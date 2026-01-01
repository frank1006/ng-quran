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
      this.compassAvailable.set(this.qiblaService.isDeviceOrientationSupported());

      // Automatically request compass permission if available
      if (this.compassAvailable()) {
        this.requestCompassPermission();
      }

      this.loading.set(false);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to initialize Qibla');
      this.loading.set(false);
    }
  }

  /**
   * Request compass permission and start listening to device compass updates
   * Automatically requests permission if not already granted (saved in localStorage)
   */
  private async requestCompassPermission(): Promise<void> {
    this.compassPermissionRequested.set(true);
    this.error.set(null);

    // Check if permission was previously granted
    const wasGranted = this.qiblaService.isCompassPermissionGranted();

    // Request permission if not already granted
    if (!wasGranted) {
      const granted = await this.qiblaService.requestCompassPermission();
      if (!granted) {
        // Permission denied, but don't show error immediately
        // User can still see Qibla direction (without compass rotation)
        this.compassPermissionGranted.set(false);
        this.compassPermissionRequested.set(false);
        return;
      }
    }

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
          this.currentHeading.set(heading);
          this.updateInstruction();
        } else {
          this.compassPermissionGranted.set(false);
          this.compassPermissionRequested.set(false);
          this.currentHeading.set(null);
        }
      },
      error: (err) => {
        // Compass not available, but we can still show Qibla direction
        this.compassPermissionGranted.set(false);
        this.compassPermissionRequested.set(false);
        this.currentHeading.set(null);
        console.error('Compass error:', err);
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
