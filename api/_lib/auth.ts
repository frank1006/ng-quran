/**
 * Who is signed in, for the API. The app signs in with Google through Supabase and sends the
 * session's access token as `Authorization: Bearer <token>`. We ask Supabase who the token
 * belongs to (it checks the signature, expiry and that the user still exists) and never trust a
 * user id sent by the app.
 *
 * Env: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY (reads); SUPABASE_SECRET_KEY (account deletion only,
 * server side, never in the app).
 */

export interface AuthUser {
  /** Supabase's user id (a UUID); a new one if the account is deleted and made again */
  id: string;
  /**
   * Who the person is for the daily limit: their Google account id, which Google never changes,
   * so deleting the account and signing up again doesn't reset the day's count. Falls back to
   * the Supabase id if no Google identity is found.
   */
  limitKey: string;
}

/** A token's answer is reused briefly, so a page's few requests cost one check */
const CACHE_MS = 60_000;
const cache = new Map<string, { user: AuthUser | null; until: number }>();

export function authConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY);
}

/** The signed-in user, or null for a guest (no token, expired, or not a real session) */
export async function getUser(request: Request): Promise<AuthUser | null> {
  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') ?? '')?.[1];
  if (!token || token.length > 4096 || !authConfigured()) return null;

  const cached = cache.get(token);
  if (cached && cached.until > Date.now()) return cached.user;

  const response = await fetch(`${supabaseUrl()}/auth/v1/user`, {
    headers: { apikey: process.env.SUPABASE_PUBLISHABLE_KEY!, authorization: `Bearer ${token}` },
  });
  if (response.status >= 500) throw new Error(`Supabase auth HTTP ${response.status}`);
  const body: any = response.ok ? await response.json().catch(() => null) : null;
  const user: AuthUser | null = typeof body?.id === 'string' ? { id: body.id, limitKey: limitKey(body) } : null;

  if (cache.size > 1000) cache.clear();
  cache.set(token, { user, until: Date.now() + CACHE_MS });
  return user;
}

function limitKey(user: any): string {
  const google = Array.isArray(user.identities) ? user.identities.find((i: any) => i?.provider === 'google') : null;
  // Google's "sub" (its permanent account id); Supabase copies it into user_metadata too
  const sub = google?.identity_data?.sub ?? user.user_metadata?.sub ?? user.user_metadata?.provider_id;
  return typeof sub === 'string' && sub ? `google:${sub}` : `user:${user.id}`;
}

/** Deletes the account from Supabase (Google Play requires in-app deletion) */
export async function deleteUser(id: string): Promise<void> {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error('SUPABASE_SECRET_KEY is not set');
  const response = await fetch(`${supabaseUrl()}/auth/v1/admin/users/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { apikey: secret, authorization: `Bearer ${secret}` },
  });
  if (!response.ok && response.status !== 404) throw new Error(`Supabase delete HTTP ${response.status}`);
  for (const [token, entry] of cache) if (entry.user?.id === id) cache.delete(token);
}

function supabaseUrl(): string {
  return process.env.SUPABASE_URL!.replace(/\/$/, '');
}
