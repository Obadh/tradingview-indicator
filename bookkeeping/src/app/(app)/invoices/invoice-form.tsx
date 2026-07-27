"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveInvoiceDraftAction } from "@/server/actions/invoices";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpTip } from "@/components/ui/tooltip";

interface VatCodeOption {
  id: string;
  code: string;
  name: string;
  ratePermille: number;
  treatment: string;
}

interface LineState {
  description: string;
  quantity: string;
  unitPrice: string;
  vatCodeId: string;
}

export function InvoiceForm({
  vatCodes,
  defaultPaymentTermDays,
  initial,
}: {
  vatCodes: VatCodeOption[];
  defaultPaymentTermDays: number;
  initial?: {
    invoiceId: string;
    contactName: string;
    contactAddress: string;
    contactPostalCode: string;
    contactCity: string;
    contactCountry: string;
    contactVatId: string;
    issueDate: string;
    supplyDate: string;
    paymentTermDays: number;
    reverseCharge: boolean;
    notes: string;
    lines: LineState[];
  };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const defaultVat = vatCodes.find((v) => v.code === "NL-HIGH")?.id ?? vatCodes[0]?.id ?? "";
  const [f, setF] = useState({
    contactName: initial?.contactName ?? "",
    contactAddress: initial?.contactAddress ?? "",
    contactPostalCode: initial?.contactPostalCode ?? "",
    contactCity: initial?.contactCity ?? "",
    contactCountry: initial?.contactCountry ?? "NL",
    contactVatId: initial?.contactVatId ?? "",
    issueDate: initial?.issueDate ?? "",
    supplyDate: initial?.supplyDate ?? "",
    paymentTermDays: String(initial?.paymentTermDays ?? defaultPaymentTermDays),
    reverseCharge: initial?.reverseCharge ?? false,
    notes: initial?.notes ?? "",
  });
  const [lines, setLines] = useState<LineState[]>(
    initial?.lines ?? [{ description: "", quantity: "1", unitPrice: "", vatCodeId: defaultVat }],
  );

  const set = (key: keyof typeof f, value: string | boolean) => setF((s) => ({ ...s, [key]: value }));

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const res = await saveInvoiceDraftAction({
        invoiceId: initial?.invoiceId,
        ...f,
        paymentTermDays: Number(f.paymentTermDays),
        lines,
      });
      if (res.ok && res.invoiceId) router.push(`/invoices/${res.invoiceId}`);
      else setError(res.error ?? "Could not save.");
    });
  };

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Customer</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="inv-name">Legal name</Label>
            <Input id="inv-name" value={f.contactName} onChange={(e) => set("contactName", e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-address">Address</Label>
            <Input id="inv-address" value={f.contactAddress} onChange={(e) => set("contactAddress", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-postal">Postal code</Label>
            <Input id="inv-postal" value={f.contactPostalCode} onChange={(e) => set("contactPostalCode", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-city">City</Label>
            <Input id="inv-city" value={f.contactCity} onChange={(e) => set("contactCity", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-country">Country (2 letters)</Label>
            <Input id="inv-country" maxLength={2} value={f.contactCountry} onChange={(e) => set("contactCountry", e.target.value.toUpperCase())} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-vatid">
              Customer VAT ID{" "}
              <HelpTip label="Explain customer VAT ID">
                Required when you reverse-charge VAT to an EU business customer. Ask the customer
                for their VAT identification number.
              </HelpTip>
            </Label>
            <Input id="inv-vatid" value={f.contactVatId} onChange={(e) => set("contactVatId", e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invoice details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="inv-issue">Issue date</Label>
            <Input id="inv-issue" type="date" value={f.issueDate} onChange={(e) => set("issueDate", e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-supply">
              Supply date{" "}
              <HelpTip label="Explain supply date">
                When the service was performed or the goods delivered, if different from the issue
                date.
              </HelpTip>
            </Label>
            <Input id="inv-supply" type="date" value={f.supplyDate} onChange={(e) => set("supplyDate", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-term">Payment term (days)</Label>
            <Input id="inv-term" type="number" min={0} max={365} value={f.paymentTermDays} onChange={(e) => set("paymentTermDays", e.target.value)} />
          </div>
          <label className="flex items-start gap-2 text-sm sm:col-span-3">
            <Checkbox checked={f.reverseCharge} onChange={(e) => set("reverseCharge", e.target.checked)} />
            <span>
              Reverse-charge VAT to the customer (EU B2B){" "}
              <HelpTip label="Explain reverse charged">
                For services to VAT-registered businesses in other EU countries you usually charge
                0% and shift the VAT to the customer (“btw verlegd”). The wording is printed on the
                invoice automatically. When unsure, check with your adviser.
              </HelpTip>
            </span>
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lines</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {lines.map((line, i) => (
            <fieldset key={i} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_90px_130px_170px_auto]">
              <legend className="sr-only">Invoice line {i + 1}</legend>
              <div className="space-y-1">
                <Label htmlFor={`inv-line-desc-${i}`}>Description</Label>
                <Input
                  id={`inv-line-desc-${i}`}
                  value={line.description}
                  onChange={(e) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, description: e.target.value } : l)))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`inv-line-qty-${i}`}>Qty</Label>
                <Input
                  id={`inv-line-qty-${i}`}
                  inputMode="decimal"
                  value={line.quantity}
                  onChange={(e) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, quantity: e.target.value } : l)))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`inv-line-price-${i}`}>Unit price (excl. VAT)</Label>
                <Input
                  id={`inv-line-price-${i}`}
                  inputMode="decimal"
                  placeholder="0,00"
                  value={line.unitPrice}
                  onChange={(e) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, unitPrice: e.target.value } : l)))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`inv-line-vat-${i}`}>VAT rate</Label>
                <Select
                  id={`inv-line-vat-${i}`}
                  value={line.vatCodeId}
                  onChange={(e) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, vatCodeId: e.target.value } : l)))}
                >
                  {vatCodes.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={lines.length === 1}
                  onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
                  aria-label={`Remove line ${i + 1}`}
                >
                  Remove
                </Button>
              </div>
            </fieldset>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setLines((ls) => [...ls, { description: "", quantity: "1", unitPrice: "", vatCodeId: defaultVat }])}
          >
            Add line
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notes (printed on the invoice)</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea aria-label="Invoice notes" value={f.notes} onChange={(e) => set("notes", e.target.value)} />
        </CardContent>
      </Card>

      <Button onClick={submit} disabled={pending || !f.contactName || !f.issueDate}>
        {pending ? "Saving…" : "Save draft"}
      </Button>
    </div>
  );
}
