import { describe, expect, it } from "vitest";
import { computeVatPeriodSummary, typicalVatDeadline, type VatLineInput } from "@/lib/domain/vat";

function line(partial: Partial<VatLineInput> & Pick<VatLineInput, "transactionId">): VatLineInput {
  return {
    direction: "SALE",
    treatment: "DOMESTIC_HIGH",
    ratePermille: 210,
    netCents: 0,
    vatCents: 0,
    ...partial,
  };
}

describe("computeVatPeriodSummary", () => {
  it("puts domestic sales in 1a/1b and computes the balance", () => {
    const summary = computeVatPeriodSummary([
      line({ transactionId: "t1", netCents: 100000, vatCents: 21000 }),
      line({ transactionId: "t2", treatment: "DOMESTIC_LOW", ratePermille: 90, netCents: 50000, vatCents: 4500 }),
      line({ transactionId: "t3", direction: "PURCHASE", netCents: 20000, vatCents: 4200 }),
    ]);
    const box1a = summary.boxes.find((b) => b.box === "1a")!;
    expect(box1a.baseCents).toBe(100000);
    expect(box1a.vatCents).toBe(21000);
    const box1b = summary.boxes.find((b) => b.box === "1b")!;
    expect(box1b.vatCents).toBe(4500);
    expect(summary.outputVatCents).toBe(25500);
    expect(summary.inputVatCents).toBe(4200);
    expect(summary.estimatedBalanceCents).toBe(21300);
  });

  it("handles EU services: owed in 4b and deducted in 5b", () => {
    const summary = computeVatPeriodSummary([
      line({
        transactionId: "t1",
        direction: "PURCHASE",
        treatment: "EU_SERVICE",
        netCents: 10000,
        vatCents: 2100,
      }),
    ]);
    const box4b = summary.boxes.find((b) => b.box === "4b")!;
    expect(box4b.baseCents).toBe(10000);
    expect(box4b.vatCents).toBe(2100);
    expect(summary.reverseChargeVatCents).toBe(2100);
    expect(summary.inputVatCents).toBe(2100);
    expect(summary.estimatedBalanceCents).toBe(0); // fully deductible: net zero
  });

  it("computes self-assessed VAT from rate when not provided", () => {
    const summary = computeVatPeriodSummary([
      line({
        transactionId: "t1",
        direction: "PURCHASE",
        treatment: "EU_ACQUISITION",
        netCents: 10000,
        vatCents: 0,
        ratePermille: 210,
      }),
    ]);
    expect(summary.reverseChargeVatCents).toBe(2100);
  });

  it("limits recovery by the vatRecoveryBp on purchases", () => {
    const summary = computeVatPeriodSummary([
      line({
        transactionId: "t1",
        direction: "PURCHASE",
        netCents: 10000,
        vatCents: 2100,
        vatRecoveryBp: 5000,
      }),
    ]);
    expect(summary.inputVatCents).toBe(1050);
  });

  it("never treats foreign VAT as input VAT", () => {
    const summary = computeVatPeriodSummary([
      line({
        transactionId: "t1",
        direction: "PURCHASE",
        treatment: "FOREIGN_VAT",
        netCents: 10000,
        vatCents: 2300,
      }),
    ]);
    expect(summary.inputVatCents).toBe(0);
    expect(summary.estimatedBalanceCents).toBe(0);
  });

  it("excludes needs-review and UNKNOWN records and reports them", () => {
    const summary = computeVatPeriodSummary([
      line({ transactionId: "ok", netCents: 10000, vatCents: 2100 }),
      line({ transactionId: "flagged", netCents: 999999, vatCents: 99999, needsReview: true }),
      line({ transactionId: "unknown", treatment: "UNKNOWN", netCents: 5000, vatCents: 0 }),
    ]);
    expect(summary.outputVatCents).toBe(2100);
    expect(summary.needsReviewTransactionIds.sort()).toEqual(["flagged", "unknown"]);
    expect(summary.includedTransactionIds).toEqual(["ok"]);
  });

  it("puts reverse-charged EU sales in 3b without VAT", () => {
    const summary = computeVatPeriodSummary([
      line({ transactionId: "t1", treatment: "REVERSE_CHARGE_SALE", ratePermille: 0, netCents: 250000, vatCents: 0 }),
    ]);
    const box3b = summary.boxes.find((b) => b.box === "3b")!;
    expect(box3b.baseCents).toBe(250000);
    expect(summary.outputVatCents).toBe(0);
  });

  it("produces an empty (zero-return) summary without records", () => {
    const summary = computeVatPeriodSummary([]);
    expect(summary.estimatedBalanceCents).toBe(0);
    expect(summary.includedTransactionIds).toHaveLength(0);
  });
});

describe("typicalVatDeadline", () => {
  it("is the last day of the following month", () => {
    expect(typicalVatDeadline({ year: 2026, month: 3 })).toEqual({ year: 2026, month: 4, day: 30 });
    expect(typicalVatDeadline({ year: 2026, month: 6 })).toEqual({ year: 2026, month: 7, day: 31 });
    expect(typicalVatDeadline({ year: 2026, month: 12 })).toEqual({ year: 2027, month: 1, day: 31 });
    expect(typicalVatDeadline({ year: 2028, month: 1 })).toEqual({ year: 2028, month: 2, day: 29 });
  });
});
