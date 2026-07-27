"use client";

import { useActionState, useState } from "react";
import { runExportAction } from "@/server/actions/export";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function ExportForm({ currentYear, firstYear }: { currentYear: number; firstYear: number }) {
  const [state, formAction, pending] = useActionState(runExportAction, null);
  const [scope, setScope] = useState("year");
  const years = [];
  for (let y = currentYear; y >= Math.min(firstYear, currentYear); y--) years.push(y);

  return (
    <Card>
      <CardHeader>
        <CardTitle>New export</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          {state?.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          {state?.ok && (
            <Alert variant="success">
              <AlertDescription>Export completed — download it below.</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="export-scope">Export by</Label>
              <Select id="export-scope" name="scope" value={scope} onChange={(e) => setScope(e.target.value)}>
                <option value="year">Financial year</option>
                <option value="vat-quarter">VAT quarter</option>
                <option value="range">Custom date range</option>
              </Select>
            </div>
            {(scope === "year" || scope === "vat-quarter") && (
              <div className="space-y-1.5">
                <Label htmlFor="export-year">Year</Label>
                <Select id="export-year" name="year" defaultValue={String(currentYear)}>
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            {scope === "vat-quarter" && (
              <div className="space-y-1.5">
                <Label htmlFor="export-quarter">Quarter</Label>
                <Select id="export-quarter" name="quarter" defaultValue="1">
                  {[1, 2, 3, 4].map((q) => (
                    <option key={q} value={q}>
                      Q{q}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            {scope === "range" && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="export-from">From</Label>
                  <Input id="export-from" name="from" type="date" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="export-to">To</Label>
                  <Input id="export-to" name="to" type="date" required />
                </div>
              </>
            )}
          </div>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox name="includeObNumber" value="true" />
            <span>
              Include the (decrypted) omzetbelastingnummer in the profile snapshot. Leave off
              unless the recipient needs it — it is sensitive.
            </span>
          </label>
          <Button type="submit" disabled={pending}>
            {pending ? "Building export… (this can take a moment)" : "Build export ZIP"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
