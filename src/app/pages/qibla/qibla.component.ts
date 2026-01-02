import { Component, OnInit, OnDestroy, signal, computed, effect, inject, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PrayerTimeStore } from '../../store/prayer-time.store';
import { QiblaService, CompassInstruction } from './services/qibla.service';
import { QiblaCompassComponent } from './components/qibla-compass.component';
import { HeroHeaderComponent } from '../../shared/components/hero-header/hero-header.component';

@Component({
  selector: 'app-qibla',
  standalone: true,
  imports: [CommonModule, QiblaCompassComponent, HeroHeaderComponent],
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
  private lastLocationKey: string | null = null;
  private locationTimeout: number | null = null;

  private readonly destroyRef = inject(DestroyRef);
  private readonly prayerTimeStore = inject(PrayerTimeStore);
  private readonly qiblaService = inject(QiblaService);
  protected readonly location = computed(() => this.prayerTimeStore.currentLocation());

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
  }

  ngOnDestroy(): void {
    if (this.locationTimeout !== null) {
      clearTimeout(this.locationTimeout);
      this.locationTimeout = null;
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
                    this.error.set('Location not available. Please enable location access.');
                    this.loading.set(false);
                  }
                }
              }, 300);
            },
            error: () => {
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
      }

      this.compassAvailable.set(this.qiblaService.isDeviceOrientationSupported());

      if (this.compassAvailable()) {
        if (this.qiblaService.isCompassPermissionGranted()) {
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

    const wasAlreadyGranted = this.qiblaService.isCompassPermissionGranted();
    
    if (wasAlreadyGranted) {
      this.startCompassListening();
      return;
    }

    const granted = await this.qiblaService.requestCompassPermission();

    if (granted) {
      this.startCompassListening();
    } else {
      this.compassPermissionRequested.set(false);
      this.error.set('Compass permission denied. Please enable in your browser settings.');
    }
  }

  private startCompassListening(): void {
    if (this.headingSubscription) {
      this.headingSubscription.unsubscribe();
    }

    this.headingSubscription = this.qiblaService.getDeviceHeading()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
      next: (heading) => {
        if (heading !== null) {
          this.compassPermissionGranted.set(true);
          this.compassPermissionRequested.set(false);
          this.needsPermissionButton.set(false);
          this.currentHeading.set(heading);
          this.updateInstruction();
        } else {
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
        console.error('Compass error:', err);
        const wasGranted = this.qiblaService.isCompassPermissionGranted();
        if (wasGranted) {
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
