import { describe, expect, it } from "vitest";
import {
  suggestMatches,
  bankLineFingerprintInput,
  type BankLineForMatching,
  type CandidateRecord,
} from "@/lib/domain/reconciliation";
import { parseBankCsv, detectDelimiter, type ColumnMapping } from "@/lib/domain/bank-csv";
import { validateInvoice } from "@/lib/domain/invoice-validation";

const bankLine: BankLineForMatching = {
  id: "bank-1",
  bookingDate: "2026-07-01",
  amountCents: 121000,
  counterpartyName: "Acme BV",
  counterpartyIban: "NL91ABNA0417164300",
  description: "Payment invoice INV-2026-0001",
  reference: null,
};

describe("suggestMatches", () => {
  it("scores an exact match with explainable reasons", () => {
    const candidates: CandidateRecord[] = [
      {
        id: "inv-1",
        kind: "INVOICE",
        date: "2026-06-28",
        expectedCents: 121000,
        openCents: 121000,
        counterpartyName: "Acme BV",
        counterpartyIban: "NL91ABNA0417164300",
        invoiceNumber: "INV-2026-0001",
      },
    ];
    const suggestions = suggestMatches(bankLine, candidates);
    expect(suggestions).toHaveLength(1);
    const s = suggestions[0]!;
    expect(s.score).toBe(100);
    expect(s.reasons).toContain("exact amount");
    expect(s.reasons).toContain("IBAN matches");
    expect(s.reasons).toContain('invoice number "INV-2026-0001" in description');
    expect(s.partial).toBe(false);
  });

  it("suggests partial payments (one invoice paid in several payments)", () => {
    const candidates: CandidateRecord[] = [
      {
        id: "inv-1",
        kind: "INVOICE",
        date: "2026-06-28",
        expectedCents: 242000,
        openCents: 242000,
        counterpartyName: "Acme BV",
        counterpartyIban: "NL91ABNA0417164300",
        invoiceNumber: "INV-2026-0001",
      },
    ];
    const suggestions = suggestMatches(bankLine, candidates);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]!.partial).toBe(true);
    expect(suggestions[0]!.amountCents).toBe(121000);
  });

  it("never matches opposite directions", () => {
    const candidates: CandidateRecord[] = [
      {
        id: "exp-1",
        kind: "TRANSACTION",
        date: "2026-07-01",
        expectedCents: -121000, // an expense (money out) vs money-in line
        openCents: -121000,
        counterpartyName: "Acme BV",
        counterpartyIban: "NL91ABNA0417164300",
        invoiceNumber: null,
      },
    ];
    expect(suggestMatches(bankLine, candidates)).toHaveLength(0);
  });

  it("drops weak candidates below the threshold", () => {
    const candidates: CandidateRecord[] = [
      {
        id: "x",
        kind: "TRANSACTION",
        date: "2025-01-01",
        expectedCents: 999900,
        openCents: 999900,
        counterpartyName: "Somebody Else",
        counterpartyIban: null,
        invoiceNumber: null,
      },
    ];
    expect(suggestMatches(bankLine, candidates)).toHaveLength(0);
  });
});

describe("bank line fingerprints (duplicate detection)", () => {
  it("is stable for identical lines and differs when content differs", () => {
    const base = {
      bookingDate: "2026-07-01",
      amountCents: -1234,
      counterpartyIban: "NL91ABNA0417164300",
      counterpartyName: "Hosting BV",
      description: "Invoice 42",
    };
    expect(bankLineFingerprintInput(base)).toBe(bankLineFingerprintInput({ ...base }));
    expect(bankLineFingerprintInput(base)).not.toBe(
      bankLineFingerprintInput({ ...base, amountCents: -1235 }),
    );
  });
});

describe("parseBankCsv", () => {
  it("detects delimiters", () => {
    expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";");
    expect(detectDelimiter("a,b,c")).toBe(",");
  });

  it("parses an ING-style export with Af/Bij indicator", () => {
    const csv = [
      '"Datum";"Naam / Omschrijving";"Tegenrekening";"Af Bij";"Bedrag (EUR)";"Mededelingen"',
      '"20260701";"Acme BV";"NL91ABNA0417164300";"Bij";"1210,00";"Payment INV-2026-0001"',
      '"20260702";"Hosting BV";"NL02RABO0123456789";"Af";"12,10";"Hosting July"',
    ].join("\n");
    const mapping: ColumnMapping = {
      date: "Datum",
      amount: "Bedrag (EUR)",
      debitCreditIndicator: "Af Bij",
      debitValue: "Af",
      counterpartyName: "Naam / Omschrijving",
      counterpartyIban: "Tegenrekening",
      description: "Mededelingen",
      dateFormat: "YMD",
      amountAlwaysPositive: true,
    };
    const result = parseBankCsv(csv, mapping);
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({ bookingDate: "2026-07-01", amountCents: 121000 });
    expect(result.rows[1]).toMatchObject({ bookingDate: "2026-07-02", amountCents: -1210 });
  });

  it("parses DMY dates and signed amounts", () => {
    const csv = ["Date,Amount,Description", "01-07-2026,-99.50,Something"].join("\n");
    const result = parseBankCsv(csv, {
      date: "Date",
      amount: "Amount",
      description: "Description",
      dateFormat: "DMY",
    });
    expect(result.rows[0]).toMatchObject({ bookingDate: "2026-07-01", amountCents: -9950 });
  });

  it("collects row errors without failing the whole file", () => {
    const csv = ["Date;Amount", "20260701;10,00", "garbage;not-a-number"].join("\n");
    const result = parseBankCsv(csv, { date: "Date", amount: "Amount", dateFormat: "YMD" });
    expect(result.rows).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.rowNumber).toBe(3);
  });
});

describe("invoice validation", () => {
  it("warns on missing fields and duplicates", () => {
    const warnings = validateInvoice({
      direction: "RECEIVED",
      supplierName: "",
      invoiceNumber: "A-1",
      knownInvoiceNumbers: ["a-1"],
      invoiceDate: null,
      description: "",
    });
    const codes = warnings.map((w) => w.code);
    expect(codes).toContain("MISSING_SUPPLIER_NAME");
    expect(codes).toContain("DUPLICATE_INVOICE_NUMBER");
    expect(codes).toContain("MISSING_INVOICE_DATE");
    expect(codes).toContain("MISSING_DESCRIPTION");
  });

  it("flags VAT calculation mismatches beyond tolerance", () => {
    const warnings = validateInvoice({
      direction: "RECEIVED",
      supplierName: "X",
      supplierAddress: "Y",
      invoiceNumber: "1",
      invoiceDate: "2026-01-01",
      description: "ok",
      lines: [{ netCents: 10000, vatCents: 2000, ratePermille: 210 }],
    });
    expect(warnings.map((w) => w.code)).toContain("VAT_CALCULATION_MISMATCH");
  });

  it("accepts rounding within tolerance", () => {
    const warnings = validateInvoice({
      direction: "RECEIVED",
      supplierName: "X",
      supplierAddress: "Y",
      invoiceNumber: "1",
      invoiceDate: "2026-01-01",
      description: "ok",
      lines: [{ netCents: 999, vatCents: 209, ratePermille: 210 }],
    });
    expect(warnings.map((w) => w.code)).not.toContain("VAT_CALCULATION_MISMATCH");
  });

  it("flags country/treatment conflicts and pre-registration dates", () => {
    const warnings = validateInvoice({
      direction: "RECEIVED",
      supplierName: "OpenAI",
      supplierAddress: "US",
      supplierCountry: "US",
      invoiceNumber: "1",
      invoiceDate: "2026-01-01",
      description: "API",
      treatment: "EU_SERVICE",
      kvkRegisteredOn: "2026-02-01",
    });
    const codes = warnings.map((w) => w.code);
    expect(codes).toContain("COUNTRY_TREATMENT_CONFLICT");
    expect(codes).toContain("PREDATES_KVK_REGISTRATION");
  });

  it("flags personally addressed invoices", () => {
    const warnings = validateInvoice({
      direction: "RECEIVED",
      supplierName: "Apple",
      supplierAddress: "IE",
      invoiceNumber: "1",
      invoiceDate: "2026-01-01",
      description: "Developer Program",
      addressedToName: "J. Jansen",
      businessNames: ["Jansen Apps"],
    });
    expect(warnings.map((w) => w.code)).toContain("ADDRESSED_PERSONALLY");
  });
});
