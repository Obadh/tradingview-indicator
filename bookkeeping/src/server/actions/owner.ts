"use server";

import { requireBusiness, auditContext } from "@/lib/server/context";
import { createTransaction } from "@/lib/server/transactions";
import { buildOwnerFlowJournal } from "@/lib/domain/journal";
import { parseAmountToCents } from "@/lib/domain/money";
import { ownerFlowSchema } from "@/lib/validation/money-flows";
import type { ExpenseActionResult } from "./expenses";

const DESCRIPTIONS: Record<string, string> = {
  OWNER_CONTRIBUTION: "Owner contribution (private deposit)",
  OWNER_WITHDRAWAL: "Owner withdrawal (private withdrawal)",
  OWN_TRANSFER: "Transfer between own accounts",
};

/**
 * Owner flows: contributions, withdrawals, transfers between own accounts.
 * None of these ever touch profit — the journals only move money between
 * asset and equity accounts. This is enforced by buildOwnerFlowJournal and
 * verified by unit tests.
 */
export async function createOwnerFlowAction(payload: unknown): Promise<ExpenseActionResult> {
  const { business, user } = await requireBusiness();
  const parsed = ownerFlowSchema.safeParse(payload);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `${issue?.path.join(".")}: ${issue?.message}` };
  }
  const d = parsed.data;

  let amountCents: number;
  try {
    amountCents = parseAmountToCents(d.amount);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invalid amount" };
  }
  if (amountCents <= 0) return { ok: false, error: "Enter a positive amount." };

  let journal;
  try {
    journal = buildOwnerFlowJournal({
      kind: d.kind,
      amountCents,
      fromAccountKey: d.fromAccount,
      toAccountKey: d.toAccount,
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not build journal" };
  }

  try {
    const id = await createTransaction(
      { ...(await auditContext(business.id)), businessId: business.id, actorUserId: user.id },
      {
        type: d.kind,
        status: "CONFIRMED",
        date: d.date,
        description: d.description?.trim() || DESCRIPTIONS[d.kind]!,
        notes: d.notes || null,
        amountCents,
        isPaid: true,
      },
      journal,
    );
    return { ok: true, transactionId: id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save." };
  }
}
