import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Our mission (/mission), linked from Profile → App → About. Also the "App home page" on Google's
 * sign-in branding: it must say what the app does and link to the privacy policy.
 * Layout: .ui-doc-page (styles.css).
 */
@Component({
  selector: 'app-mission',
  standalone: true,
  imports: [RouterLink],
  template: `
    <article class="ui-doc-page page-pattern">
      <h1 class="ui-doc-title">QuranFlow</h1>
      <p class="ui-page-subtitle">Our mission</p>

      <p class="ui-doc-lead">
        Our mission is to provide a beautiful, accessible and accurate Islamic app that helps Muslims
        around the world stay connected to their daily prayers and to the Quran. We combine modern
        design with traditional values, so it's easy to know the prayer times, read and listen to the
        Quran, and find the Qibla.
      </p>

      <section>
        <h2 class="ui-section-label">What we hold to</h2>
        <ul>
          <li><strong>Free, with no ads.</strong> Nothing is sold, and nothing distracts from prayer.</li>
          <li><strong>Private.</strong> Most of the app works without an account. Your data stays on your device, and with your account only if you sign in.</li>
          <li><strong>Accurate.</strong> Prayer times follow your location and the calculation method you choose.</li>
          <li><strong>Always there.</strong> Prayer times and the Quran text work offline.</li>
          <li><strong>For everyone.</strong> Clear text, good contrast and screen reader support.</li>
        </ul>
      </section>

      <section>
        <h2 class="ui-section-label">QuranFlow AI</h2>
        <p>
          QuranFlow AI helps you find what the Quran says and du'as from the Quran and Sunnah. It
          answers only with ayahs and du'as it found, shows them in full with their references, and
          doesn't interpret them or give religious rulings.
          For rulings about your situation, please ask a qualified scholar.
        </p>
      </section>

      <section>
        <h2 class="ui-section-label">Your privacy</h2>
        <p>
          Read how QuranFlow handles your data in our <a routerLink="/privacy">privacy policy</a>.
        </p>
      </section>

      <div class="ui-doc-back">
        <a class="ui-button ui-button--secondary" routerLink="/prayer">Open QuranFlow</a>
        <a class="ui-button ui-button--secondary" routerLink="/privacy">Privacy policy</a>
      </div>
    </article>
  `,
})
export class MissionComponent {}
