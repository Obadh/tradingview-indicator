/**
 * Invoice validation warnings (received and issued invoices). Warnings never
 * block saving unless data integrity would break (handled elsewhere, e.g.
 * duplicate sales-invoice numbers via a unique constraint).
 */

import { vatFromNet } from "./money";

export type WarningCode =
  | "MISSING_SUPPLIER_NAME"
  | "MISSING_SUPPLIER_ADDRESS"
  | "MISSING_CUSTOMER_DETAILS"
  | "MISSING_INVOICE_NUMBER"
  | "DUPLICATE_INVOICE_NUMBER"
  | "MISSING_INVOICE_DATE"
  | "MISSING_DESCRIPTION"
  | "MISSING_VAT_RATE"
  | "VAT_CALCULATION_MISMATCH"
  | "MISSING_VAT_ID_EU"
  | "TOTAL_MISMATCH"
  | "CURRENCY_MISMATCH"
  | "ADDRESSED_PERSONALLY"
  | "PREDATES_KVK_REGISTRATION"
  | "COUNTRY_TREATMENT_CONFLICT"
  | "LOOKS_LIKE_RECEIPT";

export interface InvoiceWarning {
  code: WarningCode;
  message: string;
}

export interface InvoiceCheckInput {
  direction: "RECEIVED" | "ISSUED";
  supplierName?: string | null;
  supplierAddress?: string | null;
  supplierCountry?: string | null; // ISO-2
  supplierVatId?: string | null;
  customerName?: string | null;
  customerAddress?: string | null;
  customerVatId?: string | null;
  invoiceNumber?: string | null;
  invoiceDate?: string | null; // ISO
  description?: string | null;
  currency?: string | null;
  bookkeepingCurrency?: string;
  lines?: { netCents: number; vatCents: number; ratePermille: number | null }[];
  totalExVatCents?: number | null;
  totalVatCents?: number | null;
  totalIncVatCents?: number | null;
  treatment?: string | null;
  kvkRegisteredOn?: string | null; // ISO
  addressedToName?: string | null; // whom the document is addressed to
  businessNames?: string[]; // legal + trade name to compare against
  documentCategory?: string | null;
  knownInvoiceNumbers?: string[]; // same supplier/customer, for duplicate check
  /** VAT-rounding tolerance in cents (per rate line). */
  vatToleranceCents?: number;
}

const EU_COUNTRIES = new Set([
  "AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IE","IT",
  "LV","LT","LU","MT","NL","PL","PT","RO","SK","SI","ES","SE",
]);

export function isEuCountry(code: string | null | undefined): boolean {
  return !!code && EU_COUNTRIES.has(code.toUpperCase());
}

export function validateInvoice(input: InvoiceCheckInput): InvoiceWarning[] {
  const warnings: InvoiceWarning[] = [];
  const add = (code: WarningCode, message: string) => warnings.push({ code, message });
  const tolerance = input.vatToleranceCents ?? 2;

  if (!input.supplierName?.trim()) {
    add("MISSING_SUPPLIER_NAME", "The supplier name is missing.");
  }
  if (!input.supplierAddress?.trim()) {
    add("MISSING_SUPPLIER_ADDRESS", "The supplier address is missing.");
  }
  if (input.direction === "ISSUED" && (!input.customerName?.trim() || !input.customerAddress?.trim())) {
    add("MISSING_CUSTOMER_DETAILS", "Customer name and address are required on issued invoices.");
  }
  if (!input.invoiceNumber?.trim()) {
    add("MISSING_INVOICE_NUMBER", "The invoice number is missing.");
  } else if (
    input.knownInvoiceNumbers?.some(
      (n) => n.trim().toLowerCase() === input.invoiceNumber!.trim().toLowerCase(),
    )
  ) {
    add(
      "DUPLICATE_INVOICE_NUMBER",
      `Invoice number "${input.invoiceNumber}" already exists for this contact — possible duplicate.`,
    );
  }
  if (!input.invoiceDate) {
    add("MISSING_INVOICE_DATE", "The invoice date is missing.");
  }
  if (!input.description?.trim()) {
    add("MISSING_DESCRIPTION", "A description of the goods or services is missing.");
  }

  const lines = input.lines ?? [];
  if (lines.some((l) => l.ratePermille === null)) {
    add("MISSING_VAT_RATE", "One or more lines have no VAT rate selected.");
  }
  for (const line of lines) {
    if (line.ratePermille === null) continue;
    const expected = vatFromNet(line.netCents, line.ratePermille);
    if (Math.abs(expected - line.vatCents) > tolerance) {
      add(
        "VAT_CALCULATION_MISMATCH",
        `VAT of a line differs from ${line.ratePermille / 10}% of the net amount by more than € 0.0${tolerance}.`,
      );
      break;
    }
  }

  const sumNet = lines.reduce((s, l) => s + l.netCents, 0);
  const sumVat = lines.reduce((s, l) => s + l.vatCents, 0);
  if (
    input.totalExVatCents != null &&
    lines.length > 0 &&
    Math.abs(sumNet - input.totalExVatCents) > tolerance
  ) {
    add("TOTAL_MISMATCH", "The line totals do not add up to the invoice total excluding VAT.");
  } else if (
    input.totalIncVatCents != null &&
    input.totalExVatCents != null &&
    input.totalVatCents != null &&
    input.totalExVatCents + input.totalVatCents !== input.totalIncVatCents
  ) {
    add("TOTAL_MISMATCH", "Total excluding VAT plus VAT does not equal the total including VAT.");
  } else if (
    input.totalVatCents != null &&
    lines.length > 0 &&
    Math.abs(sumVat - input.totalVatCents) > tolerance
  ) {
    add("TOTAL_MISMATCH", "The VAT line totals do not add up to the invoice VAT total.");
  }

  if (
    input.currency &&
    input.bookkeepingCurrency &&
    input.currency.toUpperCase() !== input.bookkeepingCurrency.toUpperCase()
  ) {
    add(
      "CURRENCY_MISMATCH",
      `Invoice currency ${input.currency.toUpperCase()} differs from bookkeeping currency ${input.bookkeepingCurrency.toUpperCase()} — an exchange rate is required.`,
    );
  }

  const treatment = input.treatment ?? null;
  const country = input.supplierCountry?.toUpperCase() ?? null;
  if (treatment && country) {
    const eu = isEuCountry(country);
    if ((treatment === "EU_SERVICE" || treatment === "EU_ACQUISITION") && (!eu || country === "NL")) {
      add(
        "COUNTRY_TREATMENT_CONFLICT",
        `Treatment ${treatment} expects a non-NL EU supplier, but the supplier country is ${country}.`,
      );
    }
    if (treatment === "IMPORT" && eu) {
      add("COUNTRY_TREATMENT_CONFLICT", "Import treatment selected but the supplier is inside the EU.");
    }
    if ((treatment === "DOMESTIC_HIGH" || treatment === "DOMESTIC_LOW") && country !== "NL") {
      add(
        "COUNTRY_TREATMENT_CONFLICT",
        `Dutch VAT treatment selected but the supplier country is ${country} — check whether this is really Dutch VAT.`,
      );
    }
  }
  if (
    (treatment === "EU_SERVICE" || treatment === "EU_ACQUISITION" || treatment === "REVERSE_CHARGE_SALE") &&
    !(input.direction === "ISSUED" ? input.customerVatId : input.supplierVatId)?.trim()
  ) {
    add(
      "MISSING_VAT_ID_EU",
      "This EU treatment normally requires a VAT identification number of the other party.",
    );
  }

  if (input.addressedToName && input.businessNames?.length) {
    const addressed = input.addressedToName.trim().toLowerCase();
    const matchesBusiness = input.businessNames.some(
      (n) => n.trim() && addressed.includes(n.trim().toLowerCase()),
    );
    if (!matchesBusiness) {
      add(
        "ADDRESSED_PERSONALLY",
        "The invoice appears to be addressed to a person rather than the business. Ask the supplier to invoice the business name where possible.",
      );
    }
  }

  if (input.invoiceDate && input.kvkRegisteredOn && input.invoiceDate < input.kvkRegisteredOn) {
    add(
      "PREDATES_KVK_REGISTRATION",
      "The invoice date is before the KVK registration date. Mark it as a pre-registration expense and have its deductibility reviewed.",
    );
  }

  if (
    input.direction === "RECEIVED" &&
    (input.documentCategory === "RECEIPT" ||
      (!input.invoiceNumber?.trim() && !input.supplierVatId?.trim()))
  ) {
    add(
      "LOOKS_LIKE_RECEIPT",
      "This document may be a receipt rather than a formal invoice. For VAT deduction a proper invoice is usually required.",
    );
  }

  return warnings;
}
