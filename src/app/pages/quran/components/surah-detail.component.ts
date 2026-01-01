import { Component, OnInit, OnDestroy, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { QuranApiService } from '../../../services/quran-api.service';
import { QuranStoreService } from '../../../services/quran-store.service';
import { ChapterWithVerses, Verse, AudioRecitation, SurahResponse } from '../../../services/quran-api.types';
import { AudioPlayerComponent } from './audio-player.component';

interface VerseWithAudio extends Verse {
  translation?: string;
  audioUrl?: string;
  isLoadingAudio?: boolean;
}

@Component({
  selector: 'app-surah-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, AudioPlayerComponent],
  templateUrl: './surah-detail.component.html',
  styleUrl: './surah-detail.component.css'
})
export class SurahDetailComponent implements OnInit, OnDestroy {
  protected readonly chapter = signal<ChapterWithVerses | null>(null);
  protected readonly verses = signal<VerseWithAudio[]>([]);
  protected readonly loading = signal<boolean>(true);
  protected readonly error = signal<string | null>(null);
  protected readonly showTranslation = signal<boolean>(true);
  protected readonly currentPlayingVerse = signal<number | null>(null);
  protected readonly currentAudioUrl = signal<string | null>(null);
  protected readonly isPlaying = signal<boolean>(false);
  protected readonly forcePause = signal<boolean>(false);

  protected readonly selectedReciterId = computed(() => this.quranStore.selectedReciterId());

  private chapterId: number | null = null;
  private verseAudioCache: Map<number, string> = new Map();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private quranApi: QuranApiService,
    private quranStore: QuranStoreService,
    private http: HttpClient
  ) {
    // Restore last read position
    effect(() => {
      const chapterId = this.chapterId;
      const verses = this.verses();
      if (chapterId && verses.length > 0) {
        const lastVerse = this.quranStore.getLastReadPosition(chapterId);
        if (lastVerse) {
          setTimeout(() => {
            this.scrollToVerse(lastVerse);
          }, 300);
        }
      }
    });
  }

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      const id = params.get('surahId');
      if (id) {
        this.chapterId = parseInt(id, 10);
        this.loadChapter(this.chapterId);
      }
    });
  }

  ngOnDestroy(): void {
    // Save current scroll position or last viewed verse
    if (this.chapterId && this.verses().length > 0) {
      // Could implement scroll position tracking here
    }
  }

  private loadChapter(chapterId: number): void {
    this.loading.set(true);
    this.error.set(null);

    // Fetch the raw surah response to get translations
    this.http.get<SurahResponse>(`https://quranapi.pages.dev/api/${chapterId}.json`).subscribe({
      next: (surahResponse) => {
        // Convert to ChapterWithVerses format
        const chapterData = this.mapSurahResponseToChapter(surahResponse);
        this.chapter.set(chapterData);
        
        // Map verses with translations
        const versesWithTranslations = chapterData.verses.map((verse, index) => ({
          ...verse,
          translation: surahResponse.english[index] || ''
        }));
        this.verses.set(versesWithTranslations);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.message || 'Failed to load chapter');
        this.loading.set(false);
        console.error('Error loading chapter:', err);
      }
    });
  }

  private mapSurahResponseToChapter(response: SurahResponse): ChapterWithVerses {
    const verses: Verse[] = response.english.map((translation, index) => {
      const verseNumber = index + 1;
      return {
        id: verseNumber,
        verse_number: verseNumber,
        chapter_id: response.surahNo,
        verse_key: `${response.surahNo}:${verseNumber}`,
        text_uthmani: response.arabic1[index] || '',
        text_simple: response.arabic2[index] || '',
        text_indopak: response.arabic1[index] || ''
      };
    });

    return {
      id: response.surahNo,
      name: response.surahNameArabic,
      transliteration: response.surahName,
      translation: response.surahNameTranslation,
      type: response.revelationPlace === 'Mecca' ? 'Meccan' : 'Medinan',
      total_verses: response.totalAyah,
      verses
    };
  }

  protected toggleTranslation(): void {
    this.showTranslation.update(v => !v);
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

  protected playVerse(verseNumber: number): void {
    if (!this.chapterId || !this.selectedReciterId()) return;

    // If clicking on the currently playing verse, toggle pause/play
    const currentVerse = this.currentPlayingVerse();
    if (currentVerse === verseNumber) {
      // Toggle pause/play - use forcePause to pause without clearing URL (resume from same position)
      if (this.isPlaying()) {
        // Pause: keep URL but set forcePause flag
        this.forcePause.set(true);
        this.isPlaying.set(false);
      } else {
        // Resume playing: clear forcePause flag (audio will resume from paused position)
        this.forcePause.set(false);
        this.isPlaying.set(true);
      }
      return;
    }

    // Clear forcePause when switching to a different verse (ensures auto-play works)
    this.forcePause.set(false);

    // Check cache first
    const cachedUrl = this.verseAudioCache.get(verseNumber);
    if (cachedUrl) {
      // Set verse first, then URL (triggers auto-play in audio player)
      this.currentPlayingVerse.set(verseNumber);
      this.isPlaying.set(true);
      // Use setTimeout to ensure verse is set before URL change triggers play
      setTimeout(() => {
        this.currentAudioUrl.set(cachedUrl);
      }, 0);
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
    ).subscribe({
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
        console.error(`Error loading audio for verse ${verseNumber}:`, err);
        this.verses.update(verses => {
          return verses.map(v => 
            v.verse_number === verseNumber ? { ...v, isLoadingAudio: false } : v
          );
        });
        // Clear playing state on error
        this.currentPlayingVerse.set(null);
        this.currentAudioUrl.set(null);
        this.isPlaying.set(false);
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

  protected scrollToVerse(verseNumber: number): void {
    const element = document.getElementById(`verse-${verseNumber}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
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

