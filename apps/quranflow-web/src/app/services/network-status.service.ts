import { Injectable, signal, OnDestroy } from '@angular/core';

/**
 * Service to monitor network status and display offline banner on HTTP request failures
 */
@Injectable({
  providedIn: 'root'
})
export class NetworkStatusService implements OnDestroy {
  private readonly showBanner = signal<boolean>(false);
  private hideBannerTimeoutId: ReturnType<typeof setTimeout> | null = null;

  readonly shouldShowBanner = this.showBanner.asReadonly();
  
  ngOnDestroy(): void {
    // Cleanup timeout if service is destroyed
    if (this.hideBannerTimeoutId) {
      clearTimeout(this.hideBannerTimeoutId);
      this.hideBannerTimeoutId = null;
    }
  }

  /**
   * Show the offline banner for 5 seconds (typically called by HTTP interceptor on network error)
   */
  showOfflineBanner(): void {
    // Clear any existing timeout
    if (this.hideBannerTimeoutId) {
      clearTimeout(this.hideBannerTimeoutId);
      this.hideBannerTimeoutId = null;
    }

    // Show the banner
    this.showBanner.set(true);

    // Auto-hide after 5 seconds
    this.hideBannerTimeoutId = setTimeout(() => {
      this.showBanner.set(false);
      this.hideBannerTimeoutId = null;
    }, 5000);
  }

  /**
   * Manually hide the banner (if needed)
   */
  hideBanner(): void {
    if (this.hideBannerTimeoutId) {
      clearTimeout(this.hideBannerTimeoutId);
      this.hideBannerTimeoutId = null;
    }
    this.showBanner.set(false);
  }
}

