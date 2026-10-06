import { AfterViewInit, Component, DestroyRef, ElementRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HijriCalendarService } from '../../calendar/hijri-calendar.service';
import { QFlowAyah } from './qflow.service';
import { QFlowChatStore, QFlowLang } from './qflow-chat.store';
import { buildWelcome, isoDate } from './qflow-welcome';

const MAX_QUESTION = 500;

/**
 * QuranFlow AI (code name QFlow): not in the production nav yet; released after Google login.
 * Answers come only from ayahs it retrieved; the cards show the exact text from our index.
 * The conversation itself lives in QFlowChatStore, so it survives leaving the page.
 */
@Component({
  selector: 'app-qflow',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './qflow.component.html',
  styleUrl: './qflow.component.css',
})
export class QFlowComponent implements AfterViewInit {
  private readonly chat = inject(QFlowChatStore);
  private readonly hijri = inject(HijriCalendarService);
  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');
  private readonly field = viewChild<ElementRef<HTMLInputElement>>('field');

  protected readonly maxQuestion = MAX_QUESTION;
  protected readonly draft = signal('');
  protected readonly exchanges = this.chat.exchanges;
  protected readonly busy = this.chat.busy;
  protected readonly hasQuestions = this.chat.hasQuestions;
  /** Ticks every minute, for the date (which greeting is today's) and the limit countdown */
  private readonly now = signal(new Date());
  protected readonly todayKey = computed(() => isoDate(this.now()));
  protected readonly quota = this.chat.quota;
  protected readonly limitReached = this.chat.limitReached;
  protected readonly unavailable = this.chat.unavailable;
  protected readonly canSend = computed(() => !this.busy() && !this.limitReached() && this.draft().trim().length > 0);
  /** "5 h 12 min" until the user's midnight, when the limit resets */
  protected readonly resetIn = computed(() => {
    const resetsAt = this.quota()?.resetsAt;
    if (!resetsAt) return '';
    const minutes = Math.max(1, Math.round((new Date(resetsAt).getTime() - this.now().getTime()) / 60_000));
    const h = Math.floor(minutes / 60);
    return h ? `${h} h ${minutes % 60} min` : `${minutes} min`;
  });
  /** Read out once an answer arrives (the conversation itself isn't a live region) */
  protected readonly announcement = signal('');

  constructor() {
    const timer = setInterval(() => this.now.set(new Date()), 60_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));

    // The first visit each day starts with the day's greeting (also when the date changes while open)
    effect(() => {
      this.todayKey();
      untracked(() => this.chat.welcome(buildWelcome(this.hijri)));
    });

    // When an answer (or error) arrives, announce it and bring its question to the top
    let first = true;
    effect(() => {
      const settled = this.chat.lastSettled();
      untracked(() => {
        // The answer that was already there when the page opened is not news
        if (first) {
          first = false;
          return;
        }
        if (!settled) return;
        this.announcement.set(
          settled.status === 'error'
            ? settled.error ?? ''
            : settled.result?.answer ?? `QuranFlow AI can't answer right now. ${settled.result?.ayahs.length ?? 0} matching ayahs are shown.`,
        );
        this.scrollToExchange(settled.id);
      });
    });
  }

  ngAfterViewInit(): void {
    // Coming back to the page: continue where the conversation left off (today's greeting is last)
    if (this.hasQuestions()) this.scrollToEnd('auto');
    void this.chat.refreshQuota();
  }

  protected send(text = this.draft()): void {
    if (this.busy() || this.limitReached() || this.unavailable() || !text.trim()) return;
    this.chat.ask(text);
    this.draft.set('');
    this.announcement.set('');
    this.scrollToEnd('smooth');
  }

  protected retry(id: number): void {
    this.chat.retry(id);
  }

  protected newChat(): void {
    this.chat.clear();
    this.chat.welcome(buildWelcome(this.hijri));
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
  protected translation(ayah: QFlowAyah, lang: QFlowLang): string {
    return lang === 'ur' && ayah.ur ? ayah.ur : ayah.en;
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

  private scrollToEnd(behavior: ScrollBehavior): void {
    requestAnimationFrame(() => {
      const el = this.scroller()?.nativeElement;
      el?.scrollTo({ top: el.scrollHeight, behavior });
    });
  }
}
