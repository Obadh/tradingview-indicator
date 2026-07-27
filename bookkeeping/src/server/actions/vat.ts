"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/server/db";
import { requireBusiness, auditContext } from "@/lib/server/context";
import { audit } from "@/lib/server/audit";
import { isoDateToUtc, vatPeriodRange } from "@/lib/domain/dates";
import { vatPeriodData } from "@/lib/server/queries/vat";
import type { ActionResult } from "./auth";

const periodSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  periodNo: z.coerce.number().int().min(0).max(12),
  status: z.enum(["NOT_PREPARED", "IN_PROGRESS", "READY_FOR_REVIEW", "FILED_MANUALLY"]),
});

/**
 * Update a VAT period's status. Marking it FILED_MANUALLY locks the period:
 * a snapshot of the preparation summary is stored and later changes require
 * explicit correction entries.
 */
export async function setVatPeriodStatusAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { business, user } = await requireBusiness();
  const parsed = periodSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  const { year, periodNo, status } = parsed.data;

  const settings = business.settings!;
  const freq = settings.vatFilingFrequency === "UNKNOWN" ? "QUARTERLY" : settings.vatFilingFrequency;
  const range = vatPeriodRange(freq, year, periodNo);

  const existing = await prisma.taxPeriod.findFirst({
    where: { businessId: business.id, type: "VAT", year, periodNo },
  });
  if (existing?.lockedAt) {
    return {
      ok: false,
      error:
        "This period is locked (filed). Changes now require corrections; contact your adviser about a suppletie if the filed return was wrong.",
    };
  }

  let filedSnapshot: object | undefined;
  if (status === "FILED_MANUALLY") {
    const data = await vatPeriodData(business.id, freq, year, periodNo);
    if (data.reviewTransactions.length > 0) {
      return {
        ok: false,
        error: `There are still ${data.reviewTransactions.length} record(s) needing review in this period. Resolve them before marking the return as filed.`,
      };
    }
    filedSnapshot = JSON.parse(JSON.stringify(data.summary));
  }

  const period = await prisma.taxPeriod.upsert({
    where: {
      businessId_type_year_periodNo: {
        businessId: business.id,
        type: "VAT",
        year,
        periodNo,
      },
    },
    update: {
      status,
      lockedAt: status === "FILED_MANUALLY" ? new Date() : null,
      filedAt: status === "FILED_MANUALLY" ? new Date() : null,
      filedSnapshot,
    },
    create: {
      businessId: business.id,
      type: "VAT",
      year,
      periodNo,
      startDate: isoDateToUtc(range.start),
      endDate: isoDateToUtc(range.end),
      status,
      lockedAt: status === "FILED_MANUALLY" ? new Date() : null,
      filedAt: status === "FILED_MANUALLY" ? new Date() : null,
      filedSnapshot,
    },
  });

  if (status === "FILED_MANUALLY") {
    // Lock the transactions of the period.
    await prisma.transaction.updateMany({
      where: {
        businessId: business.id,
        date: { gte: isoDateToUtc(range.start), lte: isoDateToUtc(range.end) },
        status: { in: ["CONFIRMED", "RECONCILED"] },
      },
      data: { status: "LOCKED", taxPeriodId: period.id },
    });
  }

  await audit({ ...(await auditContext(business.id)), actorUserId: user.id }, {
    action: status === "FILED_MANUALLY" ? "lock" : "update",
    entityType: "TaxPeriod",
    entityId: period.id,
    oldValues: existing ? { status: existing.status } : undefined,
    newValues: { status, year, periodNo },
  });

  revalidatePath("/vat");
  return { ok: true };
}
