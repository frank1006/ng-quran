/** GET /api/push/key: the VAPID public key the app subscribes with (public by design). */
import { cleanEnv, json } from '../_lib/push';

export function GET(): Response {
  const key = cleanEnv('VAPID_PUBLIC_KEY');
  return key ? json({ key }) : json({ error: 'Push reminders are not configured' }, 503);
}
