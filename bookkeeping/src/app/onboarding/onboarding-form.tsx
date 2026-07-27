"use client";

import { useActionState, useState } from "react";
import { completeOnboardingAction } from "@/server/actions/onboarding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { HelpTip } from "@/components/ui/tooltip";

const currentYear = new Date().getFullYear();

function Field({
  label,
  htmlFor,
  help,
  children,
}: {
  label: string;
  htmlFor: string;
  help?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>
        {label} {help && <HelpTip label={`Explain: ${label}`}>{help}</HelpTip>}
      </Label>
      {children}
    </div>
  );
}

export function OnboardingForm() {
  const [state, formAction, pending] = useActionState(completeOnboardingAction, null);
  const [step, setStep] = useState(0);

  // A single <form> whose sections are shown per step, so all values submit
  // together at the end and nothing is lost when navigating between steps.
  const steps = ["Identity", "Contact & bank", "Tax settings"];

  return (
    <form action={formAction} className="space-y-6">
      <nav aria-label="Onboarding progress" className="flex gap-2 text-sm">
        {steps.map((s, i) => (
          <button
            key={s}
            type="button"
            onClick={() => setStep(i)}
            aria-current={step === i ? "step" : undefined}
            className={`rounded-full border px-3 py-1 ${step === i ? "border-primary bg-accent text-accent-foreground" : "text-muted-foreground"}`}
          >
            {i + 1}. {s}
          </button>
        ))}
      </nav>

      {state?.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <div className={step === 0 ? "space-y-4" : "hidden"}>
        <Card>
          <CardHeader>
            <CardTitle>Business identity</CardTitle>
            <CardDescription>As registered with KVK, if you are registered already.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Legal name" htmlFor="legalName" help="Your own name or the registered name of the eenmanszaak.">
              <Input id="legalName" name="legalName" required maxLength={200} />
            </Field>
            <Field label="Trade name (optional)" htmlFor="tradeName" help="The name you use towards customers (handelsnaam).">
              <Input id="tradeName" name="tradeName" maxLength={200} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="KVK number (optional)" htmlFor="kvkNumber" help="8-digit number from the Chamber of Commerce (Kamer van Koophandel).">
                <Input id="kvkNumber" name="kvkNumber" inputMode="numeric" pattern="\d{8}" placeholder="12345678" />
              </Field>
              <Field label="KVK registration date (optional)" htmlFor="kvkRegisteredOn" help="Used to flag expenses made before registration as pre-registration (aanloopkosten) so you can review them.">
                <Input id="kvkRegisteredOn" name="kvkRegisteredOn" type="date" />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="VAT ID (optional)" htmlFor="vatId" help="Btw-identificatienummer, e.g. NL123456789B01. Shown on your sales invoices. It is masked in the app by default.">
                <Input id="vatId" name="vatId" placeholder="NL123456789B01" />
              </Field>
              <Field label="Omzetbelasting number (optional)" htmlFor="obNumber" help="The omzetbelastingnummer from Belastingdienst letters. Stored encrypted and always masked — it is sensitive because it can contain your BSN.">
                <Input id="obNumber" name="obNumber" autoComplete="off" />
              </Field>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className={step === 1 ? "space-y-4" : "hidden"}>
        <Card>
          <CardHeader>
            <CardTitle>Contact details & bank</CardTitle>
            <CardDescription>Printed on your sales invoices.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Address" htmlFor="addressLine1">
              <Input id="addressLine1" name="addressLine1" autoComplete="street-address" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Postal code" htmlFor="postalCode">
                <Input id="postalCode" name="postalCode" autoComplete="postal-code" />
              </Field>
              <Field label="City" htmlFor="city">
                <Input id="city" name="city" />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Email" htmlFor="email">
                <Input id="email" name="email" type="email" />
              </Field>
              <Field label="Phone" htmlFor="phone">
                <Input id="phone" name="phone" type="tel" />
              </Field>
            </div>
            <Field label="Business IBAN (optional)" htmlFor="iban" help="The account customers should pay into; printed on invoices.">
              <Input id="iban" name="iban" placeholder="NL00BANK0123456789" />
            </Field>
            <Field
              label="Which bank accounts do you use for the business?"
              htmlFor="bankUsage"
              help="Many starters use their personal account at first. The app treats personal accounts carefully: only business-related lines become bookkeeping entries."
            >
              <Select id="bankUsage" name="bankUsage" defaultValue="BOTH">
                <option value="BOTH">Both a personal and a business account</option>
                <option value="BUSINESS_ONLY">A business account only</option>
                <option value="PERSONAL_ONLY">My personal account only</option>
              </Select>
            </Field>
          </CardContent>
        </Card>
      </div>

      <div className={step === 2 ? "space-y-4" : "hidden"}>
        <Card>
          <CardHeader>
            <CardTitle>Tax settings</CardTitle>
            <CardDescription>
              Copy these from your Belastingdienst letters. If you are not sure, choose
              “I don’t know” — the app will not guess your obligations.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Invoice prefix" htmlFor="invoicePrefix" help="Your invoice numbers look like PREFIX-2026-0001. Sequential and without gaps.">
                <Input id="invoicePrefix" name="invoicePrefix" defaultValue="INV" required maxLength={10} />
              </Field>
              <Field label="First financial year" htmlFor="firstFinancialYear" help="The first calendar year this administration covers.">
                <Input
                  id="firstFinancialYear"
                  name="firstFinancialYear"
                  type="number"
                  min={2000}
                  max={2100}
                  defaultValue={currentYear}
                  required
                />
              </Field>
            </div>
            <Field
              label="How often must you file VAT returns?"
              htmlFor="vatFilingFrequency"
              help="VAT (btw / omzetbelasting) is the tax you charge on sales and can often reclaim on purchases. The Belastingdienst letter you received after registration states whether you file monthly, quarterly (most common) or yearly."
            >
              <Select id="vatFilingFrequency" name="vatFilingFrequency" defaultValue="UNKNOWN">
                <option value="QUARTERLY">Quarterly (most common)</option>
                <option value="MONTHLY">Monthly</option>
                <option value="YEARLY">Yearly</option>
                <option value="UNKNOWN">I don’t know yet</option>
              </Select>
            </Field>
            <Field
              label="KOR (small businesses scheme) status"
              htmlFor="korStatus"
              help="The kleineondernemersregeling is an optional VAT exemption for small turnover. If enrolled you usually charge no VAT and cannot reclaim VAT. Only choose 'Enrolled' if the Belastingdienst confirmed it."
            >
              <Select id="korStatus" name="korStatus" defaultValue="UNKNOWN">
                <option value="NOT_ENROLLED">Not enrolled</option>
                <option value="ENROLLED">Enrolled</option>
                <option value="PENDING">Applied, waiting for confirmation</option>
                <option value="UNKNOWN">I don’t know</option>
              </Select>
            </Field>
            <Field
              label="Accounting basis"
              htmlFor="accountingBasis"
              help="Invoice basis (factuurstelsel): you report VAT in the period of the invoice date — the default for most businesses. Cash basis (kasstelsel): you report when money is actually paid — mainly for businesses selling to consumers. When in doubt pick 'I don’t know' and ask an adviser."
            >
              <Select id="accountingBasis" name="accountingBasis" defaultValue="INVOICE">
                <option value="INVOICE">Invoice basis (factuurstelsel) — default</option>
                <option value="CASH">Cash basis (kasstelsel)</option>
                <option value="UNKNOWN">I don’t know</option>
              </Select>
            </Field>
          </CardContent>
        </Card>
        <Alert variant="info">
          <AlertDescription>
            This app assists with bookkeeping and shows estimates only. It does not replace a
            bookkeeper or tax adviser, and it never files anything with the Belastingdienst.
          </AlertDescription>
        </Alert>
      </div>

      <div className="flex justify-between">
        <Button type="button" variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          Back
        </Button>
        {step < steps.length - 1 ? (
          <Button type="button" onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))}>
            Next
          </Button>
        ) : (
          <Button type="submit" disabled={pending}>
            {pending ? "Setting up…" : "Finish setup"}
          </Button>
        )}
      </div>
    </form>
  );
}
