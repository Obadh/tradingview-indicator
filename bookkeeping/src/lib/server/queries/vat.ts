/**
 * VAT period data assembly: turns journal lines carrying VAT codes into the
 * inputs for computeVatPeriodSummary (pure domain logic, unit-tested).
 */

import { prisma } from "@/lib/server/db";
import { isoDateToUtc, vatPeriodRange } from "@/lib/domain/dates";
import {
  computeVatPeriodSummary,
  type VatLineInput,
  type VatPeriodSummary,
  type VatTreatment,
} from "@/lib/domain/vat";

const FINAL_STATUSES = ["CONFIRMED", "RECONCILED", "LOCKED"] as const;

export interface VatPeriodData {
  summary: VatPeriodSummary;
  range: { start: string; end: string; label: string };
  reviewTransactions: { id: string; description: string; reason: string }[];
}

export async function vatPeriodData(
  businessId: string,
  frequency: "MONTHLY" | "QUARTERLY" | "YEARLY",
  year: number,
  periodNo: number,
): Promise<VatPeriodData> {
  const range = vatPeriodRange(frequency, year, periodNo);

  const transactions = await prisma.transaction.findMany({
    where: {
      businessId,
      date: { gte: isoDateToUtc(range.start), lte: isoDateToUtc(range.end) },
      status: { in: [...FINAL_STATUSES, "NEEDS_REVIEW", "DRAFT"] },
      type: {
        in: [
          "BUSINESS_INCOME",
          "BUSINESS_EXPENSE",
          "REFUND_RECEIVED",
          "REFUND_PAID",
          "CORRECTION",
        ],
      },
    },
    include: {
      lines: { include: { vatCode: true, ledgerAccount: true } },
    },
  });

  const vatLines: VatLineInput[] = [];
  const reviewTransactions: VatPeriodData["reviewTransactions"] = [];

  for (const t of transactions) {
    const finalized = (FINAL_STATUSES as readonly string[]).includes(t.status);
    const needsReview = !finalized || t.reviewFlag !== "NONE";
    if (needsReview) {
      reviewTransactions.push({
        id: t.id,
        description: t.description,
        reason: !finalized ? "not confirmed yet" : "flagged for tax review",
      });
    }
    const direction = ["BUSINESS_INCOME", "REFUND_RECEIVED"].includes(t.type)
      ? ("SALE" as const)
      : ("PURCHASE" as const);

    // One VAT input line per journal line that carries a VAT code with a base.
    for (const line of t.lines) {
      if (!line.vatCode || line.vatBaseCents === null) continue;
      const isVatAccount = ["input_vat", "output_vat"].includes(line.ledgerAccount.systemKey ?? "");
      if (isVatAccount && direction === "PURCHASE" && line.creditCents > 0) {
        // Self-assessed output side of a purchase — already represented by
        // the input-side line; skip to avoid double counting.
        continue;
      }
      const vatCents = isVatAccount ? line.debitCents + line.creditCents : 0;
      const netCents = isVatAccount ? 0 : line.vatBaseCents;
      vatLines.push({
        transactionId: t.id,
        direction,
        treatment: line.vatCode.treatment as VatTreatment,
        ratePermille: line.vatCode.ratePermille,
        netCents: direction === "SALE" ? Math.abs(netCents) : netCents,
        vatCents,
        vatRecoveryBp: undefined, // journal already carries recoverable VAT only
        needsReview,
      });
    }
  }

  return {
    summary: computeVatPeriodSummary(vatLines),
    range: { start: range.start, end: range.end, label: range.label },
    reviewTransactions,
  };
}
