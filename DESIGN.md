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
- **No tab active** (a page outside the tabs, e.g. Privacy): the U closes into a plain bar where
  it is (a cream layer fades in over the strip) and every tab shows its label; returning to a tab
  reopens it from there. The dip's position is always a real tab, never parked off the bar, so
  the strip always covers the whole bar. A tab is active by its path alone (query strings and
  #fragments are ignored).

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

## QuranFlow AI (QFlow)

**Name:** users see "QuranFlow AI" everywhere (title, copy, errors, the AI's own wording);
"QFlow" is only the code name (files, `/qflow`, the API).

**Nav entry:** a normal tab, "Ask AI" (aria-label
"QuranFlow AI"), its icon kept brand brown so it stands out without a bubble of its own.

`/qflow`. One column: title, the conversation (scrolls), and the
question box pinned above the nav.

- **Bottom dock:** the counter and the question box (or the limit card) sit in a dock that
  overlaps the end of the conversation by 2rem with a transparent-to-white fade, so answers fade
  out underneath instead of being cut; the scroll area has the same extra room at its end.
- **Shares its row with the mini player:** the question box is the floating player button's
  height (52px, `--dock-row`) with its bottom on the button's bottom (`--dock-bottom`), so top,
  centre and bottom match; the 36px send button is centred inside. While audio plays the box
  shortens on the right (`--player-room`) so the two sit side by side 8px apart, instead of the
  page reserving an extra empty row.
- **Question box:** a white pill with a 1px border and the amber send button (`ui-icon-btn--primary`);
  the border turns into the amber edge on focus. 16px text so iOS doesn't zoom.
- **The reader's question:** a soft brand bubble, `--color-cream-strong`, no border, rounded with
  a small tail corner at bottom-right. Always on the right, using a physical `margin-left: auto`
  (a logical "start/end" would flip Urdu and Arabic questions to the left).
- **Example questions:** cream pills (cream = tappable) sized to their text, brown 600 text with a
  small sparkle in front; Urdu/Arabic ones sit on the right. Dimmed while an answer is loading.
- **Urdu and Arabic text** (questions, pills, answers) uses `--font-arabic`, one step larger.
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
- **The conversation outlives the page** (`QFlowChatStore`): it survives page switches, an answer
  still arrives if the page was left, and it's saved on this device only (localStorage, last 30
  exchanges) so it survives reopening the app. "New conversation" (+) clears it. No footer
  disclaimer; the intro says it doesn't give rulings, and every answer is labelled "AI summary".
- **Daily greeting:** the first visit each day adds a greeting to the conversation, built by the
  app from the calendar (no AI, uses no question): "Assalamu alaikum, {first name}" (just
  "Assalamu alaikum" for guests), today's weekday and Hijri date, the next event (or "Today is …", White Days),
  a one-line explanation, and three day-aware example questions (Al-Kahf on Fridays, the coming
  event's theme within 30 days, its date, one in Urdu). Earlier days' greetings stay as snapshots
  without suggestions. A new chat starts with today's greeting; the + only shows once there's a
  question to clear.
- **Daily limit:** "N of 10 questions left today" in small muted text above the question box (the
  server's count; QFLOW_DAILY_LIMIT, 0 = unlimited and the line hides). At the limit the question
  box is **replaced** by a cream card: moon icon, "That's today's 10 questions", "You can ask again
  after midnight, in 5 h 12 min" (live), and a white "Continue reading" button to the Quran. The
  greeting's suggestions hide. A limit message never offers "Try again", and it's brown, not red:
  it isn't an error. A new chat does not reset the limit (it's per person per day).
- **Knows the person's day:** each question carries the app's snapshot (city, today's prayer
  times with current/next prayer, Qibla bearing, units); the server adds nearby masjids and the
  forecast on demand. Answers about a part of the app end with a button to it: cream "Open Qibla
  compass", "See nearby masjids" (`/prayer?view=masjids`), "Open prayer times"; and an amber
  "▶ Play Surah …" that starts the recitation inside the tap (phones only allow audio from one)
  and opens the surah.
- **Sign-in:** only QuranFlow AI needs an account (Google, through Supabase); nothing else is
  ever gated and there's no sign-in screen at launch. Guests see the greeting and a cream card in
  the dock: "Sign in to ask QuranFlow AI" / "It's free. We only use your Google name to greet
  you." with a white "Continue with Google" button (four-colour G). After Google, sign-in always lands on
  QuranFlow AI (from Profile too), greeting them by name. Signing out clears the chat on
  the device. Profile, signed in: their name is the page title, the email the subtitle (envelope
  icon), a round white Sign out button on the right; guests see "Profile" and the same sign-in
  card. Delete Account sits with the other danger actions in Profile → App.
- **Du'a cards:** a du'a answer shows each cited du'a as a row like an ayah row: title (accent,
  bold, xs), Arabic, transliteration (italic, sm), meaning (secondary), then the source in accent
  and "· Say it N times" in secondary. Quranic du'as get the same ↗ link into the reader.
  Names of Allah use the same row: "Al-Wadood · The Loving" (accent) with "47 of 99" (secondary)
  on the right, Arabic, meaning. Zakat answers are text only (amounts worked out in
  `api/_lib/zakat.ts` with live nisab prices, never by the model).
  Data: `api/_lib/{duas,names,zakat}-data.ts` (UmmahAPI snapshots, `node scripts/fetch-ummahapi.mjs`).
- **Account sync:** signed in, bookmarks, reading place and preferences follow the account
  (Supabase `public.user_data`, one RLS-protected row per user; `AccountSyncService`). Silent, no
  UI: the device stays the main copy, changes go up in one debounced upsert (2s, flushed when
  the app is hidden), and the row is re-read on sign-in and at most every 5 min on resume. First
  sign-in on a device merges bookmarks; after that the newer copy wins. Sign-out clears
  bookmarks and reading place from the device, keeps preferences.
- **Global cap:** the whole app answers at most QFLOW_GLOBAL_DAILY_LIMIT questions a day (default
  250, about what the free AI tiers allow; resets at midnight Pacific, with Gemini's quota). Once
  it's used, everyone gets the same card with "QuranFlow AI is resting for today" / "It has
  answered all it can today. Please ask again tomorrow, in sha Allah." A question refused by
  the cap doesn't count against the user.
- **Context sent with each question:** the last 3 question/answer pairs as text (answers carry
  their citations, so follow-ups can fetch those ayahs again).
