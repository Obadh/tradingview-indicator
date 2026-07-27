/**
 * Journal building and balance enforcement.
 *
 * The UI presents simple income/expense/transfer forms; this module turns
 * them into balanced double-entry journal lines against the chart of
 * accounts. A transaction can never finalize unbalanced: builders throw
 * `UnbalancedJournalError` and the persistence layer re-asserts balance.
 */

import { applyBp, assertCents, sumCents } from "./money";

export class UnbalancedJournalError extends Error {}
export class JournalInputError extends Error {}

/** Stable systemKey values for the minimal eenmanszaak chart of accounts. */
export const ACCOUNTS = {
  BANK_BUSINESS: "bank_business",
  BANK_PERSONAL: "bank_personal",
  CASH: "cash",
  OWNER_CAPITAL: "owner_capital",
  OWNER_CONTRIBUTIONS: "owner_contributions",
  OWNER_WITHDRAWALS: "owner_withdrawals",
  ACCOUNTS_RECEIVABLE: "accounts_receivable",
  ACCOUNTS_PAYABLE: "accounts_payable",
  REVENUE: "revenue",
  PLATFORM_FEES: "platform_fees",
  OPERATING_EXPENSES: "operating_expenses",
  INPUT_VAT: "input_vat",
  OUTPUT_VAT: "output_vat",
  VAT_PAYABLE: "vat_payable",
  VAT_RECEIVABLE: "vat_receivable",
  FIXED_ASSETS: "fixed_assets",
  DEPRECIATION_EXPENSE: "depreciation_expense",
  ACCUMULATED_DEPRECIATION: "accumulated_depreciation",
  TAX_CLEARING: "tax_clearing",
  PRIVATE_EXPENSE_NON_DEDUCTIBLE: "private_non_deductible",
} as const;

export type SystemAccountKey = (typeof ACCOUNTS)[keyof typeof ACCOUNTS];

export const CHART_OF_ACCOUNTS: {
  code: string;
  name: string;
  type: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
  systemKey: SystemAccountKey;
}[] = [
  { code: "1000", name: "Business bank account", type: "ASSET", systemKey: ACCOUNTS.BANK_BUSINESS },
  { code: "1010", name: "Personal bank account (business part)", type: "ASSET", systemKey: ACCOUNTS.BANK_PERSONAL },
  { code: "1020", name: "Cash", type: "ASSET", systemKey: ACCOUNTS.CASH },
  { code: "1100", name: "Accounts receivable", type: "ASSET", systemKey: ACCOUNTS.ACCOUNTS_RECEIVABLE },
  { code: "1200", name: "Input VAT (voorbelasting)", type: "ASSET", systemKey: ACCOUNTS.INPUT_VAT },
  { code: "1300", name: "VAT receivable", type: "ASSET", systemKey: ACCOUNTS.VAT_RECEIVABLE },
  { code: "1500", name: "Fixed assets", type: "ASSET", systemKey: ACCOUNTS.FIXED_ASSETS },
  { code: "1510", name: "Accumulated depreciation", type: "ASSET", systemKey: ACCOUNTS.ACCUMULATED_DEPRECIATION },
  { code: "2000", name: "Accounts payable", type: "LIABILITY", systemKey: ACCOUNTS.ACCOUNTS_PAYABLE },
  { code: "2100", name: "Output VAT (btw over omzet)", type: "LIABILITY", systemKey: ACCOUNTS.OUTPUT_VAT },
  { code: "2110", name: "VAT payable", type: "LIABILITY", systemKey: ACCOUNTS.VAT_PAYABLE },
  { code: "2200", name: "Tax clearing", type: "LIABILITY", systemKey: ACCOUNTS.TAX_CLEARING },
  { code: "3000", name: "Owner capital", type: "EQUITY", systemKey: ACCOUNTS.OWNER_CAPITAL },
  { code: "3100", name: "Owner contributions (privéstorting)", type: "EQUITY", systemKey: ACCOUNTS.OWNER_CONTRIBUTIONS },
  { code: "3200", name: "Owner withdrawals (privéopname)", type: "EQUITY", systemKey: ACCOUNTS.OWNER_WITHDRAWALS },
  { code: "8000", name: "Revenue", type: "REVENUE", systemKey: ACCOUNTS.REVENUE },
  { code: "4500", name: "Platform fees", type: "EXPENSE", systemKey: ACCOUNTS.PLATFORM_FEES },
  { code: "4000", name: "Operating expenses", type: "EXPENSE", systemKey: ACCOUNTS.OPERATING_EXPENSES },
  { code: "4900", name: "Depreciation expense", type: "EXPENSE", systemKey: ACCOUNTS.DEPRECIATION_EXPENSE },
  { code: "4990", name: "Private part of costs (non-deductible)", type: "EQUITY", systemKey: ACCOUNTS.PRIVATE_EXPENSE_NON_DEDUCTIBLE },
];

export interface JournalLine {
  accountKey: SystemAccountKey | string; // systemKey, or ledger account id for custom accounts
  description?: string;
  debitCents: number;
  creditCents: number;
  vatCodeId?: string | null;
  vatBaseCents?: number | null;
  sortOrder?: number;
}

export function assertBalanced(lines: JournalLine[]): void {
  if (lines.length < 2) {
    throw new UnbalancedJournalError("A journal needs at least two lines");
  }
  for (const line of lines) {
    assertCents(line.debitCents, "debit");
    assertCents(line.creditCents, "credit");
    if (line.debitCents < 0 || line.creditCents < 0) {
      throw new UnbalancedJournalError("Journal lines must use non-negative debit/credit");
    }
    if ((line.debitCents === 0) === (line.creditCents === 0)) {
      throw new UnbalancedJournalError(
        "Each journal line must have exactly one of debit or credit set",
      );
    }
  }
  const debit = sumCents(lines.map((l) => l.debitCents));
  const credit = sumCents(lines.map((l) => l.creditCents));
  if (debit !== credit) {
    throw new UnbalancedJournalError(
      `Journal is unbalanced: debits ${debit} != credits ${credit}`,
    );
  }
}

export interface ExpenseItem {
  description: string;
  netCents: number;
  vatCents: number;
  vatCodeId?: string | null;
  /** Treatment drives self-assessed VAT handling. */
  treatment?: string;
  expenseAccountKey?: SystemAccountKey | string;
}

export interface ExpenseJournalInput {
  items: ExpenseItem[];
  /** Where the money came from (or will come from). */
  paidFrom: "BUSINESS_BANK" | "PERSONAL" | "CASH" | "NOT_PAID";
  /** Business-use share in basis points; the private part books to equity. */
  businessUseBp?: number;
  /** Share of the (Dutch) input VAT that is recoverable, in basis points. */
  vatRecoveryBp?: number;
  /** True books the asset account instead of the expense account. */
  asAsset?: boolean;
}

/**
 * Build a balanced journal for a purchase/expense.
 *
 * Standard domestic purchase, fully business, paid from business bank:
 *   Dr expense net, Dr input VAT, Cr bank gross.
 * Paid personally: the credit goes to owner contributions — paying a
 * business cost from private money is a contribution, never “missing money”.
 * Mixed use: the private part of net cost (and non-recoverable VAT) books to
 * the private (non-deductible) equity account so profit only carries the
 * business share.
 * Self-assessed treatments (EU service/acquisition, reverse charge, import):
 *   Dr input VAT (recoverable part), Cr output VAT (full self-assessed VAT),
 *   with the non-recoverable part added to cost.
 */
export function buildExpenseJournal(input: ExpenseJournalInput): JournalLine[] {
  if (input.items.length === 0) throw new JournalInputError("An expense needs at least one line");
  const businessBp = input.businessUseBp ?? 10000;
  const recoveryBp = input.vatRecoveryBp ?? 10000;
  const lines: JournalLine[] = [];
  let grossPayable = 0;
  let sortOrder = 0;

  for (const item of input.items) {
    assertCents(item.netCents, "net");
    assertCents(item.vatCents, "vat");
    if (item.netCents < 0 || item.vatCents < 0) {
      throw new JournalInputError("Use the refund flow for negative expense lines");
    }
    const selfAssessed = ["REVERSE_CHARGE_PURCHASE", "EU_ACQUISITION", "EU_SERVICE", "IMPORT"].includes(
      item.treatment ?? "",
    );
    const foreignVat = item.treatment === "FOREIGN_VAT";
    const costAccount = item.expenseAccountKey ?? (input.asAsset ? ACCOUNTS.FIXED_ASSETS : ACCOUNTS.OPERATING_EXPENSES);

    // Foreign VAT is cost, never Dutch input VAT.
    const costTotal = foreignVat ? item.netCents + item.vatCents : item.netCents;
    const businessCost = applyBp(costTotal, businessBp);
    const privateCost = costTotal - businessCost;

    if (businessCost > 0) {
      lines.push({
        accountKey: costAccount,
        description: item.description,
        debitCents: businessCost,
        creditCents: 0,
        vatCodeId: item.vatCodeId ?? null,
        vatBaseCents: applyBp(item.netCents, businessBp),
        sortOrder: sortOrder++,
      });
    }
    if (privateCost > 0) {
      lines.push({
        accountKey: ACCOUNTS.PRIVATE_EXPENSE_NON_DEDUCTIBLE,
        description: `${item.description} (private share)`,
        debitCents: privateCost,
        creditCents: 0,
        sortOrder: sortOrder++,
      });
    }

    if (selfAssessed) {
      // Self-assessed VAT: no cash VAT was paid to the supplier.
      const selfVat = item.vatCents;
      if (selfVat > 0) {
        const recoverable = applyBp(applyBp(selfVat, businessBp), recoveryBp);
        const nonRecoverable = selfVat - recoverable;
        if (recoverable > 0) {
          lines.push({
            accountKey: ACCOUNTS.INPUT_VAT,
            description: `Self-assessed VAT (${item.description})`,
            debitCents: recoverable,
            creditCents: 0,
            vatCodeId: item.vatCodeId ?? null,
            vatBaseCents: item.netCents,
            sortOrder: sortOrder++,
          });
        }
        if (nonRecoverable > 0) {
          lines.push({
            accountKey: ACCOUNTS.PRIVATE_EXPENSE_NON_DEDUCTIBLE,
            description: `Non-recoverable self-assessed VAT (${item.description})`,
            debitCents: nonRecoverable,
            creditCents: 0,
            sortOrder: sortOrder++,
          });
        }
        lines.push({
          accountKey: ACCOUNTS.OUTPUT_VAT,
          description: `Self-assessed VAT owed (${item.description})`,
          debitCents: 0,
          creditCents: selfVat,
          vatCodeId: item.vatCodeId ?? null,
          vatBaseCents: item.netCents,
          sortOrder: sortOrder++,
        });
      }
      grossPayable += item.netCents; // supplier is paid net only
    } else if (foreignVat) {
      grossPayable += item.netCents + item.vatCents; // all cost, booked above
    } else {
      // Domestic VAT paid to the supplier; recoverable part limited by
      // business use and the VAT-recovery percentage.
      const recoverable = applyBp(applyBp(item.vatCents, businessBp), recoveryBp);
      const nonRecoverable = item.vatCents - recoverable;
      if (recoverable > 0) {
        lines.push({
          accountKey: ACCOUNTS.INPUT_VAT,
          description: `VAT (${item.description})`,
          debitCents: recoverable,
          creditCents: 0,
          vatCodeId: item.vatCodeId ?? null,
          vatBaseCents: applyBp(item.netCents, businessBp),
          sortOrder: sortOrder++,
        });
      }
      if (nonRecoverable > 0) {
        lines.push({
          accountKey: ACCOUNTS.PRIVATE_EXPENSE_NON_DEDUCTIBLE,
          description: `Non-recoverable VAT (${item.description})`,
          debitCents: nonRecoverable,
          creditCents: 0,
          sortOrder: sortOrder++,
        });
      }
      grossPayable += item.netCents + item.vatCents;
    }
  }

  const counterAccount =
    input.paidFrom === "BUSINESS_BANK"
      ? ACCOUNTS.BANK_BUSINESS
      : input.paidFrom === "PERSONAL"
        ? ACCOUNTS.OWNER_CONTRIBUTIONS
        : input.paidFrom === "CASH"
          ? ACCOUNTS.CASH
          : ACCOUNTS.ACCOUNTS_PAYABLE;
  lines.push({
    accountKey: counterAccount,
    description:
      input.paidFrom === "PERSONAL"
        ? "Paid personally — owner contribution"
        : input.paidFrom === "NOT_PAID"
          ? "Owed to supplier"
          : "Payment",
    debitCents: 0,
    creditCents: grossPayable,
    sortOrder: sortOrder++,
  });

  assertBalanced(lines);
  return lines;
}

export interface IncomeItem {
  description: string;
  netCents: number;
  vatCents: number;
  vatCodeId?: string | null;
}

export interface IncomeJournalInput {
  items: IncomeItem[];
  /** Platform commission withheld before payout (App Store, Google Play...). */
  feeCents?: number;
  receivedInto: "BUSINESS_BANK" | "PERSONAL" | "CASH" | "NOT_RECEIVED";
}

/**
 * Build a balanced journal for income (client invoice or platform payout):
 *   Dr bank (net payout) [+ Dr platform fees], Cr revenue net, Cr output VAT.
 * Income received on the personal account debits the personal-bank asset
 * account so it can be reconciled/withdrawn explicitly — it is still revenue.
 */
export function buildIncomeJournal(input: IncomeJournalInput): JournalLine[] {
  if (input.items.length === 0) throw new JournalInputError("Income needs at least one line");
  const fee = input.feeCents ?? 0;
  assertCents(fee, "fee");
  if (fee < 0) throw new JournalInputError("Fees must be non-negative");

  const lines: JournalLine[] = [];
  let sortOrder = 0;
  let grossReceivable = 0;
  for (const item of input.items) {
    assertCents(item.netCents, "net");
    assertCents(item.vatCents, "vat");
    if (item.netCents < 0) throw new JournalInputError("Use the refund flow for negative income");
    lines.push({
      accountKey: ACCOUNTS.REVENUE,
      description: item.description,
      debitCents: 0,
      creditCents: item.netCents,
      vatCodeId: item.vatCodeId ?? null,
      vatBaseCents: item.netCents,
      sortOrder: sortOrder++,
    });
    if (item.vatCents > 0) {
      lines.push({
        accountKey: ACCOUNTS.OUTPUT_VAT,
        description: `VAT (${item.description})`,
        debitCents: 0,
        creditCents: item.vatCents,
        vatCodeId: item.vatCodeId ?? null,
        vatBaseCents: item.netCents,
        sortOrder: sortOrder++,
      });
    }
    grossReceivable += item.netCents + item.vatCents;
  }
  if (fee > 0) {
    lines.push({
      accountKey: ACCOUNTS.PLATFORM_FEES,
      description: "Platform commission",
      debitCents: fee,
      creditCents: 0,
      sortOrder: sortOrder++,
    });
  }
  const netReceived = grossReceivable - fee;
  if (netReceived < 0) {
    throw new JournalInputError("Fees exceed gross amount; record as an expense instead");
  }
  const account =
    input.receivedInto === "BUSINESS_BANK"
      ? ACCOUNTS.BANK_BUSINESS
      : input.receivedInto === "PERSONAL"
        ? ACCOUNTS.BANK_PERSONAL
        : input.receivedInto === "CASH"
          ? ACCOUNTS.CASH
          : ACCOUNTS.ACCOUNTS_RECEIVABLE;
  lines.push({
    accountKey: account,
    description: input.receivedInto === "NOT_RECEIVED" ? "Receivable from customer" : "Payout received",
    debitCents: netReceived,
    creditCents: 0,
    sortOrder: sortOrder++,
  });

  assertBalanced(lines);
  return lines;
}

export type OwnerFlowKind = "OWNER_CONTRIBUTION" | "OWNER_WITHDRAWAL" | "OWN_TRANSFER";

export interface OwnerFlowInput {
  kind: OwnerFlowKind;
  amountCents: number;
  /** For OWN_TRANSFER: which account the money left and entered. */
  fromAccountKey?: SystemAccountKey | string;
  toAccountKey?: SystemAccountKey | string;
}

/**
 * Owner flows never touch profit:
 * - contribution: Dr business bank, Cr owner contributions (equity);
 * - withdrawal: Dr owner withdrawals (equity), Cr business bank;
 * - own transfer: asset ↔ asset only.
 */
export function buildOwnerFlowJournal(input: OwnerFlowInput): JournalLine[] {
  assertCents(input.amountCents);
  if (input.amountCents <= 0) throw new JournalInputError("Amount must be positive");
  const a = input.amountCents;
  let lines: JournalLine[];
  switch (input.kind) {
    case "OWNER_CONTRIBUTION":
      lines = [
        { accountKey: input.toAccountKey ?? ACCOUNTS.BANK_BUSINESS, description: "Private deposit received", debitCents: a, creditCents: 0, sortOrder: 0 },
        { accountKey: ACCOUNTS.OWNER_CONTRIBUTIONS, description: "Owner contribution (privéstorting)", debitCents: 0, creditCents: a, sortOrder: 1 },
      ];
      break;
    case "OWNER_WITHDRAWAL":
      lines = [
        { accountKey: ACCOUNTS.OWNER_WITHDRAWALS, description: "Owner withdrawal (privéopname)", debitCents: a, creditCents: 0, sortOrder: 0 },
        { accountKey: input.fromAccountKey ?? ACCOUNTS.BANK_BUSINESS, description: "Paid to private account", debitCents: 0, creditCents: a, sortOrder: 1 },
      ];
      break;
    case "OWN_TRANSFER": {
      const from = input.fromAccountKey;
      const to = input.toAccountKey;
      if (!from || !to || from === to) {
        throw new JournalInputError("A transfer needs two different own accounts");
      }
      lines = [
        { accountKey: to, description: "Transfer in (own account)", debitCents: a, creditCents: 0, sortOrder: 0 },
        { accountKey: from, description: "Transfer out (own account)", debitCents: 0, creditCents: a, sortOrder: 1 },
      ];
      break;
    }
  }
  assertBalanced(lines);
  return lines;
}

/** Straight-line depreciation journal for one period charge. */
export function buildDepreciationJournal(chargeCents: number, description: string): JournalLine[] {
  assertCents(chargeCents);
  if (chargeCents <= 0) throw new JournalInputError("Depreciation charge must be positive");
  const lines: JournalLine[] = [
    { accountKey: ACCOUNTS.DEPRECIATION_EXPENSE, description, debitCents: chargeCents, creditCents: 0, sortOrder: 0 },
    { accountKey: ACCOUNTS.ACCUMULATED_DEPRECIATION, description, debitCents: 0, creditCents: chargeCents, sortOrder: 1 },
  ];
  assertBalanced(lines);
  return lines;
}
