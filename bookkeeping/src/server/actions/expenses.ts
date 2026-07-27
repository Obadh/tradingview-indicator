"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/server/db";
import { requireBusiness, auditContext } from "@/lib/server/context";
import { createTransaction } from "@/lib/server/transactions";
import { buildExpenseJournal, ACCOUNTS } from "@/lib/domain/journal";
import { parseAmountToCents, sumCents } from "@/lib/domain/money";
import { validateInvoice } from "@/lib/domain/invoice-validation";
import { expenseSchema } from "@/lib/validation/money-flows";
import type { ActionResult } from "./auth";

export interface ExpenseActionResult extends ActionResult {
  warnings?: { code: string; message: string }[];
  transactionId?: string;
}

/**
 * Create an expense from the submitted form (JSON payload — the form is a
 * client component with dynamic lines). Validation warnings are returned to
 * the UI; they never block saving. Uncertain international records are
 * flagged "needs tax review" and saved as NEEDS_REVIEW, not CONFIRMED.
 */
export async function createExpenseAction(payload: unknown): Promise<ExpenseActionResult> {
  const { business, user } = await requireBusiness();
  const parsed = expenseSchema.safeParse(payload);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `${issue?.path.join(".")}: ${issue?.message}` };
  }
  const d = parsed.data;

  let lines;
  try {
    lines = d.lines.map((l) => ({
      description: l.description,
      netCents: parseAmountToCents(l.net),
      vatCents: parseAmountToCents(l.vat),
      vatCodeId: l.vatCodeId,
    }));
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invalid amount" };
  }

  const vatCodes = await prisma.vATCode.findMany({
    where: { businessId: business.id, id: { in: lines.map((l) => l.vatCodeId) } },
  });
  const codeById = new Map(vatCodes.map((c) => [c.id, c]));
  for (const l of lines) {
    if (!codeById.has(l.vatCodeId)) return { ok: false, error: "Unknown VAT rate selected." };
  }

  const category = await prisma.category.findFirst({
    where: { id: d.categoryId, businessId: business.id, kind: "EXPENSE" },
    include: { ledgerAccount: true },
  });
  if (!category) return { ok: false, error: "Unknown category." };

  // Contact (supplier) find-or-create by name.
  const existingSupplier = await prisma.contact.findFirst({
    where: { businessId: business.id, name: d.supplierName, deletedAt: null },
  });
  const supplier =
    existingSupplier ??
    (await prisma.contact.create({
      data: {
        businessId: business.id,
        kind: "SUPPLIER",
        name: d.supplierName,
        country: d.supplierCountry.toUpperCase(),
        vatId: d.supplierVatId || null,
      },
    }));

  const businessUseBp = Math.round(d.businessUsePct * 100);
  const vatRecoveryBp = Math.round(d.vatRecoveryPct * 100);
  const itDeductibleBp = Math.round(d.itDeductiblePct * 100);
  const mixedUse = d.isMixedUse || businessUseBp < 10000 || vatRecoveryBp < 10000 || itDeductibleBp < 10000;
  if (mixedUse && !d.mixedUseNote?.trim()) {
    return {
      ok: false,
      error:
        "Mixed business/private use requires a short explanation (e.g. 'phone, ~70% business calls').",
    };
  }

  const treatments = lines.map((l) => codeById.get(l.vatCodeId)!.treatment as string);
  const selfAssessed = treatments.some((t) =>
    ["REVERSE_CHARGE_PURCHASE", "EU_ACQUISITION", "EU_SERVICE", "IMPORT"].includes(t),
  );
  const foreign = d.supplierCountry.toUpperCase() !== "NL";
  const foreignCurrency = d.currency.toUpperCase() !== "EUR";
  const needsTaxReview =
    selfAssessed || treatments.includes("FOREIGN_VAT") || treatments.includes("UNKNOWN") || (foreign && !selfAssessed);

  if (foreignCurrency && !d.exchangeRate?.trim()) {
    return {
      ok: false,
      error: "Foreign-currency expenses need the exchange rate used for the EUR amounts.",
    };
  }

  let journal;
  try {
    journal = buildExpenseJournal({
      items: lines.map((l) => ({
        description: l.description,
        netCents: l.netCents,
        vatCents: l.vatCents,
        vatCodeId: l.vatCodeId,
        treatment: codeById.get(l.vatCodeId)!.treatment,
        expenseAccountKey: d.asAsset
          ? ACCOUNTS.FIXED_ASSETS
          : (category.ledgerAccount?.systemKey ?? category.ledgerAccountId ?? ACCOUNTS.OPERATING_EXPENSES),
      })),
      paidFrom: d.paidFrom,
      businessUseBp,
      vatRecoveryBp,
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not build journal" };
  }

  const netTotal = sumCents(lines.map((l) => l.netCents));
  const vatTotal = sumCents(lines.map((l) => l.vatCents));

  const warnings = validateInvoice({
    direction: "RECEIVED",
    supplierName: d.supplierName,
    supplierAddress: null,
    supplierCountry: d.supplierCountry,
    supplierVatId: d.supplierVatId || null,
    invoiceNumber: d.invoiceNumber || null,
    invoiceDate: d.invoiceDate,
    description: d.description,
    currency: d.currency,
    bookkeepingCurrency: "EUR",
    lines: lines.map((l) => ({
      netCents: l.netCents,
      vatCents: l.vatCents,
      ratePermille: codeById.get(l.vatCodeId)!.ratePermille,
    })),
    treatment: treatments[0] ?? null,
    kvkRegisteredOn: business.kvkRegisteredOn?.toISOString().slice(0, 10) ?? null,
    knownInvoiceNumbers: d.invoiceNumber
      ? (
          await prisma.transaction.findMany({
            where: {
              businessId: business.id,
              contactId: supplier.id,
              invoiceNumber: { not: null },
              status: { notIn: ["VOID"] },
            },
            select: { invoiceNumber: true },
          })
        ).map((t) => t.invoiceNumber!)
      : [],
  });

  const isPaid = d.paidFrom !== "NOT_PAID";
  const status = d.confirmNow && !needsTaxReview && !d.isPreRegistration ? "CONFIRMED" : "NEEDS_REVIEW";

  try {
    const id = await createTransaction(
      { ...(await auditContext(business.id)), businessId: business.id, actorUserId: user.id },
      {
        type: "BUSINESS_EXPENSE",
        status,
        reviewFlag: needsTaxReview ? "NEEDS_TAX_REVIEW" : "NONE",
        date: d.invoiceDate,
        description: d.description,
        notes: d.notes || null,
        contactId: supplier.id,
        categoryId: category.id,
        currency: d.currency.toUpperCase(),
        originalAmountCents: d.originalTotal ? parseAmountToCents(d.originalTotal) : null,
        exchangeRate: d.exchangeRate || null,
        exchangeRateSource: d.exchangeRateSource || null,
        exchangeRateNote: d.exchangeRateNote || null,
        amountCents: netTotal + vatTotal,
        vatAmountCents: vatTotal,
        invoiceNumber: d.invoiceNumber || null,
        invoiceDate: d.invoiceDate,
        paymentDate: d.paymentDate || null,
        paymentMethod: d.paymentMethod || null,
        isPaid,
        paidPersonally: d.paidFrom === "PERSONAL",
        isPreRegistration: d.isPreRegistration,
        isMixedUse: mixedUse,
        businessUseBp,
        vatRecoveryBp,
        itDeductibleBp,
        mixedUseNote: d.mixedUseNote || null,
        businessPurpose: d.businessPurpose || null,
        supplierCountry: d.supplierCountry.toUpperCase(),
        supplierVatId: d.supplierVatId || null,
        isReverseCharge: d.isReverseCharge || selfAssessed,
      },
      journal,
      d.documentIds,
    );
    return { ok: true, warnings, transactionId: id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save the expense." };
  }
}

/** Data the expense form needs (categories + VAT codes). */
export async function expenseFormData() {
  const { business } = await requireBusiness();
  const [categories, vatCodes, settings] = await Promise.all([
    prisma.category.findMany({
      where: { businessId: business.id, kind: "EXPENSE", deletedAt: null },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, suggestAsset: true, defaultVatCodeId: true },
    }),
    prisma.vATCode.findMany({
      where: { businessId: business.id, validTo: null },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true, ratePermille: true, treatment: true },
    }),
    Promise.resolve(business.settings),
  ]);
  return {
    categories,
    vatCodes,
    assetThresholdCents: settings?.assetThresholdCents ?? 45000,
    kvkRegisteredOn: business.kvkRegisteredOn?.toISOString().slice(0, 10) ?? null,
  };
}

export async function redirectToTransaction(id: string): Promise<never> {
  redirect(`/transactions/${id}`);
}
