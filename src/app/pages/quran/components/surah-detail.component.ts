import { Component, OnInit, OnDestroy, AfterViewInit, signal, computed, effect, untracked, ViewChild, ElementRef, DestroyRef, inject, Injector, afterNextRender } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { QuranApiService } from '../../../services/quran-api.service';
import { UserStoreService } from '../../../services/user-store.service';
import { ChapterWithVerses, Verse } from '../../../services/quran-api.types';
import { AudioPlayerComponent } from './audio-player.component';
import { HeroHeaderComponent } from '../../../shared/components/hero-header/hero-header.component';
import { ConnectionErrorComponent } from '../../../shared/components/connection-error/connection-error.component';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { QuranAudioService } from '../../../services/quran-audio.service';

interface VerseWithTranslation extends Verse {
  translation?: string;
}

@Component({
  selector: 'app-surah-detail',
  standalone: true,
  imports: [CommonModule, AudioPlayerComponent, HeroHeaderComponent, ConnectionErrorComponent, LoadingSpinnerComponent],
  templateUrl: './surah-detail.component.html',
  styleUrl: './surah-detail.component.css'
})
export class SurahDetailComponent implements OnInit, OnDestroy, AfterViewInit {
  protected readonly chapter = signal<ChapterWithVerses | null>(null);
  protected readonly verses = signal<VerseWithTranslation[]>([]);
  protected readonly loading = signal<boolean>(true);
  protected readonly error = signal<string | null>(null);
  protected readonly selectedTranslationLanguage = signal<'english' | 'bengali' | 'urdu'>('english');
  protected readonly selectedReciterId = computed(() => this.userStore.selectedReciterId());

  /** Verse the reader tapped or is listening to */
  protected readonly selectedVerse = signal<number | null>(null);

  @ViewChild('versesContainer', { static: false }) versesContainerRef!: ElementRef<HTMLDivElement>;

  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private chapterId: number | null = null;
  private routeSubscription?: Subscription;
  private scrollHandler?: () => void;
  private scrollTimeout: number | null = null;
  private playerStateTimeout: number | null = null;
  private autoScrollTimeouts: number[] = [];
  private isRestoringState = false; // Flag to prevent auto-scroll during state restoration
  private targetVerseFromFragment: number | null = null; // Verse to scroll to from URL fragment

  // Recitation is app-wide, so it keeps playing after this page closes
  protected readonly audio = inject(QuranAudioService);

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private quranApi: QuranApiService,
    private userStore: UserStoreService
  ) {
    // Follow the recitation: select and scroll to each verse as it starts
    // (not during state restoration, and bookmark navigation takes priority)
    effect(() => {
      const track = this.audio.track();
      untracked(() => {
        if (!track || track.chapterId !== this.chapterId) return;
        this.selectedVerse.set(track.verse);
        this.userStore.setLastReadPosition(track.chapterId, track.verse);
        if (!this.isRestoringState && !this.targetVerseFromFragment) {
          const timeoutId = window.setTimeout(() => {
            if (this.versesContainerRef?.nativeElement && !this.destroyRef.destroyed) {
              this.scrollToVerse(track.verse);
            }
          }, 200);
          this.autoScrollTimeouts.push(timeoutId);
        }
      });
    });

    // Save player state when it changes (debounced)
    effect(() => {
      if (this.chapterId) {
        if (this.playerStateTimeout !== null) {
          clearTimeout(this.playerStateTimeout);
        }
        
        this.playerStateTimeout = window.setTimeout(() => {
          if (this.chapterId) {
            const playerState = {
              currentVerse: this.selectedVerse(),
              isPlaying: false,
              audioUrl: null,
              currentTime: 0
            };
            this.userStore.setPlayerState(this.chapterId!, playerState);
          }
        }, 300);
      }
    });

    // Save scroll position on scroll
    if (typeof document !== 'undefined') {
      // Will be set up after view init
    }
  }

  ngOnInit(): void {
    // Load saved translation language preference from user store
    const savedLanguage = this.userStore.quranTranslationLanguage();
    if (savedLanguage && (savedLanguage === 'english' || savedLanguage === 'bengali' || savedLanguage === 'urdu')) {
      this.selectedTranslationLanguage.set(savedLanguage);
    }
    
    // Check for URL fragment (verse to scroll to) - check immediately and subscribe for changes
    const currentFragment = this.route.snapshot.fragment;
    if (currentFragment && currentFragment.startsWith('verse-')) {
      const verseNumber = parseInt(currentFragment.replace('verse-', ''), 10);
      if (!isNaN(verseNumber)) {
        this.targetVerseFromFragment = verseNumber;
      }
    }
    
    this.route.fragment
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(fragment => {
        if (fragment && fragment.startsWith('verse-')) {
          const verseNumber = parseInt(fragment.replace('verse-', ''), 10);
          if (!isNaN(verseNumber)) {
            this.targetVerseFromFragment = verseNumber;
          }
        } else {
          this.targetVerseFromFragment = null;
        }
      });
    
    this.routeSubscription = this.route.paramMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        const id = params.get('surahId');
        if (id) {
          const newChapterId = parseInt(id, 10);
          const chapterChanged = this.chapterId !== null && this.chapterId !== newChapterId;
          this.chapterId = newChapterId;
          // Only reset fragment target if chapter actually changed AND there's no fragment in URL
          // This preserves fragment when navigating to bookmark on same or different chapter
          const hasFragment = this.route.snapshot.fragment && this.route.snapshot.fragment.startsWith('verse-');
          if (chapterChanged && !hasFragment) {
            this.targetVerseFromFragment = null;
          }
          this.loadChapter(this.chapterId);
        }
      });
  }

  ngAfterViewInit(): void {
    // Restore scroll position after view is initialized
    if (this.chapterId && this.versesContainerRef?.nativeElement) {
      // Priority order:
      // 1. URL fragment (verse from bookmark link) - highest priority
      // 2. Player state (currently playing verse)
      // 3. Saved scroll position
      // 4. Last read position
      
      // Check fragment one more time to ensure we have the latest value
      const fragment = this.route.snapshot.fragment;
      if (fragment && fragment.startsWith('verse-')) {
        const verseNumber = parseInt(fragment.replace('verse-', ''), 10);
        if (!isNaN(verseNumber)) {
          this.targetVerseFromFragment = verseNumber;
        }
      }
      
      const fragmentVerse = this.targetVerseFromFragment;
      const currentVerse = this.selectedVerse();
      
      if (fragmentVerse) {
        // Scroll to verse from URL fragment (bookmark navigation)
        // Use longer delay to ensure all content is rendered and any other scrolls have completed
        const timeoutId = window.setTimeout(() => {
          if (!this.destroyRef.destroyed && this.targetVerseFromFragment) {
            this.scrollToVerse(this.targetVerseFromFragment);
            // Clear fragment target after scrolling
            this.targetVerseFromFragment = null;
          }
        }, 800); // Longer delay to ensure content is fully loaded and rendered
        this.autoScrollTimeouts.push(timeoutId);
      } else if (currentVerse) {
        // Scroll to the selected/playing verse
        const timeoutId1 = window.setTimeout(() => {
          if (!this.destroyRef.destroyed) {
            this.scrollToVerse(currentVerse);
          }
        }, 400);
        this.autoScrollTimeouts.push(timeoutId1);
      } else {
        // No selected verse, use saved scroll position
        const savedScrollPosition = this.userStore.getScrollPosition(this.chapterId);
        
        if (savedScrollPosition !== null) {
          // Restore the exact scroll position that was saved
          const timeoutId2 = window.setTimeout(() => {
            if (this.versesContainerRef?.nativeElement && !this.destroyRef.destroyed) {
              this.versesContainerRef.nativeElement.scrollTop = savedScrollPosition;
            }
          }, 400);
          this.autoScrollTimeouts.push(timeoutId2);
        } else {
          // Fallback: scroll to last read verse if no scroll position is saved
          const lastVerse = this.userStore.getLastReadPosition(this.chapterId);
          if (lastVerse) {
            const timeoutId3 = window.setTimeout(() => {
              if (!this.destroyRef.destroyed) {
                this.scrollToVerse(lastVerse);
              }
            }, 300);
            this.autoScrollTimeouts.push(timeoutId3);
          }
        }
      }
      
      // Setup scroll tracking
      this.setupScrollTracking();
    }
  }

  ngOnDestroy(): void {
    // Clear all timeouts
    this.autoScrollTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
    this.autoScrollTimeouts = [];
    
    if (this.playerStateTimeout !== null) {
      clearTimeout(this.playerStateTimeout);
      this.playerStateTimeout = null;
    }
    
    if (this.scrollTimeout !== null) {
      clearTimeout(this.scrollTimeout);
      this.scrollTimeout = null;
    }
    
    // Remove scroll event listener
    if (this.scrollHandler && this.versesContainerRef?.nativeElement) {
      this.versesContainerRef.nativeElement.removeEventListener('scroll', this.scrollHandler);
      this.scrollHandler = undefined;
    }
    
    // Unsubscribe from route params
    if (this.routeSubscription) {
      this.routeSubscription.unsubscribe();
      this.routeSubscription = undefined;
    }
    
    // Save current scroll position
    if (this.chapterId && this.versesContainerRef?.nativeElement) {
      const scrollTop = this.versesContainerRef.nativeElement.scrollTop;
      this.userStore.setScrollPosition(this.chapterId, scrollTop);
    }

    // Save the selected verse for next time
    if (this.chapterId) {
      this.userStore.setPlayerState(this.chapterId, {
        currentVerse: this.selectedVerse(),
        isPlaying: false,
        audioUrl: null,
        currentTime: 0
      });
    }
  }

  private loadChapter(chapterId: number): void {
    this.loading.set(true);
    this.error.set(null);

    // Use the cached service method instead of direct HTTP call
    this.quranApi.getChapter(chapterId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
      next: (chapterData) => {
        this.chapter.set(chapterData);
        
        // Verify translations are attached (silently handle missing translations)
        if (!chapterData._translations && !(chapterData as any)._translations_bengali && !(chapterData as any)._translations_urdu) {
          // Translations may not be available - continue without them
        }
        
        // Get translations for the selected language
        const translations = this.getTranslationsForLanguage(
          chapterData, 
          this.selectedTranslationLanguage()
        );
        
        // Map verses with translations
        this.verses.set(chapterData.verses.map((verse: Verse, index: number) => ({
          ...verse,
          translation: translations[index] || ''
        })));
        
        // Restore player state and scroll position
        this.restoreState(chapterId);
        
        this.loading.set(false);
        // On a first visit the verses render after this, so start tracking once they're there
        afterNextRender(() => {
          if (!this.scrollHandler) this.setupScrollTracking();
        }, { injector: this.injector });
        
        // Check fragment again after chapter loads (in case it was set during navigation)
        const fragment = this.route.snapshot.fragment;
        if (fragment && fragment.startsWith('verse-')) {
          const verseNumber = parseInt(fragment.replace('verse-', ''), 10);
          if (!isNaN(verseNumber)) {
            this.targetVerseFromFragment = verseNumber;
          }
        }
        
        // If there's a fragment verse to scroll to, handle it after view is ready
        // This handles the case when navigating to a bookmark on an already loaded chapter
        // Only add timeout if ngAfterViewInit hasn't already handled it
        if (this.targetVerseFromFragment) {
          // Use a small delay to check if ngAfterViewInit will handle it first
          const timeoutId = window.setTimeout(() => {
            if (!this.destroyRef.destroyed && this.targetVerseFromFragment && this.versesContainerRef?.nativeElement) {
              // Double-check that ngAfterViewInit hasn't already scrolled
              this.scrollToVerse(this.targetVerseFromFragment);
              // Done: from here on the page follows the recitation again
              this.targetVerseFromFragment = null;
            }
          }, 700); // Slightly longer than ngAfterViewInit to avoid duplicate scrolls
          this.autoScrollTimeouts.push(timeoutId);
        }
      },
      error: (err) => {
        this.error.set(err.message || 'Failed to load chapter');
        this.loading.set(false);
      }
    });
  }

  protected onTranslationLanguageChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const language = select.value as 'english' | 'bengali' | 'urdu';
    
    // Update the selected language
    this.selectedTranslationLanguage.set(language);
    
    // Save preference to user store
    this.userStore.setQuranTranslationLanguage(language);
    
    // Update verses with new translation
    this.updateVersesWithTranslation(language);
  }

  private updateVersesWithTranslation(language: 'english' | 'bengali' | 'urdu'): void {
    const chapterData = this.chapter();
    if (!chapterData) {
      return;
    }

    // Get translations from the chapter data
    const translations = this.getTranslationsForLanguage(chapterData, language);
    
    // If no translations found, update verses with empty translations
    if (translations.length === 0) {
      this.verses.update(currentVerses => {
        return currentVerses.map(verse => ({
          ...verse,
          translation: ''
        }));
      });
      return;
    }
    
    // Update verses with the selected translation
    this.verses.update(currentVerses => {
      return currentVerses.map((verse, index) => ({
        ...verse,
        translation: translations[index] || ''
      }));
    });
  }

  private getTranslationsForLanguage(
    chapter: ChapterWithVerses, 
    language: 'english' | 'bengali' | 'urdu'
  ): string[] {
    // Check if translations are stored in the chapter object
    if (language === 'english') {
      if (chapter._translations && Array.isArray(chapter._translations)) {
        return chapter._translations;
      }
    }
    
    // For bengali and urdu, check if they're stored in the chapter object
    if (language === 'bengali') {
      const bengaliTranslations = (chapter as any)._translations_bengali;
      if (bengaliTranslations && Array.isArray(bengaliTranslations) && bengaliTranslations.length > 0) {
        return bengaliTranslations;
      }
    }
    
    if (language === 'urdu') {
      const urduTranslations = (chapter as any)._translations_urdu;
      if (urduTranslations && Array.isArray(urduTranslations) && urduTranslations.length > 0) {
        return urduTranslations;
      }
    }
    
    // Fallback: return empty array if translation not available
    return [];
  }

  protected toggleBookmark(verseNumber: number): void {
    if (!this.chapterId) return;

    const isBookmarked = this.userStore.isBookmarked(this.chapterId, verseNumber);
    if (isBookmarked) {
      this.userStore.removeBookmark(this.chapterId, verseNumber);
    } else {
      this.userStore.addBookmark(this.chapterId, verseNumber);
    }
  }

  protected isBookmarked(verseNumber: number): boolean {
    if (!this.chapterId) return false;
    return this.userStore.isBookmarked(this.chapterId, verseNumber);
  }

  /** The verse being recited, playing or paused */
  protected isVerseHighlighted(verseNumber: number): boolean {
    return !!this.chapterId && this.audio.isCurrent(this.chapterId, verseNumber);
  }

  protected isVersePlayButtonActive(verseNumber: number): boolean {
    return this.isVerseHighlighted(verseNumber) && this.audio.isPlaying();
  }

  protected isVerseLoading(verseNumber: number): boolean {
    return this.isVerseHighlighted(verseNumber) && this.audio.loadingVerse() === verseNumber;
  }

  protected selectVerse(verseNumber: number): void {
    // Select verse without playing; any recitation carries on
    this.selectedVerse.set(verseNumber);
    
    // Save as last read position
    if (this.chapterId) {
      this.userStore.setLastReadPosition(this.chapterId, verseNumber);
    }
    
    // Scroll to the selected verse
    const timeoutId = window.setTimeout(() => {
      if (!this.destroyRef.destroyed) {
        this.scrollToVerse(verseNumber);
      }
    }, 100);
    this.autoScrollTimeouts.push(timeoutId);
  }

  /** Play this verse (and the ones after it), or pause it if it is playing */
  protected playVerse(verseNumber: number): void {
    const chapter = this.chapter();
    if (!chapter || !this.selectedReciterId()) return;
    this.selectedVerse.set(verseNumber);
    this.userStore.setLastReadPosition(chapter.id, verseNumber);
    this.audio.playVerse(chapter, verseNumber);
  }

  private restoreState(chapterId: number): void {
    this.isRestoringState = true; // Prevent auto-scroll during restoration
    
    // The verse being recited if it's this surah, otherwise the one selected last time
    const track = this.audio.track();
    if (track && track.chapterId === chapterId) {
      this.selectedVerse.set(track.verse);
    } else {
      this.selectedVerse.set(this.userStore.getPlayerState(chapterId)?.currentVerse ?? null);
    }
    
    // Reset flag after a short delay to allow scroll position restoration to complete
    const timeoutId = window.setTimeout(() => {
      if (!this.destroyRef.destroyed) {
        this.isRestoringState = false;
      }
    }, 500);
    this.autoScrollTimeouts.push(timeoutId);
  }

  private setupScrollTracking(): void {
    if (!this.versesContainerRef?.nativeElement || !this.chapterId) return;

    const container = this.versesContainerRef.nativeElement;
    
    // Store handler reference for cleanup
    this.scrollHandler = () => {
      // Debounce scroll position saves
      if (this.scrollTimeout !== null) {
        clearTimeout(this.scrollTimeout);
      }
      
      this.scrollTimeout = window.setTimeout(() => {
        if (this.chapterId && !this.destroyRef.destroyed) {
          this.userStore.setScrollPosition(this.chapterId, container.scrollTop);
          // The verse at the top of the screen is where "Continue reading" picks up
          const verse = this.topVisibleVerse(container);
          if (verse !== null) {
            this.userStore.setLastReadPosition(this.chapterId, verse);
          }
        }
      }, 150);
    };

    container.addEventListener('scroll', this.scrollHandler, { passive: true });
  }

  private topVisibleVerse(container: HTMLElement): number | null {
    const top = container.getBoundingClientRect().top;
    for (const item of Array.from(container.querySelectorAll<HTMLElement>('.verse-item'))) {
      // First verse whose lower half is still on screen
      const rect = item.getBoundingClientRect();
      if (rect.top + rect.height / 2 > top) {
        const verse = parseInt(item.id.replace('verse-', ''), 10);
        return Number.isNaN(verse) ? null : verse;
      }
    }
    return null;
  }

  protected scrollToVerse(verseNumber: number): void {
    if (!this.versesContainerRef?.nativeElement) return;

    const element = document.getElementById(`verse-${verseNumber}`);
    if (!element) return;

    const container = this.versesContainerRef.nativeElement;
    
    // Get the element's position relative to the container
    const elementOffsetTop = element.offsetTop;
    
    // Convert 3rem to pixels (1rem = 16px typically, but get actual computed value)
    const gapRem = 3;
    const remInPixels = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const gapPixels = gapRem * remInPixels;

    // Calculate scroll position: element top - gap from container top
    const scrollTop = elementOffsetTop - gapPixels;

    container.scrollTo({
      top: Math.max(0, scrollTop),
      behavior: 'smooth'
    });
  }

  protected onVerseVisible(verseNumber: number): void {
    if (this.chapterId) {
      this.userStore.setLastReadPosition(this.chapterId, verseNumber);
    }
  }

  protected getArabicText(verse: Verse): string {
    return verse.text_uthmani || verse.text_simple || verse.text_indopak || '';
  }

  protected retry(): void {
    if (this.chapterId) {
      this.loadChapter(this.chapterId);
    }
  }
}

