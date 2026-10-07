/**
 * Retrieval for QFlow: questions are embedded with Cloudflare Workers AI EmbeddingGemma (768 dims)
 * and searched in Upstash Vector with the read-only token. Namespaces: "quran"
 * (scripts/import-quran.mjs) and "hadith" (scripts/import-hadith.mjs), both embedded the same way.
 *
 * Env: UPSTASH_VECTOR_REST_URL, UPSTASH_VECTOR_REST_READONLY_TOKEN, CLOUDFLARE_ACCOUNT_ID,
 * CLOUDFLARE_API_TOKEN.
 */

const EMBED_MODEL = '@cf/google/embeddinggemma-300m';
/** EmbeddingGemma's retrieval prompt for queries; documents were embedded with "title: … | text: …" */
const QUERY_PREFIX = 'task: search result | query: ';
/**
 * Recent query embeddings: the model often searches the Quran and hadith with the same words,
 * and the search-only fallback re-embeds the question. Saves Cloudflare's daily free quota.
 */
const embedCache = new Map<string, number[]>();
const EMBED_CACHE_SIZE = 50;

export async function embedQuery(text: string): Promise<number[]> {
  const cached = embedCache.get(text);
  if (cached) return cached;
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/run/${EMBED_MODEL}`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ text: [QUERY_PREFIX + text] }),
    },
  );
  const body: any = await response.json().catch(() => null);
  const values: number[] | undefined = body?.result?.data?.[0];
  if (!response.ok || !values) throw new Error(`Embedding failed (HTTP ${response.status})`);
  const norm = Math.hypot(...values) || 1;
  const embedding = values.map(v => v / norm);
  if (embedCache.size >= EMBED_CACHE_SIZE) embedCache.delete(embedCache.keys().next().value!);
  embedCache.set(text, embedding);
  return embedding;
}

export async function vector(path: string, body: unknown): Promise<any> {
  const response = await fetch(`${process.env.UPSTASH_VECTOR_REST_URL!.replace(/\/$/, '')}/${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.UPSTASH_VECTOR_REST_READONLY_TOKEN}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Vector ${path.split('/')[0]} failed (HTTP ${response.status})`);
  return (await response.json()).result;
}
