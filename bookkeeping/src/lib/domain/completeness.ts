/**
 * Bookkeeping completeness score for the dashboard. A simple, explainable
 * 0–100 score: each component lists exactly which records reduce it.
 */

export interface CompletenessInput {
  totalTransactions: number;
  transactionsNeedingReview: number;
  transactionsWithoutDocuments: number;
  documentsNeedingReview: number;
  unreconciledBankLines: number;
  invoicesMissingDetails: number;
  unmatchedDocuments: number;
}

export interface CompletenessComponent {
  key: string;
  label: string;
  weight: number;
  openItems: number;
  earned: number; // 0..weight
}

export interface CompletenessScore {
  score: number; // 0..100
  components: CompletenessComponent[];
}

function componentScore(weight: number, openItems: number, denominator: number): number {
  if (openItems <= 0) return weight;
  const ratio = Math.min(1, openItems / Math.max(denominator, 1));
  return Math.round(weight * (1 - ratio));
}

export function computeCompleteness(input: CompletenessInput): CompletenessScore {
  const denom = Math.max(input.totalTransactions, 1);
  const components: CompletenessComponent[] = [
    {
      key: "review",
      label: "Transactions reviewed",
      weight: 30,
      openItems: input.transactionsNeedingReview,
      earned: componentScore(30, input.transactionsNeedingReview, denom),
    },
    {
      key: "documents",
      label: "Transactions have documents",
      weight: 25,
      openItems: input.transactionsWithoutDocuments,
      earned: componentScore(25, input.transactionsWithoutDocuments, denom),
    },
    {
      key: "docReview",
      label: "Documents processed",
      weight: 15,
      openItems: input.documentsNeedingReview + input.unmatchedDocuments,
      earned: componentScore(15, input.documentsNeedingReview + input.unmatchedDocuments, denom),
    },
    {
      key: "bank",
      label: "Bank lines reconciled",
      weight: 20,
      openItems: input.unreconciledBankLines,
      earned: componentScore(20, input.unreconciledBankLines, denom),
    },
    {
      key: "invoices",
      label: "Invoices complete",
      weight: 10,
      openItems: input.invoicesMissingDetails,
      earned: componentScore(10, input.invoicesMissingDetails, denom),
    },
  ];
  const score = components.reduce((s, c) => s + c.earned, 0);
  return { score, components };
}
