/**
 * Straight-line depreciation schedules. Amounts in integer cents; monthly
 * charges are distributed so the total equals the depreciable base exactly
 * (the final month absorbs rounding).
 */

import { applyBp, assertCents } from "./money";

export interface DepreciationInput {
  purchasePriceExVatCents: number;
  residualValueCents: number;
  businessUseBp: number; // only the business share is depreciated as expense
  usefulLifeMonths: number;
  /** ISO date the asset went into use — schedule starts that month. */
  inUseDate: string;
}

export interface DepreciationCharge {
  year: number;
  month: number; // 1..12
  chargeCents: number;
}

export function depreciationSchedule(input: DepreciationInput): DepreciationCharge[] {
  assertCents(input.purchasePriceExVatCents, "purchase price");
  assertCents(input.residualValueCents, "residual value");
  if (input.usefulLifeMonths <= 0) throw new Error("Useful life must be positive");
  if (input.residualValueCents > input.purchasePriceExVatCents) {
    throw new Error("Residual value cannot exceed the purchase price");
  }
  const base = applyBp(input.purchasePriceExVatCents - input.residualValueCents, input.businessUseBp);
  const m = input.inUseDate.match(/^(\d{4})-(\d{2})-\d{2}$/);
  if (!m) throw new Error(`Invalid in-use date: ${input.inUseDate}`);
  let year = Number(m[1]);
  let month = Number(m[2]);

  const monthly = Math.floor(base / input.usefulLifeMonths);
  const schedule: DepreciationCharge[] = [];
  let charged = 0;
  for (let i = 0; i < input.usefulLifeMonths; i++) {
    const isLast = i === input.usefulLifeMonths - 1;
    const charge = isLast ? base - charged : monthly;
    schedule.push({ year, month, chargeCents: charge });
    charged += charge;
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return schedule;
}

/** Annual totals from a monthly schedule (for the asset register report). */
export function annualDepreciation(schedule: DepreciationCharge[]): Record<number, number> {
  const byYear: Record<number, number> = {};
  for (const c of schedule) byYear[c.year] = (byYear[c.year] ?? 0) + c.chargeCents;
  return byYear;
}
