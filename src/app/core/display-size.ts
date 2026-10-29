/**
 * The app's display size (Profile > Preferences): the whole app a little smaller or larger,
 * keeping its proportions (styles.css: --ui-zoom). The phone's font setting is ignored, which
 * keeps every screen as designed; this is where a larger (or more compact) app comes from instead.
 * The steps stay small: much larger and a phone's screen no longer fits the layout.
 */
export type DisplaySize = 'compact' | 'standard' | 'expanded';

export const DISPLAY_SIZES: { id: DisplaySize; name: string; zoom: number }[] = [
  { id: 'compact', name: 'Compact', zoom: 0.92 },
  { id: 'standard', name: 'Standard', zoom: 1 },
  { id: 'expanded', name: 'Expanded', zoom: 1.08 },
];

const STORAGE_KEY = 'display-size';

/** The saved choice (Standard when none, or when storage is unavailable) */
export function readDisplaySize(): DisplaySize {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return DISPLAY_SIZES.some(size => size.id === saved) ? (saved as DisplaySize) : 'standard';
  } catch {
    return 'standard';
  }
}

/** Applies a size to the page, and saves it when `save` */
export function applyDisplaySize(size: DisplaySize, save = false): void {
  const zoom = DISPLAY_SIZES.find(option => option.id === size)?.zoom ?? 1;
  document.documentElement.style.setProperty('--ui-zoom', String(zoom));
  if (!save) return;
  try {
    localStorage.setItem(STORAGE_KEY, size);
  } catch {
    // Private browsing and the like: it applies for now, without being remembered
  }
}
