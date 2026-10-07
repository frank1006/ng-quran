/**
 * Cloudflare AI Gateway for QuranFlow AI's model calls (./qflow) and query embeddings (./vector).
 * Env: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_AI_GATEWAY (optional), CLOUDFLARE_AI_GATEWAY_TOKEN.
 */

/**
 * Model and embedding calls go through Cloudflare AI Gateway, whose analytics show requests,
 * errors, tokens and cost per provider and model. Its logs are off, so no question or answer is
 * stored there. CLOUDFLARE_AI_GATEWAY names the gateway (default "quranflow"; "off" calls the
 * providers directly). If the gateway itself can't be reached, the call goes direct.
 */
function viaGateway(path: string): string | null {
  const id = process.env.CLOUDFLARE_AI_GATEWAY?.trim() ?? 'quranflow';
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  return id && id !== 'off' && account ? `https://gateway.ai.cloudflare.com/v1/${account}/${id}/${path}` : null;
}

/**
 * POSTs through the gateway when there is one, and directly if the gateway can't be reached.
 * CLOUDFLARE_AI_GATEWAY_TOKEN (an "AI Gateway: Run" token) lets the gateway require
 * authentication, so only our server can use it.
 */
export async function postAI(gatewayPath: string, directUrl: string, init: RequestInit & { headers: Record<string, string> }): Promise<Response> {
  const gatewayUrl = viaGateway(gatewayPath);
  if (!gatewayUrl) return fetch(directUrl, init);
  const token = process.env.CLOUDFLARE_AI_GATEWAY_TOKEN;
  const headers = token ? { ...init.headers, 'cf-aig-authorization': `Bearer ${token}` } : init.headers;
  try {
    return await fetch(gatewayUrl, { ...init, headers });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    return fetch(directUrl, init);
  }
}
