"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import * as OTPAuth from "otpauth";
import { prisma } from "@/lib/server/db";
import { requireBusiness, requireUser, auditContext } from "@/lib/server/context";
import { audit } from "@/lib/server/audit";
import { encryptString, decryptString } from "@/lib/server/crypto";
import { verifyTotp } from "@/lib/server/auth";
import { retentionEligibleDate } from "@/lib/domain/retention";
import { todayAmsterdam, isoDateToUtc, utcToIsoDate } from "@/lib/domain/dates";
import { storage } from "@/lib/server/storage";
import type { ActionResult } from "./auth";

// --- business profile & bookkeeping settings ------------------------------

const profileSchema = z.object({
  legalName: z.string().min(1).max(200),
  tradeName: z.string().max(200).optional().or(z.literal("")),
  kvkNumber: z.string().regex(/^\d{8}$/).optional().or(z.literal("")),
  vatId: z.string().regex(/^NL[0-9]{9}B[0-9]{2}$/i).optional().or(z.literal("")),
  obNumber: z.string().max(30).optional().or(z.literal("")),
  addressLine1: z.string().max(200).optional().or(z.literal("")),
  postalCode: z.string().max(10).optional().or(z.literal("")),
  city: z.string().max(100).optional().or(z.literal("")),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(30).optional().or(z.literal("")),
  iban: z.string().regex(/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/i).optional().or(z.literal("")),
  kvkRegisteredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  invoicePrefix: z.string().min(1).max(10).regex(/^[A-Za-z0-9-]+$/),
  vatFilingFrequency: z.enum(["MONTHLY", "QUARTERLY", "YEARLY", "UNKNOWN"]),
  korStatus: z.enum(["NOT_ENROLLED", "ENROLLED", "PENDING", "UNKNOWN"]),
  accountingBasis: z.enum(["CASH", "INVOICE", "UNKNOWN"]),
  defaultPaymentTermDays: z.coerce.number().int().min(0).max(365),
  retentionYears: z.coerce.number().int().min(7).max(30),
  assetThreshold: z.coerce.number().min(0).max(1_000_000),
});

export async function updateBusinessAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { business } = await requireBusiness();
  const parsed = profileSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `${issue?.path.join(".")}: ${issue?.message}` };
  }
  const d = parsed.data;

  await prisma.business.update({
    where: { id: business.id },
    data: {
      legalName: d.legalName,
      tradeName: d.tradeName || null,
      kvkNumber: d.kvkNumber || null,
      vatId: d.vatId ? d.vatId.toUpperCase() : null,
      // Only overwrite the encrypted OB number when a new value is entered.
      ...(d.obNumber ? { obNumberEncrypted: encryptString(d.obNumber) } : {}),
      addressLine1: d.addressLine1 || null,
      postalCode: d.postalCode || null,
      city: d.city || null,
      email: d.email || null,
      phone: d.phone || null,
      iban: d.iban ? d.iban.toUpperCase() : null,
      kvkRegisteredOn: d.kvkRegisteredOn ? isoDateToUtc(d.kvkRegisteredOn) : null,
      settings: {
        update: {
          invoicePrefix: d.invoicePrefix.toUpperCase(),
          vatFilingFrequency: d.vatFilingFrequency,
          korStatus: d.korStatus,
          accountingBasis: d.accountingBasis,
          defaultPaymentTermDays: d.defaultPaymentTermDays,
          retentionYears: d.retentionYears,
          assetThresholdCents: Math.round(d.assetThreshold * 100),
        },
      },
    },
  });
  await audit(await auditContext(business.id), {
    action: "update",
    entityType: "Business",
    entityId: business.id,
    newValues: { legalName: d.legalName, vatFilingFrequency: d.vatFilingFrequency, korStatus: d.korStatus },
  });
  revalidatePath("/settings");
  return { ok: true };
}

/** Explicit reveal of masked identifiers — audited. */
export async function revealSensitiveAction(): Promise<
  ActionResult & { vatId?: string; obNumber?: string }
> {
  const { business } = await requireBusiness();
  await audit(await auditContext(business.id), {
    action: "update",
    entityType: "Business",
    entityId: business.id,
    reason: "Sensitive identifiers revealed in UI",
  });
  return {
    ok: true,
    vatId: business.vatId ?? "",
    obNumber: business.obNumberEncrypted ? decryptString(business.obNumberEncrypted) : "",
  };
}

// --- TOTP MFA -------------------------------------------------------------

export async function startTotpSetupAction(): Promise<
  ActionResult & { otpauthUrl?: string; secret?: string }
> {
  const user = await requireUser();
  if (user.totpEnabledAt) return { ok: false, error: "MFA is already enabled." };
  const secret = new OTPAuth.Secret({ size: 20 });
  const totp = new OTPAuth.TOTP({
    issuer: "Boekhouding",
    label: user.email,
    secret,
  });
  await prisma.user.update({
    where: { id: user.id },
    data: { totpSecretEncrypted: encryptString(secret.base32), totpEnabledAt: null },
  });
  return { ok: true, otpauthUrl: totp.toString(), secret: secret.base32 };
}

export async function confirmTotpSetupAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const code = String(formData.get("code") ?? "");
  if (!user.totpSecretEncrypted) return { ok: false, error: "Start the setup first." };
  if (!verifyTotp(user.totpSecretEncrypted, code)) {
    return { ok: false, error: "That code is not valid. Check your authenticator app and try again." };
  }
  await prisma.user.update({ where: { id: user.id }, data: { totpEnabledAt: new Date() } });
  await audit({ actorUserId: user.id }, {
    action: "update",
    entityType: "User",
    entityId: user.id,
    newValues: { mfa: "enabled" },
  });
  revalidatePath("/settings");
  return { ok: true };
}

export async function disableTotpAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const code = String(formData.get("code") ?? "");
  if (!user.totpSecretEncrypted || !user.totpEnabledAt) {
    return { ok: false, error: "MFA is not enabled." };
  }
  if (!verifyTotp(user.totpSecretEncrypted, code)) {
    return { ok: false, error: "Enter a valid authenticator code to disable MFA." };
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { totpSecretEncrypted: null, totpEnabledAt: null },
  });
  await audit({ actorUserId: user.id }, {
    action: "update",
    entityType: "User",
    entityId: user.id,
    newValues: { mfa: "disabled" },
  });
  revalidatePath("/settings");
  return { ok: true };
}

// --- privacy: OCR consent -------------------------------------------------

const ocrSchema = z.object({
  enabled: z.coerce.boolean(),
  consent: z.coerce.boolean().default(false),
});

export async function setOcrProviderAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { business } = await requireBusiness();
  const parsed = ocrSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  const providerName = process.env.OCR_PROVIDER ?? "none";
  if (parsed.data.enabled && providerName === "none") {
    return {
      ok: false,
      error:
        "No OCR provider is configured on this installation (OCR_PROVIDER=none). The app works fully without OCR.",
    };
  }
  if (parsed.data.enabled && !parsed.data.consent) {
    return { ok: false, error: "Tick the consent box to enable document extraction." };
  }
  await prisma.businessSettings.update({
    where: { businessId: business.id },
    data: {
      ocrProviderEnabled: parsed.data.enabled,
      ocrProviderName: parsed.data.enabled ? providerName : null,
      ocrConsentAt: parsed.data.enabled ? new Date() : null,
    },
  });
  await audit(await auditContext(business.id), {
    action: "consent",
    entityType: "BusinessSettings",
    entityId: business.id,
    newValues: { ocrProviderEnabled: parsed.data.enabled, provider: providerName },
  });
  revalidatePath("/settings");
  return { ok: true };
}

// --- retention ------------------------------------------------------------

export interface RetentionItem {
  documentId: string;
  filename: string;
  recordDate: string;
  eligibleDate: string;
}

export async function listRetentionEligible(): Promise<RetentionItem[]> {
  const { business } = await requireBusiness();
  const years = business.settings?.retentionYears ?? 7;
  const today = todayAmsterdam();
  const documents = await prisma.document.findMany({
    where: { businessId: business.id, deletedAt: null },
    select: { id: true, originalFilename: true, documentDate: true, uploadedAt: true },
  });
  return documents
    .map((d) => {
      const recordDate = d.documentDate
        ? utcToIsoDate(d.documentDate)
        : d.uploadedAt.toISOString().slice(0, 10);
      return {
        documentId: d.id,
        filename: d.originalFilename,
        recordDate,
        eligibleDate: retentionEligibleDate(recordDate, years),
      };
    })
    .filter((d) => d.eligibleDate <= today);
}

const retentionDeleteSchema = z.object({
  documentId: z.string().uuid(),
  confirmation: z.literal("DELETE", {
    errorMap: () => ({ message: 'Type DELETE (in capitals) to confirm.' }),
  }),
  professionalConfirmed: z.coerce.boolean(),
});

/**
 * Retention deletion: only for documents past the retention period, with a
 * typed confirmation, and an audit record. The app recommends obtaining
 * professional confirmation first and records whether the user says they did.
 */
export async function retentionDeleteAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { business, user } = await requireBusiness();
  const parsed = retentionDeleteSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid confirmation" };
  }
  const doc = await prisma.document.findFirst({
    where: { id: parsed.data.documentId, businessId: business.id, deletedAt: null },
    include: { versions: true },
  });
  if (!doc) return { ok: false, error: "Document not found." };

  const years = business.settings?.retentionYears ?? 7;
  const recordDate = doc.documentDate
    ? utcToIsoDate(doc.documentDate)
    : doc.uploadedAt.toISOString().slice(0, 10);
  if (retentionEligibleDate(recordDate, years) > todayAmsterdam()) {
    return {
      ok: false,
      error: `This document is still within the ${years}-year retention period and cannot be deleted.`,
    };
  }

  await audit({ ...(await auditContext(business.id)), actorUserId: user.id }, {
    action: "retention-delete",
    entityType: "Document",
    entityId: doc.id,
    oldValues: { filename: doc.originalFilename, sha256: doc.sha256, recordDate },
    reason: `Retention deletion after ${years} years. Professional confirmation obtained: ${
      parsed.data.professionalConfirmed ? "yes (per user)" : "NO"
    }`,
  });
  await prisma.document.update({ where: { id: doc.id }, data: { deletedAt: new Date() } });
  for (const v of doc.versions) {
    try {
      await storage().delete(v.storageKey);
    } catch {
      // Object already gone; the audit record above still documents intent.
    }
  }
  revalidatePath("/settings");
  return { ok: true };
}

// --- account deletion -----------------------------------------------------

const deleteAccountSchema = z.object({
  confirmation: z.literal("DELETE MY ADMINISTRATION", {
    errorMap: () => ({ message: 'Type exactly: DELETE MY ADMINISTRATION' }),
  }),
});

/**
 * Account deletion flow: marks business and user as deleted (soft) so the
 * operator can purge storage after the export has been secured. Hard
 * deletion procedure is documented in PRIVACY.md.
 */
export async function deleteAccountAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { business, user } = await requireBusiness();
  const parsed = deleteAccountSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid confirmation" };
  }
  await audit({ ...(await auditContext(business.id)), actorUserId: user.id }, {
    action: "delete",
    entityType: "Business",
    entityId: business.id,
    reason: "Account deletion requested by owner. Export your administration first!",
  });
  await prisma.business.update({ where: { id: business.id }, data: { deletedAt: new Date() } });
  await prisma.user.update({ where: { id: user.id }, data: { deletedAt: new Date() } });
  return { ok: true };
}
