/**
 * Money utilities. All amounts are integer cents (EUR unless stated).
 * No floating-point arithmetic is ever used for money: parsing goes through
 * string decomposition and multiplication/division use bigint with explicit
 * half-up rounding.
 */

export class MoneyError extends Error {}

/** Maximum supported absolute amount: 1 billion euros in cents. */
export const MAX_CENTS = 100_000_000_000;

export function assertCents(value: number, label = "amount"): number {
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`${label} must be an integer number of cents, got ${value}`);
  }
  if (Math.abs(value) > MAX_CENTS) {
    throw new MoneyError(`${label} exceeds the supported maximum`);
  }
  return value;
}

/**
 * Parse a user-entered decimal string ("12,34", "12.34", "1.234,56",
 * "-0.5") into integer cents. Accepts comma or dot as decimal separator and
 * thin/dot/comma thousand separators. Throws on ambiguous or invalid input.
 */
export function parseAmountToCents(input: string): number {
  const raw = input.trim().replace(/ |\s/g, "");
  if (raw === "") throw new MoneyError("Amount is required");
  const m = raw.match(/^([+-]?)([\d.,]+)$/);
  if (!m) throw new MoneyError(`Not a valid amount: "${input}"`);
  const sign = m[1] === "-" ? -1 : 1;
  const body = m[2]!;

  const lastComma = body.lastIndexOf(",");
  const lastDot = body.lastIndexOf(".");
  let decimalSep: string | null = null;
  if (lastComma >= 0 && lastDot >= 0) {
    decimalSep = lastComma > lastDot ? "," : ".";
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? "," : ".";
    const idx = Math.max(lastComma, lastDot);
    const digitsAfter = body.length - idx - 1;
    const occurrences = body.split(sep).length - 1;
    // "1.234" with 3 digits after a single separator is a thousands group;
    // anything else ("1.2", "1.23", "1,5") is a decimal separator.
    decimalSep = occurrences === 1 && digitsAfter !== 3 ? sep : null;
    if (occurrences > 1) decimalSep = null; // repeated => thousands separators
  }

  let intPart: string;
  let fracPart = "";
  if (decimalSep) {
    const idx = body.lastIndexOf(decimalSep);
    intPart = body.slice(0, idx);
    fracPart = body.slice(idx + 1);
  } else {
    intPart = body;
  }
  // Any separators left in the integer part must be consistent thousands
  // grouping (1-3 leading digits, then groups of exactly 3).
  if (/[.,]/.test(intPart)) {
    const sep = intPart.includes(".") ? "." : ",";
    if (intPart.includes(sep === "." ? "," : ".")) {
      throw new MoneyError(`Not a valid amount: "${input}"`);
    }
    const groupPattern = new RegExp(`^\\d{1,3}(\\${sep}\\d{3})+$`);
    if (!groupPattern.test(intPart)) {
      throw new MoneyError(`Not a valid amount: "${input}"`);
    }
  }
  intPart = intPart.replace(/[.,]/g, "");
  if (!/^\d*$/.test(intPart) || !/^\d*$/.test(fracPart)) {
    throw new MoneyError(`Not a valid amount: "${input}"`);
  }
  if (fracPart.length > 2) {
    throw new MoneyError(`Amounts support at most 2 decimal places: "${input}"`);
  }
  const cents = Number(intPart || "0") * 100 + Number(fracPart.padEnd(2, "0") || "0");
  return assertCents(sign * cents);
}

/** Format integer cents as a plain decimal string, e.g. -1234 -> "-12.34". */
export function centsToDecimalString(cents: number): string {
  assertCents(cents);
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const euros = Math.floor(abs / 100);
  const rest = abs % 100;
  return `${sign}${euros}.${rest.toString().padStart(2, "0")}`;
}

/** Format cents for display, e.g. "€ 1.234,56" (nl-NL grouping, EUR default). */
export function formatCents(cents: number, currency = "EUR"): string {
  assertCents(cents);
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const euros = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const rest = (abs % 100).toString().padStart(2, "0");
  const symbol = currency === "EUR" ? "€ " : `${currency} `;
  return `${sign}${symbol}${euros},${rest}`;
}

export type Rounding = "HALF_UP";

/**
 * Multiply cents by a rational factor (numerator/denominator) with half-up
 * rounding on the absolute value, using bigint internally.
 * Used for VAT (rate permille / 1000) and percentage allocation (bp / 10000).
 */
export function mulDiv(cents: number, numerator: number, denominator: number): number {
  assertCents(cents);
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator <= 0) {
    throw new MoneyError("Invalid rational factor");
  }
  const neg = cents < 0 !== numerator < 0;
  const n = BigInt(Math.abs(cents)) * BigInt(Math.abs(numerator));
  const d = BigInt(denominator);
  const q = n / d;
  const r = n % d;
  const rounded = r * 2n >= d ? q + 1n : q;
  const result = Number(rounded) * (neg ? -1 : 1);
  return assertCents(result);
}

/** VAT amount from a net amount and a rate in permille (210 = 21%). */
export function vatFromNet(netCents: number, ratePermille: number): number {
  return mulDiv(netCents, ratePermille, 1000);
}

/** Net amount from a gross (VAT-inclusive) amount and a rate in permille. */
export function netFromGross(grossCents: number, ratePermille: number): number {
  return mulDiv(grossCents, 1000, 1000 + ratePermille);
}

/** Apply a basis-point allocation (10000 = 100%) with half-up rounding. */
export function applyBp(cents: number, bp: number): number {
  if (!Number.isSafeInteger(bp) || bp < 0 || bp > 10000) {
    throw new MoneyError(`Basis points must be 0..10000, got ${bp}`);
  }
  return mulDiv(cents, bp, 10000);
}

/**
 * Convert an original-currency amount to EUR cents using an exact decimal
 * exchange rate given as a string (e.g. "1.0834" EUR per unit). The rate is
 * parsed into an integer scaled value — no floats.
 */
export function convertToEur(originalCents: number, rateEurPerUnit: string): number {
  const m = rateEurPerUnit.trim().match(/^([+]?)(\d+)(?:\.(\d+))?$/);
  if (!m) throw new MoneyError(`Invalid exchange rate: "${rateEurPerUnit}"`);
  const frac = m[3] ?? "";
  if (frac.length > 10) throw new MoneyError("Exchange rate supports at most 10 decimals");
  const scale = 10 ** frac.length;
  const scaled = Number(m[2]!) * scale + Number(frac || "0");
  if (!Number.isSafeInteger(scaled)) throw new MoneyError("Exchange rate out of range");
  if (scaled <= 0) throw new MoneyError("Exchange rate must be positive");
  return mulDiv(originalCents, scaled, scale);
}

/** Sum with overflow check. */
export function sumCents(values: Iterable<number>): number {
  let total = 0;
  for (const v of values) {
    assertCents(v);
    total += v;
    assertCents(total, "total");
  }
  return total;
}
