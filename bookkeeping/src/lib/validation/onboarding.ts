import { z } from "zod";

export const onboardingSchema = z.object({
  legalName: z.string().min(1, "Enter your legal name").max(200),
  tradeName: z.string().max(200).optional().or(z.literal("")),
  kvkNumber: z
    .string()
    .regex(/^\d{8}$/, "A KVK number has exactly 8 digits")
    .optional()
    .or(z.literal("")),
  vatId: z
    .string()
    .regex(/^NL[0-9]{9}B[0-9]{2}$/i, "A Dutch VAT ID looks like NL123456789B01")
    .optional()
    .or(z.literal("")),
  obNumber: z
    .string()
    .max(30)
    .optional()
    .or(z.literal("")),
  addressLine1: z.string().max(200).optional().or(z.literal("")),
  postalCode: z.string().max(10).optional().or(z.literal("")),
  city: z.string().max(100).optional().or(z.literal("")),
  email: z.string().email("Enter a valid email").optional().or(z.literal("")),
  phone: z.string().max(30).optional().or(z.literal("")),
  iban: z
    .string()
    .regex(/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/i, "Enter a valid IBAN (no spaces)")
    .optional()
    .or(z.literal("")),
  kvkRegisteredOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the date picker")
    .optional()
    .or(z.literal("")),
  invoicePrefix: z
    .string()
    .min(1)
    .max(10)
    .regex(/^[A-Za-z0-9-]+$/, "Letters, digits and dashes only"),
  firstFinancialYear: z.coerce.number().int().min(2000).max(2100),
  vatFilingFrequency: z.enum(["MONTHLY", "QUARTERLY", "YEARLY", "UNKNOWN"]),
  korStatus: z.enum(["NOT_ENROLLED", "ENROLLED", "PENDING", "UNKNOWN"]),
  accountingBasis: z.enum(["CASH", "INVOICE", "UNKNOWN"]),
  bankUsage: z.enum(["PERSONAL_ONLY", "BUSINESS_ONLY", "BOTH"]),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;
