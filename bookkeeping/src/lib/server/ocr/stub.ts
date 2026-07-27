import type { ExtractionResult, OcrProvider } from "./index";

/**
 * Local, deterministic extraction stub. It only inspects plain text found in
 * the file (useful for text-based PDFs, XML/UBL invoices and the demo data)
 * and never touches the network. Confidence values are intentionally modest:
 * every suggestion requires user confirmation regardless.
 */
export class StubOcrProvider implements OcrProvider {
  readonly name = "local-stub";
  readonly external = false;

  async extract(file: Buffer, mimeType: string, _filename: string): Promise<ExtractionResult> {
    const result: ExtractionResult = {
      provider: this.name,
      extractedAt: new Date().toISOString(),
      fields: {},
    };
    let text = "";
    if (mimeType.startsWith("text/") || mimeType.includes("xml")) {
      text = file.toString("utf8");
    } else if (mimeType === "application/pdf") {
      // Extract printable ASCII runs from uncompressed PDF text operators.
      text = file
        .toString("latin1")
        .replace(/[^\x20-\x7E\n]/g, " ")
        .slice(0, 200_000);
    } else {
      return result; // images need a real OCR provider
    }

    const grab = (re: RegExp): string | null => {
      const m = text.match(re);
      return m?.[1]?.trim() ?? null;
    };

    const set = (key: keyof ExtractionResult["fields"], value: string | null, confidence: number) => {
      if (value) result.fields[key] = { value, confidence };
    };

    set("invoiceNumber", grab(/invoice\s*(?:no\.?|number|#)[:\s]*([A-Za-z0-9/-]{3,30})/i), 0.7);
    set("invoiceDate", normalizeDate(grab(/(?:invoice\s*date|date)[:\s]*([\d]{1,4}[-/.][\d]{1,2}[-/.][\d]{1,4})/i)), 0.6);
    set("dueDate", normalizeDate(grab(/due\s*date[:\s]*([\d]{1,4}[-/.][\d]{1,2}[-/.][\d]{1,4})/i)), 0.6);
    set("supplierVatId", grab(/\b([A-Z]{2}[A-Z0-9]{8,12})\b(?=.*vat)/i), 0.5);
    set("iban", grab(/\b([A-Z]{2}\d{2}[A-Z0-9]{10,30})\b/), 0.6);
    set("currency", grab(/\b(EUR|USD|GBP)\b/), 0.5);
    set("totalIncVat", grab(/total(?:\s*(?:due|incl[^\s]*|amount))?[:\s]*[€$]?\s*([\d.,]+)/i), 0.5);
    set("vatAmount", grab(/(?:vat|btw)\s*(?:amount)?[:\s]*[€$]?\s*([\d.,]+)/i), 0.5);
    set("vatRate", grab(/(\d{1,2})\s*%\s*(?:vat|btw)/i), 0.5);
    return result;
  }
}

function normalizeDate(raw: string | null): string | null {
  if (!raw) return null;
  const parts = raw.split(/[-/.]/).map((p) => p.trim());
  if (parts.length !== 3) return null;
  let y: number, m: number, d: number;
  if (parts[0]!.length === 4) {
    [y, m, d] = parts.map(Number) as [number, number, number];
  } else {
    [d, m, y] = parts.map(Number) as [number, number, number];
    if (y < 100) y += 2000;
  }
  if (!y || !m || !d || m > 12 || d > 31) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
