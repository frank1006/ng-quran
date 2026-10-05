import { Component, signal, inject, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { BottomNavComponent } from './shared/components/bottom-nav/bottom-nav.component';
import { OfflineBannerComponent } from './shared/components/offline-banner/offline-banner.component';
import { UpdatePromptComponent } from './shared/components/update-prompt/update-prompt.component';
import { NotificationWorkerService } from './services/notification-worker.service';
import { BackgroundSyncService } from './services/background-sync.service';
import { PushReminderService } from './services/push-reminder.service';


@Component({
  selector: 'app-root',
  imports: [RouterOutlet, BottomNavComponent, OfflineBannerComponent, UpdatePromptComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  protected readonly title = signal('QuranFlow');
  private readonly notificationWorker = inject(NotificationWorkerService);
  private readonly backgroundSync = inject(BackgroundSyncService);
  private readonly pushReminders = inject(PushReminderService);

  ngOnInit(): void {
    // Services are initialized via constructor
    // Setup automatic background sync
    this.backgroundSync.setupAutoSync();
  }
}
