import { Component, OnInit, OnDestroy, signal, computed, effect, inject, DestroyRef, isDevMode } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PrayerTimeStore } from '../../store/prayer-time.store';
import { QiblaService, CompassInstruction, NO_ABSOLUTE_COMPASS } from './services/qibla.service';
import { QiblaCompassComponent } from './components/qibla-compass.component';
import { ConnectionErrorComponent } from '../../shared/components/connection-error/connection-error.component';
import { HeroHeaderComponent } from '../../shared/components/hero-header/hero-header.component';
import { PermissionsService } from '../../services/permissions.service';

@Component({
  selector: 'app-qibla',
  standalone: true,
  imports: [CommonModule, QiblaCompassComponent, HeroHeaderComponent, ConnectionErrorComponent],
  templateUrl: './qibla.component.html',
  styleUrl: './qibla.component.css'
})
export class QiblaComponent implements OnInit, OnDestroy {
  protected readonly loading = signal<boolean>(false);
  protected readonly error = signal<string | null>(null);
  protected readonly cityName = signal<string>(''); // empty until found: the header shows a placeholder
  protected readonly countryName = signal<string>('');
  protected readonly quadrant = signal<string>('');
  protected readonly qiblaBearing = signal<number>(0);
  protected readonly currentHeading = signal<number | null>(null);
  protected readonly instruction = signal<CompassInstruction>(CompassInstruction.TURN_LEFT);
  protected readonly compassPermissionGranted = signal<boolean>(false);
  protected readonly compassPermissionRequested = signal<boolean>(false);
  protected readonly compassAvailable = signal<boolean>(false);
  protected readonly needsPermissionButton = signal<boolean>(false);
  protected readonly compassError = signal<string | null>(null);

  private headingSubscription: Subscription | null = null;
  private locationSubscription: Subscription | null = null;
  private lastLocationKey: string | null = null;
  private locationTimeout: number | null = null;
  private compassInitialCheckTimeout: number | null = null;

  private readonly destroyRef = inject(DestroyRef);
  private readonly prayerTimeStore = inject(PrayerTimeStore);
  private readonly qiblaService = inject(QiblaService);
  private readonly permissionsService = inject(PermissionsService);
  protected readonly location = computed(() => this.prayerTimeStore.currentLocation());
  private compassDataTimeout: number | null = null;
  private lastHeadingReceivedTime: number | null = null;

  constructor() {
    effect(() => {
      const currentLocation = this.location();
      const hasError = this.error();
      const isLoading = this.loading();
      
      if (hasError && currentLocation && !isLoading) {
        this.initializeQibla();
      }
    });
  }

  ngOnInit(): void {
    this.initializeQibla();
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  /** Readings pause while the app is hidden; give the sensor a fresh grace period on return. */
  private readonly onVisibilityChange = (): void => {
    if (!document.hidden && this.lastHeadingReceivedTime !== null) {
      this.lastHeadingReceivedTime = Date.now();
    }
  };

  ngOnDestroy(): void {
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    if (this.locationTimeout !== null) {
      clearTimeout(this.locationTimeout);
      this.locationTimeout = null;
    }
    if (this.compassDataTimeout !== null) {
      clearTimeout(this.compassDataTimeout);
      this.compassDataTimeout = null;
    }
    if (this.compassInitialCheckTimeout !== null) {
      clearTimeout(this.compassInitialCheckTimeout);
      this.compassInitialCheckTimeout = null;
    }
    if (this.headingSubscription) {
      this.headingSubscription.unsubscribe();
      this.headingSubscription = null;
    }
    if (this.locationSubscription) {
      this.locationSubscription.unsubscribe();
      this.locationSubscription = null;
    }
  }

  private async initializeQibla(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      let location = this.location();

      if (!location) {
        const today = new Date();
        this.prayerTimeStore.preloadPrayerTimes(today)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: () => {
              if (this.locationTimeout !== null) {
                clearTimeout(this.locationTimeout);
              }
              this.locationTimeout = window.setTimeout(() => {
                if (!this.destroyRef.destroyed) {
                  location = this.location();
                  if (location) {
                    this.continueQiblaInitialization(location);
                  } else {
                    this.error.set(this.prayerTimeStore.error() ?? 'Your location isn\'t available right now. Tap Try again.');
                    this.loading.set(false);
                  }
                }
              }, 300);
            },
            error: () => {
              this.error.set(this.prayerTimeStore.error() ?? 'Your location isn\'t available right now. Tap Try again.');
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

  private async continueQiblaInitialization(location: { latitude: number; longitude: number }): Promise<void> {
    try {
      const bearing = this.qiblaService.calculateQiblaBearing(location.latitude, location.longitude);
      this.qiblaBearing.set(bearing);

      const locationKey = `${location.latitude.toFixed(2)},${location.longitude.toFixed(2)}`;
      if (this.lastLocationKey !== locationKey) {
        this.lastLocationKey = locationKey;
        const locationInfo = await this.qiblaService.getLocationInfo(location.latitude, location.longitude);
        this.cityName.set(locationInfo.city);
        this.countryName.set(locationInfo.country);
        this.quadrant.set(locationInfo.quadrant || '');
      }

      this.compassAvailable.set(this.qiblaService.isDeviceOrientationSupported());

      if (this.compassAvailable()) {
        // iOS must re-request permission from a tap each launch, so it always shows the button
        if (this.qiblaService.isCompassPermissionGranted() && !this.qiblaService.requiresPermissionGesture()) {
          this.startCompassListening();
        } else {
          this.needsPermissionButton.set(true);
        }
      }

      this.loading.set(false);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to initialize Qibla');
      this.loading.set(false);
    }
  }

  async enableCompass(): Promise<void> {
    this.needsPermissionButton.set(false);
    this.compassPermissionRequested.set(true);

    try {
      const granted = await this.qiblaService.requestCompassPermission();

      if (granted) {
        this.compassError.set(null); // Clear any previous errors
        this.startCompassListening();
      } else {
        // Permission denied - restore button so user can try again
        this.compassPermissionRequested.set(false);
        this.needsPermissionButton.set(true);
        this.compassError.set('Compass permission denied. Please enable in your browser settings.');
      }
    } catch (error) {
      // Handle any errors during permission request
      if (isDevMode()) {
        console.error('Error requesting compass permission:', error);
      }
      this.compassPermissionRequested.set(false);
      this.needsPermissionButton.set(true);
      this.error.set('Failed to request compass permission. Please try again.');
    }
  }

  private startCompassListening(): void {
    if (this.headingSubscription) {
      this.headingSubscription.unsubscribe();
    }

    if (this.compassDataTimeout !== null) {
      clearTimeout(this.compassDataTimeout);
      this.compassDataTimeout = null;
    }

    this.lastHeadingReceivedTime = null;

    // Monitor for compass data not being received
    this.startCompassHealthCheck();

    this.headingSubscription = this.qiblaService.getDeviceHeading()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
      next: (heading) => {
        if (heading !== null) {
          this.lastHeadingReceivedTime = Date.now();
          this.compassPermissionGranted.set(true);
          this.compassPermissionRequested.set(false);
          this.needsPermissionButton.set(false);
          this.compassError.set(null); // Clear errors when compass is working
          this.currentHeading.set(heading);
          this.updateInstruction();
        } else {
          const wasGranted = this.qiblaService.isCompassPermissionGranted();
          if (!wasGranted) {
            this.handleCompassNotWorking('Permission not granted');
          } else {
            // Permission granted but no data - compass might have stopped working
            this.handleCompassNotWorking('Compass data not available');
          }
        }
      },
      error: (err) => {
        if (err instanceof Error && err.message === NO_ABSOLUTE_COMPASS) {
          this.handleNoAbsoluteCompass();
          return;
        }
        if (isDevMode()) {
          console.error('Compass error:', err);
        }
        this.handleCompassNotWorking('Compass error occurred');
      }
    });
  }

  /**
   * The browser only reports relative orientation, so a live compass would point the wrong way
   */
  private handleNoAbsoluteCompass(): void {
    if (this.compassDataTimeout !== null) {
      clearTimeout(this.compassDataTimeout);
      this.compassDataTimeout = null;
    }
    this.compassAvailable.set(false);
    this.compassPermissionGranted.set(false);
    this.compassPermissionRequested.set(false);
    this.needsPermissionButton.set(false);
    this.currentHeading.set(null);
    this.compassError.set(
      `This browser doesn't provide a true compass. Face ${Math.round(this.qiblaBearing())}° clockwise from north (try Chrome on Android or Safari on iPhone).`
    );
  }

  /**
   * Handle compass not working scenarios
   */
  private handleCompassNotWorking(reason: string): void {
    if (isDevMode()) {
      console.warn('Compass stopped working:', reason);
    }
    
    // Update permission state to reflect actual functionality
    this.permissionsService.markCompassAsNotWorking();
    
    this.compassPermissionGranted.set(false);
    this.compassPermissionRequested.set(false);
    this.currentHeading.set(null);
    this.needsPermissionButton.set(true);
    
    // Set user-friendly error message
    if (reason === 'Permission not granted') {
      this.compassError.set(null); // No error, just needs permission
    } else if (reason === 'Compass data not available' || reason === 'No compass data received' || reason === 'Compass not responding') {
      this.compassError.set('Compass stopped working. Please enable it again.');
    } else {
      this.compassError.set('Compass access was lost. Please try enabling it again.');
    }
    
    // Clear health check timeout
    if (this.compassDataTimeout !== null) {
      clearTimeout(this.compassDataTimeout);
      this.compassDataTimeout = null;
    }
  }

  /**
   * Monitor compass health - detect if data stops being received
   */
  private startCompassHealthCheck(): void {
    // Don't start if component is destroyed
    if (this.destroyRef.destroyed) {
      return;
    }

    if (this.compassDataTimeout !== null) {
      clearTimeout(this.compassDataTimeout);
    }

    this.compassDataTimeout = window.setTimeout(() => {
      // Don't check if component is destroyed
      if (this.destroyRef.destroyed) {
        return;
      }

      // No readings arrive while the app is in the background; don't report that as a failure
      if (document.hidden) {
        this.startCompassHealthCheck();
        return;
      }

      // Check if we haven't received data in the last 5 seconds
      if (this.lastHeadingReceivedTime !== null) {
        const timeSinceLastData = Date.now() - this.lastHeadingReceivedTime;
        if (timeSinceLastData > 5000) {
          // No data for 5 seconds - compass likely stopped working
          this.handleCompassNotWorking('No compass data received');
          return;
        }
      } else {
        // Never received data - check after initial delay
        const initialDelay = 3000;
        if (this.compassPermissionGranted() && !this.loading()) {
          // Clear any existing initial check timeout
          if (this.compassInitialCheckTimeout !== null) {
            clearTimeout(this.compassInitialCheckTimeout);
          }
          // Permission granted but no data after delay
          this.compassInitialCheckTimeout = window.setTimeout(() => {
            if (this.destroyRef.destroyed) {
              return;
            }
            if (!this.lastHeadingReceivedTime && this.compassPermissionGranted()) {
              this.handleCompassNotWorking('Compass not responding');
            }
            this.compassInitialCheckTimeout = null;
          }, initialDelay);
        }
      }

      // Continue monitoring only if compass is still active
      if (this.compassPermissionGranted() && !this.destroyRef.destroyed) {
        this.startCompassHealthCheck();
      }
    }, 3000);
  }

  private updateInstruction(): void {
    const heading = this.currentHeading();
    const bearing = this.qiblaBearing();

    if (heading === null) {
      this.instruction.set(CompassInstruction.TURN_LEFT);
      return;
    }

    const angleDiff = this.qiblaService.calculateAngleDifference(heading, bearing);
    const instruction = this.qiblaService.getInstruction(angleDiff);
    this.instruction.set(instruction);
  }

  protected readonly instructionText = computed<string>(() => this.instruction());

  protected async requestLocation(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    if (this.locationSubscription) {
      this.locationSubscription.unsubscribe();
    }

    try {
      const today = new Date();
      this.locationSubscription = this.prayerTimeStore.preloadPrayerTimes(today)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => this.initializeQibla(),
          error: (err) => {
            this.error.set(err?.message ?? 'Your location isn\'t available right now. Tap Try again.');
            this.loading.set(false);
          }
        });
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to request location');
      this.loading.set(false);
    }
  }
}
