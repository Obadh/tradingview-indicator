/**
 * Versioned VAT domain rules for Dutch bookkeeping assistance.
 *
 * Rates and return-box mappings live in the VATCode table (seeded from
 * DEFAULT_VAT_CODES below, versioned via rulesVersion/validFrom). This module
 * contains the calculation rules that interpret those codes when preparing a
 * VAT period summary. All outputs are estimates for preparation only.
 */

import { vatFromNet, sumCents } from "./money";

export const VAT_RULES_VERSION = 1;

export type VatTreatment =
  | "DOMESTIC_HIGH"
  | "DOMESTIC_LOW"
  | "DOMESTIC_ZERO"
  | "EXEMPT"
  | "OUTSIDE_SCOPE"
  | "REVERSE_CHARGE_SALE"
  | "REVERSE_CHARGE_PURCHASE"
  | "EU_ACQUISITION"
  | "EU_SERVICE"
  | "IMPORT"
  | "FOREIGN_VAT"
  | "UNKNOWN";

export interface VatCodeSeed {
  code: string;
  name: string;
  treatment: VatTreatment;
  ratePermille: number;
  returnBox: string | null;
  inputReturnBox: string | null;
  validFrom: string; // ISO date
}

/** Seeded VAT codes (rules version 1, valid from 2019 rate change). */
export const DEFAULT_VAT_CODES: VatCodeSeed[] = [
  { code: "NL-HIGH", name: "NL 21% (high rate)", treatment: "DOMESTIC_HIGH", ratePermille: 210, returnBox: "1a", inputReturnBox: "5b", validFrom: "2019-01-01" },
  { code: "NL-LOW", name: "NL 9% (low rate)", treatment: "DOMESTIC_LOW", ratePermille: 90, returnBox: "1b", inputReturnBox: "5b", validFrom: "2019-01-01" },
  { code: "NL-ZERO", name: "NL 0% (zero rate / export)", treatment: "DOMESTIC_ZERO", ratePermille: 0, returnBox: "1e", inputReturnBox: null, validFrom: "2019-01-01" },
  { code: "EXEMPT", name: "Exempt (vrijgesteld)", treatment: "EXEMPT", ratePermille: 0, returnBox: null, inputReturnBox: null, validFrom: "2019-01-01" },
  { code: "OUT-SCOPE", name: "Outside scope of VAT", treatment: "OUTSIDE_SCOPE", ratePermille: 0, returnBox: null, inputReturnBox: null, validFrom: "2019-01-01" },
  { code: "RC-SALE-EU", name: "Reverse-charged sale (EU B2B service)", treatment: "REVERSE_CHARGE_SALE", ratePermille: 0, returnBox: "3b", inputReturnBox: null, validFrom: "2019-01-01" },
  { code: "RC-PURCHASE", name: "Reverse-charged purchase (btw verlegd)", treatment: "REVERSE_CHARGE_PURCHASE", ratePermille: 210, returnBox: "2a", inputReturnBox: "5b", validFrom: "2019-01-01" },
  { code: "EU-ACQ", name: "EU acquisition of goods", treatment: "EU_ACQUISITION", ratePermille: 210, returnBox: "4b", inputReturnBox: "5b", validFrom: "2019-01-01" },
  { code: "EU-SRV", name: "EU B2B service purchase (art. 196)", treatment: "EU_SERVICE", ratePermille: 210, returnBox: "4b", inputReturnBox: "5b", validFrom: "2019-01-01" },
  { code: "IMPORT", name: "Import from outside the EU", treatment: "IMPORT", ratePermille: 210, returnBox: "4a", inputReturnBox: "5b", validFrom: "2019-01-01" },
  { code: "FOREIGN-VAT", name: "Foreign VAT charged (not recoverable in NL)", treatment: "FOREIGN_VAT", ratePermille: 0, returnBox: null, inputReturnBox: null, validFrom: "2019-01-01" },
  { code: "UNKNOWN", name: "Unknown — needs review", treatment: "UNKNOWN", ratePermille: 0, returnBox: null, inputReturnBox: null, validFrom: "2019-01-01" },
];

/** One VAT-relevant line feeding a period summary. */
export interface VatLineInput {
  transactionId: string;
  direction: "SALE" | "PURCHASE";
  treatment: VatTreatment;
  ratePermille: number;
  netCents: number; // base amount ex VAT (EUR)
  vatCents: number; // actual VAT booked (EUR)
  /** Recovery share for input VAT, basis points (mixed use). */
  vatRecoveryBp?: number;
  needsReview?: boolean;
}

export interface VatBoxAmount {
  box: string;
  label: string;
  baseCents: number;
  vatCents: number;
}

export interface VatPeriodSummary {
  rulesVersion: number;
  salesByTreatment: Record<string, { baseCents: number; vatCents: number }>;
  purchasesByTreatment: Record<string, { baseCents: number; vatCents: number }>;
  outputVatCents: number;
  /** Reverse-charge/acquisition VAT owed (also usually deductible in 5b). */
  reverseChargeVatCents: number;
  inputVatCents: number;
  boxes: VatBoxAmount[];
  /** Output + reverse charge − input. Positive = estimated amount payable. */
  estimatedBalanceCents: number;
  includedTransactionIds: string[];
  excludedTransactionIds: string[];
  needsReviewTransactionIds: string[];
  warnings: string[];
}

const BOX_LABELS: Record<string, string> = {
  "1a": "1a — Supplies taxed at the high rate",
  "1b": "1b — Supplies taxed at the low rate",
  "1e": "1e — Supplies taxed at 0% / exports",
  "2a": "2a — Supplies where VAT is reverse-charged to you",
  "3b": "3b — Supplies to EU countries (services, reverse charged)",
  "4a": "4a — Purchases from outside the EU",
  "4b": "4b — Purchases from EU countries",
  "5a": "5a — Output VAT owed (1–4)",
  "5b": "5b — Input VAT to deduct",
};

function addBox(map: Map<string, VatBoxAmount>, box: string, baseCents: number, vatCents: number) {
  const existing = map.get(box) ?? {
    box,
    label: BOX_LABELS[box] ?? box,
    baseCents: 0,
    vatCents: 0,
  };
  existing.baseCents += baseCents;
  existing.vatCents += vatCents;
  map.set(box, existing);
}

/**
 * Compute a Dutch VAT period preparation summary from confirmed lines.
 * Lines flagged needsReview (or with UNKNOWN treatment) are excluded from
 * the totals and reported separately — never silently included.
 */
export function computeVatPeriodSummary(lines: VatLineInput[]): VatPeriodSummary {
  const boxes = new Map<string, VatBoxAmount>();
  const salesByTreatment: VatPeriodSummary["salesByTreatment"] = {};
  const purchasesByTreatment: VatPeriodSummary["purchasesByTreatment"] = {};
  const included = new Set<string>();
  const excluded = new Set<string>();
  const review = new Set<string>();
  const warnings: string[] = [];

  let outputVat = 0;
  let reverseChargeVat = 0;
  let inputVat = 0;

  for (const line of lines) {
    if (line.needsReview || line.treatment === "UNKNOWN") {
      review.add(line.transactionId);
      excluded.add(line.transactionId);
      continue;
    }
    included.add(line.transactionId);

    const bucket = line.direction === "SALE" ? salesByTreatment : purchasesByTreatment;
    const agg = (bucket[line.treatment] ??= { baseCents: 0, vatCents: 0 });
    agg.baseCents += line.netCents;
    agg.vatCents += line.vatCents;

    if (line.direction === "SALE") {
      switch (line.treatment) {
        case "DOMESTIC_HIGH":
        case "DOMESTIC_LOW": {
          const box = line.treatment === "DOMESTIC_HIGH" ? "1a" : "1b";
          addBox(boxes, box, line.netCents, line.vatCents);
          outputVat += line.vatCents;
          break;
        }
        case "DOMESTIC_ZERO":
          addBox(boxes, "1e", line.netCents, 0);
          break;
        case "REVERSE_CHARGE_SALE":
          addBox(boxes, "3b", line.netCents, 0);
          break;
        case "EXEMPT":
        case "OUTSIDE_SCOPE":
        case "FOREIGN_VAT":
          break; // not on the Dutch return
        default:
          warnings.push(
            `Sale ${line.transactionId} has unusual treatment ${line.treatment}; excluded — review.`,
          );
          review.add(line.transactionId);
      }
    } else {
      switch (line.treatment) {
        case "DOMESTIC_HIGH":
        case "DOMESTIC_LOW":
        case "DOMESTIC_ZERO": {
          const recoverable =
            line.vatRecoveryBp === undefined
              ? line.vatCents
              : Math.round((line.vatCents * line.vatRecoveryBp) / 10000);
          addBox(boxes, "5b", line.netCents, recoverable);
          inputVat += recoverable;
          break;
        }
        case "REVERSE_CHARGE_PURCHASE":
        case "EU_ACQUISITION":
        case "EU_SERVICE":
        case "IMPORT": {
          // VAT is self-assessed: owed in 2a/4a/4b and (typically) deductible
          // in 5b, subject to the recovery percentage.
          const owed = line.vatCents > 0 ? line.vatCents : vatFromNet(line.netCents, line.ratePermille);
          const box =
            line.treatment === "REVERSE_CHARGE_PURCHASE"
              ? "2a"
              : line.treatment === "IMPORT"
                ? "4a"
                : "4b";
          addBox(boxes, box, line.netCents, owed);
          reverseChargeVat += owed;
          const recoverable =
            line.vatRecoveryBp === undefined
              ? owed
              : Math.round((owed * line.vatRecoveryBp) / 10000);
          addBox(boxes, "5b", 0, recoverable);
          inputVat += recoverable;
          break;
        }
        case "FOREIGN_VAT":
          // Foreign VAT is never recoverable as Dutch input VAT.
          break;
        case "EXEMPT":
        case "OUTSIDE_SCOPE":
          break;
        default:
          warnings.push(
            `Purchase ${line.transactionId} has unusual treatment ${line.treatment}; excluded — review.`,
          );
          review.add(line.transactionId);
      }
    }
  }

  const totalOwed = outputVat + reverseChargeVat;
  addBox(boxes, "5a", 0, totalOwed);

  const orderedBoxes = [...boxes.values()].sort((a, b) => a.box.localeCompare(b.box));
  return {
    rulesVersion: VAT_RULES_VERSION,
    salesByTreatment,
    purchasesByTreatment,
    outputVatCents: outputVat,
    reverseChargeVatCents: reverseChargeVat,
    inputVatCents: inputVat,
    boxes: orderedBoxes,
    estimatedBalanceCents: sumCents([totalOwed, -inputVat]),
    includedTransactionIds: [...included].filter((id) => !review.has(id)),
    excludedTransactionIds: [...excluded],
    needsReviewTransactionIds: [...review],
    warnings,
  };
}

/**
 * Typical Dutch VAT filing deadline: last day of the month after period end.
 * Presented as "typical deadline — check your Belastingdienst letter".
 */
export function typicalVatDeadline(periodEnd: { year: number; month: number }): {
  year: number;
  month: number;
  day: number;
} {
  const nextMonth = periodEnd.month === 12 ? 1 : periodEnd.month + 1;
  const year = periodEnd.month === 12 ? periodEnd.year + 1 : periodEnd.year;
  const lastDay = new Date(Date.UTC(year, nextMonth, 0)).getUTCDate();
  return { year, month: nextMonth, day: lastDay };
}
