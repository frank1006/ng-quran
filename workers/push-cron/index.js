/**
 * QuranFlow push timer: every minute, asks the app (Vercel) to send the prayer reminders
 * that are due. The reminder logic stays in api/push/dispatch.ts; this only rings the bell.
 *
 * Cloudflare starts each cron run some seconds into its minute (about :21 for this Worker),
 * and prayer times are whole minutes, so dispatching right away would send a 13:05 reminder
 * at 13:05:21. Each run waits for the next whole minute instead, so it goes out at 13:05:00.
 * Never early: dispatch only sends reminders whose time has come.
 */

/** A run that starts this close after a whole minute dispatches at once, rather than a minute late */
const ON_TIME_MS = 5_000;

export default {
  async scheduled(_event, env) {
    const intoMinute = Date.now() % 60_000;
    if (intoMinute > ON_TIME_MS) await sleep(60_000 - intoMinute);
    await dispatch(env);
  },
};

async function dispatch(env) {
  // Accept the secret pasted with or without "Bearer " or quotes
  const secret = String(env.CRON_SECRET ?? '').trim().replace(/^bearer\s+/i, '').replace(/^["']|["']$/g, '').trim();
  const response = await fetch(env.DISPATCH_URL, {
    headers: { Authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(50_000),
  });
  const body = (await response.text()).slice(0, 300);
  if (!response.ok) throw new Error(`dispatch ${response.status}: ${body}`);
  console.log(`dispatch ${response.status} at second ${(Date.now() % 60_000) / 1000}: ${body}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
