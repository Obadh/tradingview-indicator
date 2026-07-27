/**
 * OCR / AI extraction provider interface. The application is fully
 * functional without OCR. Providers return *suggestions only* with
 * confidence levels; nothing is ever saved as accounting data without the
 * user confirming each field.
 *
 * Privacy: documents are NEVER sent to an external provider unless the user
 * has explicitly enabled that provider in settings and accepted the privacy
 * warning (BusinessSettings.ocrProviderEnabled + ocrConsentAt). The only
 * bundled provider is a local deterministic stub with no network access.
 * User documents are never used to train AI models.
 */

export interface ExtractedField {
  value: string;
  /** 0..1 — shown to the user, never used to auto-accept. */
  confidence: number;
}

export interface ExtractionResult {
  provider: string;
  extractedAt: string; // ISO timestamp
  fields: Partial<
    Record<
      | "supplierName"
      | "customerName"
      | "invoiceNumber"
      | "invoiceDate"
      | "deliveryDate"
      | "dueDate"
      | "currency"
      | "totalExVat"
      | "vatAmount"
      | "totalIncVat"
      | "vatRate"
      | "supplierVatId"
      | "description"
      | "iban"
      | "paymentReference",
      ExtractedField
    >
  >;
}

export interface OcrProvider {
  readonly name: string;
  /** True if this provider sends data outside this machine. */
  readonly external: boolean;
  extract(file: Buffer, mimeType: string, filename: string): Promise<ExtractionResult>;
}

import { StubOcrProvider } from "./stub";

export function ocrProvider(): OcrProvider | null {
  switch (process.env.OCR_PROVIDER ?? "none") {
    case "stub":
      return new StubOcrProvider();
    case "none":
    default:
      return null;
  }
}
