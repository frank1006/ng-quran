/**
 * QuranFlow push timer: every minute, asks the app (Vercel) to send the prayer reminders
 * that are due. The reminder logic stays in api/push/dispatch.ts; this only rings the bell.
 */
export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(dispatch(env));
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
  console.log(`dispatch ${response.status}: ${body}`);
}
