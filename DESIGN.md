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
| `ui-select` | dropdowns (calculation method): cream pill with a brown chevron | |
| `ui-chip` | short info or action pills (location, Today, countdown, weather) | `--white`, `is-on` |
| `ui-segmented` + `ui-segment` | switching between options or views (tabs, distances, settings, Prayers/Masjids) | `ui-segmented--white`, `is-on` on the chosen segment |
| `ui-page-subtitle` | the plain brown line under a page title (countdown, country, surah translation); sits `--title-subtitle-gap` below the title on every page | |
| `ui-section-label` | small uppercase heading over a group of rows | |

## Elevation

Shadows only for things that float above the page: the bottom nav, the floating player and its
card, the update and offline banners. Everything on the page is flat and separated by colour
(white on cream, cream on white). Focus and selection use the amber edge, not a glow.

## Motion

Tokens in `src/styles.css`; no raw durations or `transition: all` in components.

| Token | Value | Use |
|---|---|---|
| `--motion-fast` | 120ms | press feedback, colour changes |
| `--motion-base` | 220ms | segments, cards opening, a page arriving |
| `--motion-slow` | 320ms | larger surfaces: accordions, the search field, sheets |
| `--motion-exit` | 150ms | anything leaving (exits are faster than entrances) |
| `--ease-out` / `--ease-in` / `--ease-standard` | | arriving / leaving / state changes |

- Animate only `transform`, `opacity`, `clip-path` (and colours). Not width, height or position.
- **Every tappable thing reacts when pressed:** rows get a cream tint (strong cream if already cream),
  buttons, chips, segments and cards shrink slightly (0.92–0.98). Put the `:active` rule in the
  component's own stylesheet; global helpers lose to component styles.
- **Pages:** Angular view transitions. Tabs crossfade; opening a surah slides forward, leaving it
  slides back. The bottom nav and floating player keep `view-transition-name` so they stay still.
  On iOS, browser back skips ours because the swipe already animates.
- **Switches:** every `ui-segmented` gets one amber pill that slides to the chosen segment
  (`SegmentedIndicatorDirective`; import it where a component uses `ui-segmented`).
- **Content swapped inside a page** (Prayers ↔ Masjids, Profile tabs) fades in with `ui-fade-in`.
- **Reduced motion:** one global rule in `styles.css` makes everything instant; no per-component
  media queries needed.

## Sheets

Overlays that slide up from the bottom (the calendar) are a native `<dialog>` opened with
`showModal()`: focus stays inside, Escape and the Android back gesture close it, and focus
returns to what opened it. White with a cream top, a handle, a title and a close button; the
handle and title can be dragged down to close. One fixed height (`min(88dvh, 52rem)`) so
switching tabs never resizes it; the content scrolls inside. It slides up (`--motion-slow`)
and down faster (`--motion-exit`) over a dimmed backdrop. Floating, so it has a shadow.

## Calendar and Islamic dates

- **One source of Hijri dates:** `HijriCalendarService`. The Prayer header, the calendar and the
  events all use it, so they can never disagree.
- **Moon sighting** is automatic by country (`calendar/hijri-countries.ts`) and can be set to
  Auto / −1 / 0 / +1 in Profile. Shown as "Pakistan · local moon sighting…".
- **Events** are stored in the app (`calendar/islamic-events.ts`), not fetched. Mawlid and
  Shab-e-Barat can be hidden in Profile. White Days (13th–15th, not 13 Dhu al-Hijjah) are marked.
- **Month grid:** each day shows the other calendar's date underneath. Today is amber, the chosen
  day cream, an event a filled brown dot, a White Day an outline dot.
- **Events list:** rows with separators (never cards); the name leads, short dates underneath,
  the countdown on the right; month headings in the section-label style.

## Lists

Rows sit on the page with 1px `--color-border` separators (no cards). The current or selected
row gets `--color-fill-current` with no separators touching it; buttons inside it switch to white.

## Text

- Uppercase only for `ui-section-label` and card labels like "Continue reading".
  Surah translations, place names and subtitles are sentence case.
- Contrast (WCAG 2.2 AA): text ≥ 4.5:1, icons and state edges ≥ 3:1. Brown on cream is 4.9:1,
  dark on amber 9:1. Check new colour pairs before adding them.
- The app is portrait-only by choice (WCAG 1.3.4 is a known exception).
- Minimum text size is 12px (`--font-xs`), on every screen width.

## Screen readers and loading

- Every page has exactly one `h1` and its own browser title (`title` on the route; a surah sets
  its name once loaded). After navigating, focus moves to the new page's `h1` (`app.ts`).
- Don't make text that updates on a timer a live region (the prayer countdown isn't one).
- While data loads, show `ui-skeleton` blocks the size of the coming text, with a
  `visually-hidden` line saying what is loading. Never show "Loading…" as a heading.
- Location off is a calm state (`app-connection-error`, cream pin, "Location needed"), worded for
  iPhone, the Android app or a browser (`core/location-help.ts`). Red is for real failures.
