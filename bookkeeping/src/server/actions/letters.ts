"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/server/db";
import { requireBusiness, auditContext } from "@/lib/server/context";
import { audit } from "@/lib/server/audit";
import { isoDateToUtc } from "@/lib/domain/dates";
import type { ActionResult } from "./auth";

const letterSchema = z.object({
  letterId: z.string().uuid().optional().or(z.literal("")),
  sender: z.string().min(1).max(120),
  letterDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  referenceNumber: z.string().max(60).optional().or(z.literal("")),
  taxType: z.string().max(60).optional().or(z.literal("")),
  period: z.string().max(60).optional().or(z.literal("")),
  responseDeadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  actionRequired: z.coerce.boolean().default(false),
  status: z.enum(["NEW", "ACTION_REQUIRED", "IN_PROGRESS", "DONE", "ARCHIVED"]).default("NEW"),
  notes: z.string().max(2000).optional().or(z.literal("")),
  documentId: z.string().uuid().optional().or(z.literal("")),
});

export async function saveLetterAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { business } = await requireBusiness();
  const parsed = letterSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `${issue?.path.join(".")}: ${issue?.message}` };
  }
  const d = parsed.data;

  if (d.documentId) {
    const doc = await prisma.document.findFirst({
      where: { id: d.documentId, businessId: business.id, deletedAt: null },
    });
    if (!doc) return { ok: false, error: "Unknown document." };
  }

  const data = {
    sender: d.sender,
    letterDate: d.letterDate ? isoDateToUtc(d.letterDate) : null,
    referenceNumber: d.referenceNumber || null,
    taxType: d.taxType || null,
    period: d.period || null,
    responseDeadline: d.responseDeadline ? isoDateToUtc(d.responseDeadline) : null,
    actionRequired: d.actionRequired,
    status: d.status,
    notes: d.notes || null,
    documentId: d.documentId || null,
  };

  let letterId: string;
  if (d.letterId) {
    const existing = await prisma.officialLetter.findFirst({
      where: { id: d.letterId, businessId: business.id },
    });
    if (!existing) return { ok: false, error: "Letter not found." };
    await prisma.officialLetter.update({ where: { id: existing.id }, data });
    letterId = existing.id;
  } else {
    const created = await prisma.officialLetter.create({
      data: { businessId: business.id, ...data },
    });
    letterId = created.id;
  }

  // Reminder based on the manually confirmed deadline (never guessed).
  if (d.responseDeadline && d.actionRequired) {
    const existing = await prisma.reminder.findFirst({
      where: { businessId: business.id, letterId, status: "OPEN" },
    });
    if (!existing) {
      await prisma.reminder.create({
        data: {
          businessId: business.id,
          kind: "LETTER_DEADLINE",
          title: `Respond to ${d.sender} letter${d.referenceNumber ? ` (${d.referenceNumber})` : ""}`,
          dueDate: isoDateToUtc(d.responseDeadline),
          letterId,
        },
      });
    }
  }

  await audit(await auditContext(business.id), {
    action: d.letterId ? "update" : "create",
    entityType: "OfficialLetter",
    entityId: letterId,
    newValues: data,
  });
  revalidatePath("/letters");
  return { ok: true };
}
