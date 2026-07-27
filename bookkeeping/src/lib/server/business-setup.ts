/**
 * Creates a new business with its default reference data: minimal chart of
 * accounts, versioned VAT codes, expense/income categories for a software
 * developer, and bank accounts matching the user's situation.
 */

import type { Prisma } from "@prisma/client";
import { CHART_OF_ACCOUNTS } from "@/lib/domain/journal";
import { DEFAULT_VAT_CODES } from "@/lib/domain/vat";
import { isoDateToUtc } from "@/lib/domain/dates";

export const EXPENSE_CATEGORIES: { name: string; suggestAsset?: boolean }[] = [
  { name: "KVK registration" },
  { name: "Apple Developer Program" },
  { name: "Google Play Console" },
  { name: "Hosting" },
  { name: "Domains" },
  { name: "Cloud infrastructure" },
  { name: "SaaS subscriptions" },
  { name: "AI tools and APIs" },
  { name: "Design tools" },
  { name: "Development tools" },
  { name: "Advertising" },
  { name: "Payment processing fees" },
  { name: "Legal and professional fees" },
  { name: "Hardware", suggestAsset: true },
  { name: "Laptop and computer equipment", suggestAsset: true },
  { name: "Phone and internet" },
  { name: "Travel" },
  { name: "Training" },
  { name: "Office supplies" },
  { name: "Insurance" },
  { name: "Bank fees" },
  { name: "Other" },
];

export const INCOME_CATEGORIES: string[] = [
  "Client invoices",
  "App Store payouts",
  "Google Play payouts",
  "Advertising revenue",
  "Subscription revenue",
  "Payment processor payouts",
  "Affiliate revenue",
  "Refunds",
  "Other income",
];

export interface BusinessProfileInput {
  legalName: string;
  tradeName?: string | null;
  kvkNumber?: string | null;
  vatId?: string | null;
  obNumberEncrypted?: string | null;
  addressLine1?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string;
  email?: string | null;
  phone?: string | null;
  iban?: string | null;
  kvkRegisteredOn?: string | null; // ISO date
  invoicePrefix: string;
  firstFinancialYear?: number | null;
  vatFilingFrequency: "MONTHLY" | "QUARTERLY" | "YEARLY" | "UNKNOWN";
  korStatus: "NOT_ENROLLED" | "ENROLLED" | "PENDING" | "UNKNOWN";
  accountingBasis: "CASH" | "INVOICE" | "UNKNOWN";
  bankUsage: "PERSONAL_ONLY" | "BUSINESS_ONLY" | "BOTH";
}

export async function createBusinessWithDefaults(
  tx: Prisma.TransactionClient,
  userId: string,
  input: BusinessProfileInput,
): Promise<string> {
  const business = await tx.business.create({
    data: {
      legalName: input.legalName,
      tradeName: input.tradeName ?? null,
      kvkNumber: input.kvkNumber ?? null,
      vatId: input.vatId ?? null,
      obNumberEncrypted: input.obNumberEncrypted ?? null,
      addressLine1: input.addressLine1 ?? null,
      postalCode: input.postalCode ?? null,
      city: input.city ?? null,
      country: input.country ?? "NL",
      email: input.email ?? null,
      phone: input.phone ?? null,
      iban: input.iban ?? null,
      kvkRegisteredOn: input.kvkRegisteredOn ? isoDateToUtc(input.kvkRegisteredOn) : null,
      settings: {
        create: {
          invoicePrefix: input.invoicePrefix,
          firstFinancialYear: input.firstFinancialYear ?? null,
          vatFilingFrequency: input.vatFilingFrequency,
          korStatus: input.korStatus,
          accountingBasis: input.accountingBasis,
          bankUsage: input.bankUsage,
          onboardingCompletedAt: new Date(),
        },
      },
      memberships: { create: { userId, role: "OWNER" } },
    },
  });

  // Chart of accounts
  const accounts = await Promise.all(
    CHART_OF_ACCOUNTS.map((a) =>
      tx.ledgerAccount.create({
        data: {
          businessId: business.id,
          code: a.code,
          name: a.name,
          type: a.type,
          isSystem: true,
          systemKey: a.systemKey,
        },
      }),
    ),
  );
  const accountByKey = new Map(accounts.map((a) => [a.systemKey!, a.id]));

  // VAT codes (versioned reference data)
  const vatCodes = await Promise.all(
    DEFAULT_VAT_CODES.map((v) =>
      tx.vATCode.create({
        data: {
          businessId: business.id,
          code: v.code,
          name: v.name,
          treatment: v.treatment,
          ratePermille: v.ratePermille,
          returnBox: v.returnBox,
          inputReturnBox: v.inputReturnBox,
          rulesVersion: 1,
          validFrom: isoDateToUtc(v.validFrom),
        },
      }),
    ),
  );
  const nlHigh = vatCodes.find((v) => v.code === "NL-HIGH")!;

  // Categories
  const operatingExpensesId = accountByKey.get("operating_expenses")!;
  const revenueId = accountByKey.get("revenue")!;
  await Promise.all([
    ...EXPENSE_CATEGORIES.map((c, i) =>
      tx.category.create({
        data: {
          businessId: business.id,
          kind: "EXPENSE",
          name: c.name,
          ledgerAccountId: operatingExpensesId,
          defaultVatCodeId: nlHigh.id,
          suggestAsset: c.suggestAsset ?? false,
          isSystem: true,
          sortOrder: i,
        },
      }),
    ),
    ...INCOME_CATEGORIES.map((name, i) =>
      tx.category.create({
        data: {
          businessId: business.id,
          kind: "INCOME",
          name,
          ledgerAccountId: revenueId,
          defaultVatCodeId: nlHigh.id,
          isSystem: true,
          sortOrder: i,
        },
      }),
    ),
  ]);

  // Bank accounts matching the user's situation
  if (input.bankUsage !== "PERSONAL_ONLY") {
    await tx.bankAccount.create({
      data: {
        businessId: business.id,
        kind: "BUSINESS",
        name: "Business bank account",
        iban: input.iban ?? null,
        ledgerAccountId: accountByKey.get("bank_business"),
      },
    });
  }
  if (input.bankUsage !== "BUSINESS_ONLY") {
    await tx.bankAccount.create({
      data: {
        businessId: business.id,
        kind: "PERSONAL",
        name: "Personal bank account (business use)",
        ledgerAccountId: accountByKey.get("bank_personal"),
        retainOnlyBusinessLines: true,
      },
    });
  }

  return business.id;
}
