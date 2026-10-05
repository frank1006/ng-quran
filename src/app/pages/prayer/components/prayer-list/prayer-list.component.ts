import { Component, input, output, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConnectionErrorComponent } from '../../../../shared/components/connection-error/connection-error.component';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';
import { NotificationService } from '../../../../services/notification.service';
import { DeviceDetectionService } from '../../../../services/device-detection.service';
import { Logger } from '../../../../core/logger.util';

/**
 * Prayer item for list display
 */
interface PrayerItem {
  name: string;
  time: string;
  key: string;
  isActive: boolean;
  hasPassed?: boolean;
}

@Component({
  selector: 'app-prayer-list',
  standalone: true,
  imports: [CommonModule, ConnectionErrorComponent, LoadingSpinnerComponent],
  template: `
    @if (loading()) {
      <app-loading-spinner />
    }

    @if (error() && prayers().length === 0) {
      <app-connection-error 
        [errorMessage]="error()!" 
        (retry)="onRetry()"
      />
    }

    @if (!loading() && prayers().length > 0) {
      <div class="prayer-list-container">
        <div class="prayer-list">
          @for (prayer of prayers(); track prayer.key) {
            <div class="prayer-card" [class.active]="prayer.isActive" [class.passed]="prayer.hasPassed">
              <div class="prayer-info">
                <h3 class="prayer-title">{{ prayer.name }}</h3>
                <p class="prayer-time">{{ prayer.time }}</p>
              </div>
              <button 
                class="notification-button" 
                type="button" 
                [class.active]="isNotificationEnabled(prayer.key)"
                [class.loading]="notificationLoadingStates()[prayer.key]"
                [disabled]="notificationLoadingStates()[prayer.key]"
                (click)="onNotificationToggle(prayer)"
                [attr.aria-label]="'Toggle notifications for ' + prayer.name"
                [attr.aria-pressed]="isNotificationEnabled(prayer.key)"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                </svg>
              </button>
            </div>
          }
        </div>
      </div>
    }
  `,
  styleUrls: ['./prayer-list.component.css']
})
export class PrayerListComponent {
  readonly prayers = input<PrayerItem[]>([]);
  readonly loading = input<boolean>(false);
  readonly error = input<string | null>(null);
  readonly retry = output<void>();

  private readonly notificationService = inject(NotificationService);
  private readonly deviceDetection = inject(DeviceDetectionService);
  readonly notificationLoadingStates = signal<Record<string, boolean>>({});

  isNotificationEnabled(prayerKey: string): boolean {
    return this.notificationService.isPrayerNotificationEnabled(prayerKey);
  }

  async onNotificationToggle(prayer: PrayerItem): Promise<void> {
    const deviceInfo = this.deviceDetection.deviceInfo();

    // Check if installation is required (iOS)
    if (deviceInfo.requiresInstallation) {
      this.showInstallationPrompt();
      return;
    }

    const currentState = this.isNotificationEnabled(prayer.key);
    const newState = !currentState;

    // Set loading state
    this.notificationLoadingStates.set({
      ...this.notificationLoadingStates(),
      [prayer.key]: true
    });

    try {
      // Request permission if not granted
      if (newState && !this.notificationService.isPermissionGranted()) {
        const permission = await this.notificationService.requestPermission();
        if (permission === 'not_supported') {
          throw new Error('Not supported');
        }
        if (permission !== 'granted') {
          throw new Error('Permission denied');
        }
      }

      await this.notificationService.togglePrayerNotification(prayer.key, newState);
    } catch (error: any) {
      if (error.message === 'INSTALLATION_REQUIRED') {
        this.showInstallationPrompt();
      } else if (error.message === 'Permission denied') {
        this.showPermissionDeniedMessage();
      } else if (error.message === 'Not supported') {
        alert('This browser does not support notifications. Try Chrome, Edge, Firefox or Safari, or install QuranFlow to your Home Screen.');
      } else {
        Logger.error('Failed to toggle notification:', error);
        // You can add a toast/alert here to show error to user
      }
    } finally {
      // Clear loading state
      const loadingStates = { ...this.notificationLoadingStates() };
      delete loadingStates[prayer.key];
      this.notificationLoadingStates.set(loadingStates);
    }
  }

  private showInstallationPrompt(): void {
    const message = this.deviceDetection.getInstallationMessage();
    if (message) {
      alert(message);
    }
  }

  private showPermissionDeniedMessage(): void {
    alert(
      this.deviceDetection.deviceInfo().isIOS
        ? 'Notifications are turned off for QuranFlow. Turn them on in Settings › Notifications › QuranFlow.'
        : 'Notifications are blocked for QuranFlow. Allow them in your browser\'s site settings to receive prayer reminders.'
    );
  }

  onRetry(): void {
    this.retry.emit();
  }
}

