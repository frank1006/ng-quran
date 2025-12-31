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
        (click)="onPrevious()" 
        type="button"
        aria-label="Previous day"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
      </button>

      <div class="date-content">
        <div class="location-badge">
          <span class="today-label">TODAY</span>
          <span class="location">📍 Dubai</span>
        </div>
        <div class="date-text">{{ formattedDate() }}</div>
        <div class="hijri-date">{{ hijriDate() }}</div>
      </div>

      <button 
        class="nav-button" 
        (click)="onNext()" 
        type="button"
        aria-label="Next day"
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
  readonly dateNavigate = output<number>();

  onPrevious(): void {
    this.dateNavigate.emit(-1);
  }

  onNext(): void {
    this.dateNavigate.emit(1);
  }
}

