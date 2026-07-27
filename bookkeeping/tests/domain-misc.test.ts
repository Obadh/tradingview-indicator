import { describe, expect, it } from "vitest";
import { depreciationSchedule, annualDepreciation } from "@/lib/domain/depreciation";
import { retentionEligibleDate, isRetentionEligible } from "@/lib/domain/retention";
import { exportFilename, sanitizeFilenamePart } from "@/lib/domain/filenames";
import { vatPeriodRange, vatPeriodFor, isoDateToUtc, utcToIsoDate } from "@/lib/domain/dates";
import { computeCompleteness } from "@/lib/domain/completeness";

describe("depreciation", () => {
  it("distributes straight-line charges exactly over the useful life", () => {
    const schedule = depreciationSchedule({
      purchasePriceExVatCents: 150000,
      residualValueCents: 0,
      businessUseBp: 10000,
      usefulLifeMonths: 60,
      inUseDate: "2026-03-15",
    });
    expect(schedule).toHaveLength(60);
    expect(schedule[0]).toEqual({ year: 2026, month: 3, chargeCents: 2500 });
    expect(schedule.reduce((s, c) => s + c.chargeCents, 0)).toBe(150000);
  });
  it("absorbs rounding in the final month", () => {
    const schedule = depreciationSchedule({
      purchasePriceExVatCents: 100000,
      residualValueCents: 0,
      businessUseBp: 10000,
      usefulLifeMonths: 36,
      inUseDate: "2026-01-01",
    });
    expect(schedule.reduce((s, c) => s + c.chargeCents, 0)).toBe(100000);
    expect(schedule[35]!.chargeCents).not.toBe(schedule[0]!.chargeCents);
  });
  it("depreciates only the business share above residual value", () => {
    const schedule = depreciationSchedule({
      purchasePriceExVatCents: 100000,
      residualValueCents: 10000,
      businessUseBp: 8000,
      usefulLifeMonths: 12,
      inUseDate: "2026-01-01",
    });
    expect(schedule.reduce((s, c) => s + c.chargeCents, 0)).toBe(72000);
    const annual = annualDepreciation(schedule);
    expect(annual[2026]).toBe(72000);
  });
  it("rejects residual above price", () => {
    expect(() =>
      depreciationSchedule({
        purchasePriceExVatCents: 100,
        residualValueCents: 200,
        businessUseBp: 10000,
        usefulLifeMonths: 12,
        inUseDate: "2026-01-01",
      }),
    ).toThrow();
  });
});

describe("retention", () => {
  it("computes the earliest eligible date from year end + retention years", () => {
    expect(retentionEligibleDate("2026-05-10", 7)).toBe("2034-01-01");
    expect(retentionEligibleDate("2026-12-31", 7)).toBe("2034-01-01");
  });
  it("checks eligibility against today", () => {
    expect(isRetentionEligible("2016-01-01", "2024-01-01", 7)).toBe(true);
    expect(isRetentionEligible("2020-01-01", "2024-01-01", 7)).toBe(false);
  });
});

describe("export filenames", () => {
  it("sanitizes unsafe characters and traversal", () => {
    expect(sanitizeFilenamePart("../../etc/passwd")).toBe("etc-passwd");
    expect(sanitizeFilenamePart("Café & Zo BV")).toBe("Cafe-Zo-BV");
    expect(sanitizeFilenamePart("")).toBe("unnamed");
  });
  it("builds the predictable export name", () => {
    const name = exportFilename({
      isoDate: "2026-03-01",
      party: "Apple Distribution International",
      invoiceNumber: "ML-2026/001",
      amountCents: 9900,
      currency: "EUR",
      documentId: "abcd1234-5678-90ab-cdef-1234567890ab",
      mimeType: "application/pdf",
      originalFilename: "invoice.pdf",
    });
    expect(name).toBe("2026-03-01_Apple-Distribution-International_ML-2026-001_99.00-EUR_abcd1234.pdf");
  });
});

describe("VAT periods & dates", () => {
  it("computes quarter ranges", () => {
    expect(vatPeriodRange("QUARTERLY", 2026, 2)).toMatchObject({
      start: "2026-04-01",
      end: "2026-06-30",
      label: "Q2 2026",
    });
    expect(vatPeriodRange("MONTHLY", 2026, 2).end).toBe("2026-02-28");
    expect(vatPeriodRange("MONTHLY", 2028, 2).end).toBe("2028-02-29");
  });
  it("finds the period for a date", () => {
    expect(vatPeriodFor("QUARTERLY", "2026-07-27")).toEqual({ year: 2026, periodNo: 3 });
    expect(vatPeriodFor("MONTHLY", "2026-07-27")).toEqual({ year: 2026, periodNo: 7 });
    expect(vatPeriodFor("YEARLY", "2026-07-27")).toEqual({ year: 2026, periodNo: 0 });
  });
  it("round-trips ISO dates as UTC-midnight Dates", () => {
    expect(utcToIsoDate(isoDateToUtc("2026-02-28"))).toBe("2026-02-28");
    expect(() => isoDateToUtc("28-02-2026")).toThrow();
  });
});

describe("completeness score", () => {
  it("is 100 when everything is resolved", () => {
    const score = computeCompleteness({
      totalTransactions: 50,
      transactionsNeedingReview: 0,
      transactionsWithoutDocuments: 0,
      documentsNeedingReview: 0,
      unreconciledBankLines: 0,
      invoicesMissingDetails: 0,
      unmatchedDocuments: 0,
    });
    expect(score.score).toBe(100);
  });
  it("drops with open items and explains components", () => {
    const score = computeCompleteness({
      totalTransactions: 10,
      transactionsNeedingReview: 5,
      transactionsWithoutDocuments: 2,
      documentsNeedingReview: 1,
      unreconciledBankLines: 3,
      invoicesMissingDetails: 0,
      unmatchedDocuments: 0,
    });
    expect(score.score).toBeLessThan(100);
    expect(score.components.find((c) => c.key === "review")!.openItems).toBe(5);
  });
});
