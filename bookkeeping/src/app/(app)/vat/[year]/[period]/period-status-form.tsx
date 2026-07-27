"use client";

import { useActionState } from "react";
import { setVatPeriodStatusAction } from "@/server/actions/vat";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TAX_PERIOD_STATUS_LABELS } from "@/lib/labels";

export function PeriodStatusForm({
  year,
  periodNo,
  currentStatus,
  locked,
  blockedByReview,
}: {
  year: number;
  periodNo: number;
  currentStatus: string;
  locked: boolean;
  blockedByReview: boolean;
}) {
  const [state, formAction, pending] = useActionState(setVatPeriodStatusAction, null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Period status: {TAX_PERIOD_STATUS_LABELS[currentStatus]}</CardTitle>
        <CardDescription>
          {locked
            ? "This period is locked. Changes to its records now require explicit correction entries, which stay visible in the audit trail. Large corrections to an already-filed return may require a suppletie — ask your adviser."
            : "After you file the return yourself with the Belastingdienst, mark the period as filed. That locks the period so the filed figures stay reproducible."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {state?.error && (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}
        {state?.ok && (
          <Alert variant="success">
            <AlertDescription>Status updated.</AlertDescription>
          </Alert>
        )}
        {!locked && (
          <div className="flex flex-wrap gap-2">
            {["IN_PROGRESS", "READY_FOR_REVIEW"].map((s) => (
              <form key={s} action={formAction}>
                <input type="hidden" name="year" value={year} />
                <input type="hidden" name="periodNo" value={periodNo} />
                <input type="hidden" name="status" value={s} />
                <Button type="submit" variant="outline" size="sm" disabled={pending || currentStatus === s}>
                  Mark {TAX_PERIOD_STATUS_LABELS[s]?.toLowerCase()}
                </Button>
              </form>
            ))}
            <form action={formAction}>
              <input type="hidden" name="year" value={year} />
              <input type="hidden" name="periodNo" value={periodNo} />
              <input type="hidden" name="status" value="FILED_MANUALLY" />
              <Button type="submit" size="sm" disabled={pending || blockedByReview}>
                I filed this return — lock the period
              </Button>
            </form>
          </div>
        )}
        {blockedByReview && !locked && (
          <p className="text-xs text-muted-foreground">
            Locking is disabled while records still need review.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
