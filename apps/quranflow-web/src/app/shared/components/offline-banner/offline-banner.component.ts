import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NetworkStatusService } from '../../../services/network-status.service';

@Component({
  selector: 'app-offline-banner',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (showBanner()) {
      <div class="offline-banner" [class.show]="showBanner()">
        <div class="offline-banner-content">
          <div class="offline-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="1" y1="1" x2="23" y2="23"></line>
              <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path>
              <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path>
              <path d="M10.71 5.05A16 16 0 0 1 22.58 9"></path>
              <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path>
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
              <line x1="12" y1="20" x2="12.01" y2="20"></line>
            </svg>
          </div>
          <div class="offline-text">
            <p class="offline-title">No Internet Connection</p>
            <p class="offline-message">Please check your connection and try again. Some features may work offline.</p>
          </div>
        </div>
      </div>
    }
  `,
  styleUrls: ['./offline-banner.component.css']
})
export class OfflineBannerComponent {
  private readonly networkStatus = inject(NetworkStatusService);
  
  protected readonly showBanner = this.networkStatus.shouldShowBanner;
}

