import { Component, OnInit, OnDestroy, AfterViewInit, signal, computed, effect, ViewChild, ElementRef, DestroyRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { QuranApiService } from '../../../services/quran-api.service';
import { QuranStoreService } from '../../../services/quran-store.service';
import { ChapterWithVerses, Verse, AudioRecitation } from '../../../services/quran-api.types';
import { AudioPlayerComponent } from './audio-player.component';
import { HeroHeaderComponent } from '../../../shared/components/hero-header/hero-header.component';
import { ConnectionErrorComponent } from '../../../shared/components/connection-error/connection-error.component';
import { NetworkStatusService } from '../../../services/network-status.service';

interface VerseWithAudio extends Verse {
  translation?: string;
  audioUrl?: string;
  isLoadingAudio?: boolean;
}

@Component({
  selector: 'app-surah-detail',
  standalone: true,
  imports: [CommonModule, AudioPlayerComponent, HeroHeaderComponent, ConnectionErrorComponent],
  templateUrl: './surah-detail.component.html',
  styleUrl: './surah-detail.component.css'
})
export class SurahDetailComponent implements OnInit, OnDestroy, AfterViewInit {
  protected readonly chapter = signal<ChapterWithVerses | null>(null);
  protected readonly verses = signal<VerseWithAudio[]>([]);
  protected readonly loading = signal<boolean>(true);
  protected readonly error = signal<string | null>(null);
  protected readonly selectedTranslationLanguage = signal<'english' | 'bengali' | 'urdu'>('english');
  protected readonly currentPlayingVerse = signal<number | null>(null);
  protected readonly currentAudioUrl = signal<string | null>(null);
  protected readonly isPlaying = signal<boolean>(false);
  protected readonly forcePause = signal<boolean>(false);
  private pausedVerseNumber = signal<number | null>(null); // Track which verse has paused audio
  
  // Computed signal for audio player's current verse (shows paused verse if any, otherwise playing verse)
  protected readonly audioPlayerVerse = computed(() => {
    const pausedVerse = this.pausedVerseNumber();
    if (pausedVerse !== null) {
      return pausedVerse;
    }
    return this.currentPlayingVerse();
  });

  protected readonly selectedReciterId = computed(() => this.quranStore.selectedReciterId());

  @ViewChild('versesContainer', { static: false }) versesContainerRef!: ElementRef<HTMLDivElement>;

  private readonly destroyRef = inject(DestroyRef);
  private chapterId: number | null = null;
  private verseAudioCache: Map<number, string> = new Map();
  private previousReciterId: number | null = null;
  private routeSubscription?: Subscription;
  private scrollHandler?: () => void;
  private scrollTimeout: number | null = null;
  private playerStateTimeout: number | null = null;
  private autoScrollTimeouts: number[] = [];
  private isRestoringState = false; // Flag to prevent auto-scroll during state restoration
  private readonly TRANSLATION_LANGUAGE_STORAGE_KEY = 'quran-translation-language';

  private readonly networkStatus = inject(NetworkStatusService);

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private quranApi: QuranApiService,
    private quranStore: QuranStoreService
  ) {
    // Handle reciter changes - clear cache, fetch new audio, and update state
    effect(() => {
      const reciterId = this.selectedReciterId();
      if (reciterId !== null && this.chapterId) {
        // Only handle reciter change if it actually changed (not on initial load)
        if (this.previousReciterId !== null && this.previousReciterId !== reciterId) {
          // Clear audio cache when reciter changes (cache is reciter-specific)
          this.verseAudioCache.clear();
          
          // If there's a current playing verse, fetch new audio for it with new reciter
          const currentVerse = this.currentPlayingVerse();
          if (currentVerse) {
            // Stop current playback first
            this.currentAudioUrl.set(null);
            this.isPlaying.set(false);
            this.forcePause.set(false);
            
            // Fetch new audio for the current verse with new reciter
            this.updateAudioForCurrentVerse(currentVerse, reciterId);
          } else {
            // Just stop playback if no current verse
            if (this.currentAudioUrl()) {
              this.currentAudioUrl.set(null);
              this.isPlaying.set(false);
              this.forcePause.set(false);
            }
          }
        }
        this.previousReciterId = reciterId;
      } else if (reciterId === null && this.previousReciterId !== null) {
        // Reciter was cleared
        this.previousReciterId = null;
      }
    });

    // Auto-scroll to playing verse when it changes (but not during state restoration)
    effect(() => {
      const playingVerse = this.currentPlayingVerse();
      if (playingVerse && !this.isRestoringState) {
        // Wait for view to be initialized
        const timeoutId = window.setTimeout(() => {
          if (this.versesContainerRef?.nativeElement && !this.destroyRef.destroyed) {
            this.scrollToVerse(playingVerse);
          }
        }, 200);
        this.autoScrollTimeouts.push(timeoutId);
      }
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
              currentVerse: this.currentPlayingVerse(),
              isPlaying: this.isPlaying(),
              audioUrl: this.currentAudioUrl(),
              currentTime: 0 // Will be updated by audio player if needed
            };
            this.quranStore.setPlayerState(this.chapterId!, playerState);
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
    // Load saved translation language preference
    this.loadTranslationLanguagePreference();
    
    // Initialize previous reciter ID from store
    this.previousReciterId = this.selectedReciterId();
    
    this.routeSubscription = this.route.paramMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        const id = params.get('surahId');
        if (id) {
          this.chapterId = parseInt(id, 10);
          // Reset previous reciter ID when loading new chapter
          this.previousReciterId = this.selectedReciterId();
          this.loadChapter(this.chapterId);
        }
      });
  }

  ngAfterViewInit(): void {
    // Restore scroll position after view is initialized
    if (this.chapterId && this.versesContainerRef?.nativeElement) {
      // Check if there's a selected verse (from player state) - prioritize scrolling to it
      const currentVerse = this.currentPlayingVerse();
      
      if (currentVerse) {
        // Scroll to the selected/playing verse
        const timeoutId1 = window.setTimeout(() => {
          if (!this.destroyRef.destroyed) {
            this.scrollToVerse(currentVerse);
          }
        }, 400);
        this.autoScrollTimeouts.push(timeoutId1);
      } else {
        // No selected verse, use saved scroll position
        const savedScrollPosition = this.quranStore.getScrollPosition(this.chapterId);
        
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
          const lastVerse = this.quranStore.getLastReadPosition(this.chapterId);
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
    
    // Stop audio playback before destroying
    this.currentAudioUrl.set(null);
    this.isPlaying.set(false);
    
    // Save current scroll position
    if (this.chapterId && this.versesContainerRef?.nativeElement) {
      const scrollTop = this.versesContainerRef.nativeElement.scrollTop;
      this.quranStore.setScrollPosition(this.chapterId, scrollTop);
    }

    // Save final player state (keep audioUrl so it can be restored if reciter hasn't changed)
    if (this.chapterId) {
      const playerState = {
        currentVerse: this.currentPlayingVerse(),
        isPlaying: false, // Always save as not playing when leaving page
        audioUrl: this.currentAudioUrl(), // Keep audio URL (will be cleared in restoreState if reciter changed)
        currentTime: 0
      };
      this.quranStore.setPlayerState(this.chapterId, playerState);
    }
    
    // Clear audio cache to free memory
    this.verseAudioCache.clear();
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
    
    // Save preference to localStorage
    this.saveTranslationLanguagePreference(language);
    
    // Update verses with new translation
    this.updateVersesWithTranslation(language);
    
    // Translation language changed
  }

  private loadTranslationLanguagePreference(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem(this.TRANSLATION_LANGUAGE_STORAGE_KEY);
        if (saved && (saved === 'english' || saved === 'bengali' || saved === 'urdu')) {
          this.selectedTranslationLanguage.set(saved as 'english' | 'bengali' | 'urdu');
        }
      }
    } catch (error) {
      // Silently handle localStorage errors
    }
  }

  private saveTranslationLanguagePreference(language: 'english' | 'bengali' | 'urdu'): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(this.TRANSLATION_LANGUAGE_STORAGE_KEY, language);
      }
    } catch (error) {
      // Silently handle localStorage errors
    }
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

    const isBookmarked = this.quranStore.isBookmarked(this.chapterId, verseNumber);
    if (isBookmarked) {
      this.quranStore.removeBookmark(this.chapterId, verseNumber);
    } else {
      this.quranStore.addBookmark(this.chapterId, verseNumber);
    }
  }

  protected isBookmarked(verseNumber: number): boolean {
    if (!this.chapterId) return false;
    return this.quranStore.isBookmarked(this.chapterId, verseNumber);
  }

  protected isVerseHighlighted(verseNumber: number): boolean {
    // Verse is highlighted if it has audio URL (either playing or paused)
    const currentAudioUrl = this.currentAudioUrl();
    const pausedVerse = this.pausedVerseNumber();
    const currentVerse = this.currentPlayingVerse();
    
    // Highlight if it's the paused verse (has audio URL)
    if (pausedVerse === verseNumber && currentAudioUrl) {
      return true;
    }
    
    // Highlight if it's the currently playing verse (has audio URL and is playing)
    if (currentVerse === verseNumber && currentAudioUrl && this.isPlaying()) {
      return true;
    }
    
    return false;
  }

  protected isVersePlayButtonActive(verseNumber: number): boolean {
    // Play button is active (shows pause icon) if verse is currently playing
    const currentVerse = this.currentPlayingVerse();
    const currentAudioUrl = this.currentAudioUrl();
    return currentVerse === verseNumber && !!currentAudioUrl && this.isPlaying();
  }

  protected onPlayingStateChange(isPlaying: boolean): void {
    // Sync state when audio player play/pause state changes
    this.isPlaying.set(isPlaying);
    
    const currentVerse = this.currentPlayingVerse();
    
    if (!isPlaying && currentVerse !== null) {
      // When paused from audio player, set forcePause and track paused verse
      this.forcePause.set(true);
      this.pausedVerseNumber.set(currentVerse);
    } else if (isPlaying && currentVerse !== null) {
      // When playing, clear forcePause and paused verse
      this.forcePause.set(false);
      this.pausedVerseNumber.set(null);
    }
  }

  protected selectVerse(verseNumber: number): void {
    // Select verse without auto-playing
    const currentVerse = this.currentPlayingVerse();
    
    // If a different verse is currently playing, pause it (but keep audio URL for highlighting)
    if (this.isPlaying() && currentVerse && currentVerse !== verseNumber) {
      this.forcePause.set(true);
      this.isPlaying.set(false);
      // Track which verse is paused (keep its audio URL so it stays highlighted)
      this.pausedVerseNumber.set(currentVerse);
      // Don't clear audio URL - keep it so the paused verse stays highlighted in player
    }
    
    // Set the new verse as selected (but don't load audio - user must click play button)
    this.currentPlayingVerse.set(verseNumber);
    
    // Save as last read position
    if (this.chapterId) {
      this.quranStore.setLastReadPosition(this.chapterId, verseNumber);
    }
    
    // Scroll to the selected verse
    const timeoutId = window.setTimeout(() => {
      if (!this.destroyRef.destroyed) {
        this.scrollToVerse(verseNumber);
      }
    }, 100);
    this.autoScrollTimeouts.push(timeoutId);
  }

  protected playVerse(verseNumber: number): void {
    if (!this.chapterId || !this.selectedReciterId()) return;

    const currentVerse = this.currentPlayingVerse();
    const currentAudioUrl = this.currentAudioUrl();
    const pausedVerse = this.pausedVerseNumber();
    
    // If clicking play on the currently playing verse, pause it
    if (currentVerse === verseNumber && currentAudioUrl && this.isPlaying()) {
      this.forcePause.set(true);
      this.isPlaying.set(false);
      this.pausedVerseNumber.set(verseNumber);
      return;
    }
    
    // If clicking play on a paused verse, resume it (paused verse has audio URL)
    if (pausedVerse === verseNumber && currentAudioUrl && !this.isPlaying()) {
      // Update currentPlayingVerse to the paused verse and resume
      this.currentPlayingVerse.set(verseNumber);
      this.pausedVerseNumber.set(null);
      this.forcePause.set(false);
      this.isPlaying.set(true);
      return;
    }
    
    // If clicking play on the selected verse that has audio URL but is paused (edge case)
    if (currentVerse === verseNumber && currentAudioUrl && !this.isPlaying() && pausedVerse === null) {
      this.forcePause.set(false);
      this.isPlaying.set(true);
      return;
    }

    // For any other case (different verse or same verse without audio URL), load and play that verse
    // Clear forcePause to ensure auto-play works
    this.forcePause.set(false);

    // Clear paused verse when playing a new verse
    this.pausedVerseNumber.set(null);
    
    // Check cache first
    const cachedUrl = this.verseAudioCache.get(verseNumber);
    if (cachedUrl) {
      // Set verse first, then URL (triggers auto-play in audio player)
      this.currentPlayingVerse.set(verseNumber);
      this.isPlaying.set(true);
      // Clear forcePause to ensure audio can play
      this.forcePause.set(false);
      // Use setTimeout to ensure verse is set before URL change triggers play
      const timeoutId = window.setTimeout(() => {
        if (!this.destroyRef.destroyed) {
          this.currentAudioUrl.set(cachedUrl);
        }
      }, 0);
      this.autoScrollTimeouts.push(timeoutId);
      return;
    }

    // Update loading state
    this.verses.update(verses => {
      return verses.map(v => 
        v.verse_number === verseNumber ? { ...v, isLoadingAudio: true } : v
      );
    });

    // Set verse first
    this.currentPlayingVerse.set(verseNumber);
    this.isPlaying.set(true);

    // Fetch audio URL from verse API (includes audio object)
    this.quranApi.getAudioRecitation(
      this.chapterId,
      verseNumber,
      this.selectedReciterId()!
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
      next: (audioData: AudioRecitation) => {
        const audioUrl = audioData.audio_url;
        this.verseAudioCache.set(verseNumber, audioUrl);
        // Set URL - this will trigger auto-play in audio player
        this.currentAudioUrl.set(audioUrl);
        
        // Clear loading state
        this.verses.update(verses => {
          return verses.map(v => 
            v.verse_number === verseNumber ? { ...v, isLoadingAudio: false } : v
          );
        });
      },
      error: (err) => {
        // Check if it's a network error
        const errorMessage = err?.message || '';
        const isNetworkError = errorMessage.includes('No internet connection') ||
                              errorMessage.includes('network') ||
                              errorMessage.includes('connection') ||
                              errorMessage.includes('Failed to fetch') ||
                              !navigator.onLine;
        
        if (isNetworkError) {
          // Show offline banner when audio fetch fails due to network issues
          this.networkStatus.showOfflineBanner();
        }
        
        this.verses.update(verses => {
          return verses.map(v => 
            v.verse_number === verseNumber ? { ...v, isLoadingAudio: false } : v
          );
        });
        // Clear playing state on error
        this.currentPlayingVerse.set(null);
        this.currentAudioUrl.set(null);
        this.isPlaying.set(false);
        this.pausedVerseNumber.set(null);
      }
    });
  }

  protected onPlayNext(): void {
    const currentVerse = this.currentPlayingVerse();
    if (!currentVerse || !this.chapter()) return;

    const nextVerse = currentVerse + 1;
    if (nextVerse <= this.chapter()!.total_verses) {
      this.playVerse(nextVerse);
    }
  }

  protected onPlayPrevious(): void {
    const currentVerse = this.currentPlayingVerse();
    if (!currentVerse) return;

    const prevVerse = currentVerse - 1;
    if (prevVerse >= 1) {
      this.playVerse(prevVerse);
    }
  }

  private restoreState(chapterId: number): void {
    this.isRestoringState = true; // Prevent auto-scroll during restoration
    
    const playerState = this.quranStore.getPlayerState(chapterId);
    if (playerState && playerState.currentVerse) {
      // Restore verse number
      this.currentPlayingVerse.set(playerState.currentVerse);
      
      // If audio URL exists, restore it (will be cleared if reciter changed)
      // The reciter change effect will handle clearing the cache and URL if reciter changed
      if (playerState.audioUrl) {
        this.currentAudioUrl.set(playerState.audioUrl);
        // Add to cache if not already there
        if (!this.verseAudioCache.has(playerState.currentVerse)) {
          this.verseAudioCache.set(playerState.currentVerse, playerState.audioUrl);
        }
      } else {
        this.currentAudioUrl.set(null);
      }
      
      this.isPlaying.set(false); // Always start paused
      this.forcePause.set(true); // Keep paused
    }
    
    // Reset flag after a short delay to allow scroll position restoration to complete
    const timeoutId = window.setTimeout(() => {
      if (!this.destroyRef.destroyed) {
        this.isRestoringState = false;
      }
    }, 500);
    this.autoScrollTimeouts.push(timeoutId);
  }

  private updateAudioForCurrentVerse(verseNumber: number, reciterId: number): void {
    if (!this.chapterId) return;

    // Update loading state
    this.verses.update(verses => {
      return verses.map(v => 
        v.verse_number === verseNumber ? { ...v, isLoadingAudio: true } : v
      );
    });

    // Fetch new audio URL with new reciter
    this.quranApi.getAudioRecitation(
      this.chapterId,
      verseNumber,
      reciterId
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
      next: (audioData: AudioRecitation) => {
        const audioUrl = audioData.audio_url;
        // Cache the new audio URL
        this.verseAudioCache.set(verseNumber, audioUrl);
        
        // Update audio URL (but keep paused - don't auto-play)
        this.currentAudioUrl.set(audioUrl);
        this.isPlaying.set(false);
        this.forcePause.set(true);
        
        // Update player state in localStorage with new audio URL
        if (this.chapterId) {
          const playerState = {
            currentVerse: verseNumber,
            isPlaying: false,
            audioUrl: audioUrl,
            currentTime: 0
          };
          this.quranStore.setPlayerState(this.chapterId, playerState);
        }
        
        // Clear loading state
        this.verses.update(verses => {
          return verses.map(v => 
            v.verse_number === verseNumber ? { ...v, isLoadingAudio: false } : v
          );
        });
      },
      error: (err) => {
        // Check if it's a network error
        const errorMessage = err?.message || '';
        const isNetworkError = errorMessage.includes('No internet connection') ||
                              errorMessage.includes('network') ||
                              errorMessage.includes('connection') ||
                              errorMessage.includes('Failed to fetch') ||
                              !navigator.onLine;
        
        if (isNetworkError) {
          // Show offline banner when audio fetch fails due to network issues
          this.networkStatus.showOfflineBanner();
        }
        
        // Clear loading state
        this.verses.update(verses => {
          return verses.map(v => 
            v.verse_number === verseNumber ? { ...v, isLoadingAudio: false } : v
          );
        });
      }
    });
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
          this.quranStore.setScrollPosition(this.chapterId, container.scrollTop);
        }
      }, 150);
    };

    container.addEventListener('scroll', this.scrollHandler, { passive: true });
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
      this.quranStore.setLastReadPosition(this.chapterId, verseNumber);
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

