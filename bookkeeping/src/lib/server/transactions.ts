/**
 * Transaction persistence. All writes go through this module so that:
 * - journal lines are always balanced (asserted before and inside the DB tx);
 * - transactions in locked VAT periods are never modified — changes create
 *   explicit CORRECTION entries instead;
 * - every mutation is audit-logged.
 */

import type { Prisma, TransactionStatus, TransactionType } from "@prisma/client";
import { prisma } from "./db";
import { audit, type AuditContext } from "./audit";
import { assertBalanced, type JournalLine } from "@/lib/domain/journal";
import { isoDateToUtc } from "@/lib/domain/dates";

export class LockedPeriodError extends Error {
  constructor() {
    super(
      "This record falls in a VAT period that has been filed and locked. Create a correction instead of editing it.",
    );
  }
}

export interface TransactionHeader {
  type: TransactionType;
  status: TransactionStatus;
  date: string; // ISO
  description: string;
  notes?: string | null;
  contactId?: string | null;
  categoryId?: string | null;
  currency?: string;
  originalAmountCents?: number | null;
  exchangeRate?: string | null;
  exchangeRateSource?: string | null;
  exchangeRateDate?: string | null;
  exchangeRateNote?: string | null;
  amountCents: number;
  vatAmountCents?: number;
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  dueDate?: string | null;
  paymentDate?: string | null;
  paymentMethod?: string | null;
  isPaid?: boolean;
  paidPersonally?: boolean;
  isPreRegistration?: boolean;
  isMixedUse?: boolean;
  businessUseBp?: number;
  vatRecoveryBp?: number;
  itDeductibleBp?: number;
  mixedUseNote?: string | null;
  businessPurpose?: string | null;
  supplierCountry?: string | null;
  supplierVatId?: string | null;
  isReverseCharge?: boolean;
  customerType?: "BUSINESS" | "CONSUMER" | "PLATFORM" | "UNKNOWN" | null;
  paymentReference?: string | null;
  reviewFlag?: "NONE" | "NEEDS_TAX_REVIEW" | "NEEDS_ADVICE";
  correctsTransactionId?: string | null;
}

async function resolveAccountIds(
  tx: Prisma.TransactionClient,
  businessId: string,
  lines: JournalLine[],
): Promise<Map<string, string>> {
  const keys = [...new Set(lines.map((l) => l.accountKey))];
  const bySystemKey = await tx.ledgerAccount.findMany({
    where: { businessId, systemKey: { in: keys } },
    select: { id: true, systemKey: true },
  });
  const map = new Map<string, string>();
  for (const a of bySystemKey) map.set(a.systemKey!, a.id);
  // Any key not found as systemKey must be a ledger account id of this business.
  const unresolved = keys.filter((k) => !map.has(k));
  if (unresolved.length > 0) {
    const byId = await tx.ledgerAccount.findMany({
      where: { businessId, id: { in: unresolved } },
      select: { id: true },
    });
    for (const a of byId) map.set(a.id, a.id);
  }
  const missing = keys.filter((k) => !map.has(k));
  if (missing.length > 0) {
    throw new Error(`Unknown ledger account(s): ${missing.join(", ")}`);
  }
  return map;
}

async function assertPeriodOpen(
  tx: Prisma.TransactionClient,
  businessId: string,
  isoDate: string,
): Promise<void> {
  const date = isoDateToUtc(isoDate);
  const locked = await tx.taxPeriod.findFirst({
    where: {
      businessId,
      type: "VAT",
      lockedAt: { not: null },
      startDate: { lte: date },
      endDate: { gte: date },
    },
  });
  if (locked) throw new LockedPeriodError();
}

export async function createTransaction(
  ctx: AuditContext & { businessId: string },
  header: TransactionHeader,
  lines: JournalLine[],
  documentIds: string[] = [],
): Promise<string> {
  assertBalanced(lines);

  return prisma.$transaction(async (tx) => {
    await assertPeriodOpen(tx, ctx.businessId, header.date);
    const accountIds = await resolveAccountIds(tx, ctx.businessId, lines);

    const created = await tx.transaction.create({
      data: {
        businessId: ctx.businessId,
        type: header.type,
        status: header.status,
        reviewFlag: header.reviewFlag ?? "NONE",
        date: isoDateToUtc(header.date),
        description: header.description,
        notes: header.notes ?? null,
        contactId: header.contactId ?? null,
        categoryId: header.categoryId ?? null,
        currency: header.currency ?? "EUR",
        originalAmountCents: header.originalAmountCents ?? null,
        exchangeRate: header.exchangeRate ?? null,
        exchangeRateSource: header.exchangeRateSource ?? null,
        exchangeRateDate: header.exchangeRateDate ? isoDateToUtc(header.exchangeRateDate) : null,
        exchangeRateNote: header.exchangeRateNote ?? null,
        amountCents: header.amountCents,
        vatAmountCents: header.vatAmountCents ?? 0,
        invoiceNumber: header.invoiceNumber ?? null,
        invoiceDate: header.invoiceDate ? isoDateToUtc(header.invoiceDate) : null,
        dueDate: header.dueDate ? isoDateToUtc(header.dueDate) : null,
        paymentDate: header.paymentDate ? isoDateToUtc(header.paymentDate) : null,
        paymentMethod: header.paymentMethod ?? null,
        isPaid: header.isPaid ?? false,
        paidPersonally: header.paidPersonally ?? false,
        isPreRegistration: header.isPreRegistration ?? false,
        isMixedUse: header.isMixedUse ?? false,
        businessUseBp: header.businessUseBp ?? 10000,
        vatRecoveryBp: header.vatRecoveryBp ?? 10000,
        itDeductibleBp: header.itDeductibleBp ?? 10000,
        mixedUseNote: header.mixedUseNote ?? null,
        businessPurpose: header.businessPurpose ?? null,
        supplierCountry: header.supplierCountry ?? null,
        supplierVatId: header.supplierVatId ?? null,
        isReverseCharge: header.isReverseCharge ?? false,
        customerType: header.customerType ?? null,
        paymentReference: header.paymentReference ?? null,
        correctsTransactionId: header.correctsTransactionId ?? null,
        finalizedAt: ["CONFIRMED", "RECONCILED"].includes(header.status) ? new Date() : null,
        lines: {
          create: lines.map((l, i) => ({
            ledgerAccountId: accountIds.get(l.accountKey)!,
            description: l.description ?? null,
            debitCents: l.debitCents,
            creditCents: l.creditCents,
            vatCodeId: l.vatCodeId ?? null,
            vatBaseCents: l.vatBaseCents ?? null,
            sortOrder: l.sortOrder ?? i,
          })),
        },
      },
    });

    if (documentIds.length > 0) {
      const docs = await tx.document.findMany({
        where: { id: { in: documentIds }, businessId: ctx.businessId, deletedAt: null },
        select: { id: true },
      });
      await tx.documentLink.createMany({
        data: docs.map((d) => ({ documentId: d.id, transactionId: created.id })),
      });
    }

    await audit(
      ctx,
      {
        action: "create",
        entityType: "Transaction",
        entityId: created.id,
        newValues: { ...header, lineCount: lines.length },
      },
      tx,
    );
    return created.id;
  });
}

/**
 * Replace a transaction's content. Only allowed while the record is not
 * locked/corrected; finalized-but-open records may be edited with a reason,
 * records in locked periods must go through createCorrection instead.
 */
export async function updateTransaction(
  ctx: AuditContext & { businessId: string },
  transactionId: string,
  header: TransactionHeader,
  lines: JournalLine[],
  reason: string | null,
): Promise<void> {
  assertBalanced(lines);

  await prisma.$transaction(async (tx) => {
    const existing = await tx.transaction.findFirst({
      where: { id: transactionId, businessId: ctx.businessId },
      include: { lines: true },
    });
    if (!existing) throw new Error("Transaction not found");
    if (["LOCKED", "CORRECTED", "VOID"].includes(existing.status)) {
      throw new LockedPeriodError();
    }
    await assertPeriodOpen(tx, ctx.businessId, existing.date.toISOString().slice(0, 10));
    await assertPeriodOpen(tx, ctx.businessId, header.date);
    if (["CONFIRMED", "RECONCILED"].includes(existing.status) && !reason) {
      throw new Error("Editing a confirmed record requires a reason (kept in the audit trail).");
    }

    const accountIds = await resolveAccountIds(tx, ctx.businessId, lines);
    await tx.transactionLine.deleteMany({ where: { transactionId } });
    await tx.transaction.update({
      where: { id: transactionId },
      data: {
        type: header.type,
        status: header.status,
        reviewFlag: header.reviewFlag ?? "NONE",
        date: isoDateToUtc(header.date),
        description: header.description,
        notes: header.notes ?? null,
        contactId: header.contactId ?? null,
        categoryId: header.categoryId ?? null,
        currency: header.currency ?? "EUR",
        originalAmountCents: header.originalAmountCents ?? null,
        exchangeRate: header.exchangeRate ?? null,
        exchangeRateSource: header.exchangeRateSource ?? null,
        exchangeRateDate: header.exchangeRateDate ? isoDateToUtc(header.exchangeRateDate) : null,
        exchangeRateNote: header.exchangeRateNote ?? null,
        amountCents: header.amountCents,
        vatAmountCents: header.vatAmountCents ?? 0,
        invoiceNumber: header.invoiceNumber ?? null,
        invoiceDate: header.invoiceDate ? isoDateToUtc(header.invoiceDate) : null,
        dueDate: header.dueDate ? isoDateToUtc(header.dueDate) : null,
        paymentDate: header.paymentDate ? isoDateToUtc(header.paymentDate) : null,
        paymentMethod: header.paymentMethod ?? null,
        isPaid: header.isPaid ?? false,
        paidPersonally: header.paidPersonally ?? false,
        isPreRegistration: header.isPreRegistration ?? false,
        isMixedUse: header.isMixedUse ?? false,
        businessUseBp: header.businessUseBp ?? 10000,
        vatRecoveryBp: header.vatRecoveryBp ?? 10000,
        itDeductibleBp: header.itDeductibleBp ?? 10000,
        mixedUseNote: header.mixedUseNote ?? null,
        businessPurpose: header.businessPurpose ?? null,
        supplierCountry: header.supplierCountry ?? null,
        supplierVatId: header.supplierVatId ?? null,
        isReverseCharge: header.isReverseCharge ?? false,
        customerType: header.customerType ?? null,
        paymentReference: header.paymentReference ?? null,
        finalizedAt:
          ["CONFIRMED", "RECONCILED"].includes(header.status) && !existing.finalizedAt
            ? new Date()
            : existing.finalizedAt,
        lines: {
          create: lines.map((l, i) => ({
            ledgerAccountId: accountIds.get(l.accountKey)!,
            description: l.description ?? null,
            debitCents: l.debitCents,
            creditCents: l.creditCents,
            vatCodeId: l.vatCodeId ?? null,
            vatBaseCents: l.vatBaseCents ?? null,
            sortOrder: l.sortOrder ?? i,
          })),
        },
      },
    });

    await audit(
      ctx,
      {
        action: "update",
        entityType: "Transaction",
        entityId: transactionId,
        oldValues: {
          description: existing.description,
          amountCents: existing.amountCents,
          status: existing.status,
          date: existing.date.toISOString().slice(0, 10),
        },
        newValues: { description: header.description, amountCents: header.amountCents, status: header.status },
        reason,
      },
      tx,
    );
  });
}

/** Status-only transitions (confirm, mark reviewed, void a draft...). */
export async function transitionTransaction(
  ctx: AuditContext & { businessId: string },
  transactionId: string,
  toStatus: TransactionStatus,
  reason: string | null,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.transaction.findFirst({
      where: { id: transactionId, businessId: ctx.businessId },
      include: { lines: true },
    });
    if (!existing) throw new Error("Transaction not found");
    if (["LOCKED", "CORRECTED"].includes(existing.status)) throw new LockedPeriodError();
    if (existing.status === "VOID") throw new Error("This record is void.");
    if (toStatus === "VOID" && ["CONFIRMED", "RECONCILED"].includes(existing.status) && !reason) {
      throw new Error("Voiding a confirmed record requires a reason.");
    }
    if (["CONFIRMED", "RECONCILED"].includes(toStatus)) {
      // Never finalize an unbalanced journal.
      assertBalanced(
        existing.lines.map((l) => ({
          accountKey: l.ledgerAccountId,
          debitCents: l.debitCents,
          creditCents: l.creditCents,
        })),
      );
    }
    await tx.transaction.update({
      where: { id: transactionId },
      data: {
        status: toStatus,
        finalizedAt:
          ["CONFIRMED", "RECONCILED"].includes(toStatus) && !existing.finalizedAt
            ? new Date()
            : existing.finalizedAt,
      },
    });
    await audit(
      ctx,
      {
        action: toStatus === "VOID" ? "delete" : "confirm",
        entityType: "Transaction",
        entityId: transactionId,
        oldValues: { status: existing.status },
        newValues: { status: toStatus },
        reason,
      },
      tx,
    );
  });
}

/**
 * Correction for a record in a locked period: the original stays untouched
 * and becomes CORRECTED; a new CORRECTION transaction (dated in an open
 * period) carries the delta journal. Requires an explicit reason.
 */
export async function createCorrection(
  ctx: AuditContext & { businessId: string },
  originalId: string,
  correctionDate: string,
  correctionLines: JournalLine[],
  description: string,
  reason: string,
): Promise<string> {
  assertBalanced(correctionLines);
  if (!reason.trim()) throw new Error("A correction requires a reason.");

  return prisma.$transaction(async (tx) => {
    const original = await tx.transaction.findFirst({
      where: { id: originalId, businessId: ctx.businessId },
    });
    if (!original) throw new Error("Original transaction not found");
    await assertPeriodOpen(tx, ctx.businessId, correctionDate);

    const accountIds = await resolveAccountIds(tx, ctx.businessId, correctionLines);
    const correction = await tx.transaction.create({
      data: {
        businessId: ctx.businessId,
        type: "CORRECTION",
        status: "CONFIRMED",
        date: isoDateToUtc(correctionDate),
        description,
        notes: `Corrects: ${original.description}`,
        amountCents: correctionLines.reduce((s, l) => s + l.debitCents, 0),
        correctsTransactionId: original.id,
        finalizedAt: new Date(),
        lines: {
          create: correctionLines.map((l, i) => ({
            ledgerAccountId: accountIds.get(l.accountKey)!,
            description: l.description ?? null,
            debitCents: l.debitCents,
            creditCents: l.creditCents,
            vatCodeId: l.vatCodeId ?? null,
            vatBaseCents: l.vatBaseCents ?? null,
            sortOrder: l.sortOrder ?? i,
          })),
        },
      },
    });
    await tx.transaction.update({
      where: { id: original.id },
      data: { status: "CORRECTED" },
    });
    await audit(
      ctx,
      {
        action: "correct",
        entityType: "Transaction",
        entityId: original.id,
        newValues: { correctionId: correction.id },
        reason,
      },
      tx,
    );
    return correction.id;
  });
}
