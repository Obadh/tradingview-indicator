"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/server/db";
import { requireBusiness, auditContext } from "@/lib/server/context";
import { audit } from "@/lib/server/audit";
import { parseAmountToCents } from "@/lib/domain/money";
import { depreciationSchedule, annualDepreciation } from "@/lib/domain/depreciation";
import { buildDepreciationJournal } from "@/lib/domain/journal";
import { createTransaction } from "@/lib/server/transactions";
import { isoDateToUtc } from "@/lib/domain/dates";
import type { ActionResult } from "./auth";

const assetSchema = z.object({
  name: z.string().min(1).max(200),
  category: z.string().max(100).optional().or(z.literal("")),
  purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  inUseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  purchasePrice: z.string().min(1),
  vat: z.string().optional().or(z.literal("")),
  businessUsePct: z.coerce.number().min(0).max(100).default(100),
  usefulLifeMonths: z.coerce.number().int().min(1).max(600).default(60),
  residualValue: z.string().optional().or(z.literal("")),
  notes: z.string().max(1000).optional().or(z.literal("")),
});

export async function createAssetAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { business } = await requireBusiness();
  const parsed = assetSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `${issue?.path.join(".")}: ${issue?.message}` };
  }
  const d = parsed.data;

  let priceCents: number, vatCents: number, residualCents: number;
  try {
    priceCents = parseAmountToCents(d.purchasePrice);
    vatCents = d.vat ? parseAmountToCents(d.vat) : 0;
    residualCents = d.residualValue ? parseAmountToCents(d.residualValue) : 0;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invalid amount" };
  }
  if (residualCents > priceCents) {
    return { ok: false, error: "Residual value cannot exceed the purchase price." };
  }

  const businessUseBp = Math.round(d.businessUsePct * 100);
  const inUse = d.inUseDate || d.purchaseDate;
  const schedule = depreciationSchedule({
    purchasePriceExVatCents: priceCents,
    residualValueCents: residualCents,
    businessUseBp,
    usefulLifeMonths: d.usefulLifeMonths,
    inUseDate: inUse,
  });
  const firstFullYear = annualDepreciation(schedule);
  const annual = Object.values(firstFullYear).sort((a, b) => b - a)[0] ?? 0;

  const asset = await prisma.asset.create({
    data: {
      businessId: business.id,
      name: d.name,
      category: d.category || null,
      purchaseDate: isoDateToUtc(d.purchaseDate),
      inUseDate: isoDateToUtc(inUse),
      purchasePriceExVatCents: priceCents,
      vatCents,
      businessUseBp,
      depreciationMethod: "STRAIGHT_LINE",
      usefulLifeMonths: d.usefulLifeMonths,
      residualValueCents: residualCents,
      annualDepreciationCents: annual,
      notes: d.notes || null,
    },
  });
  await audit(await auditContext(business.id), {
    action: "create",
    entityType: "Asset",
    entityId: asset.id,
    newValues: { name: d.name, priceCents, usefulLifeMonths: d.usefulLifeMonths },
  });
  revalidatePath("/assets");
  return { ok: true };
}

const depreciateSchema = z.object({
  assetId: z.string().uuid(),
  year: z.coerce.number().int().min(2000).max(2100),
});

/**
 * Book one year of straight-line depreciation for an asset as a
 * DEPRECIATION transaction (Dr depreciation expense, Cr accumulated
 * depreciation). Explicit user action — never automatic.
 */
export async function bookDepreciationAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { business, user } = await requireBusiness();
  const parsed = depreciateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  const { assetId, year } = parsed.data;

  const asset = await prisma.asset.findFirst({
    where: { id: assetId, businessId: business.id, deletedAt: null },
  });
  if (!asset) return { ok: false, error: "Asset not found." };
  if (!asset.inUseDate) return { ok: false, error: "Set the in-use date first." };

  const already = await prisma.transaction.findFirst({
    where: {
      businessId: business.id,
      type: "DEPRECIATION",
      description: { contains: asset.id.slice(0, 8) },
      date: { gte: isoDateToUtc(`${year}-01-01`), lte: isoDateToUtc(`${year}-12-31`) },
      status: { notIn: ["VOID"] },
    },
  });
  if (already) return { ok: false, error: `Depreciation for ${year} was already booked.` };

  const schedule = depreciationSchedule({
    purchasePriceExVatCents: asset.purchasePriceExVatCents,
    residualValueCents: asset.residualValueCents,
    businessUseBp: asset.businessUseBp,
    usefulLifeMonths: asset.usefulLifeMonths,
    inUseDate: asset.inUseDate.toISOString().slice(0, 10),
  });
  const charge = annualDepreciation(schedule)[year] ?? 0;
  if (charge <= 0) return { ok: false, error: `No depreciation applies to ${year} for this asset.` };

  const description = `Depreciation ${year}: ${asset.name} [${asset.id.slice(0, 8)}]`;
  try {
    await createTransaction(
      { ...(await auditContext(business.id)), businessId: business.id, actorUserId: user.id },
      {
        type: "DEPRECIATION",
        status: "CONFIRMED",
        date: `${year}-12-31`,
        description,
        amountCents: charge,
      },
      buildDepreciationJournal(charge, description),
    );
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not book depreciation." };
  }
  revalidatePath("/assets");
  return { ok: true };
}
