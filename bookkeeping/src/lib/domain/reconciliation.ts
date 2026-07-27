/**
 * Explainable bank-reconciliation match suggestions. Every suggestion
 * carries a human-readable reason; nothing is auto-confirmed.
 */

export interface BankLineForMatching {
  id: string;
  bookingDate: string; // ISO
  amountCents: number; // signed, negative = money out
  counterpartyName: string | null;
  counterpartyIban: string | null;
  description: string | null;
  reference: string | null;
}

export interface CandidateRecord {
  id: string;
  kind: "INVOICE" | "TRANSACTION";
  date: string | null; // ISO
  /** Expected settlement amount, signed like the bank line would be. */
  expectedCents: number;
  openCents: number; // remaining unallocated amount (signed)
  counterpartyName: string | null;
  counterpartyIban: string | null;
  invoiceNumber: string | null;
}

export interface MatchSuggestion {
  bankTransactionId: string;
  candidateId: string;
  candidateKind: "INVOICE" | "TRANSACTION";
  score: number; // 0..100
  reasons: string[];
  amountCents: number; // proposed allocation (signed)
  partial: boolean;
}

function normalize(s: string | null): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function daysBetween(a: string, b: string): number {
  return Math.abs((Date.parse(a) - Date.parse(b)) / 86_400_000);
}

/**
 * Score candidates for one bank line. Deterministic and explainable:
 * exact amount (50), IBAN match (25), invoice number in description (20),
 * name similarity (10), date proximity (up to 10). Threshold 50.
 */
export function suggestMatches(
  line: BankLineForMatching,
  candidates: CandidateRecord[],
  { threshold = 50, maxSuggestions = 5 } = {},
): MatchSuggestion[] {
  const suggestions: MatchSuggestion[] = [];
  const lineText = normalize(`${line.description ?? ""} ${line.reference ?? ""}`);

  for (const c of candidates) {
    // Direction must agree (money in matches receivables, out matches payables).
    if (Math.sign(c.expectedCents) !== Math.sign(line.amountCents) || c.openCents === 0) continue;
    const reasons: string[] = [];
    let score = 0;

    if (c.openCents === line.amountCents) {
      score += 50;
      reasons.push("exact amount");
    } else if (Math.abs(line.amountCents) < Math.abs(c.openCents)) {
      score += 25;
      reasons.push("partial payment (amount below open balance)");
    } else if (c.expectedCents === line.amountCents) {
      score += 40;
      reasons.push("amount equals original total");
    }

    if (
      line.counterpartyIban &&
      c.counterpartyIban &&
      normalize(line.counterpartyIban) === normalize(c.counterpartyIban)
    ) {
      score += 25;
      reasons.push("IBAN matches");
    }

    if (c.invoiceNumber && lineText.includes(normalize(c.invoiceNumber))) {
      score += 20;
      reasons.push(`invoice number "${c.invoiceNumber}" in description`);
    }

    const nameA = normalize(line.counterpartyName);
    const nameB = normalize(c.counterpartyName);
    if (nameA && nameB && (nameA.includes(nameB) || nameB.includes(nameA))) {
      score += 10;
      reasons.push("counterparty name matches");
    }

    if (c.date) {
      const days = daysBetween(line.bookingDate, c.date);
      if (days <= 3) {
        score += 10;
        reasons.push("dates within 3 days");
      } else if (days <= 30) {
        score += 5;
        reasons.push("dates within 30 days");
      }
    }

    if (score >= threshold) {
      const alloc =
        Math.abs(line.amountCents) <= Math.abs(c.openCents) ? line.amountCents : c.openCents;
      suggestions.push({
        bankTransactionId: line.id,
        candidateId: c.id,
        candidateKind: c.kind,
        score: Math.min(100, score),
        reasons,
        amountCents: alloc,
        partial: alloc !== c.openCents,
      });
    }
  }
  return suggestions.sort((a, b) => b.score - a.score).slice(0, maxSuggestions);
}

/** Duplicate fingerprint for imported bank lines (see BankTransaction). */
export function bankLineFingerprintInput(line: {
  bookingDate: string;
  amountCents: number;
  counterpartyIban: string | null;
  counterpartyName: string | null;
  description: string | null;
}): string {
  return [
    line.bookingDate,
    line.amountCents,
    normalize(line.counterpartyIban),
    normalize(line.counterpartyName),
    normalize(line.description).slice(0, 80),
  ].join("|");
}
