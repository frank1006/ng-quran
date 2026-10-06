import { Component, OnInit, OnDestroy, signal, computed, DestroyRef, inject, ChangeDetectionStrategy, isDevMode, ElementRef, Injector, afterNextRender, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { QuranApiService } from '../../../services/quran-api.service';
import { UserStoreService } from '../../../services/user-store.service';
import { Chapter, Reciter } from '../../../services/quran-api.types';
import { ConnectionErrorComponent } from '../../../shared/components/connection-error/connection-error.component';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { QuranAudioService } from '../../../services/quran-audio.service';

/** Where the reader was in the list, so coming back from a surah lands in the same place */
interface ListPosition {
  scrollTop: number;
  lastSurahId: number | null;
  query: string;
}

const POSITION_KEY = 'surah-list-position';

function readPosition(): ListPosition {
  try {
    const saved = JSON.parse(sessionStorage.getItem(POSITION_KEY) ?? 'null');
    if (saved && typeof saved.scrollTop === 'number') {
      return { scrollTop: saved.scrollTop, lastSurahId: saved.lastSurahId ?? null, query: saved.query ?? '' };
    }
  } catch {
    // Storage blocked or bad data: start at the top
  }
  return { scrollTop: 0, lastSurahId: null, query: '' };
}

// Kept in memory while the app is open; sessionStorage covers a reload
let listPosition: ListPosition | null = null;

@Component({
  selector: 'app-surah-list',
  standalone: true,
  imports: [CommonModule, ConnectionErrorComponent, LoadingSpinnerComponent],
  templateUrl: './surah-list.component.html',
  styleUrl: './surah-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SurahListComponent implements OnInit, OnDestroy {
  protected readonly chapters = signal<Chapter[]>([]);
  protected readonly reciters = signal<Reciter[]>([]);
  protected readonly loading = signal<boolean>(true);
  protected readonly error = signal<string | null>(null);
  protected readonly searchQuery = signal<string>('');
  /** The surah opened last: highlighted, and kept in view when the list comes back */
  protected readonly lastSurahId = signal<number | null>(null);

  protected readonly selectedReciterId = computed(() => this.userStore.selectedReciterId());
  protected readonly selectedReciterName = computed(() => {
    const id = this.selectedReciterId();
    return this.reciters().find(r => r.id === id)?.name ?? 'Choose reciter';
  });

  /** Search is a button until tapped; it stays open while a search is active */
  protected readonly searchOpen = signal(false);
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  /**
   * The reader's place (last ayah read or listened to) shown as the one card above the list.
   * Hidden while searching.
   */
  protected readonly place = computed(() => {
    const last = this.userStore.lastRead();
    if (!last || this.searchQuery().trim()) return null;
    const chapter = this.chapters().find(c => c.id === last.chapterId);
    if (!chapter) return null;
    const verse = Math.min(last.verseNumber, chapter.total_verses);
    const current = this.audio.isCurrent(chapter.id, verse);
    const playing = current && this.audio.isPlaying();
    return {
      chapter,
      verse,
      percent: Math.round((verse / chapter.total_verses) * 100),
      playing,
      loading: current && this.audio.loadingVerse() !== null,
      label: playing ? 'Now listening' : last.via === 'listen' ? 'Continue listening' : 'Continue reading'
    };
  });

  protected readonly filteredChapters = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const allChapters = this.chapters();

    if (!query) {
      return allChapters;
    }

    return allChapters.filter(chapter => {
      const nameMatch = chapter.name.toLowerCase().includes(query);
      const transliterationMatch = chapter.transliteration.toLowerCase().includes(query);
      const translationMatch = chapter.translation.toLowerCase().includes(query);
      const idMatch = chapter.id.toString().includes(query);
      
      return nameMatch || transliterationMatch || translationMatch || idMatch;
    });
  });

  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly container = viewChild<ElementRef<HTMLElement>>('listContainer');
  protected readonly audio = inject(QuranAudioService);

  constructor(
    private quranApi: QuranApiService,
    private userStore: UserStoreService,
    private router: Router
  ) {}

  ngOnInit(): void {
    listPosition ??= readPosition();
    this.searchQuery.set(listPosition.query);
    this.searchOpen.set(!!listPosition.query.trim());
    // Highlight the surah opened last, however it was reached (list, card, bookmark, player)
    this.lastSurahId.set(this.userStore.lastOpenedChapterId() ?? listPosition.lastSurahId);
    this.loadChapters();
    this.loadReciters();
  }

  private loadChapters(): void {
    this.loading.set(true);
    this.error.set(null);

    this.quranApi.getChapters()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (chapters) => {
          this.chapters.set(chapters);
          this.loading.set(false);
          afterNextRender(() => this.restorePosition(), { injector: this.injector });
        },
        error: (err) => {
          this.error.set(err.message || 'Failed to load chapters');
          this.loading.set(false);
          if (isDevMode()) {
            console.error('Error loading chapters:', err);
          }
        }
      });
  }

  private loadReciters(): void {
    this.quranApi.getReciters()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (reciters) => {
          this.reciters.set(reciters);
          
          // Set default reciter only if no reciter is currently selected
          // This must happen AFTER reciters are loaded to avoid race conditions
          const currentReciterId = this.selectedReciterId();
          if (reciters.length > 0 && currentReciterId === null) {
            this.userStore.setSelectedReciter(reciters[0].id);
          }
        },
        error: (err) => {
          if (isDevMode()) {
            console.error('Error loading reciters:', err);
          }
        }
      });
  }

  onSearchChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.searchQuery.set(input.value);
  }

  protected openSearch(): void {
    if (this.searchOpen()) return;
    this.searchOpen.set(true);
    // The field is already there (it only widens), so focus now: iOS opens the keyboard
    // only when focus happens inside the tap itself
    this.searchInput()?.nativeElement.focus({ preventScroll: true });
  }

  protected closeSearch(): void {
    this.searchOpen.set(false);
    this.searchQuery.set('');
    this.searchInput()?.nativeElement.blur();
  }

  onReciterChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const reciterId = select.value ? parseInt(select.value, 10) : null;
    this.userStore.setSelectedReciter(reciterId);
  }

  navigateToSurah(chapterId: number): void {
    this.lastSurahId.set(chapterId);
    this.savePosition();
    this.router.navigate(['/quran', chapterId]);
  }

  /** Listen from the reader's place, or pause/resume if that's what is loaded */
  protected listenFromPlace(chapter: Chapter, verse: number): void {
    this.audio.playVerse(chapter, verse);
  }

  protected continueAt(chapterId: number, verse: number): void {
    this.lastSurahId.set(chapterId);
    this.savePosition();
    this.router.navigate(['/quran', chapterId], { fragment: `verse-${verse}` });
  }

  ngOnDestroy(): void {
    this.savePosition();
  }

  private savePosition(): void {
    const el = this.container()?.nativeElement;
    listPosition = {
      scrollTop: el ? el.scrollTop : listPosition?.scrollTop ?? 0,
      lastSurahId: this.lastSurahId(),
      query: this.searchQuery()
    };
    try {
      sessionStorage.setItem(POSITION_KEY, JSON.stringify(listPosition));
    } catch {
      // Storage blocked: the in-memory copy still works
    }
  }

  /** Back where the reader left off, with the last opened surah on screen */
  private restorePosition(): void {
    const el = this.container()?.nativeElement;
    if (!el) return;
    el.scrollTop = listPosition?.scrollTop ?? 0;

    const id = this.lastSurahId();
    const card = id !== null ? el.querySelector<HTMLElement>(`[data-surah="${id}"]`) : null;
    if (!card) return;
    const box = el.getBoundingClientRect();
    const rect = card.getBoundingClientRect();
    // Space the bottom nav (and mini player) cover
    const covered = parseFloat(getComputedStyle(el).paddingBottom) || 0;
    if (rect.top < box.top || rect.bottom > box.bottom - covered) {
      el.scrollTop += rect.top - box.top - (el.clientHeight - covered - rect.height) / 2;
    }
  }

  protected retry(): void {
    this.loadChapters();
  }
}

