import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { AuthService } from '../../core/auth.service';
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
/** Tafsir text is kept on the device for less than a week (Quran Foundation's terms); the card loads it again */
const TAFSIR_KEPT_MS = 6 * 24 * 60 * 60 * 1000;

/**
 * The QuranFlow AI conversation. Lives for the whole app (not the page), so it survives page
 * switches and finishes an answer even if the page was left, and is saved on this device only
 * (localStorage) so it survives reopening the app. "New conversation" clears it, and so does
 * signing out (on a shared phone, the next person shouldn't see it).
 * Only signed-in users can ask; guests see a sign-in card instead of the question box.
 */
@Injectable({ providedIn: 'root' })
export class QFlowChatStore {
  private readonly qflow = inject(QFlowService);
  private readonly auth = inject(AuthService);

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
  /** The server didn't accept the session (expired or deleted): sign in again */
  private readonly sessionRejected = signal(false);
  /** A guest, or a session the server turned down: show the sign-in card */
  readonly signInNeeded = computed(() => this.auth.ready() && (!this.auth.signedIn() || this.sessionRejected()));

  private nextId = Math.max(0, ...this.exchanges().map(e => e.id)) + 1;

  constructor() {
    // Signing in (or switching account) starts fresh: that person's own count
    effect(() => {
      const id = this.auth.user()?.id;
      untracked(() => {
        this.sessionRejected.set(false);
        this.quota.set(null);
        if (id) void this.refreshQuota();
      });
    });
    this.auth.onSignedOut(() => this.forget());
  }

  /** Reads how many questions are left today (doesn't use one) */
  async refreshQuota(): Promise<void> {
    if (!this.auth.signedIn()) return;
    try {
      this.quota.set(await this.qflow.quota());
    } catch (error) {
      // 401 = the session isn't accepted; anything else: unknown for now, the next answer brings it
      if (httpStatus(error) === 401) this.sessionRejected.set(true);
    }
  }

  ask(text: string): void {
    const question = text.trim().slice(0, MAX_QUESTION);
    if (!question || this.busy() || this.limitReached() || this.signInNeeded()) return;
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

  /** Adds the day's greeting unless today's is already in the conversation (then it only updates
   *  the name, e.g. after signing in) */
  welcome(welcome: QFlowWelcome): void {
    const today = this.exchanges().find(e => e.kind === 'welcome' && e.welcome?.date === welcome.date);
    if (today) {
      if (today.welcome?.greeting !== welcome.greeting) this.update(today.id, { welcome: { ...today.welcome!, greeting: welcome.greeting } });
      return;
    }
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
      result.tafsirs?.forEach(tafsir => (tafsir.at = Date.now()));
      this.update(exchange.id, { status: 'done', result });
    } catch (error) {
      const status = httpStatus(error);
      const body = (error as Partial<AppHttpError>).cause?.error;
      const limited = status === 429;
      if (status === 401) this.sessionRejected.set(true);
      if (limited && body?.quota) this.quota.set(body.quota);
      const offline = !navigator.onLine || status === 0;
      const message = offline
        ? "You're offline. QuranFlow AI needs a connection to search the Quran."
        : body?.error || 'QuranFlow AI could not answer right now.';
      this.update(exchange.id, { status: 'error', error: message, limited });
    }
    this.lastSettled.set(this.exchanges().find(e => e.id === exchange.id) ?? null);
  }

  /** Signed out or account deleted: nothing of theirs stays on the device */
  private forget(): void {
    this.exchanges.set([]);
    this.lastSettled.set(null);
    this.quota.set(null);
    save([]);
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
    'hota hoti hotay wala wali walay jab tak sath saath liye lye kon kaun konsi kahan ' +
    'sunao sunaen sunayein chalao lagao parho padho dikhao bolo ' +
    // Everyday spellings: dropped vowels (tm, mjhe, nmaz) and doubled ones (haal, duwa)
    'tm tum tumhe tumhen aap apko aapko mjhe mujhe mujhy muje mje hm humein hamein haal ' +
    'kesy kaisay kaisa kaisi kesa kesi kyon kiun kiyon kaha kidhar kitna kitni kitne konsa ' +
    'kis kisi tha thi thay raha rahi rahe rha rhi rhe hoga hogi honge hua hui huwa hote hein ' +
    'kr kar karta karti karte krta krti krte karen karein krein krdo kardo dedo kuch kch sb ' +
    'bhi woh yeh iska uska unka mera meri apna apni nai nahe bta btaen btaein ' +
    'btado batado batayein bataiye smjhao samjhao samjhaen samjhaein matlab mtlb kiya ' +
    'zaroori zaruri sakta sakti sakte skta skti skte chahta chahti chahte walon wale waly ' +
    'kyunke kyunki lekin magar agar phir abhi kabhi hamesha duwa nmaz roze parhna parhni ' +
    'parhte prhna').split(' '),
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

/**
 * Which way a piece of chat text reads. The browser's own dir="auto" goes by the first letter
 * alone, so an Urdu answer that opens with a Latin word ("Surah Al-Baqarah میں …") was laid out
 * left to right; this goes by the script most of the text is written in.
 */
export function textDir(text: string): 'rtl' | 'ltr' {
  const rtl = text.match(/[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFC]/g)?.length ?? 0;
  const ltr = text.match(/[A-Za-z\u00C0-\u024F]/g)?.length ?? 0;
  return rtl > ltr ? 'rtl' : 'ltr';
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
    if (!Array.isArray(saved)) return [];
    const exchanges: QFlowExchange[] = saved.filter(e => e && typeof e.id === 'number' && typeof e.question === 'string');
    for (const tafsir of exchanges.flatMap(e => e.result?.tafsirs ?? [])) {
      if (Date.now() - (tafsir.at ?? 0) > TAFSIR_KEPT_MS) delete tafsir.text;
    }
    return exchanges;
  } catch {
    return [];
  }
}
