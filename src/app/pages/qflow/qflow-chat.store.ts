import { Injectable, computed, inject, signal } from '@angular/core';
import { AppHttpError } from '../../interceptors/error.interceptor';
import { QFlowAnswer, QFlowQuota, QFlowService, QFlowTurn } from './qflow.service';

export type QFlowLang = 'en' | 'ur' | 'ar';

/** The daily greeting, built by the app (no AI): a snapshot, so earlier days read as they were */
export interface QFlowWelcome {
  /** Local date YYYY-MM-DD */
  date: string;
  greeting: string;
  today: string;
  event?: string;
  suggestions: string[];
}

export interface QFlowExchange {
  id: number;
  /** A question and its answer, or the day's greeting */
  kind?: 'question' | 'welcome';
  welcome?: QFlowWelcome;
  question: string;
  lang: QFlowLang;
  status: 'loading' | 'done' | 'error';
  result?: QFlowAnswer;
  error?: string;
  /** The daily limit was reached: trying again today won't help */
  limited?: boolean;
}

const STORAGE_KEY = 'qflow-chat-v1';
/** Kept on the device; older exchanges are dropped first */
const MAX_SAVED = 30;
/** Follow-up context sent with each question: the last few question + answer pairs */
const HISTORY_EXCHANGES = 3;
const MAX_QUESTION = 500;

/**
 * The QuranFlow AI conversation. Lives for the whole app (not the page), so it survives page
 * switches and finishes an answer even if the page was left, and is saved on this device only
 * (localStorage) so it survives reopening the app. "New conversation" clears it.
 * Synced history across devices comes with Google login.
 */
@Injectable({ providedIn: 'root' })
export class QFlowChatStore {
  private readonly qflow = inject(QFlowService);

  readonly exchanges = signal<QFlowExchange[]>(restore());
  readonly busy = computed(() => this.exchanges().some(e => e.status === 'loading'));
  /** True once the conversation has at least one question (greetings don't count) */
  readonly hasQuestions = computed(() => this.exchanges().some(e => e.kind !== 'welcome'));
  /** The latest exchange that got its answer (or error), for the page to scroll to and announce */
  readonly lastSettled = signal<QFlowExchange | null>(null);
  /** Questions left today (from the server); null until known */
  readonly quota = signal<QFlowQuota | null>(null);
  /** The whole app has used today's questions (the server's global cap), not just this user */
  readonly busyToday = computed(() => this.quota()?.busyToday === true);
  /** No more questions today, for either reason: the box goes away */
  readonly limitReached = computed(() => this.quota()?.remaining === 0 || this.busyToday());
  /** The server has QuranFlow AI switched off (QFLOW_ENABLED isn't "true"), e.g. before release */
  readonly unavailable = signal(false);

  private nextId = Math.max(0, ...this.exchanges().map(e => e.id)) + 1;

  /** Reads how many questions are left today (doesn't use one) */
  async refreshQuota(): Promise<void> {
    try {
      this.quota.set(await this.qflow.quota());
      this.unavailable.set(false);
    } catch (error) {
      // 404 = switched off on the server; anything else: unknown for now, the next answer brings it
      if (httpStatus(error) === 404) this.unavailable.set(true);
    }
  }

  ask(text: string): void {
    const question = text.trim().slice(0, MAX_QUESTION);
    if (!question || this.busy() || this.limitReached() || this.unavailable()) return;
    const exchange: QFlowExchange = { id: this.nextId++, question, lang: detectLang(question), status: 'loading' };
    const history = this.history();
    this.exchanges.update(list => [...list, exchange]);
    void this.run(exchange, history);
  }

  retry(id: number): void {
    const exchange = this.exchanges().find(e => e.id === id);
    if (!exchange || this.busy()) return;
    this.update(id, { status: 'loading', error: undefined });
    void this.run(exchange, this.history(id));
  }

  /** Adds the day's greeting unless today's is already in the conversation */
  welcome(welcome: QFlowWelcome): void {
    if (this.exchanges().some(e => e.kind === 'welcome' && e.welcome?.date === welcome.date)) return;
    const item: QFlowExchange = { id: this.nextId++, kind: 'welcome', welcome, question: '', lang: 'en', status: 'done' };
    this.exchanges.update(list => [...list, item]);
    save(this.exchanges());
  }

  /** Clears the conversation (not the daily limit: that's counted per person per day) */
  clear(): void {
    if (this.busy()) return;
    this.exchanges.set([]);
    this.lastSettled.set(null);
    save([]);
  }

  private async run(exchange: QFlowExchange, history: QFlowTurn[]): Promise<void> {
    try {
      const result = await this.qflow.ask(exchange.question, history);
      if (result.quota) this.quota.set(result.quota);
      this.update(exchange.id, { status: 'done', result });
    } catch (error) {
      const status = httpStatus(error);
      const body = (error as Partial<AppHttpError>).cause?.error;
      const limited = status === 429;
      if (status === 404) this.unavailable.set(true);
      if (limited && body?.quota) this.quota.set(body.quota);
      const offline = !navigator.onLine || status === 0;
      const message = offline
        ? "You're offline. QuranFlow AI needs a connection to search the Quran."
        : body?.error || 'QuranFlow AI could not answer right now.';
      this.update(exchange.id, { status: 'error', error: message, limited });
    }
    this.lastSettled.set(this.exchanges().find(e => e.id === exchange.id) ?? null);
  }

  /** Earlier questions and answers, so follow-ups ("and in Surah Yusuf?") make sense */
  private history(beforeId?: number): QFlowTurn[] {
    const done = this.exchanges().filter(
      e => e.kind !== 'welcome' && e.status === 'done' && e.result?.answer && (!beforeId || e.id < beforeId),
    );
    return done.slice(-HISTORY_EXCHANGES).flatMap(e => [
      { role: 'user' as const, content: e.question },
      { role: 'assistant' as const, content: e.result!.answer! },
    ]);
  }

  private update(id: number, changes: Partial<QFlowExchange>): void {
    this.exchanges.update(list => list.map(e => (e.id === id ? { ...e, ...changes } : e)));
    save(this.exchanges());
  }
}

/** The HTTP status of an error from HttpClient (via the app's error interceptor), if any */
function httpStatus(error: unknown): number | undefined {
  const status = (error as Partial<AppHttpError>)?.status;
  return typeof status === 'number' ? status : undefined;
}

/** Common Urdu words as people type them in Latin letters (same list as api/_lib/qflow.ts) */
const ROMAN_URDU_WORDS = new Set(
  ('hai hy hain hn kya kia kyun kyu kaise kese kesay kab kb ka ki ke k ko se mein mai aur ' +
    'nahi nahin nhi btao batao bataen bataein baare bare baary barey chahiye chahye karna karo krna ' +
    'hota hoti hotay wala wali walay jab tak sath saath liye lye kon kaun konsi kahan').split(' '),
);

/**
 * The language whose translation the ayah cards show. Roman Urdu counts as Urdu: the answer is in
 * Roman Urdu, but the ayahs show the Urdu translation (there's no trusted Roman Urdu one).
 */
export function detectLang(text: string): QFlowLang {
  if (/[ٹڈڑںےۓہھگکپچژ]/.test(text)) return 'ur';
  if (/[؀-ۿ]/.test(text)) return 'ar';
  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  const urdu = words.filter(w => ROMAN_URDU_WORDS.has(w)).length;
  if (urdu >= 2 || (urdu === 1 && words.length <= 3)) return 'ur';
  return 'en';
}

/** Only answered (or failed) exchanges are saved; a question still loading when the app closes isn't kept */
function save(exchanges: QFlowExchange[]): void {
  try {
    const settled = exchanges.filter(e => e.status !== 'loading').slice(-MAX_SAVED);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settled));
  } catch {
    // Storage full or blocked (private mode): the chat still works for this session
  }
}

function restore(): QFlowExchange[] {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(saved) ? saved.filter(e => e && typeof e.id === 'number' && typeof e.question === 'string') : [];
  } catch {
    return [];
  }
}
