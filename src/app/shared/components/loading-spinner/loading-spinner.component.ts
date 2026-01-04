import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-loading-spinner',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="loading-spinner-container" [class.full-height]="fullHeight()">
      <div class="spinner-wrapper">
        <svg class="spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
          <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"></path>
        </svg>
      </div>
      @if (message()) {
        <p class="loading-message">{{ message() }}</p>
      }
    </div>
  `,
  styleUrls: ['./loading-spinner.component.css']
})
export class LoadingSpinnerComponent {
  readonly message = input<string | null>(null);
  readonly fullHeight = input<boolean>(false);
}

