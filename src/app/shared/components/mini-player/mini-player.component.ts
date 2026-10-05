import { Component, DOCUMENT, ElementRef, HostListener, computed, effect, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { QuranAudioService } from '../../../services/quran-audio.service';

/** Room the player button takes above the bottom nav; scroll areas add it to their bottom padding */
const MINI_PLAYER_SPACE = '5rem';

/** A recitation left paused this long away from its surah is put away (back to Continue reading) */
const PAUSED_DISMISS_MS = 5 * 60 * 1000;

export function formatPlaybackTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Floating button shown while a recitation is loaded and the user is away from its surah page.
 * Tapping it opens a small card with the surah and ayah, the player controls, and a link back.
 */
@Component({
  selector: 'app-mini-player',
  templateUrl: './mini-player.component.html',
  styleUrl: './mini-player.component.css'
})
export class MiniPlayerComponent {
  protected readonly audio = inject(QuranAudioService);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly host = inject(ElementRef<HTMLElement>);

  protected readonly expanded = signal(false);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(e => e.urlAfterRedirects)
    ),
    { initialValue: this.router.url }
  );

  private readonly path = computed(() => this.url().split(/[?#]/)[0]);

  /** Recitation loaded and the reciting surah's page (with its own controls) isn't open */
  private readonly awayFromSurah = computed(() => {
    const track = this.audio.track();
    return !!track && this.path() !== `/quran/${track.chapterId}`;
  });

  /** The Quran list shows the recitation in its header card instead */
  protected readonly visible = computed(() => this.awayFromSurah() && this.path() !== '/quran');

  protected readonly formatTime = formatPlaybackTime;

  constructor() {
    effect(() => {
      if (!this.visible()) this.expanded.set(false);
    });
    effect(onCleanup => {
      const idle = this.awayFromSurah() && !this.audio.isPlaying() && this.audio.loadingVerse() === null;
      if (!idle) return;
      const timer = setTimeout(() => this.audio.stop(), PAUSED_DISMISS_MS);
      onCleanup(() => clearTimeout(timer));
    });
    effect(() => {
      this.document.documentElement.style.setProperty('--mini-player-space', this.visible() ? MINI_PLAYER_SPACE : '0px');
    });
  }

  protected onSeek(event: Event): void {
    this.audio.seek(parseFloat((event.target as HTMLInputElement).value));
  }

  protected toggleCard(): void {
    this.expanded.update(open => !open);
  }

  /** A tap anywhere else closes the card */
  @HostListener('document:pointerdown', ['$event'])
  protected onDocumentClick(event: Event): void {
    if (this.expanded() && !this.host.nativeElement.contains(event.target as Node)) {
      this.expanded.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.expanded.set(false);
  }

  protected openSurah(): void {
    const track = this.audio.track();
    this.expanded.set(false);
    if (track) {
      this.router.navigate(['/quran', track.chapterId], { fragment: `verse-${track.verse}` });
    }
  }
}
