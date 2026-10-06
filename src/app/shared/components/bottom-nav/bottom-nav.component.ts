import { Component, isDevMode, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';

interface NavTab {
  path: string;
  label: string;
  /** Screen reader name when it differs from the label */
  ariaLabel?: string;
  icon: 'prayer' | 'quran' | 'ai' | 'qibla' | 'profile';
  exact: boolean;
}

const TABS: NavTab[] = [
  { path: '/prayer', label: 'Prayer', icon: 'prayer', exact: true },
  { path: '/quran', label: 'Quran', icon: 'quran', exact: false },
  { path: '/qflow', label: 'Ask AI', ariaLabel: 'QuranFlow AI', icon: 'ai', exact: false },
  { path: '/qibla', label: 'Qibla', icon: 'qibla', exact: false },
  { path: '/profile', label: 'Profile', ariaLabel: 'Profile settings', icon: 'profile', exact: false },
];

/**
 * Bottom navigation: a cream bar with a U-shaped dip that slides to the active tab. While it
 * travels, the tapped tab's icon and label hide; as the dip arrives, that tab's own amber bubble
 * rises out of it carrying the icon, and the label returns. The previous tab's bubble sinks.
 * Everything is CSS transforms/opacity driven by `--active` / `--tabs` (measured in `cqw`).
 */
@Component({
  selector: 'app-bottom-nav',
  standalone: true,
  imports: [NgTemplateOutlet, RouterLink, RouterLinkActive],
  templateUrl: './bottom-nav.component.html',
  styleUrl: './bottom-nav.component.css',
})
export class BottomNavComponent {
  /** QuranFlow AI is released after Google login; until then the tab shows in local development only */
  protected readonly tabs = TABS.filter(tab => tab.icon !== 'ai' || isDevMode());
  protected readonly active = signal(-1);
  /** Animations start after the first active tab is known, so nothing moves on load */
  protected readonly ready = signal(false);

  /** React on the tap itself, not after the next page has loaded */
  protected select(index: number): void {
    this.moveTo(index);
  }

  /** Keeps the active tab in sync with the router (back button, links inside pages) */
  protected setActive(index: number, isActive: boolean): void {
    if (isActive) {
      this.moveTo(index);
      if (!this.ready()) requestAnimationFrame(() => requestAnimationFrame(() => this.ready.set(true)));
    } else if (this.active() === index) {
      this.active.set(-1);
    }
  }

  private moveTo(index: number): void {
    this.active.set(index);
  }
}
