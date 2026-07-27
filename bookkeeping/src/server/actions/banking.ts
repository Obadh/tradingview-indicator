"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/server/db";
import { requireBusiness, auditContext } from "@/lib/server/context";
import { audit } from "@/lib/server/audit";
import { sha256Hex } from "@/lib/server/crypto";
import { storage, documentStorageKey } from "@/lib/server/storage";
import { parseBankCsv, type ColumnMapping, type ParsedBankRow } from "@/lib/domain/bank-csv";
import { bankLineFingerprintInput, suggestMatches, type MatchSuggestion } from "@/lib/domain/reconciliation";
import { isoDateToUtc } from "@/lib/domain/dates";
import type { ActionResult } from "./auth";

const mappingSchema = z.object({
  date: z.string().min(1),
  amount: z.string().min(1),
  debitCreditIndicator: z.string().optional(),
  debitValue: z.string().optional(),
  description: z.string().optional(),
  counterpartyName: z.string().optional(),
  counterpartyIban: z.string().optional(),
  reference: z.string().optional(),
  dateFormat: z.enum(["YMD", "DMY"]),
  amountAlwaysPositive: z.boolean().optional(),
});

const previewSchema = z.object({
  bankAccountId: z.string().uuid(),
  csvText: z.string().min(1).max(5_000_000),
  mapping: mappingSchema,
});

export interface BankPreviewResult extends ActionResult {
  rows?: (ParsedBankRow & { duplicate: boolean })[];
  errors?: { rowNumber: number; message: string }[];
  accountKind?: string;
}

/** Parse a CSV with the chosen mapping without storing anything. */
export async function previewBankCsvAction(payload: unknown): Promise<BankPreviewResult> {
  const { business } = await requireBusiness();
  const parsed = previewSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "Invalid import data." };

  const account = await prisma.bankAccount.findFirst({
    where: { id: parsed.data.bankAccountId, businessId: business.id, deletedAt: null },
  });
  if (!account) return { ok: false, error: "Unknown bank account." };

  const result = parseBankCsv(parsed.data.csvText, parsed.data.mapping as ColumnMapping);
  const fingerprints = result.rows.map((r) =>
    sha256Hex(bankLineFingerprintInput({ ...r, counterpartyIban: r.counterpartyIban ?? null })),
  );
  const existing = await prisma.bankTransaction.findMany({
    where: { bankAccountId: account.id, fingerprint: { in: fingerprints } },
    select: { fingerprint: true },
  });
  const existingSet = new Set(existing.map((e) => e.fingerprint));
  return {
    ok: true,
    accountKind: account.kind,
    rows: result.rows.map((r, i) => ({ ...r, duplicate: existingSet.has(fingerprints[i]!) })),
    errors: result.errors,
  };
}

const importSchema = previewSchema.extend({
  /** Row numbers to import; for personal accounts the user selects only
   *  business-related rows so private data never becomes bookkeeping data. */
  selectedRowNumbers: z.array(z.number().int()).nullable(),
  storeOriginal: z.boolean().default(true),
});

export interface BankImportResult extends ActionResult {
  importedCount?: number;
  duplicateCount?: number;
  importId?: string;
}

export async function importBankCsvAction(payload: unknown): Promise<BankImportResult> {
  const { business, user } = await requireBusiness();
  const parsed = importSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "Invalid import data." };
  const d = parsed.data;

  const account = await prisma.bankAccount.findFirst({
    where: { id: d.bankAccountId, businessId: business.id, deletedAt: null },
  });
  if (!account) return { ok: false, error: "Unknown bank account." };

  const parseResult = parseBankCsv(d.csvText, d.mapping as ColumnMapping);
  const selected =
    d.selectedRowNumbers === null
      ? parseResult.rows
      : parseResult.rows.filter((r) => d.selectedRowNumbers!.includes(r.rowNumber));
  if (selected.length === 0) return { ok: false, error: "No rows selected to import." };

  // Optionally preserve the original CSV as a bank-statement document.
  // For personal accounts the default is NOT to store the full statement.
  let documentId: string | null = null;
  if (d.storeOriginal) {
    const buf = Buffer.from(d.csvText, "utf8");
    const sha256 = sha256Hex(buf);
    const doc = await prisma.document.create({
      data: {
        businessId: business.id,
        category: "BANK_STATEMENT",
        status: "CONFIRMED",
        originalFilename: `bank-import-${new Date().toISOString().slice(0, 10)}.csv`,
        mimeType: "text/csv",
        sizeBytes: buf.length,
        sha256,
        storageKey: "pending",
        uploadedById: user.id,
      },
    });
    const key = documentStorageKey(business.id, doc.id, 1);
    await prisma.document.update({ where: { id: doc.id }, data: { storageKey: key } });
    await prisma.documentVersion.create({
      data: {
        documentId: doc.id,
        version: 1,
        storageKey: key,
        mimeType: "text/csv",
        sizeBytes: buf.length,
        sha256,
        note: "original bank CSV import",
      },
    });
    await storage().put(key, buf, "text/csv");
    documentId = doc.id;
  }

  const importRecord = await prisma.bankStatementImport.create({
    data: {
      businessId: business.id,
      bankAccountId: account.id,
      documentId,
      format: "CSV",
      status: "MAPPING",
      columnMapping: d.mapping,
      rowCount: parseResult.rows.length,
      errorLog: parseResult.errors.length ? parseResult.errors : undefined,
    },
  });

  let imported = 0;
  let duplicates = 0;
  for (const row of selected) {
    const fingerprint = sha256Hex(
      bankLineFingerprintInput({ ...row, counterpartyIban: row.counterpartyIban ?? null }),
    );
    try {
      await prisma.bankTransaction.create({
        data: {
          businessId: business.id,
          bankAccountId: account.id,
          importId: importRecord.id,
          bookingDate: isoDateToUtc(row.bookingDate),
          amountCents: row.amountCents,
          counterpartyName: row.counterpartyName,
          counterpartyIban: row.counterpartyIban,
          description: row.description,
          reference: row.reference,
          fingerprint,
        },
      });
      imported++;
    } catch {
      duplicates++; // unique(bankAccountId, fingerprint) — already imported
    }
  }

  await prisma.bankStatementImport.update({
    where: { id: importRecord.id },
    data: { status: "IMPORTED", importedCount: imported, duplicateCount: duplicates },
  });
  await audit(await auditContext(business.id), {
    action: "create",
    entityType: "BankStatementImport",
    entityId: importRecord.id,
    newValues: {
      bankAccountId: account.id,
      imported,
      duplicates,
      selective: d.selectedRowNumbers !== null,
    },
  });

  revalidatePath("/banking");
  return { ok: true, importedCount: imported, duplicateCount: duplicates, importId: importRecord.id };
}

export interface SuggestResult extends ActionResult {
  suggestions?: (MatchSuggestion & { label: string })[];
}

/** Explainable match suggestions for one bank line. */
export async function suggestMatchesAction(bankTransactionId: string): Promise<SuggestResult> {
  const { business } = await requireBusiness();
  const line = await prisma.bankTransaction.findFirst({
    where: { id: bankTransactionId, businessId: business.id },
  });
  if (!line) return { ok: false, error: "Bank transaction not found." };

  const [openInvoices, openTransactions] = await Promise.all([
    prisma.invoice.findMany({
      where: {
        businessId: business.id,
        status: { in: ["FINALIZED", "SENT", "PARTIALLY_PAID", "OVERDUE"] },
      },
      include: { contact: true, allocations: true },
    }),
    prisma.transaction.findMany({
      where: {
        businessId: business.id,
        status: { in: ["NEEDS_REVIEW", "CONFIRMED"] },
        type: { in: ["BUSINESS_EXPENSE", "BUSINESS_INCOME", "REFUND_PAID", "REFUND_RECEIVED"] },
      },
      include: { contact: true, reconciliations: true },
    }),
  ]);

  const candidates = [
    ...openInvoices.map((inv) => {
      const allocated = inv.allocations.reduce((s, a) => s + a.amountCents, 0);
      return {
        id: inv.id,
        kind: "INVOICE" as const,
        date: inv.issueDate?.toISOString().slice(0, 10) ?? null,
        expectedCents: inv.totalIncVatCents,
        openCents: inv.totalIncVatCents - allocated,
        counterpartyName: inv.contact.name,
        counterpartyIban: inv.contact.iban,
        invoiceNumber: inv.number,
        label: `Invoice ${inv.number ?? "(draft)"} — ${inv.contact.name}`,
      };
    }),
    ...openTransactions.map((t) => {
      const sign = ["BUSINESS_INCOME", "REFUND_RECEIVED"].includes(t.type) ? 1 : -1;
      const matched = t.reconciliations.reduce((s, m) => s + m.amountCents, 0);
      return {
        id: t.id,
        kind: "TRANSACTION" as const,
        date: (t.paymentDate ?? t.date).toISOString().slice(0, 10),
        expectedCents: sign * t.amountCents,
        openCents: sign * t.amountCents - matched,
        counterpartyName: t.contact?.name ?? null,
        counterpartyIban: t.contact?.iban ?? null,
        invoiceNumber: t.invoiceNumber,
        label: `${t.description} — ${t.contact?.name ?? "?"}`,
      };
    }),
  ];

  const suggestions = suggestMatches(
    {
      id: line.id,
      bookingDate: line.bookingDate.toISOString().slice(0, 10),
      amountCents: line.amountCents,
      counterpartyName: line.counterpartyName,
      counterpartyIban: line.counterpartyIban,
      description: line.description,
      reference: line.reference,
    },
    candidates,
  ).map((s) => ({
    ...s,
    label: candidates.find((c) => c.id === s.candidateId)?.label ?? s.candidateId,
  }));

  return { ok: true, suggestions };
}

const confirmMatchSchema = z.object({
  bankTransactionId: z.string().uuid(),
  candidateId: z.string().uuid(),
  candidateKind: z.enum(["INVOICE", "TRANSACTION"]),
  amountCents: z.number().int(),
  reason: z.string().min(1).max(300),
});

export async function confirmMatchAction(payload: unknown): Promise<ActionResult> {
  const { business, user } = await requireBusiness();
  const parsed = confirmMatchSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "Invalid match data." };
  const d = parsed.data;

  const line = await prisma.bankTransaction.findFirst({
    where: { id: d.bankTransactionId, businessId: business.id },
    include: { matches: true },
  });
  if (!line) return { ok: false, error: "Bank transaction not found." };

  await prisma.$transaction(async (tx) => {
    await tx.reconciliationMatch.create({
      data: {
        businessId: business.id,
        bankTransactionId: line.id,
        transactionId: d.candidateKind === "TRANSACTION" ? d.candidateId : null,
        invoiceId: d.candidateKind === "INVOICE" ? d.candidateId : null,
        amountCents: d.amountCents,
        reason: d.reason,
        suggested: false,
        confirmedAt: new Date(),
      },
    });

    const totalMatched =
      line.matches.reduce((s, m) => s + Math.abs(m.amountCents), 0) + Math.abs(d.amountCents);
    const fullyMatched = totalMatched >= Math.abs(line.amountCents);
    await tx.bankTransaction.update({
      where: { id: line.id },
      data: { state: fullyMatched ? "MATCHED" : "PARTIALLY_MATCHED" },
    });

    if (d.candidateKind === "TRANSACTION") {
      const txn = await tx.transaction.findFirst({
        where: { id: d.candidateId, businessId: business.id },
        include: { reconciliations: true },
      });
      if (txn) {
        const matched =
          txn.reconciliations.reduce((s, m) => s + Math.abs(m.amountCents), 0) + Math.abs(d.amountCents);
        const covered = matched >= txn.amountCents;
        await tx.transaction.update({
          where: { id: txn.id },
          data: {
            isPaid: covered ? true : txn.isPaid,
            paymentDate: txn.paymentDate ?? line.bookingDate,
            status: covered && txn.status === "CONFIRMED" ? "RECONCILED" : txn.status,
          },
        });
      }
    } else {
      const invoice = await tx.invoice.findFirst({
        where: { id: d.candidateId, businessId: business.id },
        include: { allocations: true },
      });
      if (invoice) {
        // One payment may cover several invoices and vice versa: allocations
        // accumulate until the invoice total is covered.
        const payment = await tx.payment.create({
          data: {
            businessId: business.id,
            bankAccountId: line.bankAccountId,
            bankTransactionId: line.id,
            date: line.bookingDate,
            amountCents: d.amountCents,
            method: "BANK_TRANSFER",
            reference: line.reference,
          },
        });
        await tx.paymentAllocation.create({
          data: {
            businessId: business.id,
            paymentId: payment.id,
            invoiceId: invoice.id,
            amountCents: Math.abs(d.amountCents),
          },
        });
        const allocated =
          invoice.allocations.reduce((s, a) => s + a.amountCents, 0) + Math.abs(d.amountCents);
        await tx.invoice.update({
          where: { id: invoice.id },
          data: { status: allocated >= invoice.totalIncVatCents ? "PAID" : "PARTIALLY_PAID" },
        });
      }
    }

    await audit(
      { ...(await auditContext(business.id)), actorUserId: user.id },
      {
        action: "update",
        entityType: "BankTransaction",
        entityId: line.id,
        newValues: { match: d },
        reason: d.reason,
      },
      tx,
    );
  });

  revalidatePath("/banking");
  return { ok: true };
}

const stateSchema = z.object({
  bankTransactionId: z.string().uuid(),
  state: z.enum(["IGNORED_PRIVATE", "OWN_TRANSFER", "UNMATCHED"]),
});

export async function setBankLineStateAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { business } = await requireBusiness();
  const parsed = stateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  const line = await prisma.bankTransaction.findFirst({
    where: { id: parsed.data.bankTransactionId, businessId: business.id },
  });
  if (!line) return { ok: false, error: "Not found" };
  await prisma.bankTransaction.update({
    where: { id: line.id },
    data: {
      state: parsed.data.state,
      stateNote:
        parsed.data.state === "IGNORED_PRIVATE"
          ? "Marked private by user — not a business transaction"
          : parsed.data.state === "OWN_TRANSFER"
            ? "Transfer between own accounts — not income or expense"
            : null,
    },
  });
  await audit(await auditContext(business.id), {
    action: "update",
    entityType: "BankTransaction",
    entityId: line.id,
    oldValues: { state: line.state },
    newValues: { state: parsed.data.state },
  });
  revalidatePath("/banking");
  return { ok: true };
}
