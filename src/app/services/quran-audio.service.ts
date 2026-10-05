import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { QuranApiService } from './quran-api.service';
import { UserStoreService } from './user-store.service';
import { NetworkStatusService } from './network-status.service';

/** What the app is reciting: one verse of one surah */
export interface QuranTrack {
  chapterId: number;
  chapterName: string;
  totalVerses: number;
  verse: number;
}

/** Off: stop after the surah's last ayah. Surah: start it again. Ayah: loop the current ayah. */
export type RepeatMode = 'off' | 'surah' | 'ayah';

const REPEAT_KEY = 'quran-repeat';
const REPEAT_ORDER: RepeatMode[] = ['off', 'surah', 'ayah'];

function readRepeat(): RepeatMode {
  try {
    const saved = localStorage.getItem(REPEAT_KEY) as RepeatMode | null;
    return saved && REPEAT_ORDER.includes(saved) ? saved : 'off';
  } catch {
    return 'off';
  }
}

/**
 * Plays Quran recitation for the whole app, so it keeps going while the user moves between
 * pages. One audio element is shared; verses play on one after another until the surah ends.
 * Lock screen and headphone controls come through the Media Session API.
 */
@Injectable({ providedIn: 'root' })
export class QuranAudioService {
  private readonly quranApi = inject(QuranApiService);
  private readonly userStore = inject(UserStoreService);
  private readonly networkStatus = inject(NetworkStatusService);

  readonly track = signal<QuranTrack | null>(null);
  readonly isPlaying = signal(false);
  /** Verse whose audio address is being fetched */
  readonly loadingVerse = signal<number | null>(null);
  readonly currentTime = signal(0);
  readonly duration = signal(0);
  readonly repeat = signal<RepeatMode>(readRepeat());
  readonly repeatLabel = computed(() =>
    ({ off: 'Repeat off', surah: 'Repeating surah', ayah: 'Repeating ayah' })[this.repeat()]
  );

  readonly hasPrevious = computed(() => (this.track()?.verse ?? 0) > 1);
  readonly hasNext = computed(() => {
    const t = this.track();
    return !!t && t.verse < t.totalVerses;
  });

  private audio: HTMLAudioElement | null = null;
  /** Verse audio addresses, keyed "reciter:chapter:verse" */
  private readonly urlCache = new Map<string, string>();
  private reciterNames = new Map<number, string>();
  /** Increases with every new request, so a slow fetch can't override a newer choice */
  private requestId = 0;
  /** A verse is about to play: the pause between verses shouldn't show as paused */
  private pendingPlay = false;

  constructor() {
    // A different reciter: reload the current verse with the new voice
    let previousReciter = this.userStore.selectedReciterId();
    effect(() => {
      const reciter = this.userStore.selectedReciterId();
      if (reciter === previousReciter) return;
      previousReciter = reciter;
      untracked(() => {
        const t = this.track();
        if (t && reciter !== null) {
          this.load(t, this.isPlaying());
        }
      });
    });

    this.quranApi.getReciters().subscribe({
      next: reciters => (this.reciterNames = new Map(reciters.map(r => [r.id, r.name]))),
      error: () => {}
    });

    this.setupMediaSession();
  }

  /** Is this verse the current one (playing or paused)? */
  isCurrent(chapterId: number, verse: number): boolean {
    const t = this.track();
    return !!t && t.chapterId === chapterId && t.verse === verse;
  }

  /** Play a verse; tapping the verse that is already playing pauses it */
  playVerse(chapter: { id: number; transliteration: string; total_verses: number }, verse: number): void {
    if (this.isCurrent(chapter.id, verse) && this.loadingVerse() === null) {
      this.toggle();
      return;
    }
    this.load({
      chapterId: chapter.id,
      chapterName: chapter.transliteration,
      totalVerses: chapter.total_verses,
      verse
    }, true);
  }

  toggle(): void {
    if (this.isPlaying()) {
      this.pause();
    } else {
      this.resume();
    }
  }

  resume(): void {
    const t = this.track();
    if (!t) return;
    const audio = this.ensureAudio();
    if (!audio.src) {
      this.load(t, true);
      return;
    }
    audio.play().catch(err => this.onPlayError(err));
  }

  pause(): void {
    this.pendingPlay = false;
    if (this.loadingVerse() !== null) {
      this.requestId++;
      this.loadingVerse.set(null);
    }
    this.audio?.pause();
    this.setPlaying(false);
  }

  next(): void {
    const t = this.track();
    if (t && t.verse < t.totalVerses) {
      this.load({ ...t, verse: t.verse + 1 }, true);
    }
  }

  previous(): void {
    const t = this.track();
    if (t && t.verse > 1) {
      this.load({ ...t, verse: t.verse - 1 }, true);
    }
  }

  /** Off → repeat surah → repeat ayah → off */
  cycleRepeat(): void {
    const next = REPEAT_ORDER[(REPEAT_ORDER.indexOf(this.repeat()) + 1) % REPEAT_ORDER.length];
    this.repeat.set(next);
    try {
      localStorage.setItem(REPEAT_KEY, next);
    } catch {
      // Storage blocked: the choice lasts until the app closes
    }
  }

  seek(seconds: number): void {
    if (this.audio) {
      this.audio.currentTime = seconds;
      this.currentTime.set(seconds);
    }
  }

  /** Stop and forget the track (closes the mini player) */
  stop(): void {
    this.requestId++;
    this.pendingPlay = false;
    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute('src');
      this.audio.load();
    }
    this.track.set(null);
    this.isPlaying.set(false);
    this.loadingVerse.set(null);
    this.currentTime.set(0);
    this.duration.set(0);
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = 'none';
    }
  }

  private async load(track: QuranTrack, play: boolean): Promise<void> {
    const reciterId = this.userStore.selectedReciterId();
    if (reciterId === null) return;

    const request = ++this.requestId;
    const audio = this.ensureAudio();
    this.pendingPlay = play;
    if (play) this.setPlaying(true);
    audio.pause();
    this.track.set(track);
    this.currentTime.set(0);
    this.duration.set(0);
    this.updateMetadata(track, reciterId);

    let url = this.urlCache.get(this.cacheKey(reciterId, track.chapterId, track.verse));
    if (!url) {
      this.loadingVerse.set(track.verse);
      try {
        url = await this.fetchUrl(reciterId, track.chapterId, track.verse);
      } catch (err) {
        if (request === this.requestId) {
          this.pendingPlay = false;
          this.loadingVerse.set(null);
          this.setPlaying(false);
          this.reportNetworkError(err);
        }
        return;
      }
      if (request !== this.requestId) return;
      this.loadingVerse.set(null);
    }

    audio.src = url;
    if (play) {
      audio.play().catch(err => this.onPlayError(err));
      this.prefetchNext(track, reciterId);
    } else {
      audio.load();
    }
  }

  private async fetchUrl(reciterId: number, chapterId: number, verse: number): Promise<string> {
    const key = this.cacheKey(reciterId, chapterId, verse);
    const cached = this.urlCache.get(key);
    if (cached) return cached;
    const data = await firstValueFrom(this.quranApi.getAudioRecitation(chapterId, verse, reciterId));
    this.urlCache.set(key, data.audio_url);
    return data.audio_url;
  }

  /**
   * Know the next verse's address before this one ends, so the switch happens straight away.
   * That matters on a locked phone, where a paused page may not get to finish a slow fetch.
   */
  private prefetchNext(track: QuranTrack, reciterId: number): void {
    const next = track.verse < track.totalVerses ? track.verse + 1 : this.repeat() === 'surah' ? 1 : null;
    if (next !== null) {
      this.fetchUrl(reciterId, track.chapterId, next).catch(() => {});
    }
  }

  private cacheKey(reciterId: number, chapterId: number, verse: number): string {
    return `${reciterId}:${chapterId}:${verse}`;
  }

  private ensureAudio(): HTMLAudioElement {
    if (this.audio) return this.audio;
    const audio = new Audio();
    audio.preload = 'auto';
    audio.addEventListener('play', () => {
      this.pendingPlay = false;
      this.setPlaying(true);
    });
    audio.addEventListener('pause', () => {
      if (!this.pendingPlay && !audio.ended) this.setPlaying(false);
    });
    audio.addEventListener('timeupdate', () => this.currentTime.set(audio.currentTime));
    audio.addEventListener('durationchange', () => {
      this.duration.set(Number.isFinite(audio.duration) ? audio.duration : 0);
      this.updatePosition();
    });
    audio.addEventListener('ended', () => this.onEnded());
    audio.addEventListener('error', () => {
      if (!audio.getAttribute('src')) return;
      this.pendingPlay = false;
      this.setPlaying(false);
      const code = audio.error?.code;
      if (code === 2 || code === 4 || !navigator.onLine) {
        this.networkStatus.showOfflineBanner();
      }
    });
    this.audio = audio;
    return audio;
  }

  private onEnded(): void {
    const t = this.track();
    const repeat = this.repeat();
    if (t && repeat === 'ayah' && this.audio) {
      this.audio.currentTime = 0;
      this.audio.play().catch(err => this.onPlayError(err));
    } else if (t && t.verse < t.totalVerses) {
      this.load({ ...t, verse: t.verse + 1 }, true);
    } else if (t && repeat === 'surah') {
      this.load({ ...t, verse: 1 }, true);
    } else {
      // End of the surah: stay on the last verse, paused
      this.setPlaying(false);
      this.currentTime.set(0);
    }
  }

  private setPlaying(playing: boolean): void {
    this.isPlaying.set(playing);
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
    }
  }

  private onPlayError(err: unknown): void {
    // A newer load interrupted this play() call: not a real failure
    if (err instanceof DOMException && err.name === 'AbortError') return;
    this.pendingPlay = false;
    this.setPlaying(false);
    this.reportNetworkError(err);
  }

  private reportNetworkError(err: unknown): void {
    const message = err instanceof Error ? err.message : '';
    if (!navigator.onLine || /internet|network|connection|fetch/i.test(message)) {
      this.networkStatus.showOfflineBanner();
    }
  }

  private setupMediaSession(): void {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const session = navigator.mediaSession;
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ['play', () => this.resume()],
      ['pause', () => this.pause()],
      ['previoustrack', () => this.previous()],
      ['nexttrack', () => this.next()],
      ['stop', () => this.stop()],
      ['seekto', details => details.seekTime !== undefined && this.seek(details.seekTime)]
    ];
    for (const [action, handler] of handlers) {
      try {
        session.setActionHandler(action, handler);
      } catch {
        // This browser doesn't support that action
      }
    }
  }

  private updateMetadata(track: QuranTrack, reciterId: number): void {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') {
      return;
    }
    navigator.mediaSession.metadata = new MediaMetadata({
      title: `${track.chapterName} · Ayah ${track.verse}`,
      artist: this.reciterNames.get(reciterId) ?? 'QuranFlow',
      album: 'QuranFlow',
      artwork: [
        { src: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' }
      ]
    });
  }

  private updatePosition(): void {
    const audio = this.audio;
    if (!audio || !('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
    try {
      navigator.mediaSession.setPositionState({
        duration: audio.duration,
        position: Math.min(audio.currentTime, audio.duration),
        playbackRate: audio.playbackRate
      });
    } catch {
      // Ignore position values the browser rejects
    }
  }
}
