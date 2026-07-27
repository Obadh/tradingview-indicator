/**
 * Generic bank-CSV column mapping. The import wizard lets the user map the
 * columns of their bank's export to canonical fields; the mapping is stored
 * on the BankStatementImport for reuse. Parsing is deterministic; amounts go
 * through the exact money parser.
 */

import { parse } from "csv-parse/sync";
import { parseAmountToCents } from "./money";

export interface ColumnMapping {
  date: string;
  amount: string;
  /** Optional separate debit/credit indicator column (e.g. "Af Bij"). */
  debitCreditIndicator?: string;
  debitValue?: string; // value meaning "money out", e.g. "Af" or "D"
  description?: string;
  counterpartyName?: string;
  counterpartyIban?: string;
  reference?: string;
  /** Date format: "YMD" (2026-01-31 / 20260131), "DMY" (31-01-2026). */
  dateFormat: "YMD" | "DMY";
  /** Some banks export amounts always positive with the indicator column. */
  amountAlwaysPositive?: boolean;
}

export interface ParsedBankRow {
  rowNumber: number;
  bookingDate: string; // ISO
  amountCents: number; // signed
  description: string | null;
  counterpartyName: string | null;
  counterpartyIban: string | null;
  reference: string | null;
}

export interface ParseResult {
  rows: ParsedBankRow[];
  errors: { rowNumber: number; message: string }[];
  headers: string[];
}

export function detectDelimiter(sample: string): string {
  const firstLine = sample.split(/\r?\n/, 1)[0] ?? "";
  const counts: [string, number][] = [";", ",", "\t"].map((d) => [
    d,
    firstLine.split(d).length - 1,
  ]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0]![1] > 0 ? counts[0]![0] : ",";
}

export function readCsvHeaders(content: string): string[] {
  const delimiter = detectDelimiter(content);
  const records: string[][] = parse(content, {
    delimiter,
    to_line: 1,
    relax_column_count: true,
    bom: true,
  });
  return (records[0] ?? []).map((h) => h.trim());
}

function parseDate(raw: string, format: "YMD" | "DMY"): string {
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length !== 8) throw new Error(`Unrecognized date: "${raw}"`);
  let y: string, m: string, d: string;
  if (format === "YMD") {
    y = digits.slice(0, 4);
    m = digits.slice(4, 6);
    d = digits.slice(6, 8);
  } else {
    d = digits.slice(0, 2);
    m = digits.slice(2, 4);
    y = digits.slice(4, 8);
  }
  const mo = Number(m);
  const day = Number(d);
  if (mo < 1 || mo > 12 || day < 1 || day > 31) throw new Error(`Invalid date: "${raw}"`);
  return `${y}-${m}-${d}`;
}

export function parseBankCsv(content: string, mapping: ColumnMapping): ParseResult {
  const delimiter = detectDelimiter(content);
  const records: Record<string, string>[] = parse(content, {
    delimiter,
    columns: (header: string[]) => header.map((h) => h.trim()),
    relax_column_count: true,
    skip_empty_lines: true,
    bom: true,
  });

  const rows: ParsedBankRow[] = [];
  const errors: ParseResult["errors"] = [];
  records.forEach((record, i) => {
    const rowNumber = i + 2; // header is line 1
    try {
      const rawAmount = record[mapping.amount];
      if (rawAmount === undefined) throw new Error(`Missing amount column "${mapping.amount}"`);
      let amountCents = parseAmountToCents(rawAmount);
      if (mapping.debitCreditIndicator) {
        const indicator = (record[mapping.debitCreditIndicator] ?? "").trim().toLowerCase();
        const debitValue = (mapping.debitValue ?? "af").trim().toLowerCase();
        const magnitude = mapping.amountAlwaysPositive ? Math.abs(amountCents) : amountCents;
        amountCents = indicator === debitValue ? -Math.abs(magnitude) : Math.abs(magnitude);
      }
      const rawDate = record[mapping.date];
      if (!rawDate) throw new Error(`Missing date column "${mapping.date}"`);
      rows.push({
        rowNumber,
        bookingDate: parseDate(rawDate, mapping.dateFormat),
        amountCents,
        description: mapping.description ? (record[mapping.description] ?? null) : null,
        counterpartyName: mapping.counterpartyName ? (record[mapping.counterpartyName] ?? null) : null,
        counterpartyIban: mapping.counterpartyIban ? (record[mapping.counterpartyIban] ?? null) : null,
        reference: mapping.reference ? (record[mapping.reference] ?? null) : null,
      });
    } catch (e) {
      errors.push({ rowNumber, message: e instanceof Error ? e.message : String(e) });
    }
  });

  return { rows, errors, headers: readCsvHeaders(content) };
}

/** Known presets for common Dutch banks (user can still adjust mappings). */
export const BANK_CSV_PRESETS: Record<string, ColumnMapping> = {
  ING: {
    date: "Date",
    amount: "Amount (EUR)",
    debitCreditIndicator: "Debit/credit",
    debitValue: "Debit",
    description: "Notifications",
    counterpartyName: "Name / Description",
    counterpartyIban: "Counterparty",
    dateFormat: "YMD",
    amountAlwaysPositive: true,
  },
  "ING (NL)": {
    date: "Datum",
    amount: "Bedrag (EUR)",
    debitCreditIndicator: "Af Bij",
    debitValue: "Af",
    description: "Mededelingen",
    counterpartyName: "Naam / Omschrijving",
    counterpartyIban: "Tegenrekening",
    dateFormat: "YMD",
    amountAlwaysPositive: true,
  },
  Rabobank: {
    date: "Datum",
    amount: "Bedrag",
    description: "Omschrijving-1",
    counterpartyName: "Naam tegenpartij",
    counterpartyIban: "Tegenrekening IBAN/BBAN",
    reference: "Betalingskenmerk",
    dateFormat: "YMD",
  },
  Bunq: {
    date: "Date",
    amount: "Amount",
    description: "Description",
    counterpartyName: "Name",
    counterpartyIban: "Counterparty",
    dateFormat: "YMD",
  },
};
