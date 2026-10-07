import { Component, inject, signal } from '@angular/core';
import { AuthService } from '../../../core/auth.service';

/**
 * "Continue with Google": the app's one sign-in button (QuranFlow AI, Profile). White with the
 * standard four-colour G, as Google's branding guidelines ask. Tapping it leaves for Google and
 * comes back to QuranFlow AI; any error from that trip shows under the button.
 */
@Component({
  selector: 'app-google-sign-in',
  standalone: true,
  template: `
    <button type="button" class="google-button" (click)="signIn()" [disabled]="busy() || auth.unavailable">
      <svg class="google-logo" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
      </svg>
      <span>{{ busy() ? 'Opening Google…' : 'Continue with Google' }}</span>
    </button>
    @if (auth.error(); as error) {
      <p class="google-error" role="alert">{{ error }}</p>
    }
  `,
  styles: `
    :host {
      display: block;
    }

    .google-button {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.625rem;
      width: 100%;
      min-height: 2.75rem;
      padding: 0 1.25rem;
      border: 1px solid var(--color-cream-strong);
      border-radius: 999px;
      background: var(--color-surface);
      color: var(--color-text);
      font-family: var(--font-body);
      font-size: var(--font-sm);
      font-weight: 600;
      cursor: pointer;
      transition: background-color var(--motion-fast) var(--ease-standard);
    }

    .google-button:active:not(:disabled) {
      transform: scale(0.98);
    }

    .google-button:disabled {
      opacity: 0.6;
      cursor: progress;
    }

    .google-button:focus-visible {
      outline: 2px solid var(--color-primary-edge);
      outline-offset: 2px;
    }

    @media (hover: hover) {
      .google-button:hover:not(:disabled) {
        background: var(--color-cream);
      }
    }

    .google-logo {
      flex: none;
      width: 1.125rem;
      height: 1.125rem;
    }

    .google-error {
      margin-top: var(--space-xs);
      font-size: var(--font-xs);
      color: var(--color-accent-dark);
      text-align: center;
    }
  `,
})
export class GoogleSignInComponent {
  protected readonly auth = inject(AuthService);
  protected readonly busy = signal(false);

  protected async signIn(): Promise<void> {
    this.busy.set(true);
    await this.auth.signIn();
    // Normally the page has left for Google by now; if not, the error shows and the button returns
    this.busy.set(false);
  }
}
