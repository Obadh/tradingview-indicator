"use client";

import { useState, useTransition, useActionState } from "react";
import { useRouter } from "next/navigation";
import {
  suggestMatchesAction,
  confirmMatchAction,
  setBankLineStateAction,
} from "@/server/actions/banking";
import type { MatchSuggestion } from "@/lib/domain/reconciliation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatCents } from "@/lib/domain/money";

export function BankLineActions({
  bankTransactionId,
  state,
}: {
  bankTransactionId: string;
  state: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [suggestions, setSuggestions] = useState<(MatchSuggestion & { label: string })[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [, stateAction] = useActionState(setBankLineStateAction, null);

  const findMatches = () => {
    startTransition(async () => {
      const res = await suggestMatchesAction(bankTransactionId);
      if (res.ok) setSuggestions(res.suggestions ?? []);
      else setError(res.error ?? "Could not load suggestions");
    });
  };

  const confirm = (s: MatchSuggestion & { label: string }) => {
    startTransition(async () => {
      const res = await confirmMatchAction({
        bankTransactionId,
        candidateId: s.candidateId,
        candidateKind: s.candidateKind,
        amountCents: s.amountCents,
        reason: s.reasons.join(", "),
      });
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else setError(res.error ?? "Could not confirm match");
    });
  };

  if (["MATCHED", "IGNORED_PRIVATE", "OWN_TRANSFER"].includes(state)) {
    return (
      <form action={stateAction}>
        <input type="hidden" name="bankTransactionId" value={bankTransactionId} />
        <input type="hidden" name="state" value="UNMATCHED" />
        <Button type="submit" size="sm" variant="ghost">
          Undo
        </Button>
      </form>
    );
  }

  return (
    <div className="flex flex-wrap gap-1">
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) findMatches(); }}>
        <DialogTrigger asChild>
          <Button size="sm" variant="outline">
            Match
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Match suggestions</DialogTitle>
            <DialogDescription>
              Each suggestion explains why it matches. Confirming records the link and marks the
              record as paid when fully covered.
            </DialogDescription>
          </DialogHeader>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {pending && <p className="text-sm text-muted-foreground">Looking for matches…</p>}
          {suggestions && suggestions.length === 0 && !pending && (
            <p className="text-sm text-muted-foreground">
              No likely matches found. Record the expense/income first, or mark this line as
              private or an own-account transfer.
            </p>
          )}
          <ul className="space-y-2">
            {suggestions?.map((s) => (
              <li key={s.candidateId} className="rounded-md border p-3 text-sm">
                <p className="font-medium">{s.label}</p>
                <p className="text-muted-foreground">
                  {formatCents(s.amountCents)} · score {s.score}/100 — {s.reasons.join(", ")}
                  {s.partial && " · partial payment"}
                </p>
                <Button size="sm" className="mt-2" disabled={pending} onClick={() => confirm(s)}>
                  Confirm match
                </Button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
      <form action={stateAction}>
        <input type="hidden" name="bankTransactionId" value={bankTransactionId} />
        <input type="hidden" name="state" value="IGNORED_PRIVATE" />
        <Button type="submit" size="sm" variant="ghost">
          Private
        </Button>
      </form>
      <form action={stateAction}>
        <input type="hidden" name="bankTransactionId" value={bankTransactionId} />
        <input type="hidden" name="state" value="OWN_TRANSFER" />
        <Button type="submit" size="sm" variant="ghost">
          Own transfer
        </Button>
      </form>
    </div>
  );
}
