"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/server/db";
import { requireBusiness, auditContext } from "@/lib/server/context";
import { audit } from "@/lib/server/audit";
import { buildExportZip } from "@/lib/server/export/build-zip";
import { storage, exportStorageKey } from "@/lib/server/storage";
import { sha256Hex } from "@/lib/server/crypto";
import { vatPeriodRange } from "@/lib/domain/dates";
import type { ActionResult } from "./auth";

const exportSchema = z
  .object({
    scope: z.enum(["year", "vat-quarter", "range"]),
    year: z.coerce.number().int().min(2000).max(2100).optional(),
    quarter: z.coerce.number().int().min(1).max(4).optional(),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
    includeObNumber: z.coerce.boolean().default(false),
  });

/**
 * Run the export as a tracked ExportJob. The build is synchronous for the
 * single-user case but the job record keeps status/summary/audit like a
 * background job would, so a queue can be introduced without schema changes.
 */
export async function runExportAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { business, user } = await requireBusiness();
  const parsed = exportSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid export parameters." };
  const d = parsed.data;

  let from: string, to: string, scopeLabel: string;
  if (d.scope === "year") {
    if (!d.year) return { ok: false, error: "Choose a year." };
    from = `${d.year}-01-01`;
    to = `${d.year}-12-31`;
    scopeLabel = `Financial year ${d.year}`;
  } else if (d.scope === "vat-quarter") {
    if (!d.year || !d.quarter) return { ok: false, error: "Choose a year and quarter." };
    const range = vatPeriodRange("QUARTERLY", d.year, d.quarter);
    from = range.start;
    to = range.end;
    scopeLabel = `VAT quarter Q${d.quarter} ${d.year}`;
  } else {
    if (!d.from || !d.to) return { ok: false, error: "Choose a start and end date." };
    if (d.from > d.to) return { ok: false, error: "The start date is after the end date." };
    from = d.from;
    to = d.to;
    scopeLabel = `Custom range ${from} to ${to}`;
  }

  const job = await prisma.exportJob.create({
    data: {
      businessId: business.id,
      requestedById: user.id,
      status: "RUNNING",
      params: { scope: d.scope, from, to, scopeLabel, includeObNumber: d.includeObNumber },
      startedAt: new Date(),
    },
  });

  try {
    const result = await buildExportZip({
      businessId: business.id,
      from,
      to,
      scopeLabel,
      includeObNumber: d.includeObNumber,
    });
    const key = exportStorageKey(business.id, job.id);
    await storage().put(key, result.zip, "application/zip");
    await prisma.exportJob.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        storageKey: key,
        sizeBytes: result.zip.length,
        sha256: sha256Hex(result.zip),
        summary: result.summary,
        finishedAt: new Date(),
      },
    });
    await audit({ ...(await auditContext(business.id)), actorUserId: user.id }, {
      action: "export",
      entityType: "ExportJob",
      entityId: job.id,
      newValues: { scopeLabel, ...result.summary },
    });
  } catch (e) {
    await prisma.exportJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        error: e instanceof Error ? e.message : String(e),
        finishedAt: new Date(),
      },
    });
    return { ok: false, error: "The export failed. Details were recorded on the export job." };
  }

  revalidatePath("/export");
  return { ok: true };
}
