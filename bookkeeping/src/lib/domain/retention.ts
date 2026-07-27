/**
 * Record-retention helpers. Dutch default bookkeeping retention: 7 years
 * (fiscale bewaarplicht), counted from the end of the financial year the
 * record belongs to. Nothing is ever deleted automatically — the app only
 * computes the earliest date deletion may be *considered* and requires an
 * explicit, audited confirmation flow (see docs/DUTCH_BOOKKEEPING_ASSUMPTIONS.md).
 */

export const DEFAULT_RETENTION_YEARS = 7;

/** Categories with commonly longer retention (e.g. immovable property: 10y). */
export const EXTENDED_RETENTION: Record<string, number> = {
  REAL_ESTATE: 10,
};

export function retentionEligibleDate(
  recordIsoDate: string,
  retentionYears: number = DEFAULT_RETENTION_YEARS,
): string {
  const m = recordIsoDate.match(/^(\d{4})-\d{2}-\d{2}$/);
  if (!m) throw new Error(`Invalid date: ${recordIsoDate}`);
  // Counted from the end of the financial year the record belongs to.
  const yearEnd = Number(m[1]);
  return `${yearEnd + retentionYears + 1}-01-01`;
}

export function isRetentionEligible(recordIsoDate: string, todayIso: string, years?: number): boolean {
  return todayIso >= retentionEligibleDate(recordIsoDate, years);
}
