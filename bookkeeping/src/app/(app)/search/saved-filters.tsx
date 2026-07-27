"use client";

import Link from "next/link";
import { useActionState } from "react";
import { saveFilterAction, deleteFilterAction } from "@/server/actions/search";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SavedFilters({
  savedFilters,
  currentCriteria,
  hasQuery,
}: {
  savedFilters: { id: string; name: string; criteria: Record<string, string> }[];
  currentCriteria: Record<string, string>;
  hasQuery: boolean;
}) {
  const [saveState, saveAction, savePending] = useActionState(saveFilterAction, null);
  const [, deleteAction] = useActionState(deleteFilterAction, null);

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">Saved filters:</span>
      {savedFilters.length === 0 && <span className="text-muted-foreground">none yet</span>}
      {savedFilters.map((f) => {
        const qs = new URLSearchParams(
          Object.entries(f.criteria).filter(([, v]) => v),
        ).toString();
        return (
          <span key={f.id} className="inline-flex items-center gap-1 rounded-full border px-2 py-1">
            <Link className="text-primary underline" href={`/search?${qs}`}>
              {f.name}
            </Link>
            <form action={deleteAction} className="inline">
              <input type="hidden" name="filterId" value={f.id} />
              <button type="submit" aria-label={`Delete saved filter ${f.name}`} className="text-muted-foreground hover:text-destructive">
                ×
              </button>
            </form>
          </span>
        );
      })}
      {hasQuery && (
        <form action={saveAction} className="ml-auto flex items-center gap-2">
          <input type="hidden" name="criteria" value={JSON.stringify(currentCriteria)} />
          <Input name="name" placeholder="Save this search as…" className="h-8 w-44" required maxLength={60} />
          <Button type="submit" size="sm" variant="outline" disabled={savePending}>
            Save filter
          </Button>
          {saveState?.error && <span className="text-destructive">{saveState.error}</span>}
        </form>
      )}
    </div>
  );
}
