/**
 * Invoice PDF generation with pdf-lib (pure JS, no browser, deterministic).
 * The finalized PDF is stored as an immutable document; it is generated once
 * at finalization and never regenerated in place.
 */

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { centsToDecimalString } from "@/lib/domain/money";
import { pdfSafe } from "@/lib/server/reports/serialize";

export interface InvoicePdfData {
  kind: "INVOICE" | "CREDIT_NOTE";
  number: string;
  issueDate: string;
  supplyDate: string | null;
  dueDate: string | null;
  business: {
    legalName: string;
    tradeName: string | null;
    addressLine1: string | null;
    postalCode: string | null;
    city: string | null;
    country: string;
    kvkNumber: string | null;
    vatId: string | null;
    iban: string | null;
    email: string | null;
    phone: string | null;
  };
  customer: {
    name: string;
    addressLine1: string | null;
    postalCode: string | null;
    city: string | null;
    country: string;
    vatId: string | null;
  };
  lines: {
    description: string;
    quantity: string;
    unitPriceExVatCents: number;
    vatRatePermille: number;
    lineExVatCents: number;
    lineVatCents: number;
  }[];
  totalExVatCents: number;
  totalVatCents: number;
  totalIncVatCents: number;
  currency: string;
  paymentTermDays: number;
  paymentInstructions: string | null;
  reverseChargeWording: string | null;
  notes: string | null;
  creditsInvoiceNumber?: string | null;
}

const A4: [number, number] = [595.28, 841.89];

export async function renderInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage(A4);
  const { height } = page.getSize();
  const margin = 50;
  let y = height - margin;
  const gray = rgb(0.35, 0.33, 0.31);
  const black = rgb(0.11, 0.09, 0.09);

  const text = (
    str: string,
    x: number,
    yy: number,
    size = 10,
    useBold = false,
    color = black,
  ) => {
    page.drawText(pdfSafe(str), { x, y: yy, size, font: useBold ? bold : font, color });
  };
  const money = (cents: number) => `€ ${centsToDecimalString(cents).replace(".", ",")}`;

  // Header: business identity
  text(data.business.tradeName || data.business.legalName, margin, y, 16, true);
  y -= 18;
  if (data.business.tradeName && data.business.tradeName !== data.business.legalName) {
    text(data.business.legalName, margin, y, 9, false, gray);
    y -= 12;
  }
  for (const line of [
    data.business.addressLine1,
    [data.business.postalCode, data.business.city].filter(Boolean).join(" "),
    data.business.email,
    data.business.phone,
  ]) {
    if (line) {
      text(line, margin, y, 9, false, gray);
      y -= 12;
    }
  }
  const regLine = [
    data.business.kvkNumber && `KVK ${data.business.kvkNumber}`,
    data.business.vatId && `VAT ${data.business.vatId}`,
  ]
    .filter(Boolean)
    .join(" · ");
  if (regLine) {
    text(regLine, margin, y, 9, false, gray);
    y -= 12;
  }

  // Title + meta
  y -= 20;
  text(data.kind === "CREDIT_NOTE" ? "CREDIT NOTE" : "INVOICE", margin, y, 20, true);
  const metaX = 380;
  let metaY = y + 8;
  const meta: [string, string][] = [
    [data.kind === "CREDIT_NOTE" ? "Credit note no." : "Invoice no.", data.number],
    ["Issue date", data.issueDate],
  ];
  if (data.supplyDate) meta.push(["Supply date", data.supplyDate]);
  if (data.dueDate) meta.push(["Due date", data.dueDate]);
  if (data.creditsInvoiceNumber) meta.push(["Credits invoice", data.creditsInvoiceNumber]);
  for (const [k, v] of meta) {
    text(k, metaX, metaY, 9, false, gray);
    text(v, metaX + 90, metaY, 9, true);
    metaY -= 13;
  }

  // Customer block
  y -= 34;
  text("Billed to", margin, y, 9, false, gray);
  y -= 13;
  text(data.customer.name, margin, y, 11, true);
  y -= 14;
  for (const line of [
    data.customer.addressLine1,
    [data.customer.postalCode, data.customer.city].filter(Boolean).join(" "),
    data.customer.country !== "NL" ? data.customer.country : null,
    data.customer.vatId ? `VAT ${data.customer.vatId}` : null,
  ]) {
    if (line) {
      text(line, margin, y, 9);
      y -= 12;
    }
  }

  // Lines table
  y -= 24;
  const cols = { desc: margin, qty: 330, price: 375, rate: 440, total: 490 };
  text("Description", cols.desc, y, 9, true);
  text("Qty", cols.qty, y, 9, true);
  text("Unit price", cols.price, y, 9, true);
  text("VAT", cols.rate, y, 9, true);
  text("Amount", cols.total, y, 9, true);
  y -= 6;
  page.drawLine({
    start: { x: margin, y },
    end: { x: A4[0] - margin, y },
    thickness: 0.7,
    color: gray,
  });
  y -= 14;
  for (const line of data.lines) {
    const desc = line.description.length > 55 ? line.description.slice(0, 52) + "…" : line.description;
    text(desc, cols.desc, y, 9);
    text(line.quantity, cols.qty, y, 9);
    text(money(line.unitPriceExVatCents), cols.price, y, 9);
    text(`${(line.vatRatePermille / 10).toFixed(line.vatRatePermille % 10 ? 1 : 0)}%`, cols.rate, y, 9);
    text(money(line.lineExVatCents), cols.total, y, 9);
    y -= 14;
  }
  y -= 4;
  page.drawLine({
    start: { x: 330, y },
    end: { x: A4[0] - margin, y },
    thickness: 0.5,
    color: gray,
  });
  y -= 14;
  text("Subtotal (excl. VAT)", 330, y, 9);
  text(money(data.totalExVatCents), cols.total, y, 9);
  y -= 14;
  // VAT per rate
  const byRate = new Map<number, number>();
  for (const l of data.lines) byRate.set(l.vatRatePermille, (byRate.get(l.vatRatePermille) ?? 0) + l.lineVatCents);
  for (const [rate, cents] of byRate) {
    text(`VAT ${(rate / 10).toFixed(rate % 10 ? 1 : 0)}%`, 330, y, 9);
    text(money(cents), cols.total, y, 9);
    y -= 14;
  }
  text("Total", 330, y, 11, true);
  text(money(data.totalIncVatCents), cols.total, y, 11, true);
  y -= 24;

  if (data.reverseChargeWording) {
    text(data.reverseChargeWording, margin, y, 9, true);
    y -= 14;
  }

  const payText =
    data.paymentInstructions ??
    (data.business.iban
      ? `Please pay within ${data.paymentTermDays} days to ${data.business.iban}, quoting ${data.number}.`
      : `Please pay within ${data.paymentTermDays} days, quoting ${data.number}.`);
  for (const chunk of wrap(payText, 95)) {
    text(chunk, margin, y, 9);
    y -= 12;
  }
  if (data.notes) {
    y -= 6;
    for (const chunk of wrap(data.notes, 95)) {
      text(chunk, margin, y, 9, false, gray);
      y -= 12;
    }
  }

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

function wrap(s: string, width: number): string[] {
  const words = s.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    if ((current + " " + w).trim().length > width) {
      lines.push(current.trim());
      current = w;
    } else {
      current += " " + w;
    }
  }
  if (current.trim()) lines.push(current.trim());
  return lines;
}
