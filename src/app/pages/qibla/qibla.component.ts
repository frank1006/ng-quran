import { Component, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { PrayerTimeStore } from '../../store/prayer-time.store';
import { QiblaService, CompassInstruction } from './services/qibla.service';
import { QiblaCompassComponent } from './components/qibla-compass.component';
import { QiblaHeaderComponent } from './components/qibla-header.component';

@Component({
  selector: 'app-qibla',
  standalone: true,
  imports: [CommonModule, QiblaCompassComponent, QiblaHeaderComponent],
  templateUrl: './qibla.component.html',
  styleUrl: './qibla.component.css'
})
export class QiblaComponent implements OnInit, OnDestroy {
  protected readonly loading = signal<boolean>(false);
  protected readonly error = signal<string | null>(null);
  protected readonly cityName = signal<string>('Loading...');
  protected readonly countryName = signal<string>('Loading...');
  protected readonly qiblaBearing = signal<number>(0);
  protected readonly currentHeading = signal<number | null>(null);
  protected readonly instruction = signal<CompassInstruction>(CompassInstruction.TURN_LEFT);
  protected readonly compassPermissionGranted = signal<boolean>(false);
  protected readonly compassPermissionRequested = signal<boolean>(false);
  protected readonly compassAvailable = signal<boolean>(false);
  protected readonly needsPermissionButton = signal<boolean>(false);

  private headingSubscription: Subscription | null = null;
  private locationSubscription: Subscription | null = null;
  private lastLocationKey: string | null = null; // Cache key for location info lookup

  constructor(
    private prayerTimeStore: PrayerTimeStore,
    private qiblaService: QiblaService
  ) {}

  /**
   * Current location from store
   */
  protected readonly location = computed(() => this.prayerTimeStore.currentLocation());

  /**
   * Watch for location changes and reinitialize if location becomes available
   */
  private locationWatcher: any = null;

  ngOnInit(): void {
    this.initializeQibla();
    
    // Watch for location changes (in case location becomes available after permission is granted)
    this.locationWatcher = setInterval(() => {
      const currentLocation = this.location();
      // If we have an error and location becomes available, reinitialize
      if (this.error() && currentLocation && !this.loading()) {
        this.initializeQibla();
      }
    }, 1000);
  }

  ngOnDestroy(): void {
    if (this.headingSubscription) {
      this.headingSubscription.unsubscribe();
      this.headingSubscription = null;
    }
    if (this.locationSubscription) {
      this.locationSubscription.unsubscribe();
      this.locationSubscription = null;
    }
    if (this.locationWatcher) {
      clearInterval(this.locationWatcher);
      this.locationWatcher = null;
    }
  }

  /**
   * Initialize Qibla direction calculation
   * Uses location from PrayerTimeStore (no new location request needed)
   */
  private async initializeQibla(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      // Get current location from store (already available from prayer times)
      let location = this.location();

      // If location is not immediately available, wait a bit and check again
      // This handles the case where permission was just granted in settings
      if (!location) {
        // Try to trigger location fetch through store
        const today = new Date();
        this.prayerTimeStore.preloadPrayerTimes(today).subscribe({
          next: () => {
            // Wait a moment for location to be stored
            setTimeout(() => {
              location = this.location();
              if (location) {
                this.continueQiblaInitialization(location);
              } else {
                this.error.set('Location not available. Please enable location access.');
                this.loading.set(false);
              }
            }, 300);
          },
          error: (err) => {
            this.error.set('Location not available. Please enable location access.');
            this.loading.set(false);
          }
        });
        return;
      }

      this.continueQiblaInitialization(location);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to initialize Qibla');
      this.loading.set(false);
    }
  }

  /**
   * Continue Qibla initialization with location
   */
  private async continueQiblaInitialization(location: { latitude: number; longitude: number }): Promise<void> {
    try {

      // Calculate Qibla bearing from store's location (no new API call)
      const bearing = this.qiblaService.calculateQiblaBearing(
        location.latitude,
        location.longitude
      );
      this.qiblaBearing.set(bearing);

      // Only fetch location info if location changed (cached in service)
      const locationKey = `${location.latitude.toFixed(2)},${location.longitude.toFixed(2)}`;
      if (this.lastLocationKey !== locationKey) {
        this.lastLocationKey = locationKey;
        // Location info is cached in QiblaService, so this won't make redundant requests
        const locationInfo = await this.qiblaService.getLocationInfo(
          location.latitude,
          location.longitude
        );
        this.cityName.set(locationInfo.city);
        this.countryName.set(locationInfo.country);
      }

      // Check if Device Orientation is available
      this.compassAvailable.set(this.qiblaService.isDeviceOrientationSupported());

      // Check if permission was previously granted (from localStorage)
      if (this.compassAvailable()) {
        const wasGranted = this.qiblaService.isCompassPermissionGranted();

        if (wasGranted) {
          // Auto-start if permission was previously granted
          // Try to start listening immediately
          this.startCompassListening();
        } else {
          // Show "Enable Compass" button (requires user gesture on iOS)
          this.needsPermissionButton.set(true);
        }
      }

      this.loading.set(false);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to initialize Qibla');
      this.loading.set(false);
    }
  }

  /**
   * User action to enable compass (called from button click)
   * Requests permission and starts listening if granted
   */
  async enableCompass(): Promise<void> {
    this.needsPermissionButton.set(false);
    this.compassPermissionRequested.set(true);

    // Check if permission was already granted (from settings page)
    const wasAlreadyGranted = this.qiblaService.isCompassPermissionGranted();
    
    if (wasAlreadyGranted) {
      // Permission was already granted, just start listening
      this.startCompassListening();
      return;
    }

    // Request permission if not already granted
    const granted = await this.qiblaService.requestCompassPermission();

    if (granted) {
      this.startCompassListening();
    } else {
      this.compassPermissionRequested.set(false);
      this.error.set('Compass permission denied. Please enable in your browser settings.');
    }
  }

  /**
   * Start listening to device compass updates
   * Called when permission is already granted or after user grants permission
   */
  private startCompassListening(): void {
    // Clean up previous subscription if exists
    if (this.headingSubscription) {
      this.headingSubscription.unsubscribe();
    }

    // Start listening to compass updates
    this.headingSubscription = this.qiblaService.getDeviceHeading().subscribe({
      next: (heading) => {
        if (heading !== null) {
          this.compassPermissionGranted.set(true);
          this.compassPermissionRequested.set(false);
          this.needsPermissionButton.set(false);
          this.currentHeading.set(heading);
          this.updateInstruction();
        } else {
          // If heading is null but permission was saved, it might need user gesture on iOS
          // Don't immediately show button, wait a bit to see if it starts
          const wasGranted = this.qiblaService.isCompassPermissionGranted();
          if (!wasGranted) {
            this.compassPermissionGranted.set(false);
            this.compassPermissionRequested.set(false);
            this.currentHeading.set(null);
            this.needsPermissionButton.set(true);
          }
        }
      },
      error: (err) => {
        // Compass not available, but we can still show Qibla direction
        console.error('Compass error:', err);
        // Check if permission was saved - if yes, show button to retry
        const wasGranted = this.qiblaService.isCompassPermissionGranted();
        if (wasGranted) {
          // Permission was granted but event listener failed - might need user gesture
          this.needsPermissionButton.set(true);
        } else {
          this.compassPermissionGranted.set(false);
          this.compassPermissionRequested.set(false);
          this.currentHeading.set(null);
          this.needsPermissionButton.set(true);
        }
      }
    });
  }


  /**
   * Update instruction based on current heading and Qibla bearing
   */
  private updateInstruction(): void {
    const heading = this.currentHeading();
    const bearing = this.qiblaBearing();

    if (heading === null) {
      // No compass available, show default message
      this.instruction.set(CompassInstruction.TURN_LEFT);
      return;
    }

    const angleDiff = this.qiblaService.calculateAngleDifference(heading, bearing);
    const instruction = this.qiblaService.getInstruction(angleDiff);
    this.instruction.set(instruction);
  }

  /**
   * Get instruction text
   */
  protected readonly instructionText = computed<string>(() => {
    return this.instruction();
  });

  /**
   * Request location access
   */
  protected async requestLocation(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    // Clean up previous subscription if exists
    if (this.locationSubscription) {
      this.locationSubscription.unsubscribe();
    }

    try {
      // Trigger location fetch through store
      const today = new Date();
      this.locationSubscription = this.prayerTimeStore.preloadPrayerTimes(today).subscribe({
        next: () => {
          // Location should be available now
          this.initializeQibla();
        },
        error: (err) => {
          this.error.set(err instanceof Error ? err.message : 'Failed to get location');
          this.loading.set(false);
        }
      });
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to request location');
      this.loading.set(false);
    }
  }
}
