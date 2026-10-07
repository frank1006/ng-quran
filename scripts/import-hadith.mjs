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
 *   node scripts/import-hadith.mjs --book bukhari --limit 2000  # stop after 2,000 this run
 *   node scripts/import-hadith.mjs --book bukhari --reset     # delete only this book's vectors first
 *
 * Live QFlow searches share Cloudflare's free 10K neurons/day with this import, so use --limit
 * to leave room for them (run again the next day to continue).
 *
 * Keys come from the environment or .env.local and are never printed (see redact()):
 *   UPSTASH_VECTOR_REST_URL, UPSTASH_VECTOR_REST_TOKEN, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN
 *
 * Text comes from the datasets-server rows API and is cached in .cache/hadith/: the book's Arabic
 * (public domain) and HadeethEnc.com's translations (open, with attribution), matched to the
 * book's hadith by their Arabic (matchHadeethEnc). The book's own translations (e.g. Muhsin Khan's
 * English) are copyrighted and are never downloaded, stored or embedded. The dataset is pinned to
 * DATASET_SHA: if it has changed, the script stops so the new version can be checked first.
 *
 * Each vector:
 *   id        "bukhari:1" (the dataset's hadith_key)
 *   metadata  { book, number, bookNumber, graded, grade, translated }
 *   data      JSON { ar, grades: [{ grader, grade }], he?: { id, en?, ur? } }, where en/ur are
 *             HadeethEnc's { text, grade, attribution } in that language
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_DIR = join(ROOT, '.cache', 'hadith');

const DATASET = 'quranlab/hadith';
const DATASET_SHA = 'cc6972dae1f46f5f5e2b65e877d24c4539bc4391';
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
// Characters that go into the embedding (the full text is kept in data): HadeethEnc's English
// when there is one, and the Arabic, whose chain of narrators comes first, so it gets more room.
// EmbeddingGemma reads at most 2,048 tokens.
const EMBED_CHARS = { en: 1500, ar: 1500 };
// Upstash allows up to 1MB of data per vector (metadata: 48KB); the longest Bukhari hadith
// (2731, the treaty of Hudaybiyyah) is ~28KB in Arabic
const MAX_DATA_BYTES = 900_000;

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
const limit = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity;
if (!(limit > 0)) {
  console.error('--limit needs a positive number');
  process.exit(1);
}
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

/** All rows of one config ("bukhari-ar", "hadeethenc-en"), cached after the first download. */
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
      rows.push({
        key: row.hadith_key,
        number: row.hadith_number,
        bookNumber: row.book_number,
        text: row.text,
        grades: row.grades ?? [],
        // HadeethEnc only
        grade: row.grade,
        attribution: row.attribution_text,
      });
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

// --- matching HadeethEnc to the collection -------------------------------------------------

/**
 * Arabic reduced to comparable words: no diacritics, one form of alef/ya/ta marbuta, and without
 * the blessings (ﷺ, رضي الله عنه…) that HadeethEnc and the collections write differently.
 */
function matchWords(text) {
  return plainArabic(text)
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^ء-ي\s]/g, ' ')
    .replace(/صلي الله عليه وسلم|رضي الله عن(?:ه|ها|هما|هم)|عليه السلام/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

const SHINGLE = 2;
const shingles = (words) => {
  const out = new Set();
  for (let i = 0; i + SHINGLE <= words.length; i++) out.add(words.slice(i, i + SHINGLE).join(' '));
  return out;
};

/**
 * At least this share of a HadeethEnc hadith's 2-word runs must appear in the collection's text.
 * Checked by hand on Bukhari: from ~0.5 up it's the same narration in nearly the same words;
 * 0.3-0.5 is mostly the same hadith in another version, whose translation wouldn't fit this Arabic.
 */
const MATCH_MIN = 0.6;
/** HadeethEnc opens with its own short chain ("عن ابن عباس رضي الله عنهما قال:"); compare what follows */
const heBody = (text) => {
  const colon = text.indexOf(':');
  return colon > 0 && colon < 90 ? text.slice(colon + 1) : text;
};
/** HadeethEnc says which collections narrate it; only these can be in this book */
const NARRATED_BY = {
  bukhari: /البخاري|متفق عليه/,
  muslim: /مسلم|متفق عليه/,
  abudawud: /أبو داود|ابو داود/,
  tirmidhi: /الترمذي/,
  nasai: /النسائي/,
  ibnmajah: /ابن ماجه/,
};

/**
 * HadeethEnc translations for this book, by hadith key. HadeethEnc gives no hadith numbers, so its
 * Arabic is compared with each hadith's: what the HadeethEnc text says (after its opening chain)
 * must appear almost word for word in the collection's (which adds the full chain of narrators).
 * A hadith the book repeats under several numbers gets the translation on each.
 */
function matchHadeethEnc(bookRows, he) {
  const index = new Map(); // shingle → row indexes
  bookRows.forEach((row, i) => {
    for (const s of shingles(matchWords(row.text ?? ''))) {
      let list = index.get(s);
      if (!list) index.set(s, (list = []));
      list.push(i);
    }
  });
  const best = new Map(); // key → { id, score }
  const stats = { candidates: 0, matched: 0 };
  for (const a of he.ar) {
    if (!NARRATED_BY[book].test(a.attribution ?? '')) continue;
    const own = shingles(matchWords(heBody(a.text ?? '')));
    if (own.size < 4) continue;
    stats.candidates++;
    const hits = new Map();
    for (const s of own) for (const i of index.get(s) ?? []) hits.set(i, (hits.get(i) ?? 0) + 1);
    let matchedAny = false;
    for (const [i, count] of hits) {
      const score = count / own.size;
      if (score < MATCH_MIN) continue;
      matchedAny = true;
      const key = bookRows[i].key;
      if (!best.has(key) || best.get(key).score < score) best.set(key, { id: a.key, score });
    }
    if (matchedAny) stats.matched++;
  }
  const enById = new Map(he.en.map((r) => [r.key, r]));
  const urById = new Map(he.ur.map((r) => [r.key, r]));
  // Each language as HadeethEnc gives it: its translation, grade and attribution
  const inLanguage = (row) => {
    const text = clean(row?.text);
    return text ? { text, grade: clean(row.grade) || undefined, attribution: clean(row.attribution) || undefined } : undefined;
  };
  const byKey = new Map();
  for (const [key, { id, score }] of best) {
    const en = inLanguage(enById.get(id));
    const ur = inLanguage(urById.get(id));
    if (!en && !ur) continue;
    byKey.set(key, { id: id.replace(/^hadeethenc:/, ''), ...(en ? { en } : {}), ...(ur ? { ur } : {}), score: Math.round(score * 100) / 100 });
  }
  return { byKey, stats };
}

async function loadHadiths() {
  // One at a time: parallel downloads trip the datasets-server rate limit. Only the Arabic of the
  // book: its translations are copyrighted and are never downloaded, stored or embedded
  const ar = await loadConfig(`${book}-ar`);
  const he = { ar: await loadConfig('hadeethenc-ar'), en: await loadConfig('hadeethenc-en'), ur: await loadConfig('hadeethenc-ur') };
  const { byKey: translations, stats: matchStats } = matchHadeethEnc(ar, he);
  await writeFile(join(CACHE_DIR, `${book}-hadeethenc-matches.json`), JSON.stringify(Object.fromEntries(translations), null, 1));

  const seen = new Set();
  const records = [];
  const stats = { noText: 0, duplicates: 0, translated: 0, maxDataBytes: 0, ...matchStats };
  for (const a of ar) {
    if (seen.has(a.key)) { stats.duplicates++; continue; }
    seen.add(a.key);
    const arText = clean(a.text);
    if (!arText) { stats.noText++; continue; }
    const grades = a.grades ?? [];
    const translation = translations.get(a.key);
    if (translation) stats.translated++;
    const { score, ...heData } = translation ?? {};
    const data = JSON.stringify({ ar: arText, grades, ...(translation ? { he: heData } : {}) });
    const bytes = Buffer.byteLength(data);
    stats.maxDataBytes = Math.max(stats.maxDataBytes, bytes);
    if (bytes > MAX_DATA_BYTES) fail(`${a.key} is ${bytes} bytes, over the ${MAX_DATA_BYTES} limit`);
    records.push({
      id: a.key,
      embedText: docText(
        `${BOOKS[book]} ${a.number}`,
        [translation?.en && cut(translation.en.text, EMBED_CHARS.en), cut(plainArabic(arText), EMBED_CHARS.ar)].filter(Boolean).join('\n'),
      ),
      metadata: {
        book,
        number: a.number,
        bookNumber: a.bookNumber,
        graded: grades.length > 0,
        grade: gradeSummary(grades),
        translated: !!translation,
      },
      data,
    });
  }
  return { records, stats, counts: { ar: ar.length, heAr: he.ar.length, heEn: he.en.length, heUr: he.ur.length } };
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
log(`Rows: ${book} ar ${counts.ar}; HadeethEnc ar ${counts.heAr}, en ${counts.heEn}, ur ${counts.heUr}`);
log(`${records.length} hadiths to import, ~${Math.round(chars / 1000)}k characters to embed`);
log(`HadeethEnc: ${stats.candidates} narrated by this book, ${stats.matched} matched; ${stats.translated} hadith get a translation`);
log(`No text (skipped): ${stats.noText}, duplicate keys: ${stats.duplicates}, largest data: ${Math.round(stats.maxDataBytes / 1000)}KB`);

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
const remaining = records.filter((r) => !done.has(r.id));
const pending = remaining.slice(0, limit);
log(`${done.size} already imported, ${remaining.length} to go${pending.length < remaining.length ? `, ${pending.length} this run (--limit)` : ''}.`);

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

if (pending.length < remaining.length) {
  log(`✓ Stopped at --limit: ${done.size + pending.length}/${records.length}. Run again to continue.`);
} else {
  log(`✓ Done: ${records.length} ${BOOKS[book]} hadiths in "${NAMESPACE}".`);
}
