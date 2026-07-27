"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireBusiness, auditContext } from "@/lib/server/context";
import { prisma } from "@/lib/server/db";
import { transitionTransaction, createCorrection } from "@/lib/server/transactions";
import type { ActionResult } from "./auth";

const transitionSchema = z.object({
  transactionId: z.string().uuid(),
  toStatus: z.enum(["CONFIRMED", "NEEDS_REVIEW", "VOID", "RECONCILED"]),
  reason: z.string().max(500).optional().or(z.literal("")),
});

export async function transitionTransactionAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { business, user } = await requireBusiness();
  const parsed = transitionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  try {
    await transitionTransaction(
      { ...(await auditContext(business.id)), businessId: business.id, actorUserId: user.id },
      parsed.data.transactionId,
      parsed.data.toStatus,
      parsed.data.reason || null,
    );
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not change status." };
  }
  revalidatePath(`/transactions/${parsed.data.transactionId}`);
  revalidatePath("/transactions");
  revalidatePath("/review");
  return { ok: true };
}

const flagSchema = z.object({
  transactionId: z.string().uuid(),
  reviewFlag: z.enum(["NONE", "NEEDS_TAX_REVIEW", "NEEDS_ADVICE"]),
});

export async function setReviewFlagAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { business } = await requireBusiness();
  const parsed = flagSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  const existing = await prisma.transaction.findFirst({
    where: { id: parsed.data.transactionId, businessId: business.id },
  });
  if (!existing) return { ok: false, error: "Not found" };
  await prisma.transaction.update({
    where: { id: existing.id },
    data: { reviewFlag: parsed.data.reviewFlag },
  });
  const { audit } = await import("@/lib/server/audit");
  await audit(await auditContext(business.id), {
    action: "update",
    entityType: "Transaction",
    entityId: existing.id,
    oldValues: { reviewFlag: existing.reviewFlag },
    newValues: { reviewFlag: parsed.data.reviewFlag },
  });
  revalidatePath(`/transactions/${existing.id}`);
  revalidatePath("/review");
  return { ok: true };
}

const correctionSchema = z.object({
  transactionId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().min(3, "Explain why this correction is needed").max(500),
});

/**
 * Full reversal correction for a record in a locked period: books the exact
 * opposite journal on the given (open-period) date. The user then records
 * the corrected version as a new transaction.
 */
export async function reverseTransactionAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { business, user } = await requireBusiness();
  const parsed = correctionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const original = await prisma.transaction.findFirst({
    where: { id: parsed.data.transactionId, businessId: business.id },
    include: { lines: true },
  });
  if (!original) return { ok: false, error: "Not found" };

  try {
    const correctionId = await createCorrection(
      { ...(await auditContext(business.id)), businessId: business.id, actorUserId: user.id },
      original.id,
      parsed.data.date,
      original.lines.map((l, i) => ({
        accountKey: l.ledgerAccountId,
        description: `Reversal: ${l.description ?? original.description}`,
        debitCents: l.creditCents,
        creditCents: l.debitCents,
        vatCodeId: l.vatCodeId,
        vatBaseCents: l.vatBaseCents === null ? null : -l.vatBaseCents,
        sortOrder: i,
      })),
      `Correction (reversal) of: ${original.description}`,
      parsed.data.reason,
    );
    revalidatePath("/transactions");
    return { ok: true, ...( { transactionId: correctionId } as object) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not create correction." };
  }
}
