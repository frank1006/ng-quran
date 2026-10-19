import { Component, input, output, signal, inject, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConnectionErrorComponent } from '../../../../shared/components/connection-error/connection-error.component';
import { NotificationService } from '../../../../services/notification.service';
import { DeviceDetectionService } from '../../../../services/device-detection.service';
import { ReminderMode } from '../../../../services/notification.types';
import { Logger } from '../../../../core/logger.util';
import { ToastService } from '../../../../core/toast.service';
import { isNativeApp } from '../../../../core/native-app';
import { ReminderChoice, ReminderIconComponent, ReminderSheetComponent } from '../reminder-sheet/reminder-sheet.component';

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

/** The website's bell cycles; the app's opens the reminder sheet */
const NEXT_MODE: Record<ReminderMode, ReminderMode> = { off: 'sound', sound: 'silent', silent: 'off', adhan: 'silent' };

@Component({
  selector: 'app-prayer-list',
  standalone: true,
  imports: [CommonModule, ConnectionErrorComponent, ReminderIconComponent, ReminderSheetComponent],
  // Times on screen stay while they refresh. With none yet: an error if there is one, otherwise a
  // skeleton of the six rows (loading, or waiting for the location), never an empty space.
  template: `
    @if (prayers().length > 0) {
      <div class="prayer-list-container">
        <div class="prayer-list">
          @for (prayer of prayers(); track prayer.key) {
            @let mode = reminderMode(prayer.key);
            <!-- The whole row sets the reminder; the bell shows how it's set -->
            <button
              type="button"
              class="prayer-card"
              [class.active]="prayer.isActive"
              [class.passed]="prayer.hasPassed"
              [class.loading]="notificationLoadingStates()[prayer.key]"
              [disabled]="notificationLoadingStates()[prayer.key]"
              (click)="onReminderTap(prayer)"
              [attr.aria-label]="prayer.name + ' ' + prayer.time + ', reminder: ' + modeLabels[mode] + (isNativeApp ? '. Tap to choose.' : '. Tap to change.')"
            >
              <span class="prayer-info">
                <span class="prayer-title">{{ prayer.name }}</span>
                <span class="prayer-time">{{ prayer.time }}</span>
              </span>
              <span
                class="ui-icon-btn notification-button"
                [class.is-on]="mode === 'sound' || mode === 'adhan'"
                [class.is-silent]="mode === 'silent'"
                aria-hidden="true"
              >
                <app-reminder-icon [mode]="mode" />
              </span>
            </button>
          }
        </div>
      </div>
      @if (isNativeApp) {
        <app-reminder-sheet (chosen)="onReminderChosen($event)" />
      }
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
  private readonly toasts = inject(ToastService);
  readonly notificationLoadingStates = signal<Record<string, boolean>>({});

  protected readonly isNativeApp = isNativeApp;
  private readonly sheet = viewChild(ReminderSheetComponent);

  /** What each bell state is called, in the toast and for screen readers */
  protected readonly modeLabels: Record<ReminderMode, string> = isNativeApp
    ? { off: 'off', sound: 'notification sound', silent: 'vibrate only', adhan: 'full adhan' }
    : { off: 'off', sound: 'with sound', silent: 'silent, no sound', adhan: 'full adhan' };
  protected reminderMode(prayerKey: string): ReminderMode {
    return this.notificationService.prayerMode(prayerKey);
  }

  /** On the website each tap moves the bell on (off → with sound → silent → off); in the app it opens the choices */
  async onReminderTap(prayer: PrayerItem): Promise<void> {
    // Check if installation is required (iOS)
    if (this.deviceDetection.deviceInfo().requiresInstallation) {
      this.showInstallationPrompt();
      return;
    }

    const sheet = this.sheet();
    if (sheet) {
      sheet.open(prayer, this.reminderMode(prayer.key));
      return;
    }

    const newMode = NEXT_MODE[this.reminderMode(prayer.key)];
    if (await this.applyMode([prayer.key], newMode)) {
      // Says what the tap did, so the three bell states explain themselves
      this.toasts.show(`${prayer.name} reminder: ${this.modeLabels[newMode]}`);
    }
  }

  /** A choice from the app's reminder sheet, for one prayer or all five */
  async onReminderChosen({ prayer, mode, allPrayers }: ReminderChoice): Promise<void> {
    const keys = allPrayers
      ? this.prayers().map(p => p.key).filter(key => key !== 'sunrise')
      : [prayer.key];
    if (await this.applyMode(keys, mode)) {
      this.toasts.show(`${allPrayers ? 'All prayers' : prayer.name + ' reminder'}: ${this.modeLabels[mode]}`);
    }
  }

  /** Sets the prayers' reminders, asking for the notification permission first if needed */
  private async applyMode(keys: string[], mode: ReminderMode): Promise<boolean> {
    const loading = (on: boolean) => {
      const states = { ...this.notificationLoadingStates() };
      for (const key of keys) {
        if (on) states[key] = true;
        else delete states[key];
      }
      this.notificationLoadingStates.set(states);
    };
    loading(true);

    try {
      // Request permission if not granted
      if (mode !== 'off' && !this.notificationService.isPermissionGranted()) {
        const permission = await this.notificationService.requestPermission();
        if (permission === 'not_supported') {
          throw new Error('Not supported');
        }
        if (permission !== 'granted') {
          throw new Error('Permission denied');
        }
      }

      for (const key of keys) await this.notificationService.setPrayerMode(key, mode);
      return true;
    } catch (error: any) {
      if (error.message === 'INSTALLATION_REQUIRED') {
        this.showInstallationPrompt();
      } else if (error.message === 'Permission denied') {
        this.showPermissionDeniedMessage();
      } else if (error.message === 'Not supported') {
        alert('This browser does not support notifications. Try Chrome, Edge, Firefox or Safari, or install QuranFlow to your Home Screen.');
      } else {
        Logger.error('Failed to toggle notification:', error);
      }
      return false;
    } finally {
      loading(false);
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
      isNativeApp
        ? 'Notifications are turned off for QuranFlow. Turn them on in your phone\'s Settings › Apps › QuranFlow › Notifications.'
        : this.deviceDetection.deviceInfo().isIOS
        ? 'Notifications are turned off for QuranFlow. Turn them on in Settings › Notifications › QuranFlow.'
        : 'Notifications are blocked for QuranFlow. Allow them in your browser\'s site settings to receive prayer reminders.'
    );
  }

  onRetry(): void {
    this.retry.emit();
  }
}

