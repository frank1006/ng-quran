import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Our mission (/mission), linked from Profile → App → About. Layout: .ui-doc-page (styles.css). */
@Component({
  selector: 'app-mission',
  standalone: true,
  imports: [RouterLink],
  template: `
    <article class="ui-doc-page page-pattern">
      <h1 class="ui-doc-title">Our mission</h1>
      <p class="ui-page-subtitle">Why we build QuranFlow</p>

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
          <li><strong>Private.</strong> Most of the app works without an account, and your data stays on your device.</li>
          <li><strong>Accurate.</strong> Prayer times follow your location and the calculation method you choose.</li>
          <li><strong>Always there.</strong> Prayer times and the Quran text work offline.</li>
          <li><strong>For everyone.</strong> Clear text, good contrast and screen reader support.</li>
        </ul>
      </section>

      <section>
        <h2 class="ui-section-label">QuranFlow AI</h2>
        <p>
          QuranFlow AI helps you find what the Quran says. It answers only with ayahs it found, shows
          them in full with their references, and doesn't interpret them or give religious rulings.
          For rulings about your situation, please ask a qualified scholar.
        </p>
      </section>

      <div class="ui-doc-back">
        <a class="ui-button ui-button--secondary" routerLink="/profile">Back to Profile</a>
      </div>
    </article>
  `,
})
export class MissionComponent {}
