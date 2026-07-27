/**
 * Date helpers. Business dates are calendar dates in Europe/Amsterdam;
 * they are stored as DATE columns (UTC midnight Date objects via Prisma).
 */

export const BUSINESS_TIMEZONE = "Europe/Amsterdam";

const amsterdamFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today's calendar date in Europe/Amsterdam as "YYYY-MM-DD". */
export function todayAmsterdam(now: Date = new Date()): string {
  return amsterdamFmt.format(now);
}

/** Parse "YYYY-MM-DD" into a UTC-midnight Date (Prisma @db.Date convention). */
export function isoDateToUtc(iso: string): Date {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) throw new Error(`Invalid ISO date: ${iso}`);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${iso}`);
  return d;
}

/** Format a stored @db.Date (UTC midnight) back to "YYYY-MM-DD". */
export function utcToIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function formatDateNl(date: Date | string): string {
  const iso = typeof date === "string" ? date : utcToIsoDate(date);
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

export interface PeriodRange {
  year: number;
  periodNo: number;
  start: string; // ISO date, inclusive
  end: string; // ISO date, inclusive
  label: string;
}

/** Quarter/month/year period ranges for VAT. periodNo: 0=year, 1..4 or 1..12. */
export function vatPeriodRange(
  frequency: "MONTHLY" | "QUARTERLY" | "YEARLY",
  year: number,
  periodNo: number,
): PeriodRange {
  if (frequency === "YEARLY") {
    return { year, periodNo: 0, start: `${year}-01-01`, end: `${year}-12-31`, label: `${year}` };
  }
  if (frequency === "QUARTERLY") {
    if (periodNo < 1 || periodNo > 4) throw new Error("Quarter must be 1..4");
    const startMonth = (periodNo - 1) * 3 + 1;
    const endMonth = startMonth + 2;
    return {
      year,
      periodNo,
      start: `${year}-${String(startMonth).padStart(2, "0")}-01`,
      end: `${year}-${String(endMonth).padStart(2, "0")}-${daysInMonth(year, endMonth)}`,
      label: `Q${periodNo} ${year}`,
    };
  }
  if (periodNo < 1 || periodNo > 12) throw new Error("Month must be 1..12");
  return {
    year,
    periodNo,
    start: `${year}-${String(periodNo).padStart(2, "0")}-01`,
    end: `${year}-${String(periodNo).padStart(2, "0")}-${daysInMonth(year, periodNo)}`,
    label: `${year}-${String(periodNo).padStart(2, "0")}`,
  };
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The VAT period a given ISO date falls in. */
export function vatPeriodFor(
  frequency: "MONTHLY" | "QUARTERLY" | "YEARLY",
  isoDate: string,
): { year: number; periodNo: number } {
  const [y, m] = isoDate.split("-").map(Number);
  if (!y || !m) throw new Error(`Invalid date ${isoDate}`);
  if (frequency === "YEARLY") return { year: y, periodNo: 0 };
  if (frequency === "QUARTERLY") return { year: y, periodNo: Math.ceil(m / 3) };
  return { year: y, periodNo: m };
}
