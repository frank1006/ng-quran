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

  ngOnInit(): void {
    this.initializeQibla();
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
      const location = this.location();

      if (!location) {
        // Location not yet available in store, trigger it through store
        this.error.set('Location not available. Please enable location access.');
        this.loading.set(false);
        return;
      }

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
      if (typeof window !== 'undefined') {
        this.compassAvailable.set(!!window.DeviceOrientationEvent);
      }

      this.loading.set(false);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to initialize Qibla');
      this.loading.set(false);
    }
  }

  /**
   * Request compass permission and start listening to device compass updates
   * This must be called from a user gesture (button click) on iOS
   */
  protected requestCompassPermission(): void {
    this.compassPermissionRequested.set(true);
    this.error.set(null);

    // Clean up previous subscription if exists
    if (this.headingSubscription) {
      this.headingSubscription.unsubscribe();
    }

    this.headingSubscription = this.qiblaService.getDeviceHeading().subscribe({
      next: (heading) => {
        if (heading !== null) {
          this.compassPermissionGranted.set(true);
          // Force update by setting to new object reference
          this.currentHeading.set(heading);
          this.updateInstruction();
          // Debug: Log heading updates (remove in production)
          if (typeof console !== 'undefined' && console.log) {
            const rotation = -heading;
            const qiblaAngle = this.qiblaBearing() - heading;
            console.log('Device heading:', heading.toFixed(1) + '°', 
                       'Compass rotation:', rotation.toFixed(1) + '°',
                       'Qibla angle:', qiblaAngle.toFixed(1) + '°');
          }
        } else {
          this.compassPermissionGranted.set(false);
          this.currentHeading.set(null);
          if (!this.error()) {
            this.error.set('Compass permission not granted. Please allow device motion access.');
          }
        }
      },
      error: (err) => {
        // Compass not available, but we can still show Qibla direction
        this.compassPermissionGranted.set(false);
        this.currentHeading.set(null);
        this.error.set('Unable to access compass. Please check device permissions.');
        console.error('Compass error:', err);
      }
    });
  }

  /**
   * Start listening to device compass updates (if permission already granted)
   */
  private startCompassUpdates(): void {
    // Only auto-start if permission was previously granted
    if (this.compassPermissionGranted()) {
      this.requestCompassPermission();
    }
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
