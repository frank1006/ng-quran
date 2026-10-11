import { Component, DestroyRef, input, output, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConnectionErrorComponent } from '../../../../shared/components/connection-error/connection-error.component';
import { NotificationService } from '../../../../services/notification.service';
import { DeviceDetectionService } from '../../../../services/device-detection.service';
import { ReminderMode } from '../../../../services/notification.types';
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

const NEXT_MODE: Record<ReminderMode, ReminderMode> = { off: 'sound', sound: 'silent', silent: 'off' };

@Component({
  selector: 'app-prayer-list',
  standalone: true,
  imports: [CommonModule, ConnectionErrorComponent],
  // Times on screen stay while they refresh. With none yet: an error if there is one, otherwise a
  // skeleton of the six rows (loading, or waiting for the location), never an empty space.
  template: `
    @if (prayers().length > 0) {
      <div class="prayer-list-container">
        <div class="prayer-list">
          @for (prayer of prayers(); track prayer.key) {
            <div class="prayer-card" [class.active]="prayer.isActive" [class.passed]="prayer.hasPassed">
              <div class="prayer-info">
                <h3 class="prayer-title">{{ prayer.name }}</h3>
                <p class="prayer-time">{{ prayer.time }}</p>
              </div>
              @let mode = reminderMode(prayer.key);
              <button
                class="ui-icon-btn notification-button"
                type="button"
                [class.is-on]="mode === 'sound'"
                [class.is-silent]="mode === 'silent'"
                [class.loading]="notificationLoadingStates()[prayer.key]"
                [disabled]="notificationLoadingStates()[prayer.key]"
                (click)="onReminderTap(prayer)"
                [attr.aria-label]="prayer.name + ' reminder: ' + modeLabels[mode] + '. Tap to change.'"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  @switch (mode) {
                    @case ('sound') {
                      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                      <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                      <path d="M2 8a10 10 0 0 1 2.6-5.5M22 8a10 10 0 0 0-2.6-5.5"></path>
                    }
                    @case ('silent') {
                      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                      <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                    }
                    @default {
                      <path d="M8.7 3A6 6 0 0 1 18 8c0 2.2.3 3.9.8 5.2M17 17H3s3-2 3-9c0-.5.1-1 .2-1.5"></path>
                      <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                      <path d="M3 3l18 18"></path>
                    }
                  }
                </svg>
              </button>
            </div>
          }
        </div>
        <p class="mode-hint" role="status" [class.is-shown]="modeHint()">{{ modeHint() }}</p>
      </div>
    } @else if (error() && !loading()) {
      <div class="prayer-state">
        <app-connection-error
          [errorMessage]="error()!"
          (retry)="onRetry()"
        />
      </div>
    } @else {
      <div class="prayer-list-container" role="status" aria-label="Loading prayer times">
        <div class="prayer-list">
          @for (row of skeletonRows; track $index) {
            <div class="prayer-card" aria-hidden="true">
              <div class="prayer-info">
                <span class="ui-skeleton skeleton-name" [style.width.rem]="row"></span>
                <span class="ui-skeleton skeleton-time"></span>
              </div>
              <span class="ui-skeleton skeleton-bell"></span>
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
  /** Name widths of the six skeleton rows (Fajr … Isha), so it looks like the real list */
  protected readonly skeletonRows = [3, 4.25, 3.75, 2.5, 4.5, 2.75];

  private readonly notificationService = inject(NotificationService);
  private readonly deviceDetection = inject(DeviceDetectionService);
  readonly notificationLoadingStates = signal<Record<string, boolean>>({});

  /** What each bell state is called, on the hint and for screen readers */
  protected readonly modeLabels: Record<ReminderMode, string> = {
    off: 'off',
    sound: 'with sound',
    silent: 'silent, no sound',
  };
  /** Shown briefly after a tap, so the three bell states explain themselves */
  protected readonly modeHint = signal('');
  private hintTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.hintTimer));
  }

  protected reminderMode(prayerKey: string): ReminderMode {
    return this.notificationService.prayerMode(prayerKey);
  }

  /** Each tap moves the bell on: off → with sound → silent → off */
  async onReminderTap(prayer: PrayerItem): Promise<void> {
    const deviceInfo = this.deviceDetection.deviceInfo();

    // Check if installation is required (iOS)
    if (deviceInfo.requiresInstallation) {
      this.showInstallationPrompt();
      return;
    }

    const newMode = NEXT_MODE[this.reminderMode(prayer.key)];

    // Set loading state
    this.notificationLoadingStates.set({
      ...this.notificationLoadingStates(),
      [prayer.key]: true
    });

    try {
      // Request permission if not granted
      if (newMode !== 'off' && !this.notificationService.isPermissionGranted()) {
        const permission = await this.notificationService.requestPermission();
        if (permission === 'not_supported') {
          throw new Error('Not supported');
        }
        if (permission !== 'granted') {
          throw new Error('Permission denied');
        }
      }

      await this.notificationService.setPrayerMode(prayer.key, newMode);
      this.showHint(`${prayer.name} reminder: ${this.modeLabels[newMode]}`);
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

  private showHint(text: string): void {
    this.modeHint.set(text);
    clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => this.modeHint.set(''), 2500);
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

