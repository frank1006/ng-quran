import { Component, input, output } from '@angular/core';

/** "📍 Toronto ↻" — tapping it takes a fresh GPS fix. Shared by the prayer and masjid views. */
@Component({
  selector: 'app-location-chip',
  template: `
    <button
      class="location-chip"
      [class.locating]="locating()"
      [disabled]="locating()"
      (click)="refresh.emit()"
      type="button"
      [attr.aria-label]="'Update location. Current location: ' + name()"
    >
      <svg class="pin" width="10" height="10" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path fill="currentColor" d="M122,231.3l-24.3-73l-73-24.3c-6.3-2-10.5-4.6-12.8-7.7c-2.3-3.1-2.5-6.4-0.6-9.8c1.8-3.4,5.8-6.4,11.7-9l202.3-94.3c9.1-4,15.3-4.3,18.6-1.1s2.9,9.5-1.1,18.6L148,233c-2.6,6-5.5,9.9-8.7,11.7c-3.3,1.9-6.5,1.6-9.6-0.6C126.5,241.9,124,237.6,122,231.3z"/>
      </svg>
      <span class="name">{{ locating() ? 'Locating…' : name() }}</span>
      <svg class="refresh" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M21 12a9 9 0 1 1-2.64-6.36"></path>
        <polyline points="21 3 21 9 15 9"></polyline>
      </svg>
    </button>
  `,
  styles: `
    :host { display: inline-flex; max-width: 100%; }

    .location-chip {
      display: inline-flex;
      align-items: center;
      gap: var(--space-xxs);
      max-width: 100%;
      min-height: 2rem;
      padding: var(--space-xs) var(--space-sm);
      border: none;
      border-radius: var(--border-radius-all);
      background: var(--color-surface-alt);
      color: var(--color-text);
      font-family: var(--font-body);
      cursor: pointer;
      transition: background 0.2s ease;
    }

    .location-chip:disabled { cursor: progress; }

    @media (hover: hover) {
      .location-chip:hover:not(:disabled) { background: var(--color-surface-muted); }
    }

    .pin { flex-shrink: 0; display: block; }

    .name {
      font-size: var(--font-xs);
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .refresh {
      flex-shrink: 0;
      margin-left: var(--space-xxs);
      color: var(--color-text-muted);
    }

    .locating .refresh { animation: spin 0.9s linear infinite; }

    @keyframes spin { to { transform: rotate(360deg); } }

    @media (prefers-reduced-motion: reduce) {
      .locating .refresh { animation: none; }
    }
  `
})
export class LocationChipComponent {
  readonly name = input('Current Location');
  readonly locating = input(false);
  readonly refresh = output<void>();
}
