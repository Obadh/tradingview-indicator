"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/server/db";
import { requireUser, auditContext } from "@/lib/server/context";
import { audit } from "@/lib/server/audit";
import { encryptString } from "@/lib/server/crypto";
import { createBusinessWithDefaults } from "@/lib/server/business-setup";
import { onboardingSchema } from "@/lib/validation/onboarding";
import type { ActionResult } from "./auth";

export async function completeOnboardingAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();

  const existing = await prisma.membership.findFirst({ where: { userId: user.id } });
  if (existing) redirect("/dashboard");

  const raw = Object.fromEntries(formData.entries());
  const parsed = onboardingSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `${issue?.path.join(".")}: ${issue?.message}` };
  }
  const d = parsed.data;

  const businessId = await prisma.$transaction(async (tx) => {
    return createBusinessWithDefaults(tx, user.id, {
      legalName: d.legalName,
      tradeName: d.tradeName || null,
      kvkNumber: d.kvkNumber || null,
      vatId: d.vatId ? d.vatId.toUpperCase() : null,
      obNumberEncrypted: d.obNumber ? encryptString(d.obNumber) : null,
      addressLine1: d.addressLine1 || null,
      postalCode: d.postalCode || null,
      city: d.city || null,
      email: d.email || null,
      phone: d.phone || null,
      iban: d.iban ? d.iban.toUpperCase() : null,
      kvkRegisteredOn: d.kvkRegisteredOn || null,
      invoicePrefix: d.invoicePrefix.toUpperCase(),
      firstFinancialYear: d.firstFinancialYear,
      vatFilingFrequency: d.vatFilingFrequency,
      korStatus: d.korStatus,
      accountingBasis: d.accountingBasis,
      bankUsage: d.bankUsage,
    });
  });

  await audit(await auditContext(businessId), {
    action: "create",
    entityType: "Business",
    entityId: businessId,
    newValues: { legalName: d.legalName, kvkNumber: d.kvkNumber || null },
  });
  redirect("/dashboard");
}
