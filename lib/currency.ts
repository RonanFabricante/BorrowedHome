/**
 * Property-country → charge currency for BorrowedHome.
 * Amounts in the DB are Stripe minor units (cents for most currencies;
 * whole units for zero-decimal currencies like JPY).
 */

export const DEFAULT_COUNTRY = "AU";
export const DEFAULT_CURRENCY = "aud";

/** ISO 3166-1 alpha-2 (upper) → ISO 4217 (lower) for Stripe. */
const COUNTRY_TO_CURRENCY: Record<string, string> = {
  AU: "aud",
  NZ: "nzd",
  US: "usd",
  CA: "cad",
  GB: "gbp",
  IE: "eur",
  FR: "eur",
  DE: "eur",
  ES: "eur",
  IT: "eur",
  NL: "eur",
  BE: "eur",
  AT: "eur",
  PT: "eur",
  FI: "eur",
  GR: "eur",
  LU: "eur",
  MT: "eur",
  CY: "eur",
  EE: "eur",
  LV: "eur",
  LT: "eur",
  SK: "eur",
  SI: "eur",
  HR: "eur",
  CH: "chf",
  SE: "sek",
  NO: "nok",
  DK: "dkk",
  SG: "sgd",
  HK: "hkd",
  JP: "jpy",
  KR: "krw",
  IN: "inr",
  MX: "mxn",
  BR: "brl",
  ZA: "zar",
  AE: "aed",
  MY: "myr",
  TH: "thb",
  PH: "php",
  ID: "idr",
  PL: "pln",
  CZ: "czk",
  HU: "huf",
  RO: "ron",
  IL: "ils",
  TR: "try",
  AR: "ars",
  CL: "clp",
  CO: "cop",
  PE: "pen",
};

/** Stripe zero-decimal currencies (amount is whole currency units). */
const ZERO_DECIMAL = new Set([
  "bif",
  "clp",
  "djf",
  "gnf",
  "jpy",
  "kmf",
  "krw",
  "mga",
  "pyg",
  "rwf",
  "ugx",
  "vnd",
  "vuv",
  "xaf",
  "xof",
  "xpf",
]);

/**
 * Stripe minimum charge amounts in minor units (or whole units for zero-decimal).
 * @see https://stripe.com/docs/currencies#minimum-and-maximum-charge-amounts
 */
const STRIPE_MIN_MINOR: Record<string, number> = {
  usd: 50,
  aud: 50,
  nzd: 50,
  cad: 50,
  eur: 50,
  gbp: 30,
  chf: 50,
  sek: 300,
  nok: 300,
  dkk: 250,
  sgd: 50,
  hkd: 400,
  jpy: 50,
  krw: 50,
  inr: 50,
  mxn: 1000,
  brl: 50,
  zar: 50,
  aed: 200,
  myr: 200,
  thb: 1000,
  php: 2000,
  idr: 10000,
  pln: 200,
  czk: 1500,
  huf: 17500,
  ron: 200,
  ils: 200,
  try: 50,
  ars: 50,
  clp: 50,
  cop: 50,
  pen: 50,
};

const LOCALE_BY_CURRENCY: Record<string, string> = {
  aud: "en-AU",
  nzd: "en-NZ",
  usd: "en-US",
  cad: "en-CA",
  gbp: "en-GB",
  eur: "en-IE",
  jpy: "ja-JP",
  sgd: "en-SG",
  hkd: "en-HK",
  inr: "en-IN",
};

export function normalizeCountryCode(country: string | null | undefined): string {
  if (!country) return DEFAULT_COUNTRY;
  const code = country.trim().toUpperCase();
  if (code.length === 2) return code;
  // Mapbox sometimes returns full names
  const byName: Record<string, string> = {
    AUSTRALIA: "AU",
    "UNITED STATES": "US",
    "UNITED STATES OF AMERICA": "US",
    "UNITED KINGDOM": "GB",
    "NEW ZEALAND": "NZ",
    CANADA: "CA",
    SINGAPORE: "SG",
    JAPAN: "JP",
    "SOUTH KOREA": "KR",
    "HONG KONG": "HK",
  };
  return byName[code] || DEFAULT_COUNTRY;
}

export function currencyForCountry(country: string | null | undefined): string {
  const code = normalizeCountryCode(country);
  return COUNTRY_TO_CURRENCY[code] || DEFAULT_CURRENCY;
}

export function normalizeCurrency(currency: string | null | undefined): string {
  if (!currency) return DEFAULT_CURRENCY;
  return currency.trim().toLowerCase();
}

export function isZeroDecimalCurrency(currency: string): boolean {
  return ZERO_DECIMAL.has(normalizeCurrency(currency));
}

/** Convert major units (form input) to Stripe/DB minor units. */
export function toMinorUnits(amountMajor: number, currency: string): number {
  const c = normalizeCurrency(currency);
  if (!Number.isFinite(amountMajor)) return 0;
  if (isZeroDecimalCurrency(c)) return Math.round(amountMajor);
  return Math.round(amountMajor * 100);
}

/** Convert Stripe/DB minor units to major units for forms. */
export function fromMinorUnits(amountMinor: number, currency: string): number {
  const c = normalizeCurrency(currency);
  if (!Number.isFinite(amountMinor)) return 0;
  if (isZeroDecimalCurrency(c)) return amountMinor;
  return amountMinor / 100;
}

export function stripeMinAmountMinor(currency: string): number {
  const c = normalizeCurrency(currency);
  return STRIPE_MIN_MINOR[c] ?? 50;
}

export function stripeMinAmountMajor(currency: string): number {
  return fromMinorUnits(stripeMinAmountMinor(currency), currency);
}

export function stripeMinAmountMessage(currency: string): string {
  const c = normalizeCurrency(currency);
  return `Amount must be at least ${formatCurrencyAmount(stripeMinAmountMinor(c), c)}`;
}

export function validateStripeAmountMinor(
  amountMinor: number,
  currency: string,
  options: { allowZero?: boolean } = {}
): string | null {
  const c = normalizeCurrency(currency);
  if (!Number.isFinite(amountMinor) || amountMinor < 0) {
    return stripeMinAmountMessage(c);
  }
  if (options.allowZero && amountMinor === 0) return null;
  if (amountMinor < stripeMinAmountMinor(c)) {
    return stripeMinAmountMessage(c);
  }
  return null;
}

export function validateStripeAmountMajor(
  amountMajor: number,
  currency: string,
  options: { allowZero?: boolean } = {}
): string | null {
  return validateStripeAmountMinor(
    toMinorUnits(amountMajor, currency),
    currency,
    options
  );
}

export function localeForCurrency(currency: string): string {
  const c = normalizeCurrency(currency);
  return LOCALE_BY_CURRENCY[c] || "en";
}

export function formatCurrencyAmount(
  amountMinor: number,
  currency: string = DEFAULT_CURRENCY
): string {
  const c = normalizeCurrency(currency);
  const major = fromMinorUnits(amountMinor, c);
  return new Intl.NumberFormat(localeForCurrency(c), {
    style: "currency",
    currency: c.toUpperCase(),
  }).format(major);
}

/** Currency code label for forms, e.g. "AUD". */
export function currencyLabel(currency: string): string {
  return normalizeCurrency(currency).toUpperCase();
}
