import { describe, expect, it } from "vitest";
import {
  ACCOUNTS,
  assertBalanced,
  buildExpenseJournal,
  buildIncomeJournal,
  buildOwnerFlowJournal,
  buildDepreciationJournal,
  UnbalancedJournalError,
  JournalInputError,
  type JournalLine,
} from "@/lib/domain/journal";

function total(lines: JournalLine[], side: "debitCents" | "creditCents"): number {
  return lines.reduce((s, l) => s + l[side], 0);
}
function on(lines: JournalLine[], key: string) {
  return lines.filter((l) => l.accountKey === key);
}
function net(lines: JournalLine[], key: string): number {
  return on(lines, key).reduce((s, l) => s + l.debitCents - l.creditCents, 0);
}

describe("assertBalanced", () => {
  it("accepts balanced journals", () => {
    expect(() =>
      assertBalanced([
        { accountKey: "a", debitCents: 100, creditCents: 0 },
        { accountKey: "b", debitCents: 0, creditCents: 100 },
      ]),
    ).not.toThrow();
  });
  it("rejects unbalanced journals", () => {
    expect(() =>
      assertBalanced([
        { accountKey: "a", debitCents: 100, creditCents: 0 },
        { accountKey: "b", debitCents: 0, creditCents: 99 },
      ]),
    ).toThrow(UnbalancedJournalError);
  });
  it("rejects lines with both or neither side set", () => {
    expect(() =>
      assertBalanced([
        { accountKey: "a", debitCents: 100, creditCents: 100 },
        { accountKey: "b", debitCents: 0, creditCents: 0 },
      ]),
    ).toThrow(UnbalancedJournalError);
  });
  it("rejects single-line journals and negative amounts", () => {
    expect(() => assertBalanced([{ accountKey: "a", debitCents: 1, creditCents: 0 }])).toThrow();
    expect(() =>
      assertBalanced([
        { accountKey: "a", debitCents: -5, creditCents: 0 },
        { accountKey: "b", debitCents: 0, creditCents: -5 },
      ]),
    ).toThrow(UnbalancedJournalError);
  });
});

describe("buildExpenseJournal", () => {
  it("books a simple domestic expense paid from business bank", () => {
    const lines = buildExpenseJournal({
      items: [{ description: "Hosting", netCents: 10000, vatCents: 2100 }],
      paidFrom: "BUSINESS_BANK",
    });
    expect(total(lines, "debitCents")).toBe(total(lines, "creditCents"));
    expect(net(lines, ACCOUNTS.OPERATING_EXPENSES)).toBe(10000);
    expect(net(lines, ACCOUNTS.INPUT_VAT)).toBe(2100);
    expect(net(lines, ACCOUNTS.BANK_BUSINESS)).toBe(-12100);
  });

  it("books personally paid expenses against owner contributions", () => {
    const lines = buildExpenseJournal({
      items: [{ description: "KVK fee", netCents: 8000, vatCents: 0 }],
      paidFrom: "PERSONAL",
    });
    expect(net(lines, ACCOUNTS.OWNER_CONTRIBUTIONS)).toBe(-8000);
    expect(total(lines, "debitCents")).toBe(total(lines, "creditCents"));
  });

  it("supports multiple VAT rates on one invoice", () => {
    const lines = buildExpenseJournal({
      items: [
        { description: "High-rate item", netCents: 10000, vatCents: 2100 },
        { description: "Low-rate item", netCents: 5000, vatCents: 450 },
      ],
      paidFrom: "NOT_PAID",
    });
    expect(net(lines, ACCOUNTS.INPUT_VAT)).toBe(2550);
    expect(net(lines, ACCOUNTS.ACCOUNTS_PAYABLE)).toBe(-17550);
    expect(total(lines, "debitCents")).toBe(total(lines, "creditCents"));
  });

  it("splits mixed-use cost between business and private", () => {
    const lines = buildExpenseJournal({
      items: [{ description: "Phone", netCents: 6000, vatCents: 1260 }],
      paidFrom: "BUSINESS_BANK",
      businessUseBp: 7000, // 70%
      vatRecoveryBp: 7000,
    });
    expect(net(lines, ACCOUNTS.OPERATING_EXPENSES)).toBe(4200);
    expect(net(lines, ACCOUNTS.PRIVATE_EXPENSE_NON_DEDUCTIBLE)).toBe(6000 - 4200 + (1260 - 617));
    // recoverable VAT = 70% of 70% of 1260 = 617.4 -> 617
    expect(net(lines, ACCOUNTS.INPUT_VAT)).toBe(617);
    expect(net(lines, ACCOUNTS.BANK_BUSINESS)).toBe(-7260);
    expect(total(lines, "debitCents")).toBe(total(lines, "creditCents"));
  });

  it("books EU service (reverse charge) with self-assessed VAT", () => {
    const lines = buildExpenseJournal({
      items: [
        {
          description: "OpenAI API",
          netCents: 10000,
          vatCents: 2100,
          treatment: "EU_SERVICE",
        },
      ],
      paidFrom: "BUSINESS_BANK",
    });
    // Supplier is paid net only; VAT is self-assessed both ways.
    expect(net(lines, ACCOUNTS.BANK_BUSINESS)).toBe(-10000);
    expect(net(lines, ACCOUNTS.INPUT_VAT)).toBe(2100);
    expect(net(lines, ACCOUNTS.OUTPUT_VAT)).toBe(-2100);
    expect(total(lines, "debitCents")).toBe(total(lines, "creditCents"));
  });

  it("books foreign VAT as cost, never as Dutch input VAT", () => {
    const lines = buildExpenseJournal({
      items: [
        { description: "Foreign SaaS", netCents: 10000, vatCents: 2300, treatment: "FOREIGN_VAT" },
      ],
      paidFrom: "BUSINESS_BANK",
    });
    expect(on(lines, ACCOUNTS.INPUT_VAT)).toHaveLength(0);
    expect(net(lines, ACCOUNTS.OPERATING_EXPENSES)).toBe(12300);
    expect(net(lines, ACCOUNTS.BANK_BUSINESS)).toBe(-12300);
  });

  it("books assets to the fixed-assets account", () => {
    const lines = buildExpenseJournal({
      items: [{ description: "Laptop", netCents: 150000, vatCents: 31500 }],
      paidFrom: "BUSINESS_BANK",
      asAsset: true,
    });
    expect(net(lines, ACCOUNTS.FIXED_ASSETS)).toBe(150000);
  });

  it("rejects negative lines", () => {
    expect(() =>
      buildExpenseJournal({
        items: [{ description: "bad", netCents: -100, vatCents: 0 }],
        paidFrom: "BUSINESS_BANK",
      }),
    ).toThrow(JournalInputError);
  });
});

describe("buildIncomeJournal", () => {
  it("books a client invoice with VAT as receivable", () => {
    const lines = buildIncomeJournal({
      items: [{ description: "App development", netCents: 100000, vatCents: 21000 }],
      receivedInto: "NOT_RECEIVED",
    });
    expect(net(lines, ACCOUNTS.REVENUE)).toBe(-100000);
    expect(net(lines, ACCOUNTS.OUTPUT_VAT)).toBe(-21000);
    expect(net(lines, ACCOUNTS.ACCOUNTS_RECEIVABLE)).toBe(121000);
    expect(total(lines, "debitCents")).toBe(total(lines, "creditCents"));
  });

  it("books a platform payout with commission (gross revenue kept visible)", () => {
    const lines = buildIncomeJournal({
      items: [{ description: "App Store sales June", netCents: 100000, vatCents: 0 }],
      feeCents: 15000,
      receivedInto: "BUSINESS_BANK",
    });
    expect(net(lines, ACCOUNTS.REVENUE)).toBe(-100000);
    expect(net(lines, ACCOUNTS.PLATFORM_FEES)).toBe(15000);
    expect(net(lines, ACCOUNTS.BANK_BUSINESS)).toBe(85000);
  });

  it("rejects fees exceeding gross", () => {
    expect(() =>
      buildIncomeJournal({
        items: [{ description: "x", netCents: 100, vatCents: 0 }],
        feeCents: 200,
        receivedInto: "BUSINESS_BANK",
      }),
    ).toThrow(JournalInputError);
  });
});

describe("owner flows never touch profit", () => {
  const plAccounts: string[] = [
    ACCOUNTS.REVENUE,
    ACCOUNTS.OPERATING_EXPENSES,
    ACCOUNTS.PLATFORM_FEES,
    ACCOUNTS.DEPRECIATION_EXPENSE,
  ];

  it("owner contribution: bank up, equity up, no P&L", () => {
    const lines = buildOwnerFlowJournal({ kind: "OWNER_CONTRIBUTION", amountCents: 50000 });
    expect(net(lines, ACCOUNTS.BANK_BUSINESS)).toBe(50000);
    expect(net(lines, ACCOUNTS.OWNER_CONTRIBUTIONS)).toBe(-50000);
    expect(lines.every((l) => !plAccounts.includes(l.accountKey as string))).toBe(true);
  });

  it("owner withdrawal: equity up (debit), bank down, no P&L", () => {
    const lines = buildOwnerFlowJournal({ kind: "OWNER_WITHDRAWAL", amountCents: 30000 });
    expect(net(lines, ACCOUNTS.OWNER_WITHDRAWALS)).toBe(30000);
    expect(net(lines, ACCOUNTS.BANK_BUSINESS)).toBe(-30000);
    expect(lines.every((l) => !plAccounts.includes(l.accountKey as string))).toBe(true);
  });

  it("own-account transfer: asset to asset only", () => {
    const lines = buildOwnerFlowJournal({
      kind: "OWN_TRANSFER",
      amountCents: 20000,
      fromAccountKey: ACCOUNTS.BANK_PERSONAL,
      toAccountKey: ACCOUNTS.BANK_BUSINESS,
    });
    expect(net(lines, ACCOUNTS.BANK_BUSINESS)).toBe(20000);
    expect(net(lines, ACCOUNTS.BANK_PERSONAL)).toBe(-20000);
    expect(lines.every((l) => !plAccounts.includes(l.accountKey as string))).toBe(true);
  });

  it("rejects transfers between the same account and non-positive amounts", () => {
    expect(() =>
      buildOwnerFlowJournal({
        kind: "OWN_TRANSFER",
        amountCents: 100,
        fromAccountKey: ACCOUNTS.BANK_BUSINESS,
        toAccountKey: ACCOUNTS.BANK_BUSINESS,
      }),
    ).toThrow(JournalInputError);
    expect(() => buildOwnerFlowJournal({ kind: "OWNER_CONTRIBUTION", amountCents: 0 })).toThrow(
      JournalInputError,
    );
  });
});

describe("depreciation journal", () => {
  it("books expense against accumulated depreciation", () => {
    const lines = buildDepreciationJournal(12500, "Laptop 2026");
    expect(net(lines, ACCOUNTS.DEPRECIATION_EXPENSE)).toBe(12500);
    expect(net(lines, ACCOUNTS.ACCUMULATED_DEPRECIATION)).toBe(-12500);
  });
});
