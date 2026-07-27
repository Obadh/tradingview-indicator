/**
 * Report engine. Each report builds a tabular dataset (columns + rows +
 * meta) that the UI renders and the export route serializes to CSV, XLSX,
 * PDF or JSON. Every generated report carries its filters and timestamp.
 */

import { prisma } from "@/lib/server/db";
import { isoDateToUtc, utcToIsoDate } from "@/lib/domain/dates";
import { centsToDecimalString } from "@/lib/domain/money";
import { VAT_TREATMENT_LABELS, TRANSACTION_TYPE_LABELS } from "@/lib/labels";

const FINAL = ["CONFIRMED", "RECONCILED", "LOCKED"] as const;

export interface ReportColumn {
  key: string;
  label: string;
  align?: "left" | "right";
}

export interface ReportData {
  key: string;
  title: string;
  description: string;
  generatedAt: string;
  filters: { from: string; to: string };
  columns: ReportColumn[];
  rows: Record<string, string | number>[];
  footnote?: string;
}

export interface ReportRange {
  from: string;
  to: string;
}

type Builder = (businessId: string, range: ReportRange) => Promise<Omit<ReportData, "key" | "generatedAt" | "filters">>;

function money(cents: number): string {
  return centsToDecimalString(cents);
}

async function plAccounts(businessId: string, range: ReportRange) {
  return prisma.transactionLine.findMany({
    where: {
      transaction: {
        businessId,
        status: { in: [...FINAL] },
        date: { gte: isoDateToUtc(range.from), lte: isoDateToUtc(range.to) },
      },
    },
    include: {
      ledgerAccount: true,
      transaction: { select: { id: true, date: true, description: true, type: true, categoryId: true } },
    },
  });
}

const profitLoss: Builder = async (businessId, range) => {
  const lines = await plAccounts(businessId, range);
  const byAccount = new Map<string, { code: string; name: string; type: string; cents: number }>();
  for (const l of lines) {
    const t = l.ledgerAccount.type;
    if (t !== "REVENUE" && t !== "EXPENSE") continue;
    const agg = byAccount.get(l.ledgerAccountId) ?? {
      code: l.ledgerAccount.code,
      name: l.ledgerAccount.name,
      type: t,
      cents: 0,
    };
    agg.cents += t === "REVENUE" ? l.creditCents - l.debitCents : l.debitCents - l.creditCents;
    byAccount.set(l.ledgerAccountId, agg);
  }
  const accounts = [...byAccount.values()].sort((a, b) => a.code.localeCompare(b.code));
  const revenue = accounts.filter((a) => a.type === "REVENUE").reduce((s, a) => s + a.cents, 0);
  const expenses = accounts.filter((a) => a.type === "EXPENSE").reduce((s, a) => s + a.cents, 0);
  return {
    title: "Profit and loss",
    description: "Revenue and expenses from finalized records (accounting estimate, not taxable profit).",
    columns: [
      { key: "code", label: "Account" },
      { key: "name", label: "Name" },
      { key: "amount", label: "Amount (EUR)", align: "right" },
    ],
    rows: [
      ...accounts.map((a) => ({ code: a.code, name: a.name, amount: money(a.cents) })),
      { code: "", name: "Total revenue", amount: money(revenue) },
      { code: "", name: "Total expenses", amount: money(expenses) },
      { code: "", name: "Result (revenue − expenses)", amount: money(revenue - expenses) },
    ],
    footnote: "Estimated result — not taxable profit; tax adjustments are not applied.",
  };
};

const balanceSheet: Builder = async (businessId, range) => {
  const lines = await prisma.transactionLine.findMany({
    where: {
      transaction: {
        businessId,
        status: { in: [...FINAL] },
        date: { lte: isoDateToUtc(range.to) },
      },
    },
    include: { ledgerAccount: true },
  });
  const byAccount = new Map<string, { code: string; name: string; type: string; cents: number }>();
  let result = 0;
  for (const l of lines) {
    const t = l.ledgerAccount.type;
    if (t === "REVENUE" || t === "EXPENSE") {
      result += t === "REVENUE" ? l.creditCents - l.debitCents : -(l.debitCents - l.creditCents);
      continue;
    }
    const agg = byAccount.get(l.ledgerAccountId) ?? {
      code: l.ledgerAccount.code,
      name: l.ledgerAccount.name,
      type: t,
      cents: 0,
    };
    // Assets: debit balance positive. Liabilities/equity: credit positive.
    agg.cents += t === "ASSET" ? l.debitCents - l.creditCents : l.creditCents - l.debitCents;
    byAccount.set(l.ledgerAccountId, agg);
  }
  const accounts = [...byAccount.values()].sort((a, b) => a.code.localeCompare(b.code));
  const assets = accounts.filter((a) => a.type === "ASSET").reduce((s, a) => s + a.cents, 0);
  const liabEq = accounts.filter((a) => a.type !== "ASSET").reduce((s, a) => s + a.cents, 0) + result;
  return {
    title: "Balance sheet",
    description: `Balances up to and including ${range.to}.`,
    columns: [
      { key: "code", label: "Account" },
      { key: "name", label: "Name" },
      { key: "side", label: "Side" },
      { key: "amount", label: "Balance (EUR)", align: "right" },
    ],
    rows: [
      ...accounts.map((a) => ({
        code: a.code,
        name: a.name,
        side: a.type === "ASSET" ? "Assets" : a.type === "EQUITY" ? "Equity" : "Liabilities",
        amount: money(a.cents),
      })),
      { code: "", name: "Current-period result", side: "Equity", amount: money(result) },
      { code: "", name: "Total assets", side: "", amount: money(assets) },
      { code: "", name: "Total liabilities + equity", side: "", amount: money(liabEq) },
    ],
  };
};

function categoryReport(kind: "INCOME" | "EXPENSE"): Builder {
  return async (businessId, range) => {
    const transactions = await prisma.transaction.findMany({
      where: {
        businessId,
        status: { in: [...FINAL] },
        type: kind === "INCOME" ? "BUSINESS_INCOME" : "BUSINESS_EXPENSE",
        date: { gte: isoDateToUtc(range.from), lte: isoDateToUtc(range.to) },
      },
      include: { category: { select: { name: true } } },
    });
    const byCategory = new Map<string, { gross: number; vat: number; count: number }>();
    for (const t of transactions) {
      const key = t.category?.name ?? "(no category)";
      const agg = byCategory.get(key) ?? { gross: 0, vat: 0, count: 0 };
      agg.gross += t.amountCents;
      agg.vat += t.vatAmountCents;
      agg.count += 1;
      byCategory.set(key, agg);
    }
    return {
      title: kind === "INCOME" ? "Income by category" : "Expenses by category",
      description: "Finalized records grouped by category.",
      columns: [
        { key: "category", label: "Category" },
        { key: "count", label: "Records", align: "right" },
        { key: "net", label: "Excl. VAT (EUR)", align: "right" },
        { key: "vat", label: "VAT (EUR)", align: "right" },
        { key: "gross", label: "Incl. VAT (EUR)", align: "right" },
      ],
      rows: [...byCategory.entries()]
        .sort((a, b) => b[1].gross - a[1].gross)
        .map(([category, v]) => ({
          category,
          count: v.count,
          net: money(v.gross - v.vat),
          vat: money(v.vat),
          gross: money(v.gross),
        })),
    };
  };
}

function transactionListReport(
  title: string,
  description: string,
  where: (businessId: string, range: ReportRange) => object,
  footnote?: string,
): Builder {
  return async (businessId, range) => {
    const transactions = await prisma.transaction.findMany({
      where: where(businessId, range) as never,
      orderBy: { date: "asc" },
      include: { contact: { select: { name: true } }, category: { select: { name: true } } },
    });
    return {
      title,
      description,
      columns: [
        { key: "date", label: "Date" },
        { key: "description", label: "Description" },
        { key: "party", label: "Party" },
        { key: "category", label: "Category" },
        { key: "type", label: "Type" },
        { key: "status", label: "Status" },
        { key: "amount", label: "Incl. VAT (EUR)", align: "right" },
        { key: "vat", label: "VAT (EUR)", align: "right" },
      ],
      rows: transactions.map((t) => ({
        date: utcToIsoDate(t.date),
        description: t.description,
        party: t.contact?.name ?? "",
        category: t.category?.name ?? "",
        type: TRANSACTION_TYPE_LABELS[t.type] ?? t.type,
        status: t.status,
        amount: money(t.amountCents),
        vat: money(t.vatAmountCents),
      })),
      footnote,
    };
  };
}

const vatSummary: Builder = async (businessId, range) => {
  const lines = await prisma.transactionLine.findMany({
    where: {
      vatCodeId: { not: null },
      transaction: {
        businessId,
        status: { in: [...FINAL] },
        date: { gte: isoDateToUtc(range.from), lte: isoDateToUtc(range.to) },
      },
    },
    include: {
      vatCode: true,
      transaction: { select: { type: true } },
      ledgerAccount: { select: { systemKey: true } },
    },
  });
  const byTreatment = new Map<string, { base: number; vat: number }>();
  for (const l of lines) {
    const treatment = l.vatCode!.treatment;
    const agg = byTreatment.get(treatment) ?? { base: 0, vat: 0 };
    const isVatAccount = ["input_vat", "output_vat"].includes(l.ledgerAccount.systemKey ?? "");
    if (isVatAccount) agg.vat += l.debitCents + l.creditCents;
    else agg.base += l.vatBaseCents ?? 0;
    byTreatment.set(treatment, agg);
  }
  return {
    title: "VAT summary",
    description: "Bases and VAT amounts per treatment (from finalized records).",
    columns: [
      { key: "treatment", label: "Treatment" },
      { key: "base", label: "Base excl. VAT (EUR)", align: "right" },
      { key: "vat", label: "VAT (EUR)", align: "right" },
    ],
    rows: [...byTreatment.entries()].map(([t, v]) => ({
      treatment: VAT_TREATMENT_LABELS[t] ?? t,
      base: money(v.base),
      vat: money(v.vat),
    })),
    footnote: "Estimates for preparation — verify before filing with the Belastingdienst.",
  };
};

const accountsReceivable: Builder = async (businessId) => {
  const invoices = await prisma.invoice.findMany({
    where: {
      businessId,
      kind: "INVOICE",
      status: { in: ["FINALIZED", "SENT", "PARTIALLY_PAID", "OVERDUE"] },
    },
    include: { contact: { select: { name: true } }, allocations: true },
  });
  return {
    title: "Accounts receivable",
    description: "Finalized sales invoices not fully paid yet.",
    columns: [
      { key: "number", label: "Invoice" },
      { key: "customer", label: "Customer" },
      { key: "issued", label: "Issued" },
      { key: "due", label: "Due" },
      { key: "total", label: "Total (EUR)", align: "right" },
      { key: "open", label: "Open (EUR)", align: "right" },
    ],
    rows: invoices.map((inv) => {
      const paid = inv.allocations.reduce((s, a) => s + a.amountCents, 0);
      return {
        number: inv.number ?? "(draft)",
        customer: inv.contact.name,
        issued: inv.issueDate ? utcToIsoDate(inv.issueDate) : "",
        due: inv.dueDate ? utcToIsoDate(inv.dueDate) : "",
        total: money(inv.totalIncVatCents),
        open: money(inv.totalIncVatCents - paid),
      };
    }),
  };
};

const accountsPayable: Builder = async (businessId) => {
  const transactions = await prisma.transaction.findMany({
    where: {
      businessId,
      type: "BUSINESS_EXPENSE",
      status: { in: ["NEEDS_REVIEW", "CONFIRMED", "RECONCILED"] },
      isPaid: false,
    },
    include: { contact: { select: { name: true } } },
    orderBy: { dueDate: "asc" },
  });
  return {
    title: "Accounts payable",
    description: "Recorded purchase invoices not marked as paid.",
    columns: [
      { key: "date", label: "Invoice date" },
      { key: "supplier", label: "Supplier" },
      { key: "invoice", label: "Invoice no." },
      { key: "due", label: "Due" },
      { key: "amount", label: "Amount (EUR)", align: "right" },
    ],
    rows: transactions.map((t) => ({
      date: utcToIsoDate(t.date),
      supplier: t.contact?.name ?? "",
      invoice: t.invoiceNumber ?? "",
      due: t.dueDate ? utcToIsoDate(t.dueDate) : "",
      amount: money(t.amountCents),
    })),
  };
};

const assetRegister: Builder = async (businessId) => {
  const assets = await prisma.asset.findMany({
    where: { businessId, deletedAt: null },
    orderBy: { purchaseDate: "asc" },
  });
  return {
    title: "Asset register",
    description: "All registered assets with depreciation settings.",
    columns: [
      { key: "name", label: "Asset" },
      { key: "purchased", label: "Purchased" },
      { key: "inUse", label: "In use since" },
      { key: "price", label: "Price excl. VAT (EUR)", align: "right" },
      { key: "businessUse", label: "Business %", align: "right" },
      { key: "life", label: "Useful life (months)", align: "right" },
      { key: "annual", label: "Annual depreciation (EUR)", align: "right" },
      { key: "disposed", label: "Disposed" },
    ],
    rows: assets.map((a) => ({
      name: a.name,
      purchased: utcToIsoDate(a.purchaseDate),
      inUse: a.inUseDate ? utcToIsoDate(a.inUseDate) : "",
      price: money(a.purchasePriceExVatCents),
      businessUse: `${a.businessUseBp / 100}%`,
      life: a.usefulLifeMonths,
      annual: a.annualDepreciationCents != null ? money(a.annualDepreciationCents) : "",
      disposed: a.disposedDate ? utcToIsoDate(a.disposedDate) : "",
    })),
  };
};

const bankReconciliation: Builder = async (businessId, range) => {
  const lines = await prisma.bankTransaction.findMany({
    where: {
      businessId,
      bookingDate: { gte: isoDateToUtc(range.from), lte: isoDateToUtc(range.to) },
    },
    include: { bankAccount: { select: { name: true } }, matches: true },
    orderBy: { bookingDate: "asc" },
  });
  return {
    title: "Bank reconciliation",
    description: "Imported bank lines and their reconciliation state.",
    columns: [
      { key: "date", label: "Date" },
      { key: "account", label: "Account" },
      { key: "counterparty", label: "Counterparty" },
      { key: "description", label: "Description" },
      { key: "amount", label: "Amount (EUR)", align: "right" },
      { key: "state", label: "State" },
      { key: "matches", label: "Matches", align: "right" },
    ],
    rows: lines.map((l) => ({
      date: utcToIsoDate(l.bookingDate),
      account: l.bankAccount.name,
      counterparty: l.counterpartyName ?? "",
      description: (l.description ?? "").slice(0, 80),
      amount: money(l.amountCents),
      state: l.state,
      matches: l.matches.length,
    })),
  };
};

const auditLogReport: Builder = async (businessId, range) => {
  const rows = await prisma.auditLog.findMany({
    where: {
      businessId,
      createdAt: { gte: isoDateToUtc(range.from), lte: new Date(isoDateToUtc(range.to).getTime() + 86_400_000) },
    },
    orderBy: { createdAt: "asc" },
    include: { actor: { select: { email: true } } },
    take: 10_000,
  });
  return {
    title: "Audit log",
    description: "Append-only record of every change.",
    columns: [
      { key: "at", label: "Timestamp (UTC)" },
      { key: "actor", label: "Actor" },
      { key: "action", label: "Action" },
      { key: "entity", label: "Entity" },
      { key: "reason", label: "Reason" },
    ],
    rows: rows.map((r) => ({
      at: r.createdAt.toISOString(),
      actor: r.actor?.email ?? "system",
      action: r.action,
      entity: `${r.entityType}${r.entityId ? ` ${r.entityId.slice(0, 8)}` : ""}`,
      reason: r.reason ?? "",
    })),
  };
};

const hoursReport: Builder = async (businessId, range) => {
  const entries = await prisma.timeEntry.findMany({
    where: {
      businessId,
      deletedAt: null,
      date: { gte: isoDateToUtc(range.from), lte: isoDateToUtc(range.to) },
    },
    include: { project: { select: { name: true } } },
    orderBy: { date: "asc" },
  });
  const total = entries.reduce((s, e) => s + e.minutes, 0);
  return {
    title: "Hours report",
    description: "Recorded working hours (relevant for the urencriterium — the app does not decide whether you qualify for any tax facility).",
    columns: [
      { key: "date", label: "Date" },
      { key: "project", label: "Project" },
      { key: "activity", label: "Activity" },
      { key: "description", label: "Description" },
      { key: "hours", label: "Hours", align: "right" },
    ],
    rows: [
      ...entries.map((e) => ({
        date: utcToIsoDate(e.date),
        project: e.project?.name ?? "",
        activity: e.activityType ?? "",
        description: e.description ?? "",
        hours: (e.minutes / 60).toFixed(2),
      })),
      { date: "", project: "", activity: "", description: "Total", hours: (total / 60).toFixed(2) },
    ],
  };
};

export const REPORTS: Record<string, { builder: Builder; title: string }> = {
  "profit-loss": { builder: profitLoss, title: "Profit and loss" },
  "balance-sheet": { builder: balanceSheet, title: "Balance sheet" },
  "income-by-category": { builder: categoryReport("INCOME"), title: "Income by category" },
  "expenses-by-category": { builder: categoryReport("EXPENSE"), title: "Expenses by category" },
  "vat-summary": { builder: vatSummary, title: "VAT summary" },
  "accounts-receivable": { builder: accountsReceivable, title: "Accounts receivable" },
  "accounts-payable": { builder: accountsPayable, title: "Accounts payable" },
  "asset-register": { builder: assetRegister, title: "Asset register" },
  "owner-flows": {
    title: "Owner contributions and withdrawals",
    builder: transactionListReport(
      "Owner contributions and withdrawals",
      "Private deposits, withdrawals and own-account transfers. These never affect profit.",
      (businessId, range) => ({
        businessId,
        type: { in: ["OWNER_CONTRIBUTION", "OWNER_WITHDRAWAL", "OWN_TRANSFER"] },
        status: { notIn: ["VOID"] },
        date: { gte: isoDateToUtc(range.from), lte: isoDateToUtc(range.to) },
      }),
    ),
  },
  "bank-reconciliation": { builder: bankReconciliation, title: "Bank reconciliation" },
  "missing-documents": {
    title: "Missing documents",
    builder: transactionListReport(
      "Missing documents",
      "Income and expense records without an attached document.",
      (businessId, range) => ({
        businessId,
        type: { in: ["BUSINESS_EXPENSE", "BUSINESS_INCOME"] },
        status: { notIn: ["VOID"] },
        documentLinks: { none: {} },
        date: { gte: isoDateToUtc(range.from), lte: isoDateToUtc(range.to) },
      }),
    ),
  },
  "missing-payments": {
    title: "Missing payments",
    builder: transactionListReport(
      "Missing payments",
      "Records not yet marked as paid / matched to a bank transaction.",
      (businessId, range) => ({
        businessId,
        type: { in: ["BUSINESS_EXPENSE", "BUSINESS_INCOME"] },
        status: { notIn: ["VOID"] },
        isPaid: false,
        date: { gte: isoDateToUtc(range.from), lte: isoDateToUtc(range.to) },
      }),
    ),
  },
  "pre-registration": {
    title: "Pre-registration expenses",
    builder: transactionListReport(
      "Pre-registration expenses",
      "Costs dated before the KVK registration, flagged for deductibility review.",
      (businessId, range) => ({
        businessId,
        isPreRegistration: true,
        status: { notIn: ["VOID"] },
        date: { gte: isoDateToUtc(range.from), lte: isoDateToUtc(range.to) },
      }),
      "Deductibility of pre-registration costs requires confirmation by an adviser.",
    ),
  },
  "mixed-use": {
    title: "Mixed-use expenses",
    builder: transactionListReport(
      "Mixed-use expenses",
      "Expenses with partial business use and their allocation percentages.",
      (businessId, range) => ({
        businessId,
        isMixedUse: true,
        status: { notIn: ["VOID"] },
        date: { gte: isoDateToUtc(range.from), lte: isoDateToUtc(range.to) },
      }),
    ),
  },
  "foreign-transactions": {
    title: "Foreign transactions",
    builder: transactionListReport(
      "Foreign transactions",
      "Records with a non-NL counterparty or non-EUR currency.",
      (businessId, range) => ({
        businessId,
        status: { notIn: ["VOID"] },
        OR: [{ supplierCountry: { not: "NL" } }, { currency: { not: "EUR" } }],
        date: { gte: isoDateToUtc(range.from), lte: isoDateToUtc(range.to) },
      }),
      "Foreign VAT is never assumed recoverable as Dutch input VAT.",
    ),
  },
  "audit-log": { builder: auditLogReport, title: "Audit log" },
  hours: { builder: hoursReport, title: "Hours report" },
};

export async function buildReport(
  key: string,
  businessId: string,
  range: ReportRange,
): Promise<ReportData | null> {
  const def = REPORTS[key];
  if (!def) return null;
  const data = await def.builder(businessId, range);
  return {
    key,
    generatedAt: new Date().toISOString(),
    filters: range,
    ...data,
  };
}
