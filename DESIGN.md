# QuranFlow design system

All shared tokens and components live in `src/styles.css`. Pages use them instead of styling
their own buttons, pills or switches. If something new is needed, add it there first.

## Colour rule

| Colour | Means | Token |
|---|---|---|
| Amber (with a darker 1px edge) | on, selected, or the main action | `--color-primary`, `--shadow-on-edge` |
| Cream | something you can tap; also the current item's fill | `--color-cream` (`--color-control`, `--color-fill-current`) |
| Strong cream | hover / pressed, seek tracks | `--color-cream-strong` |
| White | content and fields; controls placed on a cream surface | `--color-surface` |
| Grey | unavailable only (disabled, "Not supported") | `--color-surface-muted` |

Only three creams exist: the page background (`--color-bg`), cream and strong cream.
Controls on a cream surface (hero headers, the cream part of a page) use the `--white` variants.

## Components

| Class | Use | Variants |
|---|---|---|
| `ui-icon-btn` | round icon buttons (bell, directions, ayah actions, player) — 36px, 44px tap area | `is-on`, `--white`, `--ghost`, `--square`, `--primary`, `--lg` |
| `ui-button` | text buttons (Enable…, Refresh, Reset) — 44px tall | `--secondary`, `--danger`, `--block` |
| `ui-chip` | short info or action pills (location, Today, countdown, weather) | `--white`, `is-on` |
| `ui-segmented` + `ui-segment` | switching between options or views (tabs, distances, settings, Prayers/Masjids) | `ui-segmented--white`, `is-on` on the chosen segment |
| `ui-page-subtitle` | the plain brown line under a page title (countdown, country, surah translation) | |
| `ui-section-label` | small uppercase heading over a group of rows | |

## Elevation

Shadows only for things that float above the page: the bottom nav, the floating player and its
card, the update and offline banners. Everything on the page is flat and separated by colour
(white on cream, cream on white). Focus and selection use the amber edge, not a glow.

## Lists

Rows sit on the page with 1px `--color-border` separators (no cards). The current or selected
row gets `--color-fill-current` with no separators touching it; buttons inside it switch to white.

## Text

- Uppercase only for `ui-section-label` and card labels like "Continue reading".
  Surah translations, place names and subtitles are sentence case.
- Contrast (WCAG 2.2 AA): text ≥ 4.5:1, icons and state edges ≥ 3:1. Brown on cream is 4.9:1,
  dark on amber 9:1. Check new colour pairs before adding them.
- The app is portrait-only by choice (WCAG 1.3.4 is a known exception).
