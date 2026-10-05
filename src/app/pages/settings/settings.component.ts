import { Component, OnInit, OnDestroy, signal, computed, isDevMode, inject, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { take } from 'rxjs/operators';
import { SettingsService, TimeFormat, AsrSchool, CALCULATION_METHODS } from '../../services/settings.service';
import { DistanceUnit, TemperatureUnit } from '../../services/units';
import { PermissionsService, PermissionStatus } from '../../services/permissions.service';
import { PrayerTimeStore } from '../../store/prayer-time.store';
import { QiblaService } from '../qibla/services/qibla.service';
import { NotificationService } from '../../services/notification.service';
import { NotificationPermissionStatus } from '../../services/notification.types';
import { UserStoreService, Bookmark } from '../../services/user-store.service';
import { QuranApiService } from '../../services/quran-api.service';
import { Chapter } from '../../services/quran-api.types';

type ProfileTab = 'bookmarks' | 'preferences' | 'app';
const TAB_STORAGE_KEY = 'profile-tab';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.css'
})
export class SettingsComponent implements OnInit, OnDestroy {
  protected readonly tabs: { id: ProfileTab; label: string }[] = [
    { id: 'bookmarks', label: 'Bookmarks' },
    { id: 'preferences', label: 'Preferences' },
    { id: 'app', label: 'App' },
  ];
  protected readonly activeTab = signal<ProfileTab>(this.readStoredTab());

  protected readonly TimeFormat = TimeFormat;
  protected readonly PermissionStatus = PermissionStatus;
  protected readonly timeFormat = computed(() => this.settingsService.currentTimeFormat());
  protected readonly calculationMethods = CALCULATION_METHODS;
  protected readonly calcMethod = computed(() => this.settingsService.calcMethod());
  protected readonly asrSchool = computed(() => this.settingsService.asrSchool());
  protected readonly distanceUnit = computed(() => this.settingsService.distanceUnit());
  protected readonly temperatureUnit = computed(() => this.settingsService.temperatureUnit());
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

  // Bookmarks
  protected readonly bookmarks = computed(() => this.userStore.bookmarks());
  protected readonly chapters = signal<Chapter[]>([]);
  protected readonly loadingChapters = signal<boolean>(false);
  
  protected readonly groupedBookmarks = computed(() => {
    const bookmarksList = this.bookmarks();
    const chaptersMap = this.chapters();
    
    if (chaptersMap.length === 0 || bookmarksList.length === 0) {
      return [];
    }
    
    // Group bookmarks by chapterId
    const grouped = new Map<number, {
      chapterId: number;
      chapterName: string;
      chapterTransliteration: string;
      chapterTranslation: string;
      verses: Array<Bookmark & {
        chapterName: string;
        chapterTransliteration: string;
        chapterTranslation: string;
      }>;
    }>();
    
    bookmarksList.forEach(bookmark => {
      const chapter = chaptersMap.find(c => c.id === bookmark.chapterId);
      const chapterName = chapter ? chapter.name : `Chapter ${bookmark.chapterId}`;
      const chapterTransliteration = chapter ? chapter.transliteration : '';
      const chapterTranslation = chapter ? chapter.translation : '';
      
      if (!grouped.has(bookmark.chapterId)) {
        grouped.set(bookmark.chapterId, {
          chapterId: bookmark.chapterId,
          chapterName,
          chapterTransliteration,
          chapterTranslation,
          verses: []
        });
      }
      
      const group = grouped.get(bookmark.chapterId);
      if (group) {
        group.verses.push({
          ...bookmark,
          chapterName,
          chapterTransliteration,
          chapterTranslation
        });
      }
    });
    
    // Sort verses within each group by timestamp (most recent first)
    grouped.forEach(group => {
      group.verses.sort((a, b) => b.timestamp - a.timestamp);
    });
    
    // Convert to array and sort by most recent bookmark timestamp (most recent first)
    return Array.from(grouped.values()).sort((a, b) => {
      // Handle empty verses arrays safely
      if (a.verses.length === 0 && b.verses.length === 0) return 0;
      if (a.verses.length === 0) return 1; // Empty groups go to end
      if (b.verses.length === 0) return -1; // Empty groups go to end
      
      const aLatest = Math.max(...a.verses.map(v => v.timestamp));
      const bLatest = Math.max(...b.verses.map(v => v.timestamp));
      return bLatest - aLatest;
    });
  });

  // App Information
  protected readonly appName = signal<string>('QuranFlow');
  protected readonly appVersion = signal<string>('Beta-v1');
  protected readonly buildNumber = signal<string | null>(null);

  // Accordion state
  protected readonly expandedSections = signal<{ mission: boolean; privacy: boolean; credits: boolean }>({
    credits: false,
    mission: false,
    privacy: false
  });

  private verifyInterval: number | null = null;

  private readonly qiblaService = inject(QiblaService);
  private readonly notificationService = inject(NotificationService);
  private readonly userStore = inject(UserStoreService);
  private readonly quranApi = inject(QuranApiService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

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
    
    // Load chapters for bookmark display
    this.loadChapters();
    
    // Re-verify compass functionality periodically while on settings page
    // This ensures status reflects actual compass state
    this.verifyInterval = window.setInterval(() => {
      this.permissionsService.checkPermissions();
    }, 5000); // Check every 5 seconds
  }

  /**
   * Load chapters for bookmark display
   */
  private loadChapters(): void {
    this.loadingChapters.set(true);
    this.quranApi.getChapters()
      .pipe(
        take(1),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (chapters) => {
          this.chapters.set(chapters);
          this.loadingChapters.set(false);
        },
        error: (error) => {
          if (isDevMode()) {
            console.error('Error loading chapters for bookmarks:', error);
          }
          this.loadingChapters.set(false);
        }
      });
  }

  /**
   * Navigate to bookmarked verse
   */
  protected navigateToBookmark(bookmark: Bookmark): void {
    this.router.navigate(['/quran', bookmark.chapterId], {
      fragment: `verse-${bookmark.verseNumber}`
    });
  }

  /**
   * Remove bookmark
   */
  protected removeBookmark(bookmark: Bookmark, event: Event): void {
    event.stopPropagation(); // Prevent navigation when clicking remove
    this.userStore.removeBookmark(bookmark.chapterId, bookmark.verseNumber);
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
   * Change calculation method ('auto' = chosen by location); cached times are recalculated
   */
  protected onCalcMethodChange(value: string): void {
    this.settingsService.setCalcMethod(value === 'auto' ? null : Number(value));
    this.prayerTimeStore.clearCache();
  }

  protected setDistanceUnit(unit: DistanceUnit): void {
    this.settingsService.setDistanceUnit(unit);
  }

  protected setTemperatureUnit(unit: TemperatureUnit): void {
    this.settingsService.setTemperatureUnit(unit);
  }

  protected onAsrSchoolChange(school: AsrSchool): void {
    this.settingsService.setAsrSchool(school);
    this.prayerTimeStore.clearCache();
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
  protected selectTab(tab: ProfileTab): void {
    this.activeTab.set(tab);
    try {
      localStorage.setItem(TAB_STORAGE_KEY, tab);
    } catch {
      // Not remembered in private mode: fine
    }
  }

  /** Arrow keys move between tabs (WAI-ARIA tabs pattern) */
  protected onTabKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const index = this.tabs.findIndex(tab => tab.id === this.activeTab());
    const step = event.key === 'ArrowRight' ? 1 : -1;
    const next = this.tabs[(index + step + this.tabs.length) % this.tabs.length].id;
    this.selectTab(next);
    document.getElementById('tab-' + next)?.focus();
    event.preventDefault();
  }

  private readStoredTab(): ProfileTab {
    try {
      const stored = localStorage.getItem(TAB_STORAGE_KEY);
      return stored === 'preferences' || stored === 'app' ? stored : 'bookmarks';
    } catch {
      return 'bookmarks';
    }
  }

  protected toggleAccordion(section: 'mission' | 'privacy' | 'credits'): void {
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

