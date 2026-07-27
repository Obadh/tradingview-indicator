"use client";

import { useActionState } from "react";
import { updateDocumentAction } from "@/server/actions/documents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DOCUMENT_CATEGORY_LABELS } from "@/lib/labels";

export function DocumentMetaForm({
  document,
}: {
  document: {
    id: string;
    category: string;
    title: string;
    documentDate: string;
    notes: string;
    status: string;
  };
}) {
  const [state, formAction, pending] = useActionState(updateDocumentAction, null);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="documentId" value={document.id} />
      {state?.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {state?.ok && (
        <Alert variant="success">
          <AlertDescription>Saved.</AlertDescription>
        </Alert>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="doc-category">Document type</Label>
        <Select id="doc-category" name="category" defaultValue={document.category}>
          {Object.entries(DOCUMENT_CATEGORY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="doc-title">Title (optional)</Label>
        <Input id="doc-title" name="title" defaultValue={document.title} maxLength={200} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="doc-date">Document date</Label>
        <Input id="doc-date" name="documentDate" type="date" defaultValue={document.documentDate} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="doc-notes">Notes</Label>
        <Textarea id="doc-notes" name="notes" defaultValue={document.notes} maxLength={2000} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="doc-status">Status</Label>
        <Select id="doc-status" name="status" defaultValue={document.status}>
          <option value="NEEDS_REVIEW">Needs review</option>
          <option value="CONFIRMED">Confirmed</option>
          <option value="ARCHIVED">Archived</option>
        </Select>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
