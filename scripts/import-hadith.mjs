#!/usr/bin/env node
/**
 * Imports one hadith collection from the Hugging Face dataset quranlab/hadith into Upstash
 * Vector (namespace "hadith") for QFlow, embedded with the same model and prompts as the Quran
 * (scripts/import-quran.mjs), so one query embedding searches both. One book per run, so each
 * book fits in Upstash's free 10K writes/day and can be released on its own.
 *
 * Usage:
 *   node scripts/import-hadith.mjs --book bukhari --dry-run   # download + stats, no keys needed
 *   node scripts/import-hadith.mjs --book bukhari             # import (resumes if stopped)
 *   node scripts/import-hadith.mjs --book bukhari --reset     # delete only this book's vectors first
 *
 * Keys come from the environment or .env.local and are never printed (see redact()):
 *   UPSTASH_VECTOR_REST_URL, UPSTASH_VECTOR_REST_TOKEN, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN
 *
 * Text comes from the datasets-server rows API (Arabic is the spine; English and Urdu join on
 * hadith_number) and is cached in .cache/hadith/. The dataset is pinned to DATASET_SHA: if the
 * dataset has changed, the script stops so the new version can be checked before importing.
 *
 * Each vector:
 *   id        "bukhari:1" (the dataset's hadith_key)
 *   metadata  { book, number, bookNumber, graded, grade }
 *   data      JSON { ar, en, ur, grades: [{ grader, grade }], url }
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_DIR = join(ROOT, '.cache', 'hadith');

const DATASET = 'quranlab/hadith';
const DATASET_SHA = 'cc6972dae1f46f5f5e2b65e877d24c4539bc4391';
const LANGUAGES = ['ar', 'en', 'ur'];
const BOOKS = {
  bukhari: 'Sahih al-Bukhari',
  muslim: 'Sahih Muslim',
  abudawud: 'Sunan Abi Dawud',
  tirmidhi: "Jami' al-Tirmidhi",
  nasai: "Sunan an-Nasa'i",
  ibnmajah: 'Sunan Ibn Majah',
};

const MODEL = '@cf/google/embeddinggemma-300m';
const DIMENSIONS = 768;
const NAMESPACE = 'hadith';
// Same retrieval prompt as the Quran; QFlow queries use 'task: search result | query: '
const docText = (title, text) => `title: ${title} | text: ${text}`;
const BATCH = 25;
// Characters of each language that go into the embedding (the full text is kept in data).
// Long chains of narrators would otherwise crowd out the meaning, and EmbeddingGemma reads
// at most 2,048 tokens.
const EMBED_CHARS = { en: 1500, ar: 600, ur: 700 };
// Upstash's limit for metadata + data per vector is 48KB; stay well under it
const MAX_DATA_BYTES = 40_000;

const SECRET_NAMES = [
  'UPSTASH_VECTOR_REST_URL',
  'UPSTASH_VECTOR_REST_TOKEN',
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_API_TOKEN',
];

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const reset = args.includes('--reset');
const book = args[args.indexOf('--book') + 1];
if (!args.includes('--book') || !BOOKS[book]) {
  console.error(`Usage: node scripts/import-hadith.mjs --book <${Object.keys(BOOKS).join('|')}> [--dry-run] [--reset]`);
  process.exit(1);
}
const PROGRESS_FILE = join(CACHE_DIR, `${book}-progress.json`);

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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --- dataset -------------------------------------------------------------------------------

async function getJson(url, attempt = 1) {
  const response = await fetch(url);
  if (response.ok) return response.json();
  if (attempt > 6) fail(`${url} kept failing (HTTP ${response.status}). Downloaded configs are cached; run again.`);
  // The datasets-server rate-limits bursts (429); back off for longer each time
  await sleep(15_000 * attempt);
  return getJson(url, attempt + 1);
}

async function checkDatasetVersion() {
  const { sha } = await getJson(`https://huggingface.co/api/datasets/${DATASET}/revision/main`);
  if (sha !== DATASET_SHA) {
    fail(`${DATASET} has changed (now ${sha.slice(0, 7)}, pinned ${DATASET_SHA.slice(0, 7)}). Check the new version, then update DATASET_SHA.`);
  }
}

/** All rows of one config ("bukhari-en"), cached after the first download. */
async function loadConfig(config) {
  const file = join(CACHE_DIR, `${config}.json`);
  if (existsSync(file)) return JSON.parse(await readFile(file, 'utf8'));
  log(`  downloading ${config}…`);
  const rows = [];
  for (let offset = 0; ; offset += 100) {
    const page = await getJson(
      `https://datasets-server.huggingface.co/rows?dataset=${DATASET}&config=${config}&split=train&offset=${offset}&length=100`,
    );
    for (const { row, truncated_cells } of page.rows) {
      if (truncated_cells?.length) fail(`${config} ${row.hadith_key}: the API truncated ${truncated_cells.join(', ')}`);
      rows.push({ key: row.hadith_key, number: row.hadith_number, bookNumber: row.book_number, text: row.text, grades: row.grades ?? [], url: row.sunnah_url });
    }
    if (offset + 100 >= page.num_rows_total) break;
    await sleep(300);
  }
  await writeFile(file, JSON.stringify(rows));
  return rows;
}

const clean = (text) => (text ?? '').replace(/\s+/g, ' ').trim();
/** Arabic without tashkeel embeds better (same as the Quran's arabic2) */
const plainArabic = (text) => text.replace(/[ؐ-ًؚ-ٰٟۖ-ۭـ]/g, '');
const cut = (text, max) => (text.length <= max ? text : `${text.slice(0, max)}…`);

/** "Sahih (Al-Albani)" from the first grade, for metadata; all grades go in data */
const gradeSummary = (grades) => (grades.length ? `${grades[0].grade} (${grades[0].grader})` : null);

async function loadHadiths() {
  // One at a time: parallel downloads trip the datasets-server rate limit
  const rowsByLang = {};
  for (const lang of LANGUAGES) rowsByLang[lang] = await loadConfig(`${book}-${lang}`);
  const { ar, en, ur } = rowsByLang;
  const byKey = (rows) => new Map(rows.map((r) => [r.key, r]));
  const enByKey = byKey(en);
  const urByKey = byKey(ur);
  const seen = new Set();
  const records = [];
  const stats = { noText: 0, noEn: 0, noUr: 0, duplicates: 0, maxDataBytes: 0 };

  for (const a of ar) {
    if (seen.has(a.key)) { stats.duplicates++; continue; }
    seen.add(a.key);
    const arText = clean(a.text);
    const enText = clean(enByKey.get(a.key)?.text);
    const urText = clean(urByKey.get(a.key)?.text);
    if (!arText && !enText) { stats.noText++; continue; }
    if (!enText) stats.noEn++;
    if (!urText) stats.noUr++;
    // Grades sit on the translation rows too; take whichever has them
    const grades = [a, enByKey.get(a.key)].find((r) => r?.grades?.length)?.grades ?? [];
    const data = JSON.stringify({ ar: arText, en: enText, ur: urText, grades, url: a.url });
    const bytes = Buffer.byteLength(data);
    stats.maxDataBytes = Math.max(stats.maxDataBytes, bytes);
    if (bytes > MAX_DATA_BYTES) fail(`${a.key} is ${bytes} bytes, over the ${MAX_DATA_BYTES} limit`);
    records.push({
      id: a.key,
      embedText: docText(
        `${BOOKS[book]} ${a.number}`,
        [cut(enText, EMBED_CHARS.en), cut(plainArabic(arText), EMBED_CHARS.ar), cut(urText, EMBED_CHARS.ur)].filter(Boolean).join('\n'),
      ),
      metadata: {
        book,
        number: a.number,
        bookNumber: a.bookNumber,
        graded: grades.length > 0,
        grade: gradeSummary(grades),
      },
      data,
    });
  }
  return { records, stats, counts: { ar: ar.length, en: en.length, ur: ur.length } };
}

// --- progress ------------------------------------------------------------------------------

async function loadProgress() {
  if (!existsSync(PROGRESS_FILE)) return { done: [] };
  return JSON.parse(await readFile(PROGRESS_FILE, 'utf8'));
}

const saveProgress = (progress) => writeFile(PROGRESS_FILE, JSON.stringify(progress));

// --- Cloudflare ----------------------------------------------------------------------------

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
  const counts = Object.entries(info.namespaces ?? {}).map(([ns, n]) => `"${ns || '(default)'}" ${n.vectorCount}`);
  log(`Upstash index OK: ${info.dimension} dims, COSINE; vectors: ${counts.join(', ') || 'none'}`);
}

// --- main ----------------------------------------------------------------------------------

await mkdir(CACHE_DIR, { recursive: true });
await checkDatasetVersion();
log(`${BOOKS[book]} from ${DATASET}@${DATASET_SHA.slice(0, 7)}`);
const { records, stats, counts } = await loadHadiths();
const chars = records.reduce((sum, r) => sum + r.embedText.length, 0);
log(`Rows: ar ${counts.ar}, en ${counts.en}, ur ${counts.ur}`);
log(`${records.length} hadiths to import, ~${Math.round(chars / 1000)}k characters to embed`);
log(`No English: ${stats.noEn}, no Urdu: ${stats.noUr}, no text (skipped): ${stats.noText}, duplicate keys: ${stats.duplicates}, largest data: ${Math.round(stats.maxDataBytes / 1000)}KB`);

if (dryRun) {
  const sample = records.find((r) => r.id === `${book}:1`) ?? records[0];
  log(`Sample: ${sample.id} ${JSON.stringify(sample.metadata)} data=${sample.data.length} chars`);
  log(`Embed text starts: ${sample.embedText.slice(0, 160)}…`);
  log('Dry run: nothing sent.');
  process.exit(0);
}

for (const name of SECRET_NAMES) {
  if (!process.env[name]) fail(`${name} is not set (environment or .env.local).`);
}

await checkIndex();
let progress = await loadProgress();
if (reset) {
  // Only this book's ids; never reset the namespace (other books) or the index (the Quran)
  await upstash(`delete/${NAMESPACE}`, { prefix: `${book}:` });
  progress = { done: [] };
  await saveProgress(progress);
  log(`Deleted ${book}:* from "${NAMESPACE}".`);
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

log(`✓ Done: ${records.length} ${BOOKS[book]} hadiths in "${NAMESPACE}".`);
