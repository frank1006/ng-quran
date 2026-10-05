import { Component, DOCUMENT, computed, effect, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { QuranAudioService } from '../../../services/quran-audio.service';

/** Room the mini player takes above the bottom nav; scroll areas add it to their bottom padding */
const MINI_PLAYER_SPACE = '4.5rem';

export function formatPlaybackTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Floating player shown while a recitation is loaded and the user is away from its surah page.
 * Tapping the title returns to the surah at the verse being recited.
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

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(e => e.urlAfterRedirects)
    ),
    { initialValue: this.router.url }
  );

  protected readonly visible = computed(() => {
    const track = this.audio.track();
    if (!track) return false;
    // The surah page has its own controls
    const path = this.url().split(/[?#]/)[0];
    return path !== `/quran/${track.chapterId}`;
  });

  protected readonly progress = computed(() => {
    const duration = this.audio.duration();
    return duration > 0 ? Math.min(100, (this.audio.currentTime() / duration) * 100) : 0;
  });

  constructor() {
    effect(() => {
      this.document.documentElement.style.setProperty('--mini-player-space', this.visible() ? MINI_PLAYER_SPACE : '0px');
    });
  }

  protected openSurah(): void {
    const track = this.audio.track();
    if (track) {
      this.router.navigate(['/quran', track.chapterId], { fragment: `verse-${track.verse}` });
    }
  }
}
