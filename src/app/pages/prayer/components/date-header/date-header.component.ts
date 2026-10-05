import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-date-header',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="date-header">
      <button 
        class="nav-button" 
        [class.disabled]="!canNavigatePrevious()"
        [disabled]="!canNavigatePrevious()"
        (click)="onPrevious()" 
        type="button"
        [attr.aria-label]="canNavigatePrevious() ? 'Previous day' : 'Previous day (not available)'"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
      </button>

      <div class="date-content">
        <div class="chip-row">
          <button
            class="location-badge"
            [class.locating]="locating()"
            [disabled]="locating()"
            (click)="refreshLocation.emit()"
            type="button"
            [attr.aria-label]="'Update location. Current location: ' + locationName()"
          >
            <svg class="location-icon" width="10" height="10" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path fill="currentColor" d="M122,231.3l-24.3-73l-73-24.3c-6.3-2-10.5-4.6-12.8-7.7c-2.3-3.1-2.5-6.4-0.6-9.8c1.8-3.4,5.8-6.4,11.7-9l202.3-94.3c9.1-4,15.3-4.3,18.6-1.1s2.9,9.5-1.1,18.6L148,233c-2.6,6-5.5,9.9-8.7,11.7c-3.3,1.9-6.5,1.6-9.6-0.6C126.5,241.9,124,237.6,122,231.3z"/>
            </svg>
            <span class="location">{{ locating() ? 'Locating…' : locationName() }}</span>
            <svg class="refresh-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M21 12a9 9 0 1 1-2.64-6.36"></path>
              <polyline points="21 3 21 9 15 9"></polyline>
            </svg>
          </button>
          @if (!isToday()) {
            <button class="today-button" type="button" (click)="goToToday.emit()" aria-label="Go back to today">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="15 18 9 12 15 6"></polyline>
              </svg>
              Today
            </button>
          }
        </div>
        @if (locationMessage()) {
          <p class="location-message" role="status">{{ locationMessage() }}</p>
        }
        <div class="date-text">{{ formattedDate() }}</div>
        <div class="hijri-date">{{ hijriDate() }}</div>
      </div>

      <button 
        class="nav-button" 
        [class.disabled]="!canNavigateNext()"
        [disabled]="!canNavigateNext()"
        (click)="onNext()" 
        type="button"
        [attr.aria-label]="canNavigateNext() ? 'Next day' : 'Next day (not available)'"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
      </button>
    </div>
  `,
  styleUrls: ['./date-header.component.css']
})
export class DateHeaderComponent {
  readonly formattedDate = input<string>('');
  readonly hijriDate = input<string>('');
  readonly canNavigatePrevious = input<boolean>(true);
  readonly canNavigateNext = input<boolean>(true);
  readonly locationName = input<string>('Current Location');
  readonly isToday = input<boolean>(true);
  /** True while a fresh GPS fix is being taken */
  readonly locating = input<boolean>(false);
  /** Short feedback after a location refresh (e.g. permission off), or empty */
  readonly locationMessage = input<string>('');
  readonly dateNavigate = output<number>();
  readonly goToToday = output<void>();
  readonly refreshLocation = output<void>();

  onPrevious(): void {
    if (this.canNavigatePrevious()) {
      this.dateNavigate.emit(-1);
    }
  }

  onNext(): void {
    if (this.canNavigateNext()) {
      this.dateNavigate.emit(1);
    }
  }

}

