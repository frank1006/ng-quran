import { Component, OnInit, OnDestroy, signal, computed, isDevMode, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { take } from 'rxjs/operators';
import { SettingsService, TimeFormat } from '../../services/settings.service';
import { PermissionsService, PermissionStatus } from '../../services/permissions.service';
import { PrayerTimeStore } from '../../store/prayer-time.store';
import { QiblaService } from '../qibla/services/qibla.service';
import { NotificationService } from '../../services/notification.service';
import { NotificationPermissionStatus } from '../../services/notification.types';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.css'
})
export class SettingsComponent implements OnInit, OnDestroy {
  protected readonly TimeFormat = TimeFormat;
  protected readonly PermissionStatus = PermissionStatus;
  protected readonly timeFormat = computed(() => this.settingsService.currentTimeFormat());
  protected readonly compassState = computed(() => this.permissionsService.compassState());
  protected readonly locationState = computed(() => this.permissionsService.locationState());
  
  protected readonly requestingCompass = signal<boolean>(false);
  protected readonly requestingLocation = signal<boolean>(false);
  protected readonly clearingData = signal<boolean>(false);
  protected readonly notificationPermission = computed(() => this.notificationService.isPermissionGranted());
  protected readonly notificationStatus = computed(() => {
    const permission = this.notificationService.isPermissionGranted();
    return permission ? 'granted' : Notification.permission;
  });

  // Location Information
  protected readonly locationInfo = signal<{ quadrant: string; city: string; country: string } | null>(null);
  protected readonly loadingLocation = signal<boolean>(false);

  // App Information
  protected readonly appName = signal<string>('QuranFlow');
  protected readonly appVersion = signal<string>('Beta-v1');
  protected readonly buildNumber = signal<string | null>(null);

  // Accordion state
  protected readonly expandedSections = signal<{ mission: boolean; privacy: boolean }>({
    mission: false,
    privacy: false
  });

  private verifyInterval: number | null = null;

  private readonly qiblaService = inject(QiblaService);
  private readonly notificationService = inject(NotificationService);

  constructor(
    private settingsService: SettingsService,
    private permissionsService: PermissionsService,
    private prayerTimeStore: PrayerTimeStore
  ) {}

  ngOnInit(): void {
    // Refresh compass permission status on component load
    this.permissionsService.checkPermissions();
    
    // Load location information
    this.loadLocationInfo();
    
    // Re-verify compass functionality periodically while on settings page
    // This ensures status reflects actual compass state
    this.verifyInterval = window.setInterval(() => {
      this.permissionsService.checkPermissions();
    }, 5000); // Check every 5 seconds
  }

  /**
   * Load current location information
   */
  private async loadLocationInfo(): Promise<void> {
    const location = this.prayerTimeStore.currentLocation();
    if (!location) {
      return;
    }

    this.loadingLocation.set(true);
    try {
      const locationInfo = await this.qiblaService.getLocationInfo(location.latitude, location.longitude);
      this.locationInfo.set({
        quadrant: locationInfo.quadrant || '',
        city: locationInfo.city,
        country: locationInfo.country
      });
    } catch (error) {
      if (isDevMode()) {
        console.warn('Failed to load location info in settings:', error);
      }
    } finally {
      this.loadingLocation.set(false);
    }
  }

  ngOnDestroy(): void {
    // Cleanup interval on component destroy
    if (this.verifyInterval !== null) {
      clearInterval(this.verifyInterval);
      this.verifyInterval = null;
    }
  }

  /**
   * Handle time format change
   */
  protected onTimeFormatChange(format: TimeFormat): void {
    this.settingsService.setTimeFormat(format);
  }

  /**
   * Request compass permission
   */
  protected async requestCompassPermission(): Promise<void> {
    this.requestingCompass.set(true);
    
    try {
      const granted = await this.permissionsService.requestCompassPermission();
      
      if (granted) {
        // Permission granted - refresh status
        this.permissionsService.checkPermissions();
        // Give a brief moment for localStorage to be updated
        await new Promise(resolve => setTimeout(resolve, 100));
      } else {
        // Permission denied
        this.permissionsService.checkPermissions();
      }
    } catch (error) {
      if (isDevMode()) {
        console.error('Error requesting compass permission:', error);
      }
      this.permissionsService.checkPermissions();
    } finally {
      this.requestingCompass.set(false);
    }
  }

  /**
   * Request location permission
   */
  protected requestLocationPermission(): void {
    this.requestingLocation.set(true);
    
    // Use take(1) to auto-unsubscribe after completion
    this.permissionsService.requestLocationPermission()
      .pipe(take(1))
      .subscribe({
        next: (granted) => {
          if (granted) {
            // Permission granted - refresh status and reload location info
            this.permissionsService.checkPermissions();
            this.loadLocationInfo();
          } else {
            // Permission denied
            this.permissionsService.checkPermissions();
          }
          this.requestingLocation.set(false);
        },
        error: (error) => {
          if (isDevMode()) {
            console.error('Error requesting location permission:', error);
          }
          this.permissionsService.checkPermissions();
          this.requestingLocation.set(false);
        }
      });
  }

  /**
   * Get permission status text
   */
  protected getPermissionStatusText(status: PermissionStatus): string {
    return this.permissionsService.getPermissionStatusText(status);
  }

  /**
   * Get permission status class for styling
   */
  protected getPermissionStatusClass(status: PermissionStatus): string {
    switch (status) {
      case PermissionStatus.GRANTED:
        return 'status-allowed';
      case PermissionStatus.DENIED:
        return 'status-denied';
      case PermissionStatus.NOT_SUPPORTED:
        return 'status-not-supported';
      default:
        return 'status-not-requested';
    }
  }

  /**
   * Toggle accordion section
   */
  protected toggleAccordion(section: 'mission' | 'privacy'): void {
    const current = this.expandedSections();
    this.expandedSections.set({
      ...current,
      [section]: !current[section]
    });
  }

  /**
   * Reset permissions and clear all cache data (preserves user-store with user preferences)
   */
  protected resetDataAndPermissions(): void {
    if (!confirm('Are you sure you want to reset permissions and clear all cache data? This will clear API cache and reset permissions, but your preferences (time format, bookmarks, etc.) will be preserved. This action cannot be undone.')) {
      return;
    }

    this.clearingData.set(true);

    try {
      // Clear prayer times cache (API cache)
      this.prayerTimeStore.clearCache();

      // Clear app-specific localStorage items (EXCEPT user-store)
      if (typeof localStorage !== 'undefined') {
        // Clear prayer times cache
        localStorage.removeItem('prayer-time-cache');
        // Clear compass permission
        localStorage.removeItem('qibla_compass_permission_granted');
        // Clear location info cache
        localStorage.removeItem('location-info-cache');
        // Clear masjid cache
        localStorage.removeItem('masjid-cache');
        // Clear quran cache
        localStorage.removeItem('quran-cache');
        // Clear notification settings (separate from user-store)
        localStorage.removeItem('prayer_notification_settings');
        // Clear old cache keys
        localStorage.removeItem('masjid-last-radius');
        localStorage.removeItem('quran-api-chapters');
        localStorage.removeItem('quran-api-reciters');
        // Clear old chapter keys
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const key = localStorage.key(i);
          if (key && key.startsWith('quran-api-chapter-')) {
            localStorage.removeItem(key);
          }
        }
      }

      // Disable and cancel all notifications
      this.notificationService.setNotificationsEnabled(false).catch(() => {
        // Silently handle if notifications are not available
      });

      // Refresh permission statuses
      this.permissionsService.checkPermissions();

      // Reload the page to reset all state
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch (error) {
      if (isDevMode()) {
        console.error('Error resetting data and permissions:', error);
      }
      alert('Failed to reset data and permissions. Please try again.');
      this.clearingData.set(false);
    }
  }
}

