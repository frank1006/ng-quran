import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AfterViewInit, Component, DestroyRef, ElementRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GoogleSignInComponent } from '../../shared/components/google-sign-in/google-sign-in.component';
import { HijriCalendarService } from '../../calendar/hijri-calendar.service';
import { AuthService } from '../../core/auth.service';
import { QFlowAppContextService } from './qflow-app-context';
import { QFlowAction, QFlowAyah, QFlowHadith, QFlowHadithText, QFlowHadithTranslationText, QFlowService } from './qflow.service';
import { QuranAudioService } from '../../services/quran-audio.service';
import { QuranApiService } from '../../services/quran-api.service';
import { Chapter } from '../../services/quran-api.types';
import { QFlowChatStore, QFlowLang, textDir } from './qflow-chat.store';
import { QFlowClampedDirective } from './qflow-clamped.directive';
import { buildWelcome, isoDate } from './qflow-welcome';

const MAX_QUESTION = 500;

/**
 * QuranFlow AI (code name QFlow). Signed-in users only: guests see
 * the greeting and a sign-in card where the question box would be.
 * Answers come only from ayahs it retrieved; the cards show the exact text from our index.
 * The conversation itself lives in QFlowChatStore, so it survives leaving the page.
 */
@Component({
  selector: 'app-qflow',
  standalone: true,
  imports: [RouterLink, GoogleSignInComponent, QFlowClampedDirective],
  templateUrl: './qflow.component.html',
  styleUrl: './qflow.component.css',
})
export class QFlowComponent implements AfterViewInit {
  private readonly chat = inject(QFlowChatStore);
  private readonly hijri = inject(HijriCalendarService);
  private readonly audio = inject(QuranAudioService);
  private readonly qflow = inject(QFlowService);
  /** Surah names and lengths, loaded ahead so a Play button starts audio within the tap */
  private chapters: Chapter[] = [];
  protected readonly auth = inject(AuthService);
  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');
  private readonly field = viewChild<ElementRef<HTMLTextAreaElement>>('field');

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
  protected readonly busyToday = this.chat.busyToday;
  protected readonly signInNeeded = this.chat.signInNeeded;

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
    // Prayer times etc. sent with questions: start loading them now, not on the first question
    inject(QFlowAppContextService).warmUp();
    inject(QuranApiService).getChapters().pipe(takeUntilDestroyed()).subscribe({ next: c => (this.chapters = c), error: () => {} });

    const timer = setInterval(() => this.now.set(new Date()), 60_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));

    // The first visit each day starts with the day's greeting (also when the date changes while
    // open); signing in puts the person's first name in it
    effect(() => {
      this.todayKey();
      const firstName = this.auth.user()?.firstName;
      untracked(() => this.chat.welcome(buildWelcome(this.hijri, firstName)));
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

  /**
   * An answer's button. "Play Surah …" starts the recitation here, inside the tap (phones only
   * let audio start from one), from ayah 1 with the chosen reciter; the link then opens the surah.
   */
  protected onAction(action: QFlowAction): void {
    if (!action.play) return;
    const chapter = this.chapters.find(c => c.id === action.play);
    if (chapter) this.audio.playVerse(chapter, 1);
  }

  protected send(text = this.draft()): void {
    if (this.busy() || this.limitReached() || !text.trim()) return;
    this.chat.ask(text);
    this.draft.set('');
    const field = this.field()?.nativeElement;
    if (field) {
      field.value = '';
      fitToText(field);
    }
    this.announcement.set('');
    this.scrollToEnd('smooth');
  }

  protected retry(id: number): void {
    this.chat.retry(id);
  }

  protected newChat(): void {
    this.chat.clear();
    this.chat.welcome(buildWelcome(this.hijri, this.auth.user()?.firstName));
    this.announcement.set('');
    this.field()?.nativeElement.focus();
  }

  protected onInput(event: Event): void {
    const field = event.target as HTMLTextAreaElement;
    this.draft.set(field.value);
    fitToText(field);
  }

  /** Enter sends, like a chat app; Shift+Enter (or Enter while an IME is composing) doesn't */
  protected onEnter(event: Event): void {
    const key = event as KeyboardEvent;
    if (key.shiftKey || key.isComposing) return;
    key.preventDefault();
    this.send();
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

  /** "Quran 21:83, At-Tirmidhi" → 21:83, to open a Quranic du'a in the reader */
  protected quranRef(source: string): { surah: number; ayah: number } | null {
    const match = source.match(/^Quran (\d{1,3}):(\d{1,3})/i);
    return match ? { surah: Number(match[1]), ayah: Number(match[2]) } : null;
  }

  /** Right to left for Urdu and Arabic text, wherever it appears in the chat */
  protected readonly dir = textDir;

  /** Urdu readers see the Urdu translation; everyone else the English one */
  protected translation(ayah: QFlowAyah, lang: QFlowLang): string {
    return lang === 'ur' && ayah.ur ? ayah.ur : ayah.en;
  }

  /** HadeethEnc's translation for the reader: Urdu for Urdu readers when it has one, else English */
  protected hadithTranslation(hadith: QFlowHadithText, lang: QFlowLang): QFlowHadithTranslationText | undefined {
    const t = hadith.translation;
    return (lang === 'ur' && t?.ur) || t?.en || t?.ur;
  }

  protected hadithText(hadith: QFlowHadithText, lang: QFlowLang): string {
    return this.hadithTranslation(hadith, lang)?.text ?? '';
  }

  protected hadithLang(hadith: QFlowHadithText, lang: QFlowLang): 'ur' | 'en' {
    const t = hadith.translation;
    return this.hadithTranslation(hadith, lang) === t?.ur && t?.ur ? 'ur' : 'en';
  }

  /** Under an Arabic-only hadith: the answer above explains it */
  protected noTranslationNote(lang: QFlowLang): string {
    return lang === 'ur' ? 'ترجمہ دستیاب نہیں، اوپر کا خلاصہ دیکھیں' : 'Translation not available. See the summary above.';
  }

  /** Long hadith arrive shortened; their full text once it has been loaded, by ref */
  private readonly fullHadiths = signal(new Map<string, QFlowHadithText>());
  protected readonly loadingHadith = signal<string | null>(null);
  protected readonly hadithError = signal<string | null>(null);

  protected hadithFull(hadith: QFlowHadith): QFlowHadithText {
    return this.fullHadiths().get(hadith.ref) ?? hadith;
  }

  /** Loads the rest of a shortened hadith (once); false if it couldn't */
  private async loadFullHadith(hadith: QFlowHadith): Promise<boolean> {
    if (!hadith.shortened || this.fullHadiths().has(hadith.ref)) return true;
    this.loadingHadith.set(hadith.ref);
    this.hadithError.set(null);
    try {
      const full = await this.qflow.fullHadith(hadith.ref);
      this.fullHadiths.update(map => new Map(map).set(hadith.ref, full));
      return true;
    } catch {
      this.hadithError.set(hadith.ref);
      return false;
    } finally {
      this.loadingHadith.set(null);
    }
  }

  /** Opening the other language of a shortened hadith shows all of it too */
  protected onOtherToggle(event: Event, hadith: QFlowHadith): void {
    if ((event.target as HTMLDetailsElement).open) void this.loadFullHadith(hadith);
  }

  /** Hadith cards opened with "Read more", by exchange and ref */
  private readonly expanded = signal(new Set<string>());

  protected isExpanded(key: string): boolean {
    return this.expanded().has(key);
  }

  protected async toggleExpanded(key: string, hadith: QFlowHadith): Promise<void> {
    if (!this.isExpanded(key) && !(await this.loadFullHadith(hadith))) return;
    this.expanded.update(keys => {
      const next = new Set(keys);
      if (!next.delete(key)) next.add(key);
      return next;
    });
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

/** The question box grows with the text (up to its CSS max-height, then it scrolls) */
function fitToText(field: HTMLTextAreaElement): void {
  field.style.height = 'auto';
  field.style.height = `${field.scrollHeight}px`;
}
