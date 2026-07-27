import { z } from "zod";

/** Amount as user-entered decimal string; parsed to cents server-side. */
export const amountString = z
  .string()
  .min(1, "Enter an amount")
  .max(20);

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date");

export const expenseLineSchema = z.object({
  description: z.string().min(1, "Describe this line").max(300),
  net: amountString,
  vatCodeId: z.string().uuid("Choose a VAT rate"),
  vat: amountString,
});

export const expenseSchema = z.object({
  documentIds: z.array(z.string().uuid()).default([]),
  supplierName: z.string().min(1, "Enter the supplier").max(200),
  supplierCountry: z.string().length(2, "Use a 2-letter country code").default("NL"),
  supplierVatId: z.string().max(30).optional().or(z.literal("")),
  invoiceNumber: z.string().max(60).optional().or(z.literal("")),
  invoiceDate: isoDate,
  paymentDate: isoDate.optional().or(z.literal("")),
  description: z.string().min(1, "Give a short description").max(300),
  categoryId: z.string().uuid("Choose a category"),
  businessPurpose: z.string().max(500).optional().or(z.literal("")),
  currency: z.string().length(3).default("EUR"),
  originalTotal: amountString.optional().or(z.literal("")),
  exchangeRate: z.string().max(20).optional().or(z.literal("")),
  exchangeRateSource: z.string().max(60).optional().or(z.literal("")),
  exchangeRateNote: z.string().max(300).optional().or(z.literal("")),
  paidFrom: z.enum(["BUSINESS_BANK", "PERSONAL", "CASH", "NOT_PAID"]),
  paymentMethod: z.string().max(40).optional().or(z.literal("")),
  isPreRegistration: z.coerce.boolean().default(false),
  isMixedUse: z.coerce.boolean().default(false),
  businessUsePct: z.coerce.number().min(0).max(100).default(100),
  vatRecoveryPct: z.coerce.number().min(0).max(100).default(100),
  itDeductiblePct: z.coerce.number().min(0).max(100).default(100),
  mixedUseNote: z.string().max(500).optional().or(z.literal("")),
  isReverseCharge: z.coerce.boolean().default(false),
  asAsset: z.coerce.boolean().default(false),
  notes: z.string().max(2000).optional().or(z.literal("")),
  lines: z.array(expenseLineSchema).min(1, "Add at least one line"),
  confirmNow: z.coerce.boolean().default(false),
});

export const incomeLineSchema = z.object({
  description: z.string().min(1).max(300),
  net: amountString,
  vatCodeId: z.string().uuid("Choose a VAT treatment"),
  vat: amountString,
});

export const incomeSchema = z.object({
  documentIds: z.array(z.string().uuid()).default([]),
  payerName: z.string().min(1, "Enter the customer or platform").max(200),
  customerType: z.enum(["BUSINESS", "CONSUMER", "PLATFORM", "UNKNOWN"]).default("UNKNOWN"),
  country: z.string().length(2).default("NL"),
  invoiceNumber: z.string().max(60).optional().or(z.literal("")),
  invoiceDate: isoDate,
  servicePeriod: z.string().max(120).optional().or(z.literal("")),
  paymentDate: isoDate.optional().or(z.literal("")),
  description: z.string().min(1).max(300),
  categoryId: z.string().uuid("Choose a category"),
  currency: z.string().length(3).default("EUR"),
  originalTotal: amountString.optional().or(z.literal("")),
  exchangeRate: z.string().max(20).optional().or(z.literal("")),
  exchangeRateSource: z.string().max(60).optional().or(z.literal("")),
  exchangeRateNote: z.string().max(300).optional().or(z.literal("")),
  platformFee: amountString.optional().or(z.literal("")),
  receivedInto: z.enum(["BUSINESS_BANK", "PERSONAL", "CASH", "NOT_RECEIVED"]),
  paymentReference: z.string().max(100).optional().or(z.literal("")),
  notes: z.string().max(2000).optional().or(z.literal("")),
  lines: z.array(incomeLineSchema).min(1, "Add at least one line"),
  confirmNow: z.coerce.boolean().default(false),
});

export const ownerFlowSchema = z.object({
  kind: z.enum(["OWNER_CONTRIBUTION", "OWNER_WITHDRAWAL", "OWN_TRANSFER"]),
  date: isoDate,
  amount: amountString,
  description: z.string().max(300).optional().or(z.literal("")),
  fromAccount: z.enum(["bank_business", "bank_personal", "cash"]).optional(),
  toAccount: z.enum(["bank_business", "bank_personal", "cash"]).optional(),
  notes: z.string().max(2000).optional().or(z.literal("")),
});

export type ExpenseInput = z.infer<typeof expenseSchema>;
export type IncomeInput = z.infer<typeof incomeSchema>;
export type OwnerFlowInput = z.infer<typeof ownerFlowSchema>;
