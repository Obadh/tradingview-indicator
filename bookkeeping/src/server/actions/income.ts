"use server";

import { prisma } from "@/lib/server/db";
import { requireBusiness, auditContext } from "@/lib/server/context";
import { createTransaction } from "@/lib/server/transactions";
import { buildIncomeJournal } from "@/lib/domain/journal";
import { parseAmountToCents, sumCents } from "@/lib/domain/money";
import { incomeSchema } from "@/lib/validation/money-flows";
import type { ExpenseActionResult } from "./expenses";

/**
 * Record income: a client invoice, a platform payout (App Store, Google
 * Play, ad network...), subscription revenue, etc. Platform payouts may
 * span multiple lines with different VAT treatments/countries; the payout
 * fee is booked as platform fees so gross revenue stays visible.
 * Transfers between the user's own accounts are NOT income — the form links
 * to the owner-transfer flow for that.
 */
export async function createIncomeAction(payload: unknown): Promise<ExpenseActionResult> {
  const { business, user } = await requireBusiness();
  const parsed = incomeSchema.safeParse(payload);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `${issue?.path.join(".")}: ${issue?.message}` };
  }
  const d = parsed.data;

  let lines;
  let feeCents = 0;
  try {
    lines = d.lines.map((l) => ({
      description: l.description,
      netCents: parseAmountToCents(l.net),
      vatCents: parseAmountToCents(l.vat),
      vatCodeId: l.vatCodeId,
    }));
    feeCents = d.platformFee ? parseAmountToCents(d.platformFee) : 0;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invalid amount" };
  }

  const vatCodes = await prisma.vATCode.findMany({
    where: { businessId: business.id, id: { in: lines.map((l) => l.vatCodeId) } },
  });
  const codeById = new Map(vatCodes.map((c) => [c.id, c]));
  for (const l of lines) {
    if (!codeById.has(l.vatCodeId)) return { ok: false, error: "Unknown VAT treatment selected." };
  }

  const category = await prisma.category.findFirst({
    where: { id: d.categoryId, businessId: business.id, kind: "INCOME" },
  });
  if (!category) return { ok: false, error: "Unknown category." };

  const existingPayer = await prisma.contact.findFirst({
    where: { businessId: business.id, name: d.payerName, deletedAt: null },
  });
  const payer =
    existingPayer ??
    (await prisma.contact.create({
      data: {
        businessId: business.id,
        kind: d.customerType === "PLATFORM" ? "PLATFORM" : "CUSTOMER",
        name: d.payerName,
        country: d.country.toUpperCase(),
      },
    }));

  const foreignCurrency = d.currency.toUpperCase() !== "EUR";
  if (foreignCurrency && !d.exchangeRate?.trim()) {
    return { ok: false, error: "Foreign-currency income needs the exchange rate used." };
  }
  const treatments = lines.map((l) => codeById.get(l.vatCodeId)!.treatment as string);
  const needsTaxReview =
    treatments.includes("UNKNOWN") ||
    treatments.includes("FOREIGN_VAT") ||
    (d.country.toUpperCase() !== "NL" && d.customerType !== "PLATFORM" && treatments.some((t) => t.startsWith("DOMESTIC")));

  let journal;
  try {
    journal = buildIncomeJournal({
      items: lines,
      feeCents,
      receivedInto: d.receivedInto,
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not build journal" };
  }

  const netTotal = sumCents(lines.map((l) => l.netCents));
  const vatTotal = sumCents(lines.map((l) => l.vatCents));
  const status = d.confirmNow && !needsTaxReview ? "CONFIRMED" : "NEEDS_REVIEW";

  try {
    const id = await createTransaction(
      { ...(await auditContext(business.id)), businessId: business.id, actorUserId: user.id },
      {
        type: "BUSINESS_INCOME",
        status,
        reviewFlag: needsTaxReview ? "NEEDS_TAX_REVIEW" : "NONE",
        date: d.invoiceDate,
        description: d.description,
        notes: [d.servicePeriod && `Service period: ${d.servicePeriod}`, d.notes]
          .filter(Boolean)
          .join("\n") || null,
        contactId: payer.id,
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
        isPaid: d.receivedInto !== "NOT_RECEIVED",
        customerType: d.customerType,
        supplierCountry: d.country.toUpperCase(),
        paymentReference: d.paymentReference || null,
      },
      journal,
      d.documentIds,
    );
    return { ok: true, transactionId: id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save the income." };
  }
}
