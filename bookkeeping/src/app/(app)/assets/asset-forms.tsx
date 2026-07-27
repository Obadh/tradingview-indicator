"use client";

import { useActionState } from "react";
import { createAssetAction, bookDepreciationAction } from "@/server/actions/assets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function NewAsset() {
  const [state, formAction, pending] = useActionState(createAssetAction, null);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Register asset</CardTitle>
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
              <AlertDescription>Asset registered.</AlertDescription>
            </Alert>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="asset-name">Name</Label>
            <Input id="asset-name" name="name" required maxLength={200} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="asset-category">Category (optional)</Label>
            <Input id="asset-category" name="category" placeholder="Laptop, phone, monitor…" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="asset-purchase-date">Purchase date</Label>
            <Input id="asset-purchase-date" name="purchaseDate" type="date" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="asset-inuse-date">In-use date (defaults to purchase date)</Label>
            <Input id="asset-inuse-date" name="inUseDate" type="date" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="asset-price">Purchase price excl. VAT (EUR)</Label>
            <Input id="asset-price" name="purchasePrice" inputMode="decimal" placeholder="0,00" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="asset-vat">VAT (EUR)</Label>
            <Input id="asset-vat" name="vat" inputMode="decimal" placeholder="0,00" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="asset-buspct">Business use %</Label>
            <Input id="asset-buspct" name="businessUsePct" type="number" min={0} max={100} defaultValue={100} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="asset-life">Useful life (months)</Label>
            <Input id="asset-life" name="usefulLifeMonths" type="number" min={1} max={600} defaultValue={60} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="asset-residual">Residual value (EUR)</Label>
            <Input id="asset-residual" name="residualValue" inputMode="decimal" placeholder="0,00" />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Register asset"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function BookDepreciation({ assetId }: { assetId: string }) {
  const [state, formAction, pending] = useActionState(bookDepreciationAction, null);
  const year = new Date().getFullYear();
  return (
    <form action={formAction} className="flex items-center gap-1">
      <input type="hidden" name="assetId" value={assetId} />
      <Select name="year" defaultValue={String(year - 1)} aria-label="Depreciation year" className="w-24">
        {[year, year - 1, year - 2, year - 3].map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </Select>
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        Book
      </Button>
      {state?.error && <span className="text-xs text-destructive">{state.error}</span>}
      {state?.ok && <span className="text-xs text-success">Booked ✓</span>}
    </form>
  );
}

export const AssetForms = { NewAsset, BookDepreciation };
