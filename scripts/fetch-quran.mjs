#!/usr/bin/env node
/**
 * Downloads the Quran text from quranapi.pages.dev (MIT, The-Quran-Project/Quran-API)
 * into public/data/quran/ so the app serves it from its own origin.
 *
 * Usage: node scripts/fetch-quran.mjs
 * Output: surah.json, reciters.json and 1.json … 114.json (same format as the API)
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE = 'https://quranapi.pages.dev/api/';
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data', 'quran');
const CONCURRENCY = 6;

async function fetchJson(name, attempt = 1) {
  const response = await fetch(`${SOURCE}${name}`);
  if (!response.ok) {
    if (attempt < 3) return fetchJson(name, attempt + 1);
    throw new Error(`${name}: HTTP ${response.status}`);
  }
  return response.json();
}

async function save(name, data) {
  // Minified to keep the deploy small; content is unchanged
  await writeFile(join(OUT_DIR, name), JSON.stringify(data));
}

await mkdir(OUT_DIR, { recursive: true });

const surahs = await fetchJson('surah.json');
if (!Array.isArray(surahs) || surahs.length !== 114) {
  throw new Error(`Expected 114 surahs, got ${surahs?.length}`);
}
await save('surah.json', surahs);
await save('reciters.json', await fetchJson('reciters.json'));

const ids = Array.from({ length: 114 }, (_, i) => i + 1);
for (let i = 0; i < ids.length; i += CONCURRENCY) {
  await Promise.all(
    ids.slice(i, i + CONCURRENCY).map(async id => {
      const surah = await fetchJson(`${id}.json`);
      if (surah.totalAyah !== surahs[id - 1].totalAyah || surah.arabic1?.length !== surah.totalAyah) {
        throw new Error(`Surah ${id}: verse count mismatch`);
      }
      await save(`${id}.json`, surah);
    })
  );
  process.stdout.write(`\r${Math.min(i + CONCURRENCY, 114)}/114 surahs`);
}
console.log(`\nSaved to ${OUT_DIR}`);
