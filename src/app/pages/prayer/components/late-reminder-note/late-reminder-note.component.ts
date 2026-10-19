import { Component, computed, inject } from '@angular/core';
import { NativeAdhanService } from '../../../../services/native-adhan.service';

const PRAYER_NAMES: Record<string, string> = {
  fajr: 'Fajr', sunrise: 'Shuruq', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha',
};

/**
 * The Android app, after a reminder rang over a minute late: one quiet line that battery
 * settings can help, with a way there. Shown only on evidence (never up front) and only while
 * battery use isn't already Unrestricted; closing it or opening settings puts it away for good.
 */
@Component({
  selector: 'app-late-reminder-note',
  template: `
    @if (note(); as n) {
      <div class="late-note" role="status">
        <p class="text">{{ n.prayer }}'s reminder came {{ n.minutes }} {{ n.minutes === 1 ? 'minute' : 'minutes' }} late. Battery settings can help.</p>
        <button class="open" type="button" (click)="openSettings()">Open settings</button>
        <button class="close" type="button" aria-label="Close" (click)="adhan.dismissLateRing()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    }
  `,
  styles: `
    /* Same side gutter as the prayer rows below it */
    :host { display: block; padding: var(--space-sm) var(--space-lg) 0; }

    .late-note {
      display: flex;
      align-items: center;
      gap: var(--space-xs);
      padding: var(--space-xs) var(--space-xs) var(--space-xs) var(--space-sm);
      border-radius: var(--radius-sm);
      background: var(--color-warning-soft);
      color: var(--color-text);
      font-size: var(--font-sm);
      line-height: 1.4;
    }

    .text { flex: 1; margin: 0; }

    .open,
    .close {
      flex-shrink: 0;
      border: none;
      background: none;
      color: var(--color-accent-text);
      font: inherit;
      font-weight: 600;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }

    .open { padding: var(--space-xxs) var(--space-xs); }

    .close {
      display: grid;
      place-items: center;
      width: 2rem;
      height: 2rem;
      color: var(--color-text-muted);
    }

    .open:focus-visible,
    .close:focus-visible {
      outline: 2px solid var(--color-primary-edge);
      outline-offset: 2px;
      border-radius: var(--radius-sm);
    }
  `
})
export class LateReminderNoteComponent {
  protected readonly adhan = inject(NativeAdhanService);

  protected readonly note = computed(() => {
    const late = this.adhan.lateRing();
    if (!late || this.adhan.batteryUnrestricted()) return null;
    return { prayer: PRAYER_NAMES[late.prayer] ?? late.prayer, minutes: late.minutesLate };
  });

  protected async openSettings(): Promise<void> {
    await this.adhan.dismissLateRing();
    await this.adhan.openBatterySettings();
  }
}
