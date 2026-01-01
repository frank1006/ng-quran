import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Qibla page header component
 * Similar to home page hero section with same typography and styling
 */
@Component({
  selector: 'app-qibla-header',
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
        <div class="location-title">
          <h2 class="city-name" [attr.aria-live]="'polite'">
            {{ cityName() || 'Loading...' }}
          </h2>
          <p class="location-label" [attr.aria-live]="'polite'">
            {{ countryName() || 'Loading...' }}
          </p>
        </div>
      </div>
    </section>
  `,
  styleUrls: ['./qibla-header.component.css']
})
export class QiblaHeaderComponent {
  readonly cityName = input<string>('Loading...');
  readonly countryName = input<string>('Loading...');
}
