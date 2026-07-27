/**
 * Dashboard aggregates. Every figure is computed from the journal lines of
 * CONFIRMED/RECONCILED/LOCKED transactions and each tile links to the exact
 * filtered list that produced it — numbers are always explainable.
 */

import { prisma } from "@/lib/server/db";
import { todayAmsterdam, isoDateToUtc, vatPeriodRange, vatPeriodFor } from "@/lib/domain/dates";
import { typicalVatDeadline } from "@/lib/domain/vat";
import { computeCompleteness, type CompletenessScore } from "@/lib/domain/completeness";

const FINAL_STATUSES = ["CONFIRMED", "RECONCILED", "LOCKED"] as const;

export interface PeriodTotals {
  incomeCents: number;
  expenseCents: number;
  from: string;
  to: string;
}

async function totalsBetween(businessId: string, fromIso: string, toIso: string): Promise<PeriodTotals> {
  // Income = credits on revenue accounts; expenses = debits on expense
  // accounts (minus refunds), from finalized transactions only. Owner flows
  // and own transfers never appear here because they touch no P&L account.
  const lines = await prisma.transactionLine.findMany({
    where: {
      transaction: {
        businessId,
        status: { in: [...FINAL_STATUSES] },
        date: { gte: isoDateToUtc(fromIso), lte: isoDateToUtc(toIso) },
      },
      ledgerAccount: { type: { in: ["REVENUE", "EXPENSE"] } },
    },
    select: {
      debitCents: true,
      creditCents: true,
      ledgerAccount: { select: { type: true } },
    },
  });
  let incomeCents = 0;
  let expenseCents = 0;
  for (const l of lines) {
    if (l.ledgerAccount.type === "REVENUE") incomeCents += l.creditCents - l.debitCents;
    else expenseCents += l.debitCents - l.creditCents;
  }
  return { incomeCents, expenseCents, from: fromIso, to: toIso };
}

export interface DashboardData {
  month: PeriodTotals;
  quarter: PeriodTotals;
  year: PeriodTotals;
  vatCollectedCents: number;
  vatRecoverableCents: number;
  vatBalanceCents: number;
  vatQuarterLabel: string;
  documentsNeedingReview: number;
  transactionsNeedingReview: number;
  transactionsWithoutDocuments: number;
  documentsWithoutPayments: number;
  invoicesMissingDetails: number;
  unreconciledBankLines: number;
  nextVatDeadline: { label: string; date: string } | null;
  completeness: CompletenessScore;
}

export async function dashboardData(
  businessId: string,
  vatFilingFrequency: "MONTHLY" | "QUARTERLY" | "YEARLY" | "UNKNOWN",
): Promise<DashboardData> {
  const today = todayAmsterdam();
  const [y, m] = today.split("-").map(Number) as [number, number, number];
  const monthRange = vatPeriodRange("MONTHLY", y, m);
  const quarterRange = vatPeriodRange("QUARTERLY", y, Math.ceil(m / 3));
  const yearRange = vatPeriodRange("YEARLY", y, 0);

  const [month, quarter, year] = await Promise.all([
    totalsBetween(businessId, monthRange.start, monthRange.end),
    totalsBetween(businessId, quarterRange.start, quarterRange.end),
    totalsBetween(businessId, yearRange.start, yearRange.end),
  ]);

  // VAT position for the current filing period (quarter unless monthly).
  const vatFreq = vatFilingFrequency === "UNKNOWN" ? "QUARTERLY" : vatFilingFrequency;
  const vatPeriod = vatPeriodFor(vatFreq, today);
  const vatRange = vatPeriodRange(vatFreq, vatPeriod.year, vatPeriod.periodNo);
  const vatLines = await prisma.transactionLine.findMany({
    where: {
      transaction: {
        businessId,
        status: { in: [...FINAL_STATUSES] },
        date: { gte: isoDateToUtc(vatRange.start), lte: isoDateToUtc(vatRange.end) },
      },
      ledgerAccount: { systemKey: { in: ["output_vat", "input_vat"] } },
    },
    select: {
      debitCents: true,
      creditCents: true,
      ledgerAccount: { select: { systemKey: true } },
    },
  });
  let vatCollected = 0;
  let vatRecoverable = 0;
  for (const l of vatLines) {
    if (l.ledgerAccount.systemKey === "output_vat") vatCollected += l.creditCents - l.debitCents;
    else vatRecoverable += l.debitCents - l.creditCents;
  }

  const [
    documentsNeedingReview,
    transactionsNeedingReview,
    transactionsWithoutDocuments,
    documentsWithoutPayments,
    invoicesMissingDetails,
    unreconciledBankLines,
    totalTransactions,
    unmatchedDocuments,
  ] = await Promise.all([
    prisma.document.count({
      where: { businessId, status: { in: ["UPLOADED", "NEEDS_REVIEW"] }, deletedAt: null },
    }),
    prisma.transaction.count({
      where: { businessId, status: { in: ["DRAFT", "NEEDS_REVIEW"] } },
    }),
    prisma.transaction.count({
      where: {
        businessId,
        type: { in: ["BUSINESS_EXPENSE", "BUSINESS_INCOME"] },
        status: { notIn: ["VOID", "CORRECTED"] },
        documentLinks: { none: {} },
      },
    }),
    prisma.document.count({
      where: {
        businessId,
        deletedAt: null,
        category: { in: ["PURCHASE_INVOICE", "SALES_INVOICE", "RECEIPT", "SUBSCRIPTION_INVOICE"] },
        links: { none: { transaction: { isPaid: true } } },
      },
    }),
    prisma.invoice.count({
      where: {
        businessId,
        status: "DRAFT",
      },
    }),
    prisma.bankTransaction.count({
      where: { businessId, state: { in: ["UNMATCHED", "SUGGESTED", "PARTIALLY_MATCHED"] } },
    }),
    prisma.transaction.count({ where: { businessId, status: { notIn: ["VOID"] } } }),
    prisma.document.count({
      where: {
        businessId,
        deletedAt: null,
        status: { notIn: ["ARCHIVED"] },
        category: { in: ["PURCHASE_INVOICE", "SALES_INVOICE", "RECEIPT", "SUBSCRIPTION_INVOICE"] },
        links: { none: {} },
      },
    }),
  ]);

  let nextVatDeadline: DashboardData["nextVatDeadline"] = null;
  if (vatFilingFrequency !== "UNKNOWN") {
    const endMonth = Number(vatRange.end.split("-")[1]);
    const deadline = typicalVatDeadline({ year: vatPeriod.year, month: endMonth });
    nextVatDeadline = {
      label: vatRange.label,
      date: `${deadline.year}-${String(deadline.month).padStart(2, "0")}-${String(deadline.day).padStart(2, "0")}`,
    };
  }

  const completeness = computeCompleteness({
    totalTransactions,
    transactionsNeedingReview,
    transactionsWithoutDocuments,
    documentsNeedingReview,
    unreconciledBankLines,
    invoicesMissingDetails,
    unmatchedDocuments,
  });

  return {
    month,
    quarter,
    year,
    vatCollectedCents: vatCollected,
    vatRecoverableCents: vatRecoverable,
    vatBalanceCents: vatCollected - vatRecoverable,
    vatQuarterLabel: vatRange.label,
    documentsNeedingReview,
    transactionsNeedingReview,
    transactionsWithoutDocuments,
    documentsWithoutPayments,
    invoicesMissingDetails,
    unreconciledBankLines,
    nextVatDeadline,
    completeness,
  };
}
