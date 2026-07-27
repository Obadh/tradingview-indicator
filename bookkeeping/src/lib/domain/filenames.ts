/**
 * Filename sanitization for the export package. Produces predictable names:
 *   YYYY-MM-DD_supplier_invoice-number_amount-currency_document-id.pdf
 * while stripping anything unsafe (path traversal, control chars, reserved
 * characters) and always retaining the document id for traceability.
 */

const UNSAFE = /[^a-zA-Z0-9._-]+/g;

export function sanitizeFilenamePart(part: string, maxLength = 60): string {
  const cleaned = part
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .replace(UNSAFE, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  return (cleaned || "unnamed").slice(0, maxLength);
}

export function extensionFor(mimeType: string, originalFilename: string): string {
  const known: Record<string, string> = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/heic": "heic",
    "text/csv": "csv",
    "text/xml": "xml",
    "application/xml": "xml",
  };
  if (known[mimeType]) return known[mimeType];
  const m = originalFilename.toLowerCase().match(/\.([a-z0-9]{1,8})$/);
  return m ? m[1]! : "bin";
}

export interface ExportNameInput {
  isoDate: string | null; // YYYY-MM-DD
  party: string | null; // supplier or customer name
  invoiceNumber: string | null;
  amountCents: number | null;
  currency: string;
  documentId: string;
  mimeType: string;
  originalFilename: string;
}

export function exportFilename(input: ExportNameInput): string {
  const date = input.isoDate ?? "0000-00-00";
  const party = sanitizeFilenamePart(input.party ?? "unknown");
  const invoice = sanitizeFilenamePart(input.invoiceNumber ?? "no-number", 30);
  const amount =
    input.amountCents === null
      ? "0.00"
      : `${input.amountCents < 0 ? "-" : ""}${Math.floor(Math.abs(input.amountCents) / 100)}.${(
          Math.abs(input.amountCents) % 100
        )
          .toString()
          .padStart(2, "0")}`;
  const ext = extensionFor(input.mimeType, input.originalFilename);
  const shortId = input.documentId.slice(0, 8);
  return `${date}_${party}_${invoice}_${amount}-${sanitizeFilenamePart(input.currency, 5)}_${shortId}.${ext}`;
}
