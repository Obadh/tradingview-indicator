/** Plain-English labels for enum values, shared by UI and exports. */

export const DOCUMENT_CATEGORY_LABELS: Record<string, string> = {
  PURCHASE_INVOICE: "Purchase invoice",
  SALES_INVOICE: "Sales invoice",
  RECEIPT: "Receipt",
  BANK_STATEMENT: "Bank statement",
  KVK_DOCUMENT: "KVK document",
  BELASTINGDIENST_LETTER: "Belastingdienst letter",
  CONTRACT: "Contract",
  SUBSCRIPTION_INVOICE: "Subscription invoice",
  APP_STORE_STATEMENT: "App-store statement",
  PAYMENT_PROVIDER_STATEMENT: "Payment-provider statement",
  OTHER: "Other",
};

export const DOCUMENT_STATUS_LABELS: Record<string, string> = {
  UPLOADED: "Uploaded",
  PROCESSING: "Processing",
  NEEDS_REVIEW: "Needs review",
  CONFIRMED: "Confirmed",
  ARCHIVED: "Archived",
};

export const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  BUSINESS_INCOME: "Business income",
  BUSINESS_EXPENSE: "Business expense",
  OWNER_CONTRIBUTION: "Owner contribution (private deposit)",
  OWNER_WITHDRAWAL: "Owner withdrawal (private withdrawal)",
  OWN_TRANSFER: "Transfer between own accounts",
  REFUND_RECEIVED: "Refund received",
  REFUND_PAID: "Refund paid",
  TAX_PAYMENT: "Tax payment",
  VAT_REFUND: "VAT refund",
  DEPRECIATION: "Depreciation",
  CORRECTION: "Correction",
  UNKNOWN: "Unknown — needs review",
};

export const TRANSACTION_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  NEEDS_REVIEW: "Needs review",
  CONFIRMED: "Confirmed",
  RECONCILED: "Reconciled",
  LOCKED: "Locked",
  CORRECTED: "Corrected",
  VOID: "Void",
};

export const VAT_TREATMENT_LABELS: Record<string, string> = {
  DOMESTIC_HIGH: "NL 21%",
  DOMESTIC_LOW: "NL 9%",
  DOMESTIC_ZERO: "NL 0%",
  EXEMPT: "Exempt",
  OUTSIDE_SCOPE: "Outside scope",
  REVERSE_CHARGE_SALE: "Reverse charged (sale)",
  REVERSE_CHARGE_PURCHASE: "Reverse charged (purchase)",
  EU_ACQUISITION: "EU acquisition",
  EU_SERVICE: "EU service",
  IMPORT: "Import",
  FOREIGN_VAT: "Foreign VAT (not recoverable)",
  UNKNOWN: "Unknown — needs review",
};

export const RECONCILIATION_STATE_LABELS: Record<string, string> = {
  UNMATCHED: "Unmatched",
  SUGGESTED: "Suggested match",
  PARTIALLY_MATCHED: "Partially matched",
  MATCHED: "Fully matched",
  IGNORED_PRIVATE: "Ignored as private",
  OWN_TRANSFER: "Transfer between own accounts",
};

export const TAX_PERIOD_STATUS_LABELS: Record<string, string> = {
  NOT_PREPARED: "Not prepared",
  IN_PROGRESS: "In progress",
  READY_FOR_REVIEW: "Ready for review",
  FILED_MANUALLY: "Filed manually",
  CORRECTED: "Corrected",
};
