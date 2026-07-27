/**
 * Report serialization: CSV, XLSX (exceljs), PDF (pdf-lib) and JSON.
 * Every output embeds the generation timestamp and filter criteria.
 */

import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { ReportData } from "./index";

export function reportToCsv(report: ReportData): string {
  const escape = (v: string | number) => {
    const s = String(v);
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    `# ${report.title}`,
    `# Generated: ${report.generatedAt}`,
    `# Period: ${report.filters.from} to ${report.filters.to}`,
    report.columns.map((c) => escape(c.label)).join(";"),
    ...report.rows.map((r) => report.columns.map((c) => escape(r[c.key] ?? "")).join(";")),
  ];
  if (report.footnote) lines.push(`# ${report.footnote}`);
  return lines.join("\r\n");
}

export async function reportToXlsx(report: ReportData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.created = new Date(report.generatedAt);
  const ws = wb.addWorksheet(report.title.slice(0, 31));
  ws.addRow([report.title]);
  ws.addRow([`Generated: ${report.generatedAt}`]);
  ws.addRow([`Period: ${report.filters.from} to ${report.filters.to}`]);
  ws.addRow([]);
  const header = ws.addRow(report.columns.map((c) => c.label));
  header.font = { bold: true };
  for (const row of report.rows) {
    ws.addRow(
      report.columns.map((c) => {
        const v = row[c.key];
        // Numeric-looking money strings become numbers for spreadsheet use.
        if (typeof v === "string" && /^-?\d+\.\d{2}$/.test(v)) return Number(v);
        return v ?? "";
      }),
    );
  }
  if (report.footnote) {
    ws.addRow([]);
    ws.addRow([report.footnote]);
  }
  ws.columns.forEach((col) => {
    let max = 10;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      max = Math.max(max, String(cell.value ?? "").length + 2);
    });
    col.width = Math.min(max, 60);
  });
  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer as ArrayBuffer);
}

export async function reportToPdf(report: ReportData): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [841.89, 595.28]; // A4 landscape
  const margin = 40;
  let page = doc.addPage(pageSize);
  let y = pageSize[1] - margin;

  const newPage = () => {
    page = doc.addPage(pageSize);
    y = pageSize[1] - margin;
  };

  page.drawText(report.title, { x: margin, y, size: 14, font: bold });
  y -= 16;
  page.drawText(
    `Generated ${report.generatedAt} · Period ${report.filters.from} to ${report.filters.to}`,
    { x: margin, y, size: 8, font, color: rgb(0.4, 0.4, 0.4) },
  );
  y -= 20;

  const usable = pageSize[0] - margin * 2;
  const colWidth = usable / report.columns.length;
  const drawRow = (values: (string | number)[], useBold = false) => {
    if (y < margin + 20) newPage();
    values.forEach((v, i) => {
      const s = String(v ?? "");
      page.drawText(s.length > 38 ? s.slice(0, 35) + "…" : s, {
        x: margin + i * colWidth,
        y,
        size: 7.5,
        font: useBold ? bold : font,
      });
    });
    y -= 12;
  };
  drawRow(report.columns.map((c) => c.label), true);
  for (const row of report.rows) {
    drawRow(report.columns.map((c) => row[c.key] ?? ""));
  }
  if (report.footnote) {
    y -= 8;
    if (y < margin) newPage();
    page.drawText(report.footnote, { x: margin, y, size: 8, font, color: rgb(0.4, 0.4, 0.4) });
  }
  return Buffer.from(await doc.save());
}

export function reportToJson(report: ReportData): string {
  return JSON.stringify(report, null, 2);
}
