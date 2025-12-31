import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Prayer item for display
 */
interface PrayerItem {
  name: string;
  time: string;
  isActive: boolean;
}

@Component({
  selector: 'app-hero-section',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="hero-section">
      <div class="hero-background">
        <div class="curve-timeline">
          <svg viewBox="0 0 400 120" preserveAspectRatio="none" class="curve-svg">
            <path d="M 0,100 Q 100,20 200,50 T 400,60 L 400,120 L 0,120 Z"
                  fill="url(#gradient1)" opacity="0.3"/>
            <defs>
              <linearGradient id="gradient1" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" style="stop-color:#ffb030;stop-opacity:0.4" />
                <stop offset="100%" style="stop-color:#874d14;stop-opacity:0.2" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      </div>

      <div class="hero-content">
        <div class="current-prayer">
          <h2 class="prayer-name" [attr.aria-live]="'polite'">
            {{ currentPrayer()?.name || 'Loading...' }}
          </h2>
          <p class="time-remaining" [attr.aria-live]="'polite'">
            {{ timeUntilNext() }}
          </p>
        </div>
      </div>

      <ng-content></ng-content>
    </section>
  `,
  styleUrls: ['./hero-section.component.css']
})
export class HeroSectionComponent {
  readonly currentPrayer = input<PrayerItem | null>(null);
  readonly timeUntilNext = input<string>('Loading...');
}

