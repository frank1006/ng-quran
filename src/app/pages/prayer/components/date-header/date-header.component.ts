import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LocationChipComponent } from '../../../../shared/components/location-chip/location-chip.component';

@Component({
  selector: 'app-date-header',
  standalone: true,
  imports: [CommonModule, LocationChipComponent],
  template: `
    <div class="date-header">
      <button 
        class="ui-icon-btn ui-icon-btn--ghost nav-button" 
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
          <app-location-chip [name]="locationName()" [locating]="locating()" (refresh)="refreshLocation.emit()" />
          @if (!isToday()) {
            <button class="ui-chip today-button" type="button" (click)="goToToday.emit()" aria-label="Go back to today">
              @if (todayIsBehind()) {
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <polyline points="15 18 9 12 15 6"></polyline>
                </svg>
              }
              Today
              @if (!todayIsBehind()) {
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
              }
            </button>
          }
        </div>
        @if (locationMessage()) {
          <p class="location-message" role="status">{{ locationMessage() }}</p>
        }
        <!-- Tap the date to open the calendar -->
        <button
          type="button"
          class="date-button"
          aria-haspopup="dialog"
          [attr.aria-label]="'Open calendar. ' + formattedDate() + ', ' + hijriDate()"
          (click)="openCalendar.emit()"
        >
          <span class="date-text">{{ formattedDate() }}</span>
          <span class="hijri-date">
            {{ hijriDate() }}
            <svg class="calendar-hint" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M16 3v4M8 3v4M3 10h18"></path>
            </svg>
          </span>
        </button>
      </div>

      <button 
        class="ui-icon-btn ui-icon-btn--ghost nav-button" 
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
  /** The viewed day is after today, so the Today button points back */
  readonly todayIsBehind = input<boolean>(true);
  /** True while a fresh GPS fix is being taken */
  readonly locating = input<boolean>(false);
  /** Short feedback after a location refresh (e.g. permission off), or empty */
  readonly locationMessage = input<string>('');
  readonly dateNavigate = output<number>();
  readonly goToToday = output<void>();
  readonly refreshLocation = output<void>();
  readonly openCalendar = output<void>();

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

