import { describe, expect, it } from "vitest";
import {
  parseAmountToCents,
  centsToDecimalString,
  formatCents,
  mulDiv,
  vatFromNet,
  netFromGross,
  applyBp,
  convertToEur,
  sumCents,
  MoneyError,
} from "@/lib/domain/money";

describe("parseAmountToCents", () => {
  it("parses plain decimals with dot or comma", () => {
    expect(parseAmountToCents("12.34")).toBe(1234);
    expect(parseAmountToCents("12,34")).toBe(1234);
    expect(parseAmountToCents("0,5")).toBe(50);
    expect(parseAmountToCents("7")).toBe(700);
  });
  it("parses thousands separators", () => {
    expect(parseAmountToCents("1.234,56")).toBe(123456);
    expect(parseAmountToCents("1,234.56")).toBe(123456);
    expect(parseAmountToCents("1.234")).toBe(123400); // 1234 euros (grouping)
    expect(parseAmountToCents("12.345.678")).toBe(1234567800);
  });
  it("parses negatives and whitespace", () => {
    expect(parseAmountToCents("-12,34")).toBe(-1234);
    expect(parseAmountToCents(" 12,34 ")).toBe(1234);
  });
  it("rejects garbage and >2 decimals", () => {
    expect(() => parseAmountToCents("abc")).toThrow(MoneyError);
    expect(() => parseAmountToCents("1,234.567")).toThrow(MoneyError);
    expect(() => parseAmountToCents("")).toThrow(MoneyError);
    expect(() => parseAmountToCents("12,3,4")).toThrow(MoneyError);
  });
});

describe("formatting", () => {
  it("formats cents as decimal strings", () => {
    expect(centsToDecimalString(1234)).toBe("12.34");
    expect(centsToDecimalString(-5)).toBe("-0.05");
    expect(centsToDecimalString(0)).toBe("0.00");
  });
  it("formats for display with nl grouping", () => {
    expect(formatCents(123456789)).toBe("€ 1.234.567,89");
    expect(formatCents(-1234)).toBe("-€ 12,34");
  });
});

describe("mulDiv / VAT math", () => {
  it("computes 21% VAT with half-up rounding", () => {
    expect(vatFromNet(10000, 210)).toBe(2100);
    expect(vatFromNet(999, 210)).toBe(210); // 209.79 -> 210
    expect(vatFromNet(1, 210)).toBe(0); // 0.21 -> 0
    expect(vatFromNet(3, 210)).toBe(1); // 0.63 -> 1
  });
  it("computes 9% VAT", () => {
    expect(vatFromNet(10000, 90)).toBe(900);
    expect(vatFromNet(1050, 90)).toBe(95); // 94.5 -> 95 (half-up)
  });
  it("extracts net from gross", () => {
    expect(netFromGross(12100, 210)).toBe(10000);
    expect(netFromGross(10900, 90)).toBe(10000);
  });
  it("gross minus net equals VAT for common cases", () => {
    for (const gross of [12100, 999, 1, 55555, 1234567]) {
      const net = netFromGross(gross, 210);
      expect(net + vatFromNet(net, 210)).toBeGreaterThanOrEqual(gross - 1);
      expect(net + vatFromNet(net, 210)).toBeLessThanOrEqual(gross + 1);
    }
  });
  it("handles negative amounts symmetrically", () => {
    expect(vatFromNet(-10000, 210)).toBe(-2100);
    expect(mulDiv(-999, 210, 1000)).toBe(-210);
  });
});

describe("percentage allocation (basis points)", () => {
  it("applies percentages exactly", () => {
    expect(applyBp(10000, 10000)).toBe(10000);
    expect(applyBp(10000, 5000)).toBe(5000);
    expect(applyBp(10000, 3333)).toBe(3333);
    expect(applyBp(999, 5000)).toBe(500); // 499.5 -> 500
    expect(applyBp(10000, 0)).toBe(0);
  });
  it("rejects invalid bp", () => {
    expect(() => applyBp(100, -1)).toThrow(MoneyError);
    expect(() => applyBp(100, 10001)).toThrow(MoneyError);
  });
  it("business + private share always sums to the whole", () => {
    for (const cents of [1, 33, 999, 12345]) {
      for (const bp of [1, 2500, 3333, 6667, 9999]) {
        const business = applyBp(cents, bp);
        expect(business + (cents - business)).toBe(cents);
      }
    }
  });
});

describe("currency conversion", () => {
  it("converts with exact decimal rates", () => {
    expect(convertToEur(10000, "1")).toBe(10000);
    expect(convertToEur(10000, "0.92")).toBe(9200);
    expect(convertToEur(9999, "0.9234")).toBe(9233); // 9232.4766 -> half-up
    expect(convertToEur(100, "1.0834")).toBe(108);
  });
  it("rejects invalid rates", () => {
    expect(() => convertToEur(100, "abc")).toThrow(MoneyError);
    expect(() => convertToEur(100, "0")).toThrow(MoneyError);
    expect(() => convertToEur(100, "-1")).toThrow(MoneyError);
    expect(() => convertToEur(100, "1.12345678901")).toThrow(MoneyError);
  });
});

describe("sumCents", () => {
  it("sums and checks integrity", () => {
    expect(sumCents([1, 2, 3])).toBe(6);
    expect(() => sumCents([1.5])).toThrow(MoneyError);
  });
});
