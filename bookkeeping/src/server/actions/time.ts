"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/server/db";
import { requireBusiness } from "@/lib/server/context";
import type { ActionResult } from "./auth";

const entrySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hours: z.coerce.number().min(0).max(24),
  minutes: z.coerce.number().min(0).max(59).default(0),
  projectName: z.string().max(120).optional().or(z.literal("")),
  activityType: z.string().max(60).optional().or(z.literal("")),
  description: z.string().max(500).optional().or(z.literal("")),
  evidenceNote: z.string().max(500).optional().or(z.literal("")),
});

export async function createTimeEntryAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { business, user } = await requireBusiness();
  const parsed = entrySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `${issue?.path.join(".")}: ${issue?.message}` };
  }
  const d = parsed.data;
  const totalMinutes = Math.round(d.hours * 60) + d.minutes;
  if (totalMinutes <= 0) return { ok: false, error: "Enter a duration." };

  let projectId: string | null = null;
  if (d.projectName) {
    const project =
      (await prisma.project.findFirst({
        where: { businessId: business.id, name: d.projectName },
      })) ??
      (await prisma.project.create({
        data: { businessId: business.id, name: d.projectName },
      }));
    projectId = project.id;
  }

  await prisma.timeEntry.create({
    data: {
      businessId: business.id,
      userId: user.id,
      projectId,
      date: new Date(`${d.date}T00:00:00Z`),
      minutes: totalMinutes,
      activityType: d.activityType || null,
      description: d.description || null,
      evidenceNote: d.evidenceNote || null,
    },
  });
  revalidatePath("/time");
  return { ok: true };
}

export async function deleteTimeEntryAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { business } = await requireBusiness();
  const id = String(formData.get("entryId") ?? "");
  const entry = await prisma.timeEntry.findFirst({ where: { id, businessId: business.id } });
  if (!entry) return { ok: false, error: "Not found" };
  await prisma.timeEntry.update({ where: { id }, data: { deletedAt: new Date() } });
  revalidatePath("/time");
  return { ok: true };
}
