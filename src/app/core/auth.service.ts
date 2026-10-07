import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { PUBLIC_ENV } from './public-env';

/** The signed-in person, as the app shows them */
export interface AppUser {
  id: string;
  /** Full name from Google, e.g. "Ahmad Raza" */
  name: string;
  /** For greetings: "Ahmad" */
  firstName: string;
  email: string;
  avatarUrl: string | null;
}

/** Fired when someone signs out or deletes their account, so their data on the device can go */
type SignedOutListener = () => void;

/**
 * Google sign-in through Supabase. Only QuranFlow AI needs an account; everything else works
 * without one. The Supabase library loads after the first screen (it isn't small) and keeps the
 * session in this browser's storage, refreshing it as needed.
 *
 * Sign-in is a full-page redirect to Google and back (PKCE). Popups don't work reliably in an app
 * installed to the home screen.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  /** False until the saved session (or a returning redirect) has been read */
  readonly ready = signal(false);
  readonly user = signal<AppUser | null>(null);
  readonly signedIn = computed(() => this.user() !== null);
  /** Sign-in can't work: Supabase isn't configured in this build */
  readonly unavailable = !PUBLIC_ENV.supabaseUrl || !PUBLIC_ENV.supabasePublishableKey;
  /** Shown once after a sign-in that came back with an error (e.g. the person cancelled) */
  readonly error = signal<string | null>(null);

  private readonly http = inject(HttpClient);
  private client?: Promise<SupabaseClient | null>;
  private readonly signedOutListeners: SignedOutListener[] = [];

  constructor() {
    this.readRedirectError();
    void this.supabase();
  }

  /** Goes to Google and comes back to the page the person is on */
  async signIn(): Promise<void> {
    this.error.set(null);
    const supabase = await this.supabase();
    if (!supabase) {
      this.error.set('Sign-in is not available right now.');
      return;
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${location.origin}${location.pathname}`,
        queryParams: { prompt: 'select_account' },
      },
    });
    if (error) this.error.set('Could not open Google sign-in. Please try again.');
  }

  async signOut(): Promise<void> {
    const supabase = await this.supabase();
    // 'local': this device only; other devices stay signed in
    await supabase?.auth.signOut({ scope: 'local' }).catch(() => {});
    this.applySession(null);
    this.signedOutListeners.forEach(listener => listener());
  }

  /** Deletes the account on the server (Google Play requires this in the app), then signs out */
  async deleteAccount(): Promise<void> {
    const token = await this.accessToken();
    if (!token) return;
    await firstValueFrom(this.http.delete('/api/auth/account', { headers: { authorization: `Bearer ${token}` } }));
    await this.signOut();
  }

  /** The current access token for our API (refreshed by Supabase when it's about to expire) */
  async accessToken(): Promise<string | null> {
    const supabase = await this.supabase();
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }

  /** Lets features clear what they saved for the person (e.g. the QuranFlow AI chat) */
  onSignedOut(listener: SignedOutListener): void {
    this.signedOutListeners.push(listener);
  }

  private supabase(): Promise<SupabaseClient | null> {
    this.client ??= this.createClient();
    return this.client;
  }

  private async createClient(): Promise<SupabaseClient | null> {
    if (this.unavailable) {
      this.ready.set(true);
      return null;
    }
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(PUBLIC_ENV.supabaseUrl, PUBLIC_ENV.supabasePublishableKey, {
        auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      });
      supabase.auth.onAuthStateChange((_event, session) => this.applySession(session));
      // Also finishes a returning Google redirect (?code=…) before answering
      const { data } = await supabase.auth.getSession();
      this.applySession(data.session);
      this.cleanRedirectUrl();
      return supabase;
    } catch {
      // Offline on first load, or the library failed to load: stay signed out for now
      return null;
    } finally {
      this.ready.set(true);
    }
  }

  private applySession(session: Session | null): void {
    const u = session?.user;
    if (!u) {
      this.user.set(null);
      return;
    }
    const meta = u.user_metadata ?? {};
    const name: string = (meta['full_name'] || meta['name'] || u.email || '').trim();
    const firstName: string = (meta['given_name'] || name.split(/\s+/)[0] || '').trim();
    const current = this.user();
    // Same person: keep the object, so nothing re-renders on every token refresh
    if (current?.id === u.id && current.name === name) return;
    this.user.set({
      id: u.id,
      name,
      firstName,
      email: u.email ?? '',
      avatarUrl: meta['avatar_url'] || meta['picture'] || null,
    });
  }

  /** Google or Supabase can come back with ?error=… (e.g. the person pressed Cancel) */
  private readRedirectError(): void {
    const params = new URLSearchParams(location.search);
    const error = params.get('error');
    if (!error) return;
    this.error.set(error === 'access_denied' ? 'Sign-in was cancelled.' : 'Sign-in did not complete. Please try again.');
    this.cleanRedirectUrl();
  }

  /** Removes ?code= / ?error= from the address bar once they've been used */
  private cleanRedirectUrl(): void {
    const url = new URL(location.href);
    const keys = ['code', 'error', 'error_code', 'error_description', 'state'];
    if (!keys.some(k => url.searchParams.has(k))) return;
    keys.forEach(k => url.searchParams.delete(k));
    history.replaceState(history.state, '', url.pathname + url.search + url.hash);
  }
}
