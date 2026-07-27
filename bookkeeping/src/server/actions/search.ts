"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/server/db";
import { requireBusiness } from "@/lib/server/context";
import type { ActionResult } from "./auth";

const saveSchema = z.object({
  name: z.string().min(1, "Give the filter a name").max(60),
  criteria: z.string().max(2000),
});

export async function saveFilterAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { business, user } = await requireBusiness();
  const parsed = saveSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" };
  let criteria: unknown;
  try {
    criteria = JSON.parse(parsed.data.criteria);
  } catch {
    return { ok: false, error: "Invalid filter data" };
  }
  await prisma.savedFilter.upsert({
    where: {
      businessId_userId_name: {
        businessId: business.id,
        userId: user.id,
        name: parsed.data.name,
      },
    },
    update: { criteria: criteria as object, deletedAt: null },
    create: {
      businessId: business.id,
      userId: user.id,
      name: parsed.data.name,
      criteria: criteria as object,
    },
  });
  revalidatePath("/search");
  return { ok: true };
}

export async function deleteFilterAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { business, user } = await requireBusiness();
  const id = String(formData.get("filterId") ?? "");
  const filter = await prisma.savedFilter.findFirst({
    where: { id, businessId: business.id, userId: user.id },
  });
  if (!filter) return { ok: false, error: "Not found" };
  await prisma.savedFilter.update({ where: { id }, data: { deletedAt: new Date() } });
  revalidatePath("/search");
  return { ok: true };
}
