import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Prayer item for list display
 */
interface PrayerItem {
  name: string;
  time: string;
  key: string;
  isActive: boolean;
}

@Component({
  selector: 'app-prayer-list',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (loading()) {
      <div class="loading-state">
        <p>Loading prayer times...</p>
      </div>
    }

    @if (error()) {
      <div class="error-state">
        <p>{{ error() }}</p>
        <button class="retry-button" (click)="onRetry()">Retry</button>
      </div>
    }

    @if (!loading() && prayers().length > 0) {
      <div class="prayer-list-container">
        <div class="prayer-list">
          @for (prayer of prayers(); track prayer.key) {
            <div class="prayer-card" [class.active]="prayer.isActive">
              <div class="prayer-info">
                <h3 class="prayer-title">{{ prayer.name }}</h3>
                <p class="prayer-time">{{ prayer.time }}</p>
              </div>
              <button 
                class="notification-button" 
                type="button" 
                [class.active]="true"
                [attr.aria-label]="'Toggle notifications for ' + prayer.name"
                [attr.aria-pressed]="true"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                </svg>
              </button>
            </div>
          }
        </div>
      </div>
    }
  `,
  styleUrls: ['./prayer-list.component.css']
})
export class PrayerListComponent {
  readonly prayers = input<PrayerItem[]>([]);
  readonly loading = input<boolean>(false);
  readonly error = input<string | null>(null);
  readonly retry = output<void>();

  onRetry(): void {
    this.retry.emit();
  }
}

