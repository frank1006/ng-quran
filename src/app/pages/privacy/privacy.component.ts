import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Privacy policy (/privacy). Linked from Profile and from Google's sign-in consent screen, so it
 * must stay accurate: update it whenever the app starts sending or keeping new data.
 */
@Component({
  selector: 'app-privacy',
  standalone: true,
  imports: [RouterLink],
  template: `
    <article class="privacy page-pattern">
      <h1 class="privacy-title">Privacy policy</h1>
      <p class="ui-page-subtitle">Last updated 7 October 2026</p>

      <p class="lead">
        QuranFlow is a free app for prayer times, the Quran, Qibla direction and nearby masjids. Most
        of it works without an account, and what you do in the app stays on your device unless a
        feature below needs to send it somewhere. We don't sell your data or show ads.
      </p>

      <section>
        <h2 class="ui-section-label">Kept on your device</h2>
        <p>
          Your settings, bookmarks, reading progress, last location and your QuranFlow AI
          conversation are saved in your browser's storage on this device only. Clearing this
          site's data in your browser removes them; signing out clears the QuranFlow AI
          conversation.
        </p>
      </section>

      <section>
        <h2 class="ui-section-label">Your location</h2>
        <p>
          With your permission, your location is used to work out prayer times and the Qibla
          direction, and it is sent (without your name) to these services to get: prayer times
          (AlAdhan), weather (Open-Meteo), nearby masjids (OpenStreetMap / Overpass) and your city's
          name (OpenStreetMap Nominatim or Geoapify).
        </p>
      </section>

      <section>
        <h2 class="ui-section-label">Prayer reminders</h2>
        <p>
          If you turn on reminders, we store your device's push address, your location rounded to
          about 1 km, your time zone, your calculation settings and which prayers you chose, so
          reminders arrive while the app is closed. Turning reminders off deletes them.
        </p>
      </section>

      <section>
        <h2 class="ui-section-label">Account (Google sign-in)</h2>
        <p>
          An account is only needed for QuranFlow AI. When you sign in with Google, our sign-in
          provider (Supabase) receives your name, email address and profile picture from Google. We
          use your first name to greet you and your account to count your daily questions. We
          never see your Google password. You can delete your account at any time in Profile → App
          → Delete Account.
        </p>
      </section>

      <section>
        <h2 class="ui-section-label">QuranFlow AI</h2>
        <p>
          Your question, a few earlier questions and answers from the same conversation, and the
          Islamic calendar dates are sent to our AI providers to produce the answer: Cloudflare (to
          search the Quran), Google Gemini and, as a backup, Groq. We don't store your questions or
          answers on our servers. To keep the service fair, we keep a count of your questions for
          the day, stored under a scrambled form of your account id, and it expires after a day and a
          half. Please don't include personal details in your questions.
        </p>
      </section>

      <section>
        <h2 class="ui-section-label">Quran audio and text</h2>
        <p>
          Quran text and recitations are loaded from public Quran services; these requests don't
          include your name or location.
        </p>
      </section>

      <section>
        <h2 class="ui-section-label">Usage statistics</h2>
        <p>
          We use Vercel Analytics to count page visits. It doesn't use cookies and doesn't identify
          you.
        </p>
      </section>

      <section>
        <h2 class="ui-section-label">Children</h2>
        <p>QuranFlow AI and accounts are not intended for children under 13.</p>
      </section>

      <section>
        <h2 class="ui-section-label">Changes</h2>
        <p>If this policy changes, we'll update it here and change the date at the top.</p>
      </section>

      <a class="ui-button ui-button--secondary back" routerLink="/profile">Back to Profile</a>
    </article>
  `,
  styles: `
    .privacy {
      max-width: 40rem;
      margin: 0 auto;
      padding: var(--space-xl) var(--space-xl) calc(var(--nav-space) + var(--space-xl));
    }

    .privacy-title {
      font-size: var(--page-title-size);
      line-height: var(--page-title-line-height);
      font-weight: 700;
      color: var(--color-text);
      letter-spacing: -0.03125rem;
    }

    .lead {
      margin-top: var(--space-lg);
    }

    section {
      margin-top: var(--space-xl);
    }

    p {
      font-size: var(--font-sm);
      line-height: 1.6;
      color: var(--color-text);
    }

    .back {
      margin-top: var(--space-xl);
    }
  `,
})
export class PrivacyComponent {}
