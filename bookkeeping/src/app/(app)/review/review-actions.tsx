"use client";

import Link from "next/link";
import { useActionState } from "react";
import { transitionTransactionAction, setReviewFlagAction } from "@/server/actions/transactions";
import { Button } from "@/components/ui/button";

/**
 * Review inbox quick actions: Confirm, Edit (opens the record), Mark
 * private (void with reason), Needs advice, Attach document, Match payment.
 */
export function ReviewItemActions({
  transactionId,
  hasDocument,
  reviewFlag,
}: {
  transactionId: string;
  hasDocument: boolean;
  reviewFlag: string;
}) {
  const [, transitionAction, pending] = useActionState(transitionTransactionAction, null);
  const [, flagAction] = useActionState(setReviewFlagAction, null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form action={transitionAction}>
        <input type="hidden" name="transactionId" value={transactionId} />
        <input type="hidden" name="toStatus" value="CONFIRMED" />
        <Button type="submit" size="sm" disabled={pending}>
          Confirm
        </Button>
      </form>
      <Button asChild size="sm" variant="outline">
        <Link href={`/transactions/${transactionId}`}>Edit</Link>
      </Button>
      <form action={transitionAction}>
        <input type="hidden" name="transactionId" value={transactionId} />
        <input type="hidden" name="toStatus" value="VOID" />
        <input type="hidden" name="reason" value="Marked as private — not a business transaction" />
        <Button type="submit" size="sm" variant="ghost" disabled={pending}>
          Mark private
        </Button>
      </form>
      <form action={flagAction}>
        <input type="hidden" name="transactionId" value={transactionId} />
        <input type="hidden" name="reviewFlag" value={reviewFlag === "NEEDS_ADVICE" ? "NONE" : "NEEDS_ADVICE"} />
        <Button type="submit" size="sm" variant="ghost">
          {reviewFlag === "NEEDS_ADVICE" ? "Advice ✓" : "Needs advice"}
        </Button>
      </form>
      {!hasDocument && (
        <Button asChild size="sm" variant="ghost">
          <Link href="/documents">Attach document</Link>
        </Button>
      )}
      <Button asChild size="sm" variant="ghost">
        <Link href="/banking">Match payment</Link>
      </Button>
    </div>
  );
}
