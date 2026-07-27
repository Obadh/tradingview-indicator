"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/server/db";
import { requireBusiness, auditContext } from "@/lib/server/context";
import { audit } from "@/lib/server/audit";
import { isoDateToUtc } from "@/lib/domain/dates";
import type { ActionResult } from "./auth";

const updateSchema = z.object({
  documentId: z.string().uuid(),
  category: z.enum([
    "PURCHASE_INVOICE",
    "SALES_INVOICE",
    "RECEIPT",
    "BANK_STATEMENT",
    "KVK_DOCUMENT",
    "BELASTINGDIENST_LETTER",
    "CONTRACT",
    "SUBSCRIPTION_INVOICE",
    "APP_STORE_STATEMENT",
    "PAYMENT_PROVIDER_STATEMENT",
    "OTHER",
  ]),
  title: z.string().max(200).optional().or(z.literal("")),
  documentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  notes: z.string().max(2000).optional().or(z.literal("")),
  status: z.enum(["NEEDS_REVIEW", "CONFIRMED", "ARCHIVED"]),
});

export async function updateDocumentAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { business } = await requireBusiness();
  const parsed = updateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;

  const existing = await prisma.document.findFirst({
    where: { id: d.documentId, businessId: business.id, deletedAt: null },
  });
  if (!existing) return { ok: false, error: "Document not found." };

  const newValues = {
    category: d.category,
    title: d.title || null,
    documentDate: d.documentDate || null,
    notes: d.notes || null,
    status: d.status,
  };
  await prisma.document.update({
    where: { id: existing.id },
    data: {
      category: d.category,
      title: d.title || null,
      documentDate: d.documentDate ? isoDateToUtc(d.documentDate) : null,
      notes: d.notes || null,
      status: d.status,
      archivedAt: d.status === "ARCHIVED" ? new Date() : null,
    },
  });
  await audit(await auditContext(business.id), {
    action: "update",
    entityType: "Document",
    entityId: existing.id,
    oldValues: {
      category: existing.category,
      title: existing.title,
      documentDate: existing.documentDate?.toISOString().slice(0, 10) ?? null,
      notes: existing.notes,
      status: existing.status,
    },
    newValues,
  });
  revalidatePath(`/documents/${existing.id}`);
  revalidatePath("/documents");
  return { ok: true };
}

const linkSchema = z.object({
  documentId: z.string().uuid(),
  transactionId: z.string().uuid(),
});

export async function linkDocumentToTransactionAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { business } = await requireBusiness();
  const parsed = linkSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" };

  const [doc, txn] = await Promise.all([
    prisma.document.findFirst({
      where: { id: parsed.data.documentId, businessId: business.id, deletedAt: null },
    }),
    prisma.transaction.findFirst({
      where: { id: parsed.data.transactionId, businessId: business.id },
    }),
  ]);
  if (!doc || !txn) return { ok: false, error: "Record not found." };

  const already = await prisma.documentLink.findFirst({
    where: { documentId: doc.id, transactionId: txn.id },
  });
  if (already) return { ok: false, error: "Already attached." };

  await prisma.documentLink.create({
    data: { documentId: doc.id, transactionId: txn.id },
  });
  await audit(await auditContext(business.id), {
    action: "update",
    entityType: "Document",
    entityId: doc.id,
    newValues: { linkedTransactionId: txn.id },
    reason: "Document attached to transaction",
  });
  revalidatePath(`/documents/${doc.id}`);
  revalidatePath(`/transactions/${txn.id}`);
  return { ok: true };
}
