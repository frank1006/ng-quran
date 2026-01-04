import { Component, Input, Output, EventEmitter, signal, computed, inject, OnChanges, SimpleChanges, OnInit, OnDestroy, DestroyRef, isDevMode } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject } from 'rxjs';
import { switchMap, takeUntil } from 'rxjs/operators';
import { Masjid, MasjidService } from '../../../../services/masjid.service';
import { ConnectionErrorComponent } from '../../../../shared/components/connection-error/connection-error.component';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';

@Component({
  selector: 'app-masjid-list',
  standalone: true,
  imports: [CommonModule, ConnectionErrorComponent, LoadingSpinnerComponent],
  templateUrl: './masjid-list.component.html',
  styleUrl: './masjid-list.component.css'
})
export class MasjidListComponent implements OnInit, OnChanges, OnDestroy {
  @Input() latitude: number = 0;
  @Input() longitude: number = 0;
  @Input() radius: number = 1;
  @Input() refreshTrigger: number = 0;
  @Output() radiusChange = new EventEmitter<number>();

  private readonly masjidService = inject(MasjidService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly loading = signal<boolean>(false);
  protected readonly masjids = signal<Masjid[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly hasMasjids = computed(() => this.masjids().length > 0);
  protected readonly isEmpty = computed(() => !this.loading() && this.masjids().length === 0 && !this.error());

  private isInitialLoad = true;
  private lastLoadedKey: string | null = null;
  private lastRefreshTrigger: number = 0;
  private isLoading = false;
  private cancelPreviousRequest$ = new Subject<void>();

  ngOnInit(): void {
    // Don't load here - let ngOnChanges handle it to avoid duplicate calls
    // ngOnChanges is called after ngOnInit with initial values
    if (this.latitude && this.longitude) {
      this.lastLoadedKey = this.getLocationKey();
      this.lastRefreshTrigger = this.refreshTrigger;
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.latitude || !this.longitude) {
      return;
    }

    const currentKey = this.getLocationKey();
    const keyChanged = this.lastLoadedKey !== currentKey;
    // Refresh triggered if refreshTrigger changed AND it's a new value (not initial 0)
    const refreshTriggered = changes['refreshTrigger'] && 
                             this.refreshTrigger !== this.lastRefreshTrigger && 
                             this.refreshTrigger > 0;

    // If this is the first time showing masjid list (initial load), use cache
    if (this.isInitialLoad) {
      this.loadMasjids(false); // Use cache on initial load
      this.isInitialLoad = false;
      this.lastLoadedKey = currentKey;
      this.lastRefreshTrigger = this.refreshTrigger;
      return;
    }

    // If refresh trigger changed (button clicked), force refresh and make HTTP request
    if (refreshTriggered) {
      // Button was clicked - force HTTP request, bypass cache, and update cache
      this.loadMasjids(true); // forceRefresh=true bypasses cache and makes HTTP request
      this.lastRefreshTrigger = this.refreshTrigger;
      this.lastLoadedKey = currentKey;
      return;
    }

    // Only reload if the key actually changed
    // This prevents duplicate loads when ngOnChanges fires but values haven't changed
    if (keyChanged) {
      // Cancel any ongoing request
      this.cancelPreviousRequest();
      // Check cache first, only make HTTP request if cache miss
      this.loadMasjids(false); // Use cache first, only make HTTP request if cache miss
      this.lastLoadedKey = currentKey;
    }
  }

  private getLocationKey(): string {
    return `${this.latitude.toFixed(2)},${this.longitude.toFixed(2)},${this.radius}`;
  }

  protected loadMasjids(forceRefresh: boolean = false): void {
    if (!this.latitude || !this.longitude) {
      this.error.set('Location not available');
      return;
    }

    // Cancel any previous ongoing request
    this.cancelPreviousRequest();

    this.error.set(null);
    
    // Only clear results if forcing refresh
    if (forceRefresh) {
      this.masjids.set([]);
    }

    // Service will check cache first (unless forcing refresh) and return cached data if available
    // This prevents HTTP requests when cache exists
    // Set loading state - will be cleared quickly if cache hit
    this.isLoading = true;
    this.loading.set(true);

    // Create new cancel subject for this request
    const cancel$ = new Subject<void>();
    this.cancelPreviousRequest$ = cancel$;

    this.masjidService.getNearbyMasjids(this.latitude, this.longitude, this.radius, forceRefresh)
      .pipe(
        takeUntil(cancel$), // Cancel if new request is made
        takeUntilDestroyed(this.destroyRef) // Clean up on component destroy
      )
      .subscribe({
        next: (masjids) => {
          // Check if this request was cancelled
          if (cancel$.closed) {
            return;
          }

          this.masjids.set(masjids);
          this.loading.set(false);
          this.isLoading = false;
          
          // Only show error if we got a successful response but no results
          // Don't show error if it's an empty array from a caught error
          if (masjids.length === 0) {
            this.error.set(`No mosques found within ${this.radius}km. Try increasing the radius.`);
          } else {
            this.error.set(null); // Clear any previous errors
          }
        },
        error: (err) => {
          // Check if this request was cancelled
          if (cancel$.closed) {
            return;
          }

          this.error.set('Failed to load mosques. Please try again.');
          this.loading.set(false);
          this.isLoading = false;
          this.masjids.set([]);
          if (isDevMode()) {
            console.error('Error loading masjids:', err);
          }
        }
      });
  }

  /**
   * Cancel previous ongoing request
   */
  private cancelPreviousRequest(): void {
    if (!this.cancelPreviousRequest$.closed) {
      this.cancelPreviousRequest$.next();
      this.cancelPreviousRequest$.complete();
    }
  }

  protected formatDistance(distanceKm: number | undefined): string {
    if (distanceKm === undefined) return '';
    return this.masjidService.formatDistance(distanceKm);
  }

  protected openDirections(masjid: Masjid): void {
    // Open in Google Maps or Apple Maps
    const url = `https://www.google.com/maps/dir/?api=1&destination=${masjid.latitude},${masjid.longitude}`;
    window.open(url, '_blank');
  }

  ngOnDestroy(): void {
    // Cancel any ongoing requests when component is destroyed
    this.cancelPreviousRequest();
  }
}

