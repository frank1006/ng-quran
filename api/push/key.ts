/** GET /api/push/key: the VAPID public key the app subscribes with (public by design). */
import { json } from '../_lib/push';

export function GET(): Response {
  const key = process.env.VAPID_PUBLIC_KEY;
  return key ? json({ key }) : json({ error: 'Push reminders are not configured' }, 503);
}
