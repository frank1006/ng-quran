import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Privacy policy (/privacy). Linked from Profile and from Google's sign-in consent screen, so it
 * must stay accurate: update it whenever the app starts sending or keeping new data. It also
 * carries the data credits the sources' licences ask for (OpenStreetMap ODbL, Open-Meteo CC BY,
 * the hadith dataset's attribution).
 * Layout: the shared .ui-doc-page styles (styles.css).
 */
@Component({
  selector: 'app-privacy',
  standalone: true,
  imports: [RouterLink],
  template: `
    <article class="ui-doc-page page-pattern">
      <h1 class="ui-doc-title">Privacy policy</h1>
      <p class="ui-page-subtitle">Last updated 10 October 2026</p>

      <p class="ui-doc-lead">
        QuranFlow is a free app for prayer times, the Quran, Qibla direction and nearby masjids. Most
        of it works without an account, and what you do in the app stays on your device unless a
        feature below needs to send it somewhere. We don't sell your data or show ads.
      </p>

      <section>
        <h2 class="ui-section-label">Kept on your device</h2>
        <p>
          Your settings, bookmarks, reading progress, last location and your QuranFlow AI
          conversation are saved in your browser's storage on this device. Without an account they
          stay on this device only, and clearing this site's data in your browser removes them.
          Signing out clears the QuranFlow AI conversation, bookmarks and reading progress from the
          device (they stay with your account).
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
        <p>
          While you're signed in, your bookmarks, reading progress and app settings (reciter,
          translation, time format, prayer calculation, units and Hijri date adjustment) are also
          saved with your account at Supabase, so they're the same on all your devices. Only you can
          read them. Your location and your QuranFlow AI conversation are not saved with your
          account. Deleting your account deletes this copy too.
        </p>
      </section>

      <section>
        <h2 class="ui-section-label">QuranFlow AI</h2>
        <p>
          Your question, a few earlier questions and answers from the same conversation, and the
          Islamic calendar dates are sent to our AI providers to produce the answer: Cloudflare (to
          search the Quran), Google Gemini and, as backups, Cloudflare Workers AI and Groq. These requests pass through Cloudflare AI Gateway, which counts them (time, model, size, errors) without storing their content. So it can answer about your day,
          it also receives your city, today's prayer times, the Qibla direction and, when you ask,
          the names and distances of nearby masjids and the weather forecast; it never receives
          your exact location. To look those up, our server uses your location rounded to about
          1 km (OpenStreetMap / Geoapify for masjids, Open-Meteo for weather). For a zakat estimate,
          only your currency is sent to UmmahAPI for today's gold and silver prices; the amounts you
          type are part of your question and are worked out on our server. We don't store your
          questions or answers on our servers. To keep the service fair, we keep a count of your questions for
          the day, stored under a scrambled form of your Google account id, and it expires after a day and a
          half (also if you delete your account). Please don't include personal details in your questions.
        </p>
        <p>
          When you ask what an ayah means, our server asks the Quran Foundation for the tafsir of that ayah. Only the
          ayah's number and the tafsir's name are sent; nothing about you is.
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

      <section>
        <h2 class="ui-section-label">Data sources and credits</h2>
        <ul>
          <li>Prayer times by <a href="https://aladhan.com" target="_blank" rel="noopener">AlAdhan</a></li>
          <li>Quran text and audio via <a href="https://github.com/The-Quran-Project/Quran-API" target="_blank" rel="noopener">The Quran Project</a> (MIT)</li>
          <li>Masjid and map data &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a> (ODbL); fallback by <a href="https://www.geoapify.com" target="_blank" rel="noopener">Geoapify</a></li>
          <li>Weather data by <a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo.com</a> (CC BY 4.0)</li>
          <li>Du'as, the names of Allah, zakat rules and today's gold and silver prices via <a href="https://ummahapi.com" target="_blank" rel="noopener">UmmahAPI</a></li>
          <li>
            Hadith of Sahih al-Bukhari and Sahih Muslim via the <a href="https://huggingface.co/datasets/quranlab/hadith" target="_blank" rel="noopener">QuranLab hadith dataset</a>:
            the Arabic text (public domain) from <a href="https://github.com/fawazahmed0/hadith-api" target="_blank" rel="noopener">fawazahmed0/hadith-api</a>,
            and English and Urdu translations, with their grades, from
            <a href="https://hadeethenc.com" target="_blank" rel="noopener">HadeethEnc.com</a> (the Encyclopedia of
            Translated Prophetic Hadiths), used with attribution. Hadith without a HadeethEnc translation are shown in Arabic only.
          </li>
          <li>
            Tafsir, shown under QuranFlow AI's answer when you ask what an ayah means, via the
            <a href="https://quran.foundation" target="_blank" rel="noopener">Quran Foundation</a> API: Tafsir Ibn Kathir
            (English, Urdu, Arabic), Ma'arif al-Qur'an by Mufti Muhammad Shafi, Tazkir ul Quran by Maulana Wahiduddin Khan,
            Bayan ul Quran by Dr. Israr Ahmad, Fi Zilal al-Quran by Sayyid Qutb, Al-Tafsir al-Muyassar, and the tafsirs of
            al-Tabari, al-Qurtubi, al-Sa'di, al-Baghawi and Tantawi (Al-Wasit). Passages are shown as the scholars wrote them; QuranFlow AI summarises one only when asked to.
          </li>
        </ul>
      </section>

      <div class="ui-doc-back">
        <a class="ui-button ui-button--secondary" routerLink="/profile">Back to Profile</a>
        <a class="ui-button ui-button--secondary" routerLink="/terms">Terms of use</a>
      </div>
    </article>
  `,
})
export class PrivacyComponent {}
