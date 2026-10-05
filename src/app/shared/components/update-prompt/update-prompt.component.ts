import { Component, DestroyRef, inject, signal } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs';
import { Logger } from '../../../core/logger.util';

/** Check for a new deploy at most this often while the app is in use. */
const CHECK_INTERVAL_MS = 30 * 60 * 1000;

/**
 * Tells the user when a new version has been downloaded by the service worker
 * and lets them switch to it with one tap.
 */
@Component({
  selector: 'app-update-prompt',
  template: `
    @if (updateReady()) {
      <div class="update-prompt" role="status" aria-live="polite">
        <p class="update-text">A new version of QuranFlow is available.</p>
        <button type="button" class="update-later" (click)="dismiss()">Later</button>
        <button type="button" class="update-refresh" (click)="refresh()">Refresh</button>
      </div>
    }
  `,
  styleUrl: './update-prompt.component.css'
})
export class UpdatePromptComponent {
  private readonly swUpdate = inject(SwUpdate);
  protected readonly updateReady = signal(false);

  constructor() {
    if (!this.swUpdate.isEnabled) return;

    const versionSub = this.swUpdate.versionUpdates
      .pipe(filter((event): event is VersionReadyEvent => event.type === 'VERSION_READY'))
      .subscribe(() => this.updateReady.set(true));

    // The cached app can't be served any more (e.g. files evicted): only a reload recovers
    const brokenSub = this.swUpdate.unrecoverable.subscribe(() => document.location.reload());

    // Installed PWAs often stay open for days, so check again when brought back to the front
    let lastCheck = Date.now();
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || Date.now() - lastCheck < CHECK_INTERVAL_MS) return;
      lastCheck = Date.now();
      this.swUpdate.checkForUpdate().catch(error => Logger.warn('Update check failed:', error));
    };
    document.addEventListener('visibilitychange', onVisible);

    inject(DestroyRef).onDestroy(() => {
      versionSub.unsubscribe();
      brokenSub.unsubscribe();
      document.removeEventListener('visibilitychange', onVisible);
    });
  }

  protected dismiss(): void {
    this.updateReady.set(false);
  }

  protected async refresh(): Promise<void> {
    try {
      await this.swUpdate.activateUpdate();
    } finally {
      document.location.reload();
    }
  }
}
