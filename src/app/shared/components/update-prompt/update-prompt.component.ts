import { Component, DestroyRef, inject, signal } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs';
import { Logger } from '../../../core/logger.util';
import { QuranAudioService } from '../../../services/quran-audio.service';

/** Check for a new deploy at most this often while the app is in use. */
const CHECK_INTERVAL_MS = 30 * 60 * 1000;
/** A new version found this soon after the app opens is switched to as part of starting up. */
const STARTUP_WINDOW_MS = 8_000;
/** Away at least this long: coming back is a fresh start, so a ready update is applied then. */
const AWAY_MS = 2 * 60 * 1000;

/**
 * Keeps everyone on the latest version without interrupting them. A ready update is applied
 * by itself when the app opens or when the user comes back after being away, never while
 * Quran audio is playing. While they're using the app it waits, with a banner to update now.
 */
@Component({
  selector: 'app-update-prompt',
  template: `
    @if (updateReady()) {
      <div class="update-prompt" role="status" aria-live="polite">
        <p class="update-text">A new version of QuranFlow is ready.</p>
        <button type="button" class="ui-button" (click)="refresh()">Update</button>
      </div>
    }
  `,
  styleUrl: './update-prompt.component.css'
})
export class UpdatePromptComponent {
  private readonly swUpdate = inject(SwUpdate);
  private readonly audio = inject(QuranAudioService);
  private readonly startedAt = Date.now();
  protected readonly updateReady = signal(false);

  constructor() {
    if (!this.swUpdate.isEnabled) return;

    const versionSub = this.swUpdate.versionUpdates
      .pipe(filter((event): event is VersionReadyEvent => event.type === 'VERSION_READY'))
      .subscribe(() => {
        this.updateReady.set(true);
        if (Date.now() - this.startedAt < STARTUP_WINDOW_MS) this.refreshIfIdle();
      });

    // The cached app can't be served any more (e.g. files evicted): only a reload recovers
    const brokenSub = this.swUpdate.unrecoverable.subscribe(() => document.location.reload());

    // Installed PWAs often stay open for days, so check again when brought back to the front
    let lastCheck = Date.now();
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        return;
      }
      if (this.updateReady() && hiddenAt && Date.now() - hiddenAt >= AWAY_MS) {
        this.refreshIfIdle();
        return;
      }
      if (Date.now() - lastCheck < CHECK_INTERVAL_MS) return;
      lastCheck = Date.now();
      this.swUpdate.checkForUpdate().catch(error => Logger.warn('Update check failed:', error));
    };
    document.addEventListener('visibilitychange', onVisibility);

    inject(DestroyRef).onDestroy(() => {
      versionSub.unsubscribe();
      brokenSub.unsubscribe();
      document.removeEventListener('visibilitychange', onVisibility);
    });
  }

  protected async refresh(): Promise<void> {
    try {
      await this.swUpdate.activateUpdate();
    } finally {
      document.location.reload();
    }
  }

  /** Recitation keeps playing; the banner stays and the update waits for the next chance */
  private refreshIfIdle(): void {
    if (!this.audio.isPlaying()) void this.refresh();
  }
}
