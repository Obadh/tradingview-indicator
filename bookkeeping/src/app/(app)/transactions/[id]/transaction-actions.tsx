"use client";

import { useActionState } from "react";
import {
  transitionTransactionAction,
  setReviewFlagAction,
  reverseTransactionAction,
} from "@/server/actions/transactions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function TransactionActions({
  transactionId,
  status,
  reviewFlag,
  locked,
}: {
  transactionId: string;
  status: string;
  reviewFlag: string;
  locked: boolean;
}) {
  const [transitionState, transitionAction, transitionPending] = useActionState(
    transitionTransactionAction,
    null,
  );
  const [flagState, flagAction] = useActionState(setReviewFlagAction, null);
  const [reverseState, reverseAction, reversePending] = useActionState(reverseTransactionAction, null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Actions</CardTitle>
        {locked && (
          <CardDescription>
            This record is {status.toLowerCase()} and can no longer be edited. Changes require an
            explicit correction, which stays visible in the audit trail.
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {(transitionState?.error || flagState?.error || reverseState?.error) && (
          <Alert variant="destructive">
            <AlertDescription>
              {transitionState?.error ?? flagState?.error ?? reverseState?.error}
            </AlertDescription>
          </Alert>
        )}
        {reverseState?.ok && (
          <Alert variant="success">
            <AlertDescription>Correction (reversal) created.</AlertDescription>
          </Alert>
        )}

        {!locked && (
          <div className="flex flex-wrap gap-2">
            {["DRAFT", "NEEDS_REVIEW"].includes(status) && (
              <form action={transitionAction}>
                <input type="hidden" name="transactionId" value={transactionId} />
                <input type="hidden" name="toStatus" value="CONFIRMED" />
                <Button type="submit" size="sm" disabled={transitionPending}>
                  Confirm
                </Button>
              </form>
            )}
            {["CONFIRMED", "RECONCILED"].includes(status) && (
              <form action={transitionAction}>
                <input type="hidden" name="transactionId" value={transactionId} />
                <input type="hidden" name="toStatus" value="NEEDS_REVIEW" />
                <Button type="submit" size="sm" variant="outline" disabled={transitionPending}>
                  Reopen for review
                </Button>
              </form>
            )}
            <form action={flagAction}>
              <input type="hidden" name="transactionId" value={transactionId} />
              <input
                type="hidden"
                name="reviewFlag"
                value={reviewFlag === "NEEDS_ADVICE" ? "NONE" : "NEEDS_ADVICE"}
              />
              <Button type="submit" size="sm" variant="outline">
                {reviewFlag === "NEEDS_ADVICE" ? "Remove 'needs advice'" : "Mark 'needs advice'"}
              </Button>
            </form>
          </div>
        )}

        {!locked && ["DRAFT", "NEEDS_REVIEW", "CONFIRMED"].includes(status) && (
          <form action={transitionAction} className="space-y-2 border-t pt-3">
            <input type="hidden" name="transactionId" value={transactionId} />
            <input type="hidden" name="toStatus" value="VOID" />
            <Label htmlFor="void-reason">Void this record (reason required when confirmed)</Label>
            <Input id="void-reason" name="reason" placeholder="Why is this record void?" />
            <Button type="submit" size="sm" variant="destructive" disabled={transitionPending}>
              Void record
            </Button>
            <p className="text-xs text-muted-foreground">
              Voided records stay visible in the audit trail; nothing disappears silently.
            </p>
          </form>
        )}

        {(locked || ["LOCKED"].includes(status)) && status !== "VOID" && status !== "CORRECTED" && (
          <form action={reverseAction} className="space-y-2 border-t pt-3">
            <input type="hidden" name="transactionId" value={transactionId} />
            <Label htmlFor="correction-date">Correction date (in an open period)</Label>
            <Input id="correction-date" name="date" type="date" required />
            <Label htmlFor="correction-reason">Reason</Label>
            <Input id="correction-reason" name="reason" required minLength={3} placeholder="Why is this correction needed?" />
            <Button type="submit" size="sm" variant="outline" disabled={reversePending}>
              Create reversal correction
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
