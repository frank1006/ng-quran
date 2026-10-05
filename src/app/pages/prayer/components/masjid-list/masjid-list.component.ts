import { Component, Input, Output, EventEmitter, signal, computed, inject, OnChanges, SimpleChanges, OnInit, OnDestroy, DestroyRef, isDevMode } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject } from 'rxjs';
import { switchMap, takeUntil } from 'rxjs/operators';
import { Masjid, MasjidService } from '../../../../services/masjid.service';
import { SettingsService } from '../../../../services/settings.service';
import { formatDistance } from '../../../../services/units';
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
  /** When the chosen distance has no results, widen it automatically (until the user picks one) */
  @Input() autoExpand = false;
  /** The distance filter options (km), used to pick the next one when widening */
  @Input() radiusOptions: number[] = [];
  @Output() radiusChange = new EventEmitter<number>();
  /** Emitted instead of showing an empty list when autoExpand is on */
  @Output() autoRadius = new EventEmitter<number>();

  private readonly masjidService = inject(MasjidService);
  private readonly settings = inject(SettingsService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly loading = signal<boolean>(false);
  protected readonly masjids = signal<Masjid[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly errorTitle = computed(() => navigator.onLine ? 'Couldn\'t Load Masjids' : 'No Internet Connection');
  protected readonly hasMasjids = computed(() => this.masjids().length > 0);
  protected readonly isEmpty = computed(() => !this.loading() && this.masjids().length === 0 && !this.error());

  private isInitialLoad = true;
  private lastLoadedKey: string | null = null;
  private lastRefreshTrigger: number = 0;
  private isLoading = false;
  private cancelPreviousRequest$ = new Subject<void>();
  private abortController: AbortController | null = null;

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

    // Cancel any previous ongoing request (both RxJS subscription and HTTP request)
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

    // Create new AbortController for HTTP request cancellation
    this.abortController = new AbortController();
    const abortSignal = this.abortController.signal;

    this.masjidService.getNearbyMasjids(this.latitude, this.longitude, this.radius, forceRefresh, abortSignal)
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

          // The service returns a wider search; keep only those inside the chosen radius
          const inRadius = masjids.filter(m => (m.distance ?? 0) <= this.radius);
          const wider = inRadius.length === 0 && this.autoExpand ? this.widerRadius(masjids) : undefined;
          if (wider !== undefined) {
            // Keep the spinner up while the parent switches to the wider distance
            this.autoRadius.emit(wider);
            return;
          }
          this.masjids.set(inRadius);
          this.loading.set(false);
          this.isLoading = false;

          // An empty radius is handled by the template's empty state
          this.error.set(null);
        },
        error: (err) => {
          // Check if this request was cancelled (either via RxJS or HTTP abort)
          if (cancel$.closed || abortSignal.aborted) {
            return;
          }

          // Don't show error if request was aborted
          const errorMessage = err?.message || '';
          if (errorMessage.includes('Request aborted') || errorMessage.includes('REQUEST_ABORTED')) {
            return;
          }

          this.error.set(errorMessage || 'Failed to load masjids. Please try again.');
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
   * The next distance option that has results: from the wider search already loaded when
   * it found something, otherwise the next option beyond it (which triggers a new search).
   */
  private widerRadius(loaded: Masjid[]): number | undefined {
    const larger = this.radiusOptions.filter(option => option > this.radius);
    const nearest = loaded.length ? Math.min(...loaded.map(m => m.distance ?? Infinity)) : undefined;
    if (nearest !== undefined && isFinite(nearest)) {
      return larger.find(option => option >= nearest) ?? undefined;
    }
    const searched = Math.max(this.radius, this.masjidService.minimumSearchKm);
    return larger.find(option => option > searched);
  }

  /**
   * Cancel previous ongoing request (both RxJS subscription and HTTP request)
   */
  private cancelPreviousRequest(): void {
    // Cancel RxJS subscription
    if (!this.cancelPreviousRequest$.closed) {
      this.cancelPreviousRequest$.next();
      this.cancelPreviousRequest$.complete();
    }
    
    // Abort HTTP request
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /**
   * Rough travel estimate: walking (~5 km/h) up to 2 km, otherwise driving: town speed
   * (~30 km/h) for the first 10 km and main roads (~60 km/h) beyond that.
   */
  protected travelTime(distanceKm: number): string {
    if (distanceKm <= 2) {
      return `${Math.max(1, Math.round(distanceKm * 12))} min walk`;
    }
    const minutes = Math.min(distanceKm, 10) * 2 + Math.max(0, distanceKm - 10);
    return `${Math.round(minutes)} min drive`;
  }

  protected formatDistance(distanceKm: number | undefined): string {
    if (distanceKm === undefined) return '';
    return formatDistance(distanceKm, this.settings.distanceUnit());
  }

  protected openDirections(masjid: Masjid): void {
    // Open in Google Maps or Apple Maps
    const url = `https://www.google.com/maps/dir/?api=1&destination=${masjid.latitude},${masjid.longitude}`;
    window.open(url, '_blank');
  }

  ngOnDestroy(): void {
    // Cancel any ongoing requests when component is destroyed (both RxJS subscription and HTTP request)
    this.cancelPreviousRequest();
  }
}

