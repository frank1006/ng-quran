/**
 * Zakat for QuranFlow AI: the rules (a fixed copy of UmmahAPI's zakat info,
 * scripts/fetch-ummahapi.mjs) and an estimate worked out here, never by the model. Today's
 * gold and silver prices for the nisab come live from UmmahAPI's nisab endpoint, in the
 * person's currency.
 */
import { ZAKAT_INFO } from './zakat-data';

export interface ZakatInfo {
  definition: string;
  nisab: { gold: { grams: number; description: string }; silver: { grams: number; description: string }; note: string };
  rate: Record<string, string>;
  conditions: string[];
  eligible_recipients: string[];
  zakatable_assets: string[];
  non_zakatable_assets: string[];
  hawl: string;
  disclaimer: string;
  source: string;
}

const RATE = 0.025;
/** South Asian tola */
const TOLA_GRAMS = 11.6638;
const NISAB_URL = 'https://ummahapi.com/api/zakat/nisab';
const PRICE_CACHE_MS = 6 * 60 * 60 * 1000;
const prices = new Map<string, { at: number; gold: number; silver: number; asOf: string }>();

/** Country (as the app's city lookup names it) → currency, for when the person doesn't say */
const COUNTRY_CURRENCY: Record<string, string> = {
  'united states': 'USD', usa: 'USD', canada: 'CAD', 'united kingdom': 'GBP', uk: 'GBP', pakistan: 'PKR', india: 'INR',
  bangladesh: 'BDT', 'united arab emirates': 'AED', 'saudi arabia': 'SAR', qatar: 'QAR', kuwait: 'KWD', malaysia: 'MYR',
  indonesia: 'IDR', turkey: 'TRY', türkiye: 'TRY', egypt: 'EGP', nigeria: 'NGN', 'south africa': 'ZAR', australia: 'AUD',
  'new zealand': 'NZD', germany: 'EUR', france: 'EUR', netherlands: 'EUR', belgium: 'EUR', ireland: 'EUR', italy: 'EUR',
  spain: 'EUR', austria: 'EUR',
};

export function zakatInfoText(): string {
  const i = ZAKAT_INFO;
  return JSON.stringify({
    definition: i.definition,
    nisab: `${i.nisab.gold.grams} g of gold or ${i.nisab.silver.grams} g of silver. ${i.nisab.note}`,
    rate: i.rate,
    conditions: i.conditions,
    recipients: i.eligible_recipients,
    zakatable: i.zakatable_assets,
    notZakatable: i.non_zakatable_assets,
    hawl: i.hawl,
    disclaimer: i.disclaimer,
    source: i.source,
  });
}

export interface ZakatInput {
  currency?: string;
  cash?: number;
  gold_grams?: number;
  gold_karat?: number;
  gold_tola?: number;
  silver_grams?: number;
  silver_tola?: number;
  investments?: number;
  business_goods?: number;
  money_owed_to_you?: number;
  debts_due?: number;
}

/** The estimate, as text for the model (it reports the numbers; it doesn't do the math) */
export async function calculateZakat(raw: ZakatInput, country?: string): Promise<string> {
  const amount = (v: unknown) => (typeof v === 'number' && isFinite(v) && v > 0 ? v : 0);
  const currency = /^[A-Za-z]{3}$/.test(raw.currency ?? '')
    ? raw.currency!.toUpperCase()
    : COUNTRY_CURRENCY[(country ?? '').toLowerCase()] ?? 'USD';
  const karat = Math.min(24, Math.max(1, Number(raw.gold_karat) || 24));

  const market = await nisabPrices(currency);
  if (!market) return `Today's gold and silver prices are unavailable, so the nisab can't be checked. Say to try again shortly.`;

  const goldGrams = amount(raw.gold_grams) + amount(raw.gold_tola) * TOLA_GRAMS;
  const silverGrams = amount(raw.silver_grams) + amount(raw.silver_tola) * TOLA_GRAMS;
  const pureGold = goldGrams * (karat / 24);
  const assets = {
    cash: amount(raw.cash),
    gold: pureGold * market.gold,
    silver: silverGrams * market.silver,
    investments: amount(raw.investments),
    businessGoods: amount(raw.business_goods),
    moneyOwedToYou: amount(raw.money_owed_to_you),
  };
  const total = Object.values(assets).reduce((a, b) => a + b, 0);
  const net = Math.max(0, total - amount(raw.debts_due));
  const nisabGold = ZAKAT_INFO.nisab.gold.grams * market.gold;
  const nisabSilver = ZAKAT_INFO.nisab.silver.grams * market.silver;
  // "CAD 75.00", not "$75.00": the code avoids mixing up dollars
  const money = new Intl.NumberFormat('en', { style: 'currency', currency, currencyDisplay: 'code', maximumFractionDigits: 2 });
  const due = (nisab: number) => (net >= nisab ? money.format(net * RATE) : 'none (below nisab)');

  return JSON.stringify({
    currency,
    assets: Object.fromEntries(Object.entries(assets).filter(([, v]) => v > 0).map(([k, v]) => [k, money.format(v)])),
    goldUsed: pureGold ? `${round(pureGold)} g pure gold (${karat}k) at ${money.format(market.gold)}/g` : undefined,
    silverUsed: silverGrams ? `${round(silverGrams)} g at ${money.format(market.silver)}/g` : undefined,
    debtsDeducted: amount(raw.debts_due) ? money.format(amount(raw.debts_due)) : undefined,
    zakatableWealth: money.format(net),
    nisab: { silver: money.format(nisabSilver), gold: money.format(nisabGold) },
    zakatDue: { bySilverNisab: due(nisabSilver), byGoldNisab: due(nisabGold) },
    rate: '2.5% of zakatable wealth',
    pricesAsOf: market.asOf,
    remember: [
      'Zakat is due only on wealth held for a full lunar year (hawl).',
      'Scholars differ on using the silver or gold nisab and on jewellery worn regularly; for your situation ask a scholar.',
    ],
  });
}

async function nisabPrices(currency: string): Promise<{ gold: number; silver: number; asOf: string } | null> {
  const cached = prices.get(currency);
  if (cached && Date.now() - cached.at < PRICE_CACHE_MS) return cached;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(`${NISAB_URL}?currency=${currency}`, { signal: controller.signal });
    const body: any = await response.json();
    const gold = body?.data?.gold?.price_per_gram;
    const silver = body?.data?.silver?.price_per_gram;
    if (!response.ok || typeof gold !== 'number' || typeof silver !== 'number' || body.data.currency !== currency) return null;
    const entry = { at: Date.now(), gold, silver, asOf: String(body.data.prices_used?.as_of ?? '').slice(0, 10) };
    prices.set(currency, entry);
    return entry;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
