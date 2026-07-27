"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/server/db";
import { requireBusiness, auditContext } from "@/lib/server/context";
import { audit } from "@/lib/server/audit";
import { parseAmountToCents, mulDiv } from "@/lib/domain/money";
import { isoDateToUtc, todayAmsterdam } from "@/lib/domain/dates";
import { renderInvoicePdf } from "@/lib/server/invoice-pdf";
import { sha256Hex } from "@/lib/server/crypto";
import { storage, documentStorageKey } from "@/lib/server/storage";
import { createTransaction } from "@/lib/server/transactions";
import { buildIncomeJournal } from "@/lib/domain/journal";
import type { ActionResult } from "./auth";

const draftSchema = z.object({
  invoiceId: z.string().uuid().optional(),
  contactName: z.string().min(1, "Enter the customer name").max(200),
  contactAddress: z.string().max(200).optional().or(z.literal("")),
  contactPostalCode: z.string().max(10).optional().or(z.literal("")),
  contactCity: z.string().max(100).optional().or(z.literal("")),
  contactCountry: z.string().length(2).default("NL"),
  contactVatId: z.string().max(30).optional().or(z.literal("")),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  supplyDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  paymentTermDays: z.coerce.number().int().min(0).max(365).default(30),
  reverseCharge: z.coerce.boolean().default(false),
  notes: z.string().max(2000).optional().or(z.literal("")),
  lines: z
    .array(
      z.object({
        description: z.string().min(1).max(300),
        quantity: z.string().min(1).max(15),
        unitPrice: z.string().min(1).max(20),
        vatCodeId: z.string().uuid(),
      }),
    )
    .min(1, "Add at least one line"),
});

export interface InvoiceActionResult extends ActionResult {
  invoiceId?: string;
}

export async function saveInvoiceDraftAction(payload: unknown): Promise<InvoiceActionResult> {
  const { business } = await requireBusiness();
  const parsed = draftSchema.safeParse(payload);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `${issue?.path.join(".")}: ${issue?.message}` };
  }
  const d = parsed.data;

  const vatCodes = await prisma.vATCode.findMany({
    where: { businessId: business.id, id: { in: d.lines.map((l) => l.vatCodeId) } },
  });
  const codeById = new Map(vatCodes.map((c) => [c.id, c]));

  let computed;
  try {
    computed = d.lines.map((l) => {
      const code = codeById.get(l.vatCodeId);
      if (!code) throw new Error("Unknown VAT code");
      const unitPriceExVatCents = parseAmountToCents(l.unitPrice);
      const qtyThousandths = Math.round(Number(l.quantity.replace(",", ".")) * 1000);
      if (!Number.isFinite(qtyThousandths) || qtyThousandths <= 0) {
        throw new Error(`Invalid quantity: ${l.quantity}`);
      }
      const lineExVatCents = mulDiv(unitPriceExVatCents, qtyThousandths, 1000);
      const lineVatCents = mulDiv(lineExVatCents, code.ratePermille, 1000);
      return {
        description: l.description,
        quantity: (qtyThousandths / 1000).toString(),
        unitPriceExVatCents,
        vatCodeId: l.vatCodeId,
        vatRatePermille: code.ratePermille,
        lineExVatCents,
        lineVatCents,
      };
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invalid line amounts" };
  }

  const totalExVatCents = computed.reduce((s, l) => s + l.lineExVatCents, 0);
  const totalVatCents = computed.reduce((s, l) => s + l.lineVatCents, 0);

  const existingContact = await prisma.contact.findFirst({
    where: { businessId: business.id, name: d.contactName, deletedAt: null },
  });
  const contact = existingContact
    ? await prisma.contact.update({
        where: { id: existingContact.id },
        data: {
          addressLine1: d.contactAddress || existingContact.addressLine1,
          postalCode: d.contactPostalCode || existingContact.postalCode,
          city: d.contactCity || existingContact.city,
          country: d.contactCountry.toUpperCase(),
          vatId: d.contactVatId || existingContact.vatId,
        },
      })
    : await prisma.contact.create({
        data: {
          businessId: business.id,
          kind: "CUSTOMER",
          name: d.contactName,
          addressLine1: d.contactAddress || null,
          postalCode: d.contactPostalCode || null,
          city: d.contactCity || null,
          country: d.contactCountry.toUpperCase(),
          vatId: d.contactVatId || null,
        },
      });

  const reverseChargeWording = d.reverseCharge
    ? "Btw verlegd / VAT reverse charged (art. 196 EU VAT Directive)"
    : null;

  const data = {
    contactId: contact.id,
    issueDate: isoDateToUtc(d.issueDate),
    supplyDate: d.supplyDate ? isoDateToUtc(d.supplyDate) : null,
    dueDate: isoDateToUtc(d.issueDate),
    paymentTermDays: d.paymentTermDays,
    reverseChargeWording,
    notes: d.notes || null,
    totalExVatCents,
    totalVatCents,
    totalIncVatCents: totalExVatCents + totalVatCents,
  };
  // Due date = issue date + term.
  data.dueDate = new Date(data.issueDate.getTime() + d.paymentTermDays * 86_400_000);

  let invoiceId: string;
  if (d.invoiceId) {
    const existing = await prisma.invoice.findFirst({
      where: { id: d.invoiceId, businessId: business.id },
    });
    if (!existing) return { ok: false, error: "Invoice not found." };
    if (existing.status !== "DRAFT") {
      return {
        ok: false,
        error:
          "Finalized invoices cannot be edited. Create a credit note to correct it — that keeps the numbering intact.",
      };
    }
    await prisma.$transaction([
      prisma.invoiceLine.deleteMany({ where: { invoiceId: existing.id } }),
      prisma.invoice.update({
        where: { id: existing.id },
        data: { ...data, lines: { create: computed } },
      }),
    ]);
    invoiceId = existing.id;
  } else {
    const created = await prisma.invoice.create({
      data: {
        businessId: business.id,
        kind: "INVOICE",
        status: "DRAFT",
        ...data,
        lines: { create: computed },
      },
    });
    invoiceId = created.id;
  }

  await audit(await auditContext(business.id), {
    action: d.invoiceId ? "update" : "create",
    entityType: "Invoice",
    entityId: invoiceId,
    newValues: { totalExVatCents, totalVatCents, contact: contact.name, status: "DRAFT" },
  });
  revalidatePath("/invoices");
  return { ok: true, invoiceId };
}

/**
 * Finalize: assigns the next sequential number (per prefix+year, no gaps,
 * unique constraint enforced), snapshots business + customer details,
 * renders the PDF once, stores it as an immutable document, and books the
 * balanced revenue journal (Dr accounts receivable / Cr revenue + VAT).
 */
export async function finalizeInvoiceAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { business, user } = await requireBusiness();
  const invoiceId = String(formData.get("invoiceId") ?? "");
  if (!invoiceId) return { ok: false, error: "Missing invoice." };

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, businessId: business.id },
    include: { lines: { orderBy: { sortOrder: "asc" } }, contact: true },
  });
  if (!invoice) return { ok: false, error: "Invoice not found." };
  if (invoice.status !== "DRAFT") return { ok: false, error: "Already finalized." };
  if (invoice.lines.length === 0) return { ok: false, error: "Add at least one line first." };
  if (invoice.reverseChargeWording && !invoice.contact.vatId) {
    return {
      ok: false,
      error: "Reverse-charged invoices require the customer's VAT ID. Add it to the invoice first.",
    };
  }

  const settings = business.settings!;
  const issueDate = invoice.issueDate ?? isoDateToUtc(todayAmsterdam());
  const year = issueDate.getUTCFullYear();
  const prefix = settings.invoicePrefix;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Atomic sequential numbering: upsert + increment inside the tx.
      const seq = await tx.invoiceSequence.upsert({
        where: { businessId_prefix_year: { businessId: business.id, prefix, year } },
        update: { nextNumber: { increment: 1 } },
        create: { businessId: business.id, prefix, year, nextNumber: 2 },
      });
      const seqNo = seq.nextNumber - 1;
      const number = `${prefix}-${year}-${String(seqNo).padStart(4, "0")}`;

      const updated = await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          number,
          prefix,
          status: "FINALIZED",
          finalizedAt: new Date(),
          issueDate,
          businessSnapshot: {
            legalName: business.legalName,
            tradeName: business.tradeName,
            kvkNumber: business.kvkNumber,
            vatId: business.vatId,
            addressLine1: business.addressLine1,
            postalCode: business.postalCode,
            city: business.city,
            iban: business.iban,
            email: business.email,
            phone: business.phone,
          },
          customerSnapshot: {
            name: invoice.contact.name,
            addressLine1: invoice.contact.addressLine1,
            postalCode: invoice.contact.postalCode,
            city: invoice.contact.city,
            country: invoice.contact.country,
            vatId: invoice.contact.vatId,
          },
        },
      });
      return { number, issueDate, updated };
    });

    // Render + store the PDF (outside the DB tx; failures leave a finalized
    // invoice without PDF which can be re-rendered via the download route).
    const creditsInvoice = invoice.creditsInvoiceId
      ? await prisma.invoice.findFirst({
          where: { id: invoice.creditsInvoiceId },
          select: { number: true },
        })
      : null;
    const pdf = await renderInvoicePdf({
      kind: invoice.kind as "INVOICE" | "CREDIT_NOTE",
      creditsInvoiceNumber: creditsInvoice?.number ?? null,
      number: result.number,
      issueDate: result.issueDate.toISOString().slice(0, 10),
      supplyDate: invoice.supplyDate?.toISOString().slice(0, 10) ?? null,
      dueDate: invoice.dueDate?.toISOString().slice(0, 10) ?? null,
      business: {
        legalName: business.legalName,
        tradeName: business.tradeName,
        addressLine1: business.addressLine1,
        postalCode: business.postalCode,
        city: business.city,
        country: business.country,
        kvkNumber: business.kvkNumber,
        vatId: business.vatId,
        iban: business.iban,
        email: business.email,
        phone: business.phone,
      },
      customer: {
        name: invoice.contact.name,
        addressLine1: invoice.contact.addressLine1,
        postalCode: invoice.contact.postalCode,
        city: invoice.contact.city,
        country: invoice.contact.country,
        vatId: invoice.contact.vatId,
      },
      lines: invoice.lines.map((l) => ({
        description: l.description,
        quantity: l.quantity.toString(),
        unitPriceExVatCents: l.unitPriceExVatCents,
        vatRatePermille: l.vatRatePermille,
        lineExVatCents: l.lineExVatCents,
        lineVatCents: l.lineVatCents,
      })),
      totalExVatCents: invoice.totalExVatCents,
      totalVatCents: invoice.totalVatCents,
      totalIncVatCents: invoice.totalIncVatCents,
      currency: invoice.currency,
      paymentTermDays: invoice.paymentTermDays,
      paymentInstructions: invoice.paymentInstructions,
      reverseChargeWording: invoice.reverseChargeWording,
      notes: invoice.notes,
    });
    const sha256 = sha256Hex(pdf);
    const doc = await prisma.document.create({
      data: {
        businessId: business.id,
        category: "SALES_INVOICE",
        status: "CONFIRMED",
        originalFilename: `${result.number}.pdf`,
        mimeType: "application/pdf",
        sizeBytes: pdf.length,
        sha256,
        storageKey: "pending",
        uploadedById: user.id,
        title: `Sales invoice ${result.number}`,
        documentDate: result.issueDate,
      },
    });
    const key = documentStorageKey(business.id, doc.id, 1);
    await prisma.document.update({ where: { id: doc.id }, data: { storageKey: key } });
    await prisma.documentVersion.create({
      data: {
        documentId: doc.id,
        version: 1,
        storageKey: key,
        mimeType: "application/pdf",
        sizeBytes: pdf.length,
        sha256,
        note: "finalized invoice PDF",
      },
    });
    await storage().put(key, pdf, "application/pdf");

    // Revenue journal: receivable now, payment reconciles later. A credit
    // note books the exact reversal (Dr revenue + VAT, Cr receivable).
    const isCredit = invoice.kind === "CREDIT_NOTE";
    const journal = isCredit
      ? [
          ...invoice.lines.flatMap((l, i) => [
            {
              accountKey: "revenue",
              description: l.description,
              debitCents: Math.abs(l.lineExVatCents),
              creditCents: 0,
              vatCodeId: l.vatCodeId,
              vatBaseCents: l.lineExVatCents,
              sortOrder: i * 2,
            },
            ...(l.lineVatCents !== 0
              ? [
                  {
                    accountKey: "output_vat",
                    description: `VAT (${l.description})`,
                    debitCents: Math.abs(l.lineVatCents),
                    creditCents: 0,
                    vatCodeId: l.vatCodeId,
                    vatBaseCents: l.lineExVatCents,
                    sortOrder: i * 2 + 1,
                  },
                ]
              : []),
          ]),
          {
            accountKey: "accounts_receivable",
            description: "Credit to customer",
            debitCents: 0,
            creditCents: Math.abs(invoice.totalIncVatCents),
            sortOrder: 999,
          },
        ]
      : buildIncomeJournal({
          items: invoice.lines.map((l) => ({
            description: l.description,
            netCents: l.lineExVatCents,
            vatCents: l.lineVatCents,
            vatCodeId: l.vatCodeId,
          })),
          receivedInto: "NOT_RECEIVED",
        });
    const transactionId = await createTransaction(
      { ...(await auditContext(business.id)), businessId: business.id, actorUserId: user.id },
      {
        type: isCredit ? "REFUND_PAID" : "BUSINESS_INCOME",
        status: "CONFIRMED",
        date: result.issueDate.toISOString().slice(0, 10),
        description: `${isCredit ? "Credit note" : "Sales invoice"} ${result.number} — ${invoice.contact.name}`,
        contactId: invoice.contactId,
        amountCents: Math.abs(invoice.totalIncVatCents),
        vatAmountCents: Math.abs(invoice.totalVatCents),
        invoiceNumber: result.number,
        invoiceDate: result.issueDate.toISOString().slice(0, 10),
        dueDate: invoice.dueDate?.toISOString().slice(0, 10) ?? null,
        customerType: "BUSINESS",
      },
      journal,
      [doc.id],
    );

    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { pdfDocumentId: doc.id, transactionId },
    });
    await prisma.documentLink.create({ data: { documentId: doc.id, invoiceId: invoice.id } });
    await audit({ ...(await auditContext(business.id)), actorUserId: user.id }, {
      action: "finalize",
      entityType: "Invoice",
      entityId: invoice.id,
      newValues: { number: result.number, totalIncVatCents: invoice.totalIncVatCents },
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Finalization failed." };
  }

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  return { ok: true };
}

/**
 * Credit note: a new draft that mirrors the original with negated totals is
 * intentionally NOT what we create — Dutch practice is a credit note with
 * positive amounts marked as credit. We store negative line amounts booked
 * against revenue on finalization via the CREDIT_NOTE kind.
 */
export async function createCreditNoteAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<InvoiceActionResult> {
  const { business } = await requireBusiness();
  const invoiceId = String(formData.get("invoiceId") ?? "");
  const original = await prisma.invoice.findFirst({
    where: { id: invoiceId, businessId: business.id },
    include: { lines: true },
  });
  if (!original) return { ok: false, error: "Invoice not found." };
  if (!["FINALIZED", "SENT", "PAID", "PARTIALLY_PAID", "OVERDUE"].includes(original.status)) {
    return { ok: false, error: "Only finalized invoices can be credited." };
  }

  const credit = await prisma.invoice.create({
    data: {
      businessId: business.id,
      kind: "CREDIT_NOTE",
      status: "DRAFT",
      contactId: original.contactId,
      creditsInvoiceId: original.id,
      issueDate: isoDateToUtc(todayAmsterdam()),
      paymentTermDays: original.paymentTermDays,
      reverseChargeWording: original.reverseChargeWording,
      notes: `Credit note for invoice ${original.number}`,
      totalExVatCents: -original.totalExVatCents,
      totalVatCents: -original.totalVatCents,
      totalIncVatCents: -original.totalIncVatCents,
      lines: {
        create: original.lines.map((l, i) => ({
          description: `Credit: ${l.description}`,
          quantity: l.quantity,
          unitPriceExVatCents: -l.unitPriceExVatCents,
          vatCodeId: l.vatCodeId,
          vatRatePermille: l.vatRatePermille,
          lineExVatCents: -l.lineExVatCents,
          lineVatCents: -l.lineVatCents,
          sortOrder: i,
        })),
      },
    },
  });
  await prisma.invoice.update({ where: { id: original.id }, data: { status: "CREDITED" } });
  await audit(await auditContext(business.id), {
    action: "create",
    entityType: "Invoice",
    entityId: credit.id,
    newValues: { kind: "CREDIT_NOTE", credits: original.number },
    reason: "Correction of a finalized invoice via credit note",
  });
  revalidatePath("/invoices");
  return { ok: true, invoiceId: credit.id };
}

/**
 * Finalizing a credit note books the reversing journal. Reuses the same
 * numbering sequence so all outgoing documents stay sequential.
 */
export async function finalizeCreditNoteAction(
  prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  // Credit notes go through the same finalize path; the journal builder
  // handles negative revenue via a dedicated reversal journal below.
  return finalizeInvoiceAction(prev, formData);
}
