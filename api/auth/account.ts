/**
 * DELETE /api/auth/account
 * Deletes the signed-in user's QuranFlow account (their Supabase sign-in record). Google Play
 * requires that people can delete their account from inside the app. The app then signs out
 * and clears what it keeps on the device.
 */
import { deleteUser, getUser } from '../_lib/auth';

export const maxDuration = 10;

export async function DELETE(request: Request): Promise<Response> {
  try {
    const user = await getUser(request);
    if (!user) return json({ error: 'Please sign in first' }, 401);
    await deleteUser(user.id);
    return json({ deleted: true });
  } catch (error) {
    console.error('auth/account delete failed:', (error as Error).message);
    return json({ error: 'Could not delete the account right now. Please try again.' }, 503);
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
