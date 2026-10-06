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
| `ui-icon-btn` | round icon buttons (bell, directions, ayah actions, player) — 36px, 44px tap area; always round, including the players and the floating player button | `is-on`, `--white`, `--ghost`, `--primary`, `--lg` |
| `ui-button` | text buttons (Enable…, Refresh, Reset) — 44px tall | `--secondary`, `--danger`, `--block` |
| `ui-select` | dropdowns (calculation method): cream pill with a brown chevron | |
| `ui-chip` | short info or action pills (location, Today, countdown, weather) | `--white`, `is-on` |
| `ui-segmented` + `ui-segment` | switching between options or views (tabs, distances, settings, Prayers/Masjids) | `ui-segmented--white`, `is-on` on the chosen segment |
| `ui-page-subtitle` | the plain brown line under a page title (countdown, country, surah translation); sits `--title-subtitle-gap` below the title on every page | |
| `ui-section-label` | small uppercase heading over a group of rows | |

## Page search (Quran)

- A 48px white circle centred beside the title and subtitle block; the text keeps its standard
  positions and stays clear of the circle's column.
- Tapping it widens the same element sideways into a 48px field over that block (clip-path, no
  vertical movement); the title and subtitle fade out underneath, and the list doesn't move.
- The amber edge appears only on the open field. Closing returns focus to the search button.

## Bottom navigation

- **Cream bar** (`--color-cream`, the "tappable" colour) with a `--color-cream-strong` hairline,
  brown tab icons and labels (`--color-control-ink`, 4.9:1), the AI icon in `--color-accent-dark`.
  Flat: no shadow and no fade above it. Labels keep one weight.
- **A U-shaped dip** in the bar sits under the active tab. It's transparent: the page shows
  through it as it is, and the bubble floats in it. The hairline follows the top edge, the U and
  both rounded corners; a corner's arc hides while the dip occupies that edge (first/last tab).
- **Pages scroll underneath the nav.** `.main` has no bottom padding; every scroll area pads its
  own bottom with `--nav-space` (+ `--mini-player-space`), so the last item still clears the nav.
  New pages must do the same.
- **Active tab:** its own 56px amber bubble (`--color-primary` + amber edge) sits in the dip,
  24px above the bar, with the icon in dark ink (9:1). The active tab shows **no label** (it's
  only made transparent: it keeps its space and is still read by screen readers).
- **Motion, in order and in time with the page change:** the old bubble sinks (`--sink`, 120ms);
  once that's half done the bar, a wide strip (cream · U · cream) moved with one composited
  transform, glides the dip to the tapped tab (~240ms, `--ease-glide`); the tapped tab's icon
  and label are already hidden. When the dip is ~60% there, that tab's bubble rises out of it
  with the icon (~175ms, `--ease-spring`). The old tab's icon and label return once its bubble
  has gone. Measured: the page's view transition ends ~315ms after the tap and the bubble settles
  ~365ms (only its spring settle is later). Keep the two in step if either changes. It reacts on
  the tap itself, not after the next page loads; nothing moves on first load. Position is pure
  CSS (`--active` / `--tabs` against the nav's width in `cqw`).

## Elevation

Shadows only for things that float above the page: the floating player and its card, the update and offline banners. Everything on the page is flat and separated by colour
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
| `--ease-spring` | | a small overshoot for things that pop up (the nav's bubble rising out of its dip); use sparingly |

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

## QFlow (assistant)

`/qflow`, not in the nav until release. One column: title, the conversation (scrolls), and the
question box pinned above the nav.

- **Question box:** a white pill with a 1px border and the amber send button (`ui-icon-btn--primary`);
  the border turns into the amber edge on focus. 16px text so iOS doesn't zoom.
- **The reader's question:** white bubble with a 1px border, aligned to the end. Not cream:
  it isn't tappable.
- **Answer:** plain text under an "AI summary" label (section-label style). Never a bubble or a
  card, and never markdown. Urdu/Arabic answers switch to `--font-arabic`. Citations like
  2:183-187 sit in a `<bdi dir="ltr">`, otherwise RTL text shows them as "187-2:183".
- **Ayahs:** rows with separators, like every list: the reference in brown ("Al-Baqara · 2:255"),
  an "open in Quran" ghost icon button (`/quran/2#verse-255`), the Arabic in Amiri, then the
  translation (Urdu for Urdu questions, English otherwise). The text always comes from our index,
  never from the model.
- **States:** "Searching the Quran…" with skeleton lines while waiting; red text with "Try again"
  on failure; when no model can answer, "These ayahs match your words" with the closest ayahs.
- **New question scrolls to the top** of the conversation when its answer arrives, so the answer
  reads from its start (long ayahs would otherwise push it out of view).
- Answers are announced once through a visually-hidden polite live region; the conversation
  itself isn't live.
