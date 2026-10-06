#!/usr/bin/env node
/**
 * Imports the Quran's 6,236 ayahs from public/data/quran into Upstash Vector (namespace "quran")
 * for QFlow, embedded with Cloudflare Workers AI EmbeddingGemma-300m (768 dims, 100+ languages,
 * so English, Arabic and Urdu questions all match).
 *
 * Usage:
 *   node scripts/import-quran.mjs --dry-run   # stats only, no keys needed
 *   node scripts/import-quran.mjs             # import (resumes if stopped)
 *   node scripts/import-quran.mjs --reset     # clear the "quran" namespace first
 *
 * Keys come from the environment or .env.local and are never printed (see redact()):
 *   UPSTASH_VECTOR_REST_URL, UPSTASH_VECTOR_REST_TOKEN, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN
 *
 * The Upstash index must be 768 dimensions, COSINE, with no built-in embedding model.
 * Queries must be embedded with the same model and the prefix in QUERY_PREFIX.
 *
 * Each vector:
 *   id        "2:255"
 *   metadata  { surah, ayah, surahName, surahNameArabic }
 *   data      JSON { ar, en, ur } (ar keeps full tashkeel for display)
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const QURAN_DIR = join(ROOT, 'public', 'data', 'quran');
const CACHE_DIR = join(ROOT, '.cache', 'quran');
const PROGRESS_FILE = join(CACHE_DIR, 'progress.json');

const MODEL = '@cf/google/embeddinggemma-300m';
const DIMENSIONS = 768;
const NAMESPACE = 'quran';
// EmbeddingGemma's retrieval prompts; the QFlow search function must use QUERY_PREFIX for questions
const docText = (title, text) => `title: ${title} | text: ${text}`;
const QUERY_PREFIX = 'task: search result | query: ';
const BATCH = 50;
const TOTAL_AYAHS = 6236;

const SECRET_NAMES = [
  'UPSTASH_VECTOR_REST_URL',
  'UPSTASH_VECTOR_REST_TOKEN',
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_API_TOKEN',
];

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const reset = args.includes('--reset');

// --- secrets -------------------------------------------------------------------------------

if (existsSync(join(ROOT, '.env.local'))) process.loadEnvFile(join(ROOT, '.env.local'));

/** Removes every secret value (and the index host) from a message before it is printed. */
function redact(message) {
  let text = String(message);
  for (const name of SECRET_NAMES) {
    const value = process.env[name];
    if (value && value.length > 3) text = text.split(value).join(`[${name}]`);
  }
  const host = URL.parse(process.env.UPSTASH_VECTOR_REST_URL ?? '')?.host;
  if (host) text = text.split(host).join('[UPSTASH_VECTOR_HOST]');
  return text;
}

const log = (message) => console.log(redact(message));

function fail(message) {
  console.error(redact(`✗ ${message}`));
  process.exit(1);
}

// Anything unexpected (network errors, bad JSON) is printed redacted too, never as a raw stack
process.on('uncaughtException', (error) => fail(error?.message ?? error));
process.on('unhandledRejection', (error) => fail(error?.message ?? error));

// --- data ----------------------------------------------------------------------------------

const clean = (text) => (text ?? '').replace(/\s+/g, ' ').trim();

async function loadAyahs() {
  const records = [];
  for (let surah = 1; surah <= 114; surah++) {
    const s = JSON.parse(await readFile(join(QURAN_DIR, `${surah}.json`), 'utf8'));
    s.english.forEach((english, i) => {
      const ref = `${surah}:${i + 1}`;
      const en = clean(english);
      const ar = clean(s.arabic1[i]);
      const ur = clean(s.urdu[i]);
      records.push({
        id: ref,
        // Plain Arabic (arabic2) embeds better than full tashkeel; all three languages in one
        // vector lets a question in any of them find the ayah
        embedText: docText(`${s.surahName} ${ref}`, [en, clean(s.arabic2[i]), ur].join('\n')),
        metadata: {
          surah,
          ayah: i + 1,
          surahName: s.surahName,
          surahNameArabic: s.surahNameArabic,
        },
        data: JSON.stringify({ ar, en, ur }),
      });
    });
  }
  if (records.length !== TOTAL_AYAHS) fail(`Expected ${TOTAL_AYAHS} ayahs, found ${records.length}`);
  return records;
}

// --- progress ------------------------------------------------------------------------------

async function loadProgress() {
  if (!existsSync(PROGRESS_FILE)) return { done: [] };
  return JSON.parse(await readFile(PROGRESS_FILE, 'utf8'));
}

const saveProgress = (progress) => writeFile(PROGRESS_FILE, JSON.stringify(progress));

// --- Cloudflare ----------------------------------------------------------------------------

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalise(values) {
  const norm = Math.hypot(...values) || 1;
  return values.map((v) => v / norm);
}

async function embed(texts, attempt = 1) {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/run/${MODEL}`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ text: texts }),
    },
  );
  const body = await response.json().catch(() => ({}));
  if (response.status === 429 || response.status >= 500) {
    const detail = JSON.stringify(body.errors ?? '').slice(0, 200);
    if (/daily free allocation|4006/i.test(detail)) {
      fail(`Cloudflare's free daily allowance is used up (${detail}). Progress is saved; run again tomorrow.`);
    }
    if (attempt > 5) fail(`Cloudflare kept failing (HTTP ${response.status} ${detail}). Progress is saved.`);
    log(`  Cloudflare HTTP ${response.status}, retrying in ${10 * attempt}s…`);
    await sleep(10_000 * attempt);
    return embed(texts, attempt + 1);
  }
  if (!response.ok || !body.success) {
    fail(`Cloudflare HTTP ${response.status}: ${JSON.stringify(body.errors ?? body).slice(0, 300)}`);
  }
  const vectors = body.result?.data;
  if (vectors?.length !== texts.length) fail('Cloudflare returned the wrong number of embeddings');
  if (vectors[0].length !== DIMENSIONS) fail(`Expected ${DIMENSIONS} dims, got ${vectors[0].length}`);
  return vectors.map(normalise);
}

// --- Upstash -------------------------------------------------------------------------------

async function upstash(path, body) {
  const response = await fetch(`${process.env.UPSTASH_VECTOR_REST_URL.replace(/\/$/, '')}/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      authorization: `Bearer ${process.env.UPSTASH_VECTOR_REST_TOKEN}`,
      'content-type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    const error = new Error(`Upstash ${path} HTTP ${response.status}: ${text.slice(0, 300)}`);
    error.status = response.status;
    throw error;
  }
  return JSON.parse(text).result;
}

async function checkIndex() {
  const info = await upstash('info');
  if (info.dimension !== DIMENSIONS) {
    fail(`The Upstash index has ${info.dimension} dimensions; it needs ${DIMENSIONS} (COSINE, no embedding model).`);
  }
  if (info.similarityFunction !== 'COSINE') fail(`The Upstash index uses ${info.similarityFunction}; it must be COSINE.`);
  const count = info.namespaces?.[NAMESPACE]?.vectorCount ?? 0;
  log(`Upstash index OK: ${info.dimension} dims, COSINE, ${count} vectors in "${NAMESPACE}"`);
}

// --- main ----------------------------------------------------------------------------------

await mkdir(CACHE_DIR, { recursive: true });
const records = await loadAyahs();
const chars = records.reduce((sum, r) => sum + r.embedText.length, 0);
log(`${records.length} ayahs, ~${Math.round(chars / 1000)}k characters to embed`);

if (dryRun) {
  const sample = records.find((r) => r.id === '2:255');
  log(`Sample: ${sample.id} ${JSON.stringify(sample.metadata)} data=${sample.data.length} chars`);
  log(`Embed text starts: ${sample.embedText.slice(0, 120)}…`);
  log('Dry run: nothing sent.');
  process.exit(0);
}

for (const name of SECRET_NAMES) {
  if (!process.env[name]) fail(`${name} is not set (environment or .env.local).`);
}

await checkIndex();
let progress = await loadProgress();
if (reset) {
  await upstash(`reset/${NAMESPACE}`, {});
  progress = { done: [] };
  await saveProgress(progress);
  log(`Cleared the "${NAMESPACE}" namespace.`);
}

const done = new Set(progress.done);
const pending = records.filter((r) => !done.has(r.id));
log(`${done.size} already imported, ${pending.length} to go.`);

for (let i = 0; i < pending.length; i += BATCH) {
  const batch = pending.slice(i, i + BATCH);
  const vectors = await embed(batch.map((r) => r.embedText));
  try {
    await upstash(
      `upsert/${NAMESPACE}`,
      batch.map((r, k) => ({ id: r.id, vector: vectors[k], metadata: r.metadata, data: r.data })),
    );
  } catch (error) {
    // Upstash answers 403 "Exceeded daily write limit" (or 429) once the free 10K/day is used
    if (error.status === 429 || /daily write limit/i.test(error.message)) fail("Upstash's daily update limit is used up. Progress is saved; run again tomorrow.");
    throw error;
  }
  progress.done.push(...batch.map((r) => r.id));
  await saveProgress(progress);
  const total = done.size + i + batch.length;
  if (total % 500 < BATCH || i + BATCH >= pending.length) log(`  ${total}/${records.length} (${batch.at(-1).id})`);
}

log(`✓ Done: ${records.length} ayahs in "${NAMESPACE}".`);
