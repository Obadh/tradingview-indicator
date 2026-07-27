"use client";

import { useActionState } from "react";
import { saveLetterAction } from "@/server/actions/letters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function LetterForm({ documents }: { documents: { id: string; label: string }[] }) {
  const [state, formAction, pending] = useActionState(saveLetterAction, null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Register letter</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-4 sm:grid-cols-2">
          {state?.error && (
            <Alert variant="destructive" className="sm:col-span-2">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          {state?.ok && (
            <Alert variant="success" className="sm:col-span-2">
              <AlertDescription>Letter saved.</AlertDescription>
            </Alert>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="letter-sender">Sender</Label>
            <Select id="letter-sender" name="sender" defaultValue="Belastingdienst">
              <option value="Belastingdienst">Belastingdienst</option>
              <option value="KVK">KVK</option>
              <option value="Other">Other</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="letter-date">Letter date</Label>
            <Input id="letter-date" name="letterDate" type="date" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="letter-ref">Reference number</Label>
            <Input id="letter-ref" name="referenceNumber" maxLength={60} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="letter-taxtype">Tax type</Label>
            <Input id="letter-taxtype" name="taxType" placeholder="omzetbelasting, inkomstenbelasting…" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="letter-period">Period</Label>
            <Input id="letter-period" name="period" placeholder="e.g. Q2 2026" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="letter-deadline">Response deadline (from the letter)</Label>
            <Input id="letter-deadline" name="responseDeadline" type="date" />
          </div>
          <label className="flex items-start gap-2 text-sm sm:col-span-2">
            <Checkbox name="actionRequired" value="true" />
            <span>Action required — create a reminder for the deadline above</span>
          </label>
          <div className="space-y-1.5">
            <Label htmlFor="letter-doc">Scanned document (optional)</Label>
            <Select id="letter-doc" name="documentId" defaultValue="">
              <option value="">— none —</option>
              {documents.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="letter-status">Status</Label>
            <Select id="letter-status" name="status" defaultValue="NEW">
              <option value="NEW">New</option>
              <option value="ACTION_REQUIRED">Action required</option>
              <option value="IN_PROGRESS">In progress</option>
              <option value="DONE">Done</option>
              <option value="ARCHIVED">Archived</option>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="letter-notes">Notes</Label>
            <Textarea id="letter-notes" name="notes" maxLength={2000} />
          </div>
          <div>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save letter"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
