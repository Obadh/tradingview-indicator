"use client";

import { useActionState } from "react";
import { finalizeInvoiceAction, createCreditNoteAction } from "@/server/actions/invoices";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function InvoiceActions({
  invoiceId,
  status,
  kind,
}: {
  invoiceId: string;
  status: string;
  kind: string;
}) {
  const [finalizeState, finalizeAction, finalizePending] = useActionState(finalizeInvoiceAction, null);
  const [creditState, creditAction, creditPending] = useActionState(createCreditNoteAction, null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Actions</CardTitle>
        {status === "DRAFT" && (
          <CardDescription>
            Finalizing assigns the next sequential number, freezes the invoice, generates the PDF
            and books the revenue. This cannot be undone — corrections then require a credit note.
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {(finalizeState?.error || creditState?.error) && (
          <Alert variant="destructive">
            <AlertDescription>{finalizeState?.error ?? creditState?.error}</AlertDescription>
          </Alert>
        )}
        <div className="flex flex-wrap gap-2">
          {status === "DRAFT" && (
            <form action={finalizeAction}>
              <input type="hidden" name="invoiceId" value={invoiceId} />
              <Button type="submit" disabled={finalizePending}>
                {finalizePending
                  ? "Finalizing…"
                  : kind === "CREDIT_NOTE"
                    ? "Finalize credit note"
                    : "Finalize invoice"}
              </Button>
            </form>
          )}
          {["FINALIZED", "SENT", "PAID", "PARTIALLY_PAID", "OVERDUE"].includes(status) &&
            kind === "INVOICE" && (
              <form action={creditAction}>
                <input type="hidden" name="invoiceId" value={invoiceId} />
                <Button type="submit" variant="outline" disabled={creditPending}>
                  {creditPending ? "Creating…" : "Create credit note"}
                </Button>
              </form>
            )}
        </div>
      </CardContent>
    </Card>
  );
}
