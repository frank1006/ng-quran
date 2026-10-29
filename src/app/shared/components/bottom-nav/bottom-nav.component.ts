import { Component, DestroyRef, ElementRef, afterNextRender, inject, signal, viewChild } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { IsActiveMatchOptions, RouterLink, RouterLinkActive } from '@angular/router';

interface NavTab {
  path: string;
  label: string;
  /** Screen reader name when it differs from the label */
  ariaLabel?: string;
  icon: 'prayer' | 'quran' | 'ai' | 'qibla' | 'profile';
  exact: boolean;
}

/**
 * A tab is active by its path alone. Query strings and #fragments never matter: with Angular's
 * plain `exact: true` they had to match too, so /prayer?code=… (coming back from Google sign-in)
 * left no tab active and the bar's dip slid off the side.
 */
const matchOptions = (exact: boolean): IsActiveMatchOptions => ({
  paths: exact ? 'exact' : 'subset',
  queryParams: 'ignored',
  fragment: 'ignored',
  matrixParams: 'ignored',
});

/** How long the corners follow the dip after a tab change: at least the glide, at most this */
const FOLLOW_MIN_MS = 700;
const FOLLOW_MAX_MS = 1500;

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
  protected readonly tabs = TABS.map(tab => ({
    ...tab,
    matchOptions: matchOptions(tab.exact),
  }));
  /** The active tab, or -1 on a page that isn't one of the tabs (e.g. Privacy) */
  protected readonly active = signal(-1);
  /**
   * Where the dip sits: the active tab, or the last one while no tab is active (the dip is closed
   * then, see .nav-flat). Always a real tab, so the sliding strip always covers the whole bar.
   */
  protected readonly dipAt = signal(0);
  /** Animations start after the first active tab is known, so nothing moves on load */
  protected readonly ready = signal(false);

  private readonly bar = viewChild.required<ElementRef<HTMLElement>>('bar');
  private readonly dip = viewChild.required<ElementRef<HTMLElement>>('dip');
  private cornerFrame = 0;

  constructor() {
    afterNextRender(() => this.followDip());
    const onResize = () => this.followDip();
    window.addEventListener('resize', onResize);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(this.cornerFrame);
    });
  }

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
    this.dipAt.set(index);
    this.followDip();
  }

  /**
   * Keeps each top corner of the bar no rounder than the dip is far from that edge, every frame
   * while the dip moves, so the corner squares exactly as the dip reaches the first or last tab
   * (rounded, it would cut a notch into the dip's curve) and rounds again as the dip pulls away.
   * The CSS reads the two radii (--corner-start, --corner-end).
   */
  private followDip(): void {
    cancelAnimationFrame(this.cornerFrame);
    let last = NaN;
    let still = 0;
    const started = performance.now();
    const step = () => {
      const bar = this.bar().nativeElement;
      // --corner-full is in rem (it scales with the app): in pixels for the arithmetic below
      const full = (parseFloat(getComputedStyle(bar).getPropertyValue('--corner-full')) || 1.5)
        * (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16);
      const frame = bar.getBoundingClientRect();
      const dip = this.dip().nativeElement.getBoundingClientRect();
      // No tab active: the dip is closed under a plain bar, so both corners are fully round
      const open = this.active() >= 0;
      const start = open ? Math.min(full, Math.max(0, dip.left - frame.left)) : full;
      const end = open ? Math.min(full, Math.max(0, frame.right - dip.right)) : full;
      bar.style.setProperty('--corner-start', `${start}px`);
      bar.style.setProperty('--corner-end', `${end}px`);
      still = dip.left === last ? still + 1 : 0;
      last = dip.left;
      // Through the whole glide (it starts after a short delay, later still while the next page
      // renders), then until the dip has sat still for a few frames
      const elapsed = performance.now() - started;
      if ((elapsed < FOLLOW_MIN_MS || still < 3) && elapsed < FOLLOW_MAX_MS) this.cornerFrame = requestAnimationFrame(step);
    };
    this.cornerFrame = requestAnimationFrame(step);
  }
}
