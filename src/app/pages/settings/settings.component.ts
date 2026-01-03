import { Component, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SettingsService, TimeFormat } from '../../services/settings.service';
import { PermissionsService, PermissionStatus } from '../../services/permissions.service';
import { PrayerTimeStore } from '../../store/prayer-time.store';

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
  
  protected readonly requestingCompass = signal<boolean>(false);
  protected readonly clearingData = signal<boolean>(false);

  private verifyInterval: number | null = null;

  constructor(
    private settingsService: SettingsService,
    private permissionsService: PermissionsService,
    private prayerTimeStore: PrayerTimeStore
  ) {}

  ngOnInit(): void {
    // Refresh compass permission status on component load
    this.permissionsService.checkPermissions();
    
    // Re-verify compass functionality periodically while on settings page
    // This ensures status reflects actual compass state
    this.verifyInterval = window.setInterval(() => {
      this.permissionsService.checkPermissions();
    }, 5000); // Check every 5 seconds
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
      console.error('Error requesting compass permission:', error);
      this.permissionsService.checkPermissions();
    } finally {
      this.requestingCompass.set(false);
    }
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
   * Reset data and permissions - clears local storage, API cache, and resets permissions
   */
  protected resetDataAndPermissions(): void {
    if (!confirm('Are you sure you want to reset all data and permissions? This will remove prayer times cache, settings, and all stored preferences. This action cannot be undone.')) {
      return;
    }

    this.clearingData.set(true);

    try {
      // Clear prayer times cache (API cache)
      this.prayerTimeStore.clearCache();

      // Clear app-specific localStorage items
      if (typeof localStorage !== 'undefined') {
        // Clear prayer times cache
        localStorage.removeItem('prayer-time-cache');
        // Clear time format preference
        localStorage.removeItem('app_time_format');
        // Clear compass permission
        localStorage.removeItem('qibla_compass_permission_granted');
      }

      // Reset time format to default
      this.settingsService.setTimeFormat(TimeFormat.TWENTY_FOUR_HOUR);

      // Refresh permission statuses
      this.permissionsService.checkPermissions();

      // Reload the page to reset all state
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch (error) {
      console.error('Error resetting data and permissions:', error);
      alert('Failed to reset data and permissions. Please try again.');
      this.clearingData.set(false);
    }
  }
}

