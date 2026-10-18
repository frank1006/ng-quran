import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { vi } from 'vitest';
import { AuthService } from './auth.service';

describe('AuthService start-up', () => {
  let loadSupabase: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();
    // Stands in for loading the Supabase library, so no test talks to Supabase
    loadSupabase = vi.spyOn(AuthService.prototype as any, 'supabase').mockResolvedValue(null);
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('does not load the sign-in library for a guest, and is ready at once', async () => {
    const auth = TestBed.inject(AuthService);
    expect(loadSupabase).not.toHaveBeenCalled();
    expect(auth.ready()).toBe(true);
    expect(auth.signedIn()).toBe(false);
    expect(await auth.accessToken()).toBeNull();
    expect(loadSupabase).not.toHaveBeenCalled();
  });

  it('loads it at start-up when a session is saved in this browser', () => {
    localStorage.setItem('sb-project-auth-token', '{}');
    TestBed.inject(AuthService);
    expect(loadSupabase).toHaveBeenCalledTimes(1);
  });

  it('loads it when the person taps Sign in', async () => {
    const auth = TestBed.inject(AuthService);
    await auth.signIn();
    expect(loadSupabase).toHaveBeenCalledTimes(1);
  });
});
