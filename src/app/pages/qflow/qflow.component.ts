import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { QFlowAnswer, QFlowAyah, QFlowService, QFlowTurn } from './qflow.service';

type Lang = 'en' | 'ur' | 'ar';

interface Exchange {
  id: number;
  question: string;
  lang: Lang;
  status: 'loading' | 'done' | 'error';
  result?: QFlowAnswer;
  error?: string;
}

const MAX_QUESTION = 500;
/** Follow-up context sent with each question (question + answer pairs) */
const HISTORY_EXCHANGES = 3;

const SUGGESTIONS = [
  'What does the Quran say about patience?',
  'Show me Ayat al-Kursi',
  'When does Ramadan start?',
  'صبر کے بارے میں قرآن کیا کہتا ہے؟',
];

/**
 * QFlow, the QuranFlow assistant (not in the nav yet; released after Google login).
 * Answers come only from ayahs QFlow retrieved; the cards show the exact text from our index.
 */
@Component({
  selector: 'app-qflow',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './qflow.component.html',
  styleUrl: './qflow.component.css',
})
export class QFlowComponent {
  private readonly qflow = inject(QFlowService);
  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');
  private readonly field = viewChild<ElementRef<HTMLInputElement>>('field');
  private nextId = 1;

  protected readonly maxQuestion = MAX_QUESTION;
  protected readonly suggestions = SUGGESTIONS;
  protected readonly draft = signal('');
  protected readonly exchanges = signal<Exchange[]>([]);
  protected readonly busy = computed(() => this.exchanges().some(e => e.status === 'loading'));
  protected readonly canSend = computed(() => !this.busy() && this.draft().trim().length > 0);
  /** Read out once an answer arrives (the conversation itself isn't a live region) */
  protected readonly announcement = signal('');

  protected send(text = this.draft()): void {
    const question = text.trim().slice(0, MAX_QUESTION);
    if (!question || this.busy()) return;
    const exchange: Exchange = { id: this.nextId++, question, lang: detectLang(question), status: 'loading' };
    const history = this.history();
    this.exchanges.update(list => [...list, exchange]);
    this.draft.set('');
    this.announcement.set('');
    this.scrollToEnd();
    void this.run(exchange, history);
  }

  protected retry(exchange: Exchange): void {
    if (this.busy()) return;
    this.update(exchange.id, { status: 'loading', error: undefined });
    void this.run(exchange, this.history(exchange.id));
  }

  protected newChat(): void {
    if (this.busy()) return;
    this.exchanges.set([]);
    this.announcement.set('');
    this.field()?.nativeElement.focus();
  }

  protected onInput(event: Event): void {
    this.draft.set((event.target as HTMLInputElement).value);
  }

  /**
   * Splits an answer so citations like 2:183-187 can sit in their own left-to-right element:
   * inside Urdu or Arabic text the browser would otherwise show "187-2:183".
   */
  protected answerParts(text: string): { text: string; ref: boolean }[] {
    // split() with a capturing group puts the citations at the odd positions
    return text
      .split(/(\d{1,3}:\d{1,3}(?:\s*[-–]\s*\d{1,3})?)/)
      .map((part, i) => ({ text: part, ref: i % 2 === 1 }))
      .filter(part => part.text);
  }

  /** Urdu readers see the Urdu translation; everyone else the English one */
  protected translation(ayah: QFlowAyah, lang: Lang): string {
    return lang === 'ur' && ayah.ur ? ayah.ur : ayah.en;
  }

  private async run(exchange: Exchange, history: QFlowTurn[]): Promise<void> {
    try {
      const result = await this.qflow.ask(exchange.question, history);
      this.update(exchange.id, { status: 'done', result });
      this.announcement.set(
        result.answer ?? `QFlow can't answer right now. ${result.ayahs.length} matching ayahs are shown.`,
      );
    } catch (error) {
      const offline = !navigator.onLine || (error instanceof HttpErrorResponse && error.status === 0);
      const message = offline
        ? "You're offline. QFlow needs a connection to search the Quran."
        : (error instanceof HttpErrorResponse && error.error?.error) || 'QFlow could not answer right now.';
      this.update(exchange.id, { status: 'error', error: message });
      this.announcement.set(message);
    }
    this.scrollToExchange(exchange.id);
  }

  /** Earlier questions and answers, so follow-ups ("and in Surah Yusuf?") make sense */
  private history(beforeId?: number): QFlowTurn[] {
    const done = this.exchanges().filter(e => e.status === 'done' && e.result?.answer && (!beforeId || e.id < beforeId));
    return done.slice(-HISTORY_EXCHANGES).flatMap(e => [
      { role: 'user' as const, content: e.question },
      { role: 'assistant' as const, content: e.result!.answer! },
    ]);
  }

  private update(id: number, changes: Partial<Exchange>): void {
    this.exchanges.update(list => list.map(e => (e.id === id ? { ...e, ...changes } : e)));
  }

  /** Brings an answered question to the top, so its answer reads from the start */
  private scrollToExchange(id: number): void {
    requestAnimationFrame(() => {
      const scroller = this.scroller()?.nativeElement;
      const article = scroller?.querySelector<HTMLElement>(`[data-exchange="${id}"]`);
      if (!scroller || !article) return;
      const top = article.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
      scroller.scrollTo({ top: top - 8, behavior: 'smooth' });
    });
  }

  private scrollToEnd(): void {
    requestAnimationFrame(() => {
      const el = this.scroller()?.nativeElement;
      el?.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    });
  }
}

function detectLang(text: string): Lang {
  if (/[ٹڈڑںےۓہھگکپچژ]/.test(text)) return 'ur';
  if (/[؀-ۿ]/.test(text)) return 'ar';
  return 'en';
}
