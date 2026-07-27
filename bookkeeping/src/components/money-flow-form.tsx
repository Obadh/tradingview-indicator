"use client";

/**
 * Shared client form for expenses and income: dynamic invoice lines with
 * per-line VAT codes (multiple VAT rates on one invoice), foreign-currency
 * fields, mixed-use percentages (expenses) and platform fees (income).
 * Amounts stay strings until the server parses them exactly into cents.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpTip } from "@/components/ui/tooltip";
import type { ExpenseActionResult } from "@/server/actions/expenses";

export interface VatCodeOption {
  id: string;
  code: string;
  name: string;
  ratePermille: number;
  treatment: string;
}

export interface CategoryOption {
  id: string;
  name: string;
  suggestAsset?: boolean;
  defaultVatCodeId?: string | null;
}

interface LineState {
  description: string;
  net: string;
  vatCodeId: string;
  vat: string;
  vatTouched: boolean;
}

function calcVat(net: string, ratePermille: number): string {
  const cleaned = net.replace(/\./g, "").replace(",", ".");
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return "";
  return ((value * ratePermille) / 1000).toFixed(2).replace(".", ",");
}

export function MoneyFlowForm({
  mode,
  categories,
  vatCodes,
  documentId,
  suggested,
  kvkRegisteredOn,
  assetThresholdCents,
  action,
}: {
  mode: "expense" | "income";
  categories: CategoryOption[];
  vatCodes: VatCodeOption[];
  documentId?: string;
  suggested?: Partial<Record<string, string>>;
  kvkRegisteredOn?: string | null;
  assetThresholdCents?: number;
  action: (payload: unknown) => Promise<ExpenseActionResult>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const defaultVat = vatCodes.find((v) => v.code === "NL-HIGH")?.id ?? vatCodes[0]?.id ?? "";
  const [lines, setLines] = useState<LineState[]>([
    {
      description: suggested?.description ?? "",
      net: suggested?.totalExVat ?? "",
      vatCodeId: defaultVat,
      vat: suggested?.vatAmount ?? "",
      vatTouched: !!suggested?.vatAmount,
    },
  ]);
  const [result, setResult] = useState<ExpenseActionResult | null>(null);
  const [fields, setFields] = useState<Record<string, string | boolean>>({
    supplierName: suggested?.supplierName ?? "",
    supplierCountry: "NL",
    supplierVatId: suggested?.supplierVatId ?? "",
    invoiceNumber: suggested?.invoiceNumber ?? "",
    invoiceDate: suggested?.invoiceDate ?? "",
    paymentDate: "",
    description: suggested?.description ?? "",
    categoryId: categories[0]?.id ?? "",
    businessPurpose: "",
    currency: suggested?.currency ?? "EUR",
    originalTotal: "",
    exchangeRate: "",
    exchangeRateSource: "",
    exchangeRateNote: "",
    paidFrom: "BUSINESS_BANK",
    receivedInto: "BUSINESS_BANK",
    paymentMethod: "",
    customerType: "BUSINESS",
    servicePeriod: "",
    platformFee: "",
    paymentReference: "",
    isPreRegistration: false,
    isMixedUse: false,
    businessUsePct: "100",
    vatRecoveryPct: "100",
    itDeductiblePct: "100",
    mixedUseNote: "",
    asAsset: false,
    notes: "",
  });

  const set = (key: string, value: string | boolean) => setFields((f) => ({ ...f, [key]: value }));
  const str = (key: string) => String(fields[key] ?? "");
  const bool = (key: string) => Boolean(fields[key]);

  const isExpense = mode === "expense";
  const foreignCurrency = str("currency").toUpperCase() !== "EUR";
  const category = categories.find((c) => c.id === fields.categoryId);
  const netTotalApprox = useMemo(
    () =>
      lines.reduce((s, l) => {
        const v = Number(l.net.replace(/\./g, "").replace(",", "."));
        return s + (Number.isFinite(v) ? v : 0);
      }, 0),
    [lines],
  );
  const suggestsAsset =
    isExpense &&
    (category?.suggestAsset ?? false) &&
    netTotalApprox * 100 >= (assetThresholdCents ?? 45000);
  const mixedUseActive =
    bool("isMixedUse") ||
    Number(str("businessUsePct")) < 100 ||
    Number(str("vatRecoveryPct")) < 100 ||
    Number(str("itDeductiblePct")) < 100;
  const preRegSuggested =
    isExpense && !!kvkRegisteredOn && !!str("invoiceDate") && str("invoiceDate") < kvkRegisteredOn;

  const submit = (confirmNow: boolean) => {
    const payload: Record<string, unknown> = {
      documentIds: documentId ? [documentId] : [],
      invoiceDate: str("invoiceDate"),
      paymentDate: str("paymentDate"),
      description: str("description"),
      categoryId: str("categoryId"),
      currency: str("currency").toUpperCase(),
      originalTotal: str("originalTotal"),
      exchangeRate: str("exchangeRate"),
      exchangeRateSource: str("exchangeRateSource"),
      exchangeRateNote: str("exchangeRateNote"),
      invoiceNumber: str("invoiceNumber"),
      notes: str("notes"),
      lines: lines.map((l) => ({
        description: l.description,
        net: l.net,
        vatCodeId: l.vatCodeId,
        vat: l.vat === "" ? "0" : l.vat,
      })),
      confirmNow,
    };
    if (isExpense) {
      Object.assign(payload, {
        supplierName: str("supplierName"),
        supplierCountry: str("supplierCountry").toUpperCase(),
        supplierVatId: str("supplierVatId"),
        businessPurpose: str("businessPurpose"),
        paidFrom: str("paidFrom"),
        paymentMethod: str("paymentMethod"),
        isPreRegistration: bool("isPreRegistration") || preRegSuggested,
        isMixedUse: mixedUseActive,
        businessUsePct: Number(str("businessUsePct")),
        vatRecoveryPct: Number(str("vatRecoveryPct")),
        itDeductiblePct: Number(str("itDeductiblePct")),
        mixedUseNote: str("mixedUseNote"),
        asAsset: bool("asAsset"),
      });
    } else {
      Object.assign(payload, {
        payerName: str("supplierName"),
        customerType: str("customerType"),
        country: str("supplierCountry").toUpperCase(),
        servicePeriod: str("servicePeriod"),
        platformFee: str("platformFee"),
        receivedInto: str("receivedInto"),
        paymentReference: str("paymentReference"),
      });
    }
    startTransition(async () => {
      const res = await action(payload);
      setResult(res);
      if (res.ok && res.transactionId && (!res.warnings || res.warnings.length === 0)) {
        router.push(`/transactions/${res.transactionId}`);
      }
    });
  };

  return (
    <div className="space-y-6">
      {result && !result.ok && (
        <Alert variant="destructive">
          <AlertDescription>{result.error}</AlertDescription>
        </Alert>
      )}
      {result?.ok && result.warnings && result.warnings.length > 0 && (
        <Alert variant="warning">
          <AlertTitle>Saved with warnings</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {result.warnings.map((w) => (
                <li key={w.code}>{w.message}</li>
              ))}
            </ul>
            <Button
              className="mt-2"
              size="sm"
              variant="outline"
              onClick={() => router.push(`/transactions/${result.transactionId}`)}
            >
              View the saved record
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{isExpense ? "Supplier" : "Customer or platform"}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="party-name">{isExpense ? "Supplier name" : "Customer / platform name"}</Label>
            <Input id="party-name" value={str("supplierName")} onChange={(e) => set("supplierName", e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="party-country">
              Country (2 letters){" "}
              <HelpTip label="Explain country">
                The supplier’s country drives the VAT treatment. NL = Dutch VAT; other EU countries
                often mean reverse-charged VAT; outside the EU may mean import rules.
              </HelpTip>
            </Label>
            <Input id="party-country" value={str("supplierCountry")} maxLength={2} onChange={(e) => set("supplierCountry", e.target.value.toUpperCase())} />
          </div>
          {isExpense ? (
            <div className="space-y-1.5">
              <Label htmlFor="party-vatid">Supplier VAT ID (optional)</Label>
              <Input id="party-vatid" value={str("supplierVatId")} onChange={(e) => set("supplierVatId", e.target.value)} />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="customer-type">
                Customer type{" "}
                <HelpTip label="Explain customer type">
                  Business customers in the EU are usually invoiced with reverse-charged VAT;
                  consumers get Dutch VAT; platforms (Apple, Google) settle on their own statements.
                </HelpTip>
              </Label>
              <Select id="customer-type" value={str("customerType")} onChange={(e) => set("customerType", e.target.value)}>
                <option value="BUSINESS">Business</option>
                <option value="CONSUMER">Consumer</option>
                <option value="PLATFORM">Platform (App Store, Google Play…)</option>
                <option value="UNKNOWN">Unknown</option>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{isExpense ? "Invoice details" : "Invoice / statement details"}</CardTitle>
          <CardDescription>
            <HelpTip label="Invoice date versus payment date">
              The invoice date decides which VAT period the record belongs to (invoice basis). The
              payment date is when money actually moved — they are often different.
            </HelpTip>{" "}
            Invoice date decides the VAT period; payment date is when money moved.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="invoice-number">Invoice / statement number</Label>
            <Input id="invoice-number" value={str("invoiceNumber")} onChange={(e) => set("invoiceNumber", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invoice-date">Invoice date</Label>
            <Input id="invoice-date" type="date" value={str("invoiceDate")} onChange={(e) => set("invoiceDate", e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="payment-date">Payment date (optional)</Label>
            <Input id="payment-date" type="date" value={str("paymentDate")} onChange={(e) => set("paymentDate", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="flow-description">Short description</Label>
            <Input id="flow-description" value={str("description")} onChange={(e) => set("description", e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="flow-category">Category</Label>
            <Select id="flow-category" value={str("categoryId")} onChange={(e) => set("categoryId", e.target.value)}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          {!isExpense && (
            <div className="space-y-1.5">
              <Label htmlFor="service-period">Service date or period (optional)</Label>
              <Input id="service-period" placeholder="e.g. June 2026" value={str("servicePeriod")} onChange={(e) => set("servicePeriod", e.target.value)} />
            </div>
          )}
          {isExpense && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="business-purpose">
                Business purpose{" "}
                <HelpTip label="Explain business purpose">
                  One sentence on why this cost is business-related (e.g. “hosting for client
                  project X”). Helps you and your adviser later.
                </HelpTip>
              </Label>
              <Input id="business-purpose" value={str("businessPurpose")} onChange={(e) => set("businessPurpose", e.target.value)} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Amounts</CardTitle>
          <CardDescription>
            Use one line per VAT rate — an invoice can mix 21%, 9% and other treatments.{" "}
            <HelpTip label="What is VAT?">
              VAT (btw) is the tax on the invoice. “Net” is the amount excluding VAT. The VAT amount
              is suggested from the rate but you can correct it to match the invoice exactly.
            </HelpTip>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {lines.map((line, i) => {
            const code = vatCodes.find((v) => v.id === line.vatCodeId);
            return (
              <fieldset key={i} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_120px_180px_120px_auto]">
                <legend className="sr-only">Invoice line {i + 1}</legend>
                <div className="space-y-1">
                  <Label htmlFor={`line-desc-${i}`}>Description</Label>
                  <Input
                    id={`line-desc-${i}`}
                    value={line.description}
                    onChange={(e) =>
                      setLines((ls) => ls.map((l, j) => (j === i ? { ...l, description: e.target.value } : l)))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`line-net-${i}`}>Net ({str("currency")})</Label>
                  <Input
                    id={`line-net-${i}`}
                    inputMode="decimal"
                    placeholder="0,00"
                    value={line.net}
                    onChange={(e) =>
                      setLines((ls) =>
                        ls.map((l, j) =>
                          j === i
                            ? {
                                ...l,
                                net: e.target.value,
                                vat: l.vatTouched ? l.vat : calcVat(e.target.value, code?.ratePermille ?? 0),
                              }
                            : l,
                        ),
                      )
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`line-vatcode-${i}`}>VAT rate / treatment</Label>
                  <Select
                    id={`line-vatcode-${i}`}
                    value={line.vatCodeId}
                    onChange={(e) => {
                      const newCode = vatCodes.find((v) => v.id === e.target.value);
                      setLines((ls) =>
                        ls.map((l, j) =>
                          j === i
                            ? {
                                ...l,
                                vatCodeId: e.target.value,
                                vat: l.vatTouched ? l.vat : calcVat(l.net, newCode?.ratePermille ?? 0),
                              }
                            : l,
                        ),
                      );
                    }}
                  >
                    {vatCodes.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`line-vat-${i}`}>VAT amount</Label>
                  <Input
                    id={`line-vat-${i}`}
                    inputMode="decimal"
                    placeholder="0,00"
                    value={line.vat}
                    onChange={(e) =>
                      setLines((ls) => ls.map((l, j) => (j === i ? { ...l, vat: e.target.value, vatTouched: true } : l)))
                    }
                  />
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
            );
          })}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setLines((ls) => [...ls, { description: "", net: "", vatCodeId: defaultVat, vat: "", vatTouched: false }])
            }
          >
            Add line (another VAT rate)
          </Button>
          {!isExpense && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="platform-fee">
                  Platform commission / fees (optional){" "}
                  <HelpTip label="Explain platform commission">
                    For App Store / Google Play payouts: the commission the platform kept. Recording
                    it separately keeps your gross revenue and costs visible instead of only the net
                    payout.
                  </HelpTip>
                </Label>
                <Input id="platform-fee" inputMode="decimal" placeholder="0,00" value={str("platformFee")} onChange={(e) => set("platformFee", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="payment-reference">Payment reference (optional)</Label>
                <Input id="payment-reference" value={str("paymentReference")} onChange={(e) => set("paymentReference", e.target.value)} />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Currency</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="currency">Invoice currency</Label>
            <Input id="currency" value={str("currency")} maxLength={3} onChange={(e) => set("currency", e.target.value.toUpperCase())} />
          </div>
          {foreignCurrency && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="original-total">Total in {str("currency")} (as on the invoice)</Label>
                <Input id="original-total" inputMode="decimal" value={str("originalTotal")} onChange={(e) => set("originalTotal", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="exchange-rate">
                  Exchange rate (EUR per 1 {str("currency")}){" "}
                  <HelpTip label="Explain exchange rate">
                    Enter the amounts above in EUR, using the rate from your bank statement or the
                    ECB reference rate, and record which source you used. There is no automatic
                    rate feed — the app makes no external calls.
                  </HelpTip>
                </Label>
                <Input id="exchange-rate" inputMode="decimal" placeholder="e.g. 0.92" value={str("exchangeRate")} onChange={(e) => set("exchangeRate", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="exchange-source">Rate source</Label>
                <Input id="exchange-source" placeholder="bank statement / ECB / manual" value={str("exchangeRateSource")} onChange={(e) => set("exchangeRateSource", e.target.value)} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="exchange-note">Note (required for manual rates)</Label>
                <Input id="exchange-note" value={str("exchangeRateNote")} onChange={(e) => set("exchangeRateNote", e.target.value)} />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {isExpense ? (
            <div className="space-y-1.5">
              <Label htmlFor="paid-from">
                Paid from{" "}
                <HelpTip label="Explain paid personally">
                  “Paid personally” means you paid with private money. The app then records an owner
                  contribution — the business owes nothing and your profit is unaffected. This is
                  normal for starters.
                </HelpTip>
              </Label>
              <Select id="paid-from" value={str("paidFrom")} onChange={(e) => set("paidFrom", e.target.value)}>
                <option value="BUSINESS_BANK">Business bank account</option>
                <option value="PERSONAL">Paid personally (private money)</option>
                <option value="CASH">Cash</option>
                <option value="NOT_PAID">Not paid yet</option>
              </Select>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="received-into">Received into</Label>
              <Select id="received-into" value={str("receivedInto")} onChange={(e) => set("receivedInto", e.target.value)}>
                <option value="BUSINESS_BANK">Business bank account</option>
                <option value="PERSONAL">Personal bank account</option>
                <option value="CASH">Cash</option>
                <option value="NOT_RECEIVED">Not received yet</option>
              </Select>
            </div>
          )}
          {isExpense && (
            <div className="space-y-1.5">
              <Label htmlFor="payment-method">Payment method (optional)</Label>
              <Input id="payment-method" placeholder="iDEAL, card, direct debit…" value={str("paymentMethod")} onChange={(e) => set("paymentMethod", e.target.value)} />
            </div>
          )}
        </CardContent>
      </Card>

      {isExpense && (
        <Card>
          <CardHeader>
            <CardTitle>Special situations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {preRegSuggested && (
              <Alert variant="warning">
                <AlertDescription>
                  This invoice date is before your KVK registration ({kvkRegisteredOn}). It will be
                  marked as a pre-registration expense and flagged for review — such costs are
                  sometimes deductible, but that needs confirmation.
                </AlertDescription>
              </Alert>
            )}
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={bool("isPreRegistration") || preRegSuggested} onChange={(e) => set("isPreRegistration", e.target.checked)} />
              <span>
                Pre-registration / startup expense{" "}
                <HelpTip label="Explain pre-registration expense">
                  A cost made before your KVK registration (aanloopkosten). The app never assumes it
                  is deductible; it flags it so you or your adviser can decide.
                </HelpTip>
              </span>
            </label>
            {suggestsAsset && (
              <Alert variant="info">
                <AlertDescription>
                  This looks like it may be an asset (≥ €{((assetThresholdCents ?? 45000) / 100).toFixed(0)}{" "}
                  excluding VAT). Assets are usually depreciated over several years instead of
                  expensed at once. Tick the box below to book it as an asset — you decide.
                </AlertDescription>
              </Alert>
            )}
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={bool("asAsset")} onChange={(e) => set("asAsset", e.target.checked)} />
              <span>Book as asset (depreciate over time, register in the asset list)</span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={mixedUseActive} onChange={(e) => set("isMixedUse", e.target.checked)} />
              <span>
                Mixed business/private use{" "}
                <HelpTip label="Explain business-use percentage">
                  For things you also use privately (phone, internet, laptop). Enter which share is
                  business. The cost share and the VAT share may differ — when unsure, ask your
                  adviser. An explanation is required below 100%.
                </HelpTip>
              </span>
            </label>
            {mixedUseActive && (
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="business-use">Business cost %</Label>
                  <Input id="business-use" type="number" min={0} max={100} value={str("businessUsePct")} onChange={(e) => set("businessUsePct", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="vat-recovery">VAT recovery %</Label>
                  <Input id="vat-recovery" type="number" min={0} max={100} value={str("vatRecoveryPct")} onChange={(e) => set("vatRecoveryPct", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="it-deduct">Income-tax deductible %</Label>
                  <Input id="it-deduct" type="number" min={0} max={100} value={str("itDeductiblePct")} onChange={(e) => set("itDeductiblePct", e.target.value)} />
                </div>
                <div className="space-y-1.5 sm:col-span-3">
                  <Label htmlFor="mixed-note">Explanation (required)</Label>
                  <Input id="mixed-note" placeholder="e.g. phone used ±70% for business" value={str("mixedUseNote")} onChange={(e) => set("mixedUseNote", e.target.value)} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea aria-label="Notes" value={str("notes")} onChange={(e) => set("notes", e.target.value)} />
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={pending} onClick={() => submit(false)}>
          {pending ? "Saving…" : "Save for review"}
        </Button>
        <Button type="button" variant="outline" disabled={pending} onClick={() => submit(true)}>
          Save and confirm
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        “Save for review” keeps the record in your review inbox. International or uncertain records
        are always saved for review first, never confirmed silently.
      </p>
    </div>
  );
}
