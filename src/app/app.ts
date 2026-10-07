import { Component, DOCUMENT, signal, inject, OnInit, afterNextRender, Injector, DestroyRef } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, skip } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BottomNavComponent } from './shared/components/bottom-nav/bottom-nav.component';
import { OfflineBannerComponent } from './shared/components/offline-banner/offline-banner.component';
import { UpdatePromptComponent } from './shared/components/update-prompt/update-prompt.component';
import { MiniPlayerComponent } from './shared/components/mini-player/mini-player.component';
import { NotificationWorkerService } from './services/notification-worker.service';
import { BackgroundSyncService } from './services/background-sync.service';
import { PushReminderService } from './services/push-reminder.service';
import { AuthService } from './core/auth.service';


@Component({
  selector: 'app-root',
  imports: [RouterOutlet, BottomNavComponent, OfflineBannerComponent, UpdatePromptComponent, MiniPlayerComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  protected readonly title = signal('QuranFlow');
  private readonly notificationWorker = inject(NotificationWorkerService);
  private readonly backgroundSync = inject(BackgroundSyncService);
  private readonly pushReminders = inject(PushReminderService);
  /** Started here so a returning Google sign-in is finished on whichever page it lands */
  private readonly auth = inject(AuthService);

  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);

  ngOnInit(): void {
    this.focusPageOnNavigation();

    // Services are initialized via constructor
    // Setup automatic background sync
    this.backgroundSync.setupAutoSync();
  }

  /**
   * After moving to another page, put screen reader focus on its main heading, so the new page
   * is announced instead of focus staying on the tapped link. Not on first load.
   */
  private focusPageOnNavigation(): void {
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      skip(1),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(() => {
      afterNextRender(() => {
        const main = this.document.querySelector<HTMLElement>('main');
        if (!main) return;
        const heading = main.querySelector<HTMLElement>('h1');
        if (heading) {
          this.focusQuietly(heading);
          return;
        }
        // Pages that load their content first (a surah) get their heading a moment later
        this.focusQuietly(main);
        const observer = new MutationObserver(() => {
          const late = main.querySelector<HTMLElement>('h1');
          if (!late) return;
          observer.disconnect();
          if (this.document.activeElement === main) this.focusQuietly(late);
        });
        observer.observe(main, { childList: true, subtree: true });
        setTimeout(() => observer.disconnect(), 4000);
      }, { injector: this.injector });
    });
  }

  private focusQuietly(element: HTMLElement): void {
    if (!element.hasAttribute('tabindex')) element.setAttribute('tabindex', '-1');
    element.focus({ preventScroll: true });
  }
}
