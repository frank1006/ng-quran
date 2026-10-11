import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Terms of use (/terms). Linked from Profile → App → About, the mission page and the launch
 * screen. Quran Foundation's developer terms ask for public Terms of Use beside the privacy
 * policy; keep the two in step (what the app does with data is said there, not here).
 * Layout: the shared .ui-doc-page styles (styles.css).
 */
@Component({
  selector: 'app-terms',
  standalone: true,
  imports: [RouterLink],
  template: `
    <article class="ui-doc-page page-pattern">
      <h1 class="ui-doc-title">Terms of use</h1>
      <p class="ui-page-subtitle">Last updated 10 October 2026</p>

      <p class="ui-doc-lead">
        QuranFlow is a free app for prayer times, the Quran, Qibla direction, nearby masjids and
        QuranFlow AI. By using it you agree to these terms. If you don't agree with them, please
        don't use the app.
      </p>

      <section>
        <h2 class="ui-section-label">Using QuranFlow</h2>
        <p>
          You may use QuranFlow for your own personal, non-commercial use. Most of it works without
          an account. Please use it respectfully and lawfully.
        </p>
        <p>You agree not to:</p>
        <ul>
          <li>copy, scrape or download the app's content in bulk, or offer it to others as data;</li>
          <li>get around the daily question limit or any other limit, or use automated tools to send requests;</li>
          <li>interfere with the app, its servers or other people's use of it;</li>
          <li>use the app to mock or misrepresent the Quran or Islam, or for anything hateful, abusive or unlawful.</li>
        </ul>
        <p>We may limit or end access for anyone who breaks these terms.</p>
      </section>

      <section>
        <h2 class="ui-section-label">Prayer times, Qibla and reminders</h2>
        <p>
          Prayer times are calculated from your location and the calculation method you choose, and
          they can differ by a few minutes from your local masjid's timetable. The Qibla direction
          depends on your device's location and compass, which can be inaccurate, especially indoors
          or near metal. Islamic dates are calculated and can differ by a day from a local moon
          sighting. Please check with your local masjid where it matters.
        </p>
        <p>
          Prayer reminders are sent as notifications through your phone's and browser's services. They
          can arrive late or not at all, so please don't rely on them alone.
        </p>
      </section>

      <section>
        <h2 class="ui-section-label">QuranFlow AI</h2>
        <p>
          QuranFlow AI helps you find ayahs, hadith, du'as and tafsir, and shows them with their
          sources. It is a computer program, not a scholar. It can make mistakes, choose a passage
          that doesn't fit your question, or summarise imperfectly, so please read the sources it
          shows and not only its words.
        </p>
        <p>
          It does not give religious rulings (fatwas), and nothing in it is medical, legal or
          financial advice. A zakat estimate is an estimate only. For a ruling about your situation,
          please ask a qualified scholar you trust.
        </p>
        <p>
          QuranFlow AI needs a Google sign-in and is not intended for children under 13. The number of
          questions each person can ask per day is limited, and the limit can change. Please don't
          include personal details in your questions.
        </p>
      </section>

      <section>
        <h2 class="ui-section-label">Your account</h2>
        <p>
          You are responsible for what is done with your account. You can sign out or delete your
          account at any time in Profile → App → Delete Account. How your data is handled is
          explained in our <a routerLink="/privacy">privacy policy</a>.
        </p>
      </section>

      <section>
        <h2 class="ui-section-label">Content and credits</h2>
        <p>
          The Quran text is shown unchanged. The Quran text and audio, translations, hadith, tafsir,
          du'as, prayer times, maps and weather come from the sources named in the
          <a routerLink="/privacy">privacy policy</a>, and they remain the property of their owners. Tafsir
          is provided through the Quran Foundation API and is shown as its authors wrote it. You may
          read and share short passages for personal use, with their reference; anything more needs
          the permission of the source.
        </p>
        <p>The QuranFlow name, logo and design are ours. Please don't present them as your own.</p>
      </section>

      <section>
        <h2 class="ui-section-label">No guarantee</h2>
        <p>
          QuranFlow is provided free and "as is". We work to keep it accurate and available, but we
          can't promise that it will always be correct, complete or uninterrupted, and we may change
          or stop any part of it. As far as the law allows, we are not liable for any loss that comes
          from using the app or relying on what it shows.
        </p>
      </section>

      <section>
        <h2 class="ui-section-label">Changes</h2>
        <p>
          If these terms change, we'll update them here and change the date at the top. Using the app
          after a change means you accept the new terms.
        </p>
      </section>

      <div class="ui-doc-back">
        <a class="ui-button ui-button--secondary" routerLink="/profile">Back to Profile</a>
        <a class="ui-button ui-button--secondary" routerLink="/privacy">Privacy policy</a>
      </div>
    </article>
  `,
})
export class TermsComponent {}
