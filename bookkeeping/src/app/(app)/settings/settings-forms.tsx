"use client";

import { useActionState, useState, useTransition } from "react";
import {
  updateBusinessAction,
  revealSensitiveAction,
  startTotpSetupAction,
  confirmTotpSetupAction,
  disableTotpAction,
  setOcrProviderAction,
  retentionDeleteAction,
  deleteAccountAction,
  type RetentionItem,
} from "@/server/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpTip } from "@/components/ui/tooltip";

interface BusinessProps {
  legalName: string;
  tradeName: string;
  kvkNumber: string;
  vatIdMasked: string;
  hasObNumber: boolean;
  obNumberMasked: string;
  addressLine1: string;
  postalCode: string;
  city: string;
  email: string;
  phone: string;
  iban: string;
  kvkRegisteredOn: string;
}

interface SettingsProps {
  invoicePrefix: string;
  vatFilingFrequency: string;
  korStatus: string;
  accountingBasis: string;
  defaultPaymentTermDays: number;
  retentionYears: number;
  assetThreshold: string;
  ocrProviderEnabled: boolean;
  ocrProviderConfigured: boolean;
}

export function SettingsForms({
  business,
  settings,
  security,
  retentionEligible,
}: {
  business: BusinessProps;
  settings: SettingsProps;
  security: { mfaEnabled: boolean; email: string };
  retentionEligible: RetentionItem[];
}) {
  const [profileState, profileAction, profilePending] = useActionState(updateBusinessAction, null);
  const [revealed, setRevealed] = useState<{ vatId: string; obNumber: string } | null>(null);
  const [, startReveal] = useTransition();

  return (
    <div className="space-y-8">
      {/* ------------------------------------------------ business profile */}
      <Card>
        <CardHeader>
          <CardTitle>Business profile & tax settings</CardTitle>
          <CardDescription>
            Sensitive identifiers are masked. Revealing them is recorded in the audit log.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={profileAction} className="grid gap-4 sm:grid-cols-2">
            {profileState?.error && (
              <Alert variant="destructive" className="sm:col-span-2">
                <AlertDescription>{profileState.error}</AlertDescription>
              </Alert>
            )}
            {profileState?.ok && (
              <Alert variant="success" className="sm:col-span-2">
                <AlertDescription>Settings saved.</AlertDescription>
              </Alert>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="s-legal">Legal name</Label>
              <Input id="s-legal" name="legalName" defaultValue={business.legalName} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-trade">Trade name</Label>
              <Input id="s-trade" name="tradeName" defaultValue={business.tradeName} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-kvk">KVK number</Label>
              <Input id="s-kvk" name="kvkNumber" defaultValue={business.kvkNumber} pattern="\d{8}" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-kvkdate">KVK registration date</Label>
              <Input id="s-kvkdate" name="kvkRegisteredOn" type="date" defaultValue={business.kvkRegisteredOn} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-vatid">
                VAT ID{" "}
                {!revealed && (
                  <button
                    type="button"
                    className="text-xs text-primary underline"
                    onClick={() =>
                      startReveal(async () => {
                        const res = await revealSensitiveAction();
                        if (res.ok) setRevealed({ vatId: res.vatId ?? "", obNumber: res.obNumber ?? "" });
                      })
                    }
                  >
                    reveal
                  </button>
                )}
              </Label>
              <Input
                id="s-vatid"
                name="vatId"
                defaultValue={revealed?.vatId ?? ""}
                placeholder={revealed ? "" : business.vatIdMasked || "NL123456789B01"}
                key={revealed ? "vat-revealed" : "vat-masked"}
              />
              <p className="text-xs text-muted-foreground">Leave empty to keep the current value masked above.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-ob">
                Omzetbelasting number{" "}
                <HelpTip label="Explain omzetbelastingnummer">
                  From Belastingdienst letters; can contain your BSN, so it is stored encrypted and
                  always masked. Enter a value only to change it.
                </HelpTip>
              </Label>
              <Input
                id="s-ob"
                name="obNumber"
                autoComplete="off"
                defaultValue={revealed?.obNumber ?? ""}
                placeholder={revealed ? "" : business.obNumberMasked || "(not set)"}
                key={revealed ? "ob-revealed" : "ob-masked"}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-address">Address</Label>
              <Input id="s-address" name="addressLine1" defaultValue={business.addressLine1} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="s-postal">Postal code</Label>
                <Input id="s-postal" name="postalCode" defaultValue={business.postalCode} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="s-city">City</Label>
                <Input id="s-city" name="city" defaultValue={business.city} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-email">Email</Label>
              <Input id="s-email" name="email" type="email" defaultValue={business.email} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-phone">Phone</Label>
              <Input id="s-phone" name="phone" defaultValue={business.phone} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-iban">Business IBAN</Label>
              <Input id="s-iban" name="iban" defaultValue={business.iban} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-prefix">Invoice prefix</Label>
              <Input id="s-prefix" name="invoicePrefix" defaultValue={settings.invoicePrefix} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-freq">VAT filing frequency (from your Belastingdienst letter)</Label>
              <Select id="s-freq" name="vatFilingFrequency" defaultValue={settings.vatFilingFrequency}>
                <option value="QUARTERLY">Quarterly</option>
                <option value="MONTHLY">Monthly</option>
                <option value="YEARLY">Yearly</option>
                <option value="UNKNOWN">I don’t know</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-kor">KOR status</Label>
              <Select id="s-kor" name="korStatus" defaultValue={settings.korStatus}>
                <option value="NOT_ENROLLED">Not enrolled</option>
                <option value="ENROLLED">Enrolled</option>
                <option value="PENDING">Pending</option>
                <option value="UNKNOWN">Unknown</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-basis">Accounting basis</Label>
              <Select id="s-basis" name="accountingBasis" defaultValue={settings.accountingBasis}>
                <option value="INVOICE">Invoice basis (factuurstelsel)</option>
                <option value="CASH">Cash basis (kasstelsel)</option>
                <option value="UNKNOWN">Unknown</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-term">Default payment term (days)</Label>
              <Input id="s-term" name="defaultPaymentTermDays" type="number" min={0} max={365} defaultValue={settings.defaultPaymentTermDays} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-retention">
                Retention period (years){" "}
                <HelpTip label="Explain retention">
                  Dutch bookkeeping must be kept for at least 7 years (longer for some records,
                  e.g. real estate: 10). This app never deletes anything automatically.
                </HelpTip>
              </Label>
              <Input id="s-retention" name="retentionYears" type="number" min={7} max={30} defaultValue={settings.retentionYears} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-asset">Asset suggestion threshold (EUR excl. VAT)</Label>
              <Input id="s-asset" name="assetThreshold" type="number" min={0} defaultValue={settings.assetThreshold} />
            </div>
            <div>
              <Button type="submit" disabled={profilePending}>
                {profilePending ? "Saving…" : "Save settings"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <SecuritySection mfaEnabled={security.mfaEnabled} />
      <PrivacySection ocrEnabled={settings.ocrProviderEnabled} ocrConfigured={settings.ocrProviderConfigured} />
      <RetentionSection items={retentionEligible} retentionYears={settings.retentionYears} />
      <DangerSection />
    </div>
  );
}

function SecuritySection({ mfaEnabled }: { mfaEnabled: boolean }) {
  const [setup, setSetup] = useState<{ otpauthUrl: string; secret: string } | null>(null);
  const [, startSetup] = useTransition();
  const [confirmState, confirmAction, confirmPending] = useActionState(confirmTotpSetupAction, null);
  const [disableState, disableAction, disablePending] = useActionState(disableTotpAction, null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Security — two-factor authentication (TOTP)</CardTitle>
        <CardDescription>
          Adds a 6-digit code from an authenticator app to your sign-in. Sessions expire
          automatically after 12 hours.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {mfaEnabled && !confirmState?.ok ? (
          <form action={disableAction} className="space-y-2">
            <Alert variant="success">
              <AlertDescription>MFA is enabled.</AlertDescription>
            </Alert>
            {disableState?.error && (
              <Alert variant="destructive">
                <AlertDescription>{disableState.error}</AlertDescription>
              </Alert>
            )}
            <Label htmlFor="mfa-disable-code">Authenticator code (required to disable)</Label>
            <Input id="mfa-disable-code" name="code" inputMode="numeric" className="w-40" />
            <Button type="submit" variant="destructive" size="sm" disabled={disablePending}>
              Disable MFA
            </Button>
          </form>
        ) : setup ? (
          <div className="space-y-3">
            <p className="text-sm">
              Add this account to your authenticator app (e.g. Aegis, 1Password, Google
              Authenticator) with this secret, then confirm with a code:
            </p>
            <p className="break-all rounded bg-secondary p-2 font-mono text-sm">{setup.secret}</p>
            <p className="break-all text-xs text-muted-foreground">{setup.otpauthUrl}</p>
            <form action={confirmAction} className="flex items-end gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="mfa-code">Code from the app</Label>
                <Input id="mfa-code" name="code" inputMode="numeric" className="w-40" required />
              </div>
              <Button type="submit" disabled={confirmPending}>
                Confirm & enable
              </Button>
            </form>
            {confirmState?.error && (
              <Alert variant="destructive">
                <AlertDescription>{confirmState.error}</AlertDescription>
              </Alert>
            )}
            {confirmState?.ok && (
              <Alert variant="success">
                <AlertDescription>MFA enabled.</AlertDescription>
              </Alert>
            )}
          </div>
        ) : (
          <Button
            variant="outline"
            onClick={() =>
              startSetup(async () => {
                const res = await startTotpSetupAction();
                if (res.ok && res.otpauthUrl && res.secret)
                  setSetup({ otpauthUrl: res.otpauthUrl, secret: res.secret });
              })
            }
          >
            Set up MFA
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function PrivacySection({ ocrEnabled, ocrConfigured }: { ocrEnabled: boolean; ocrConfigured: boolean }) {
  const [state, action, pending] = useActionState(setOcrProviderAction, null);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Privacy & data processing</CardTitle>
        <CardDescription>
          No analytics, no external calls by default. Your documents are never used to train AI
          models.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
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
        <form action={action} className="space-y-2">
          <input type="hidden" name="enabled" value={ocrEnabled ? "" : "true"} />
          {!ocrEnabled ? (
            <>
              <p className="text-sm">
                Document extraction (OCR) is currently <strong>off</strong>. The app is fully
                functional without it.
                {!ocrConfigured && " No provider is configured on this installation."}
              </p>
              <label className="flex items-start gap-2 text-sm">
                <Checkbox name="consent" value="true" />
                <span>
                  I understand that enabling extraction processes my uploaded documents with the
                  configured provider, and — if that provider is external — sends the file contents
                  to it. I consent to this processing.
                </span>
              </label>
              <Button type="submit" variant="outline" size="sm" disabled={pending || !ocrConfigured}>
                Enable document extraction
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm">
                Document extraction is <strong>on</strong>. Extracted values are always suggestions
                requiring your confirmation.
              </p>
              <Button type="submit" variant="outline" size="sm" disabled={pending}>
                Disable document extraction
              </Button>
            </>
          )}
        </form>
        <p className="text-sm text-muted-foreground">
          Data export: use <a className="text-primary underline" href="/export">Export administration</a> for a
          complete ZIP (documents + data). Reports can be exported as JSON for machine-readable
          backups.
        </p>
      </CardContent>
    </Card>
  );
}

function RetentionSection({ items, retentionYears }: { items: RetentionItem[]; retentionYears: number }) {
  const [state, action, pending] = useActionState(retentionDeleteAction, null);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Record retention</CardTitle>
        <CardDescription>
          Nothing is deleted automatically. Documents older than the {retentionYears}-year
          retention period are listed here; deleting one requires explicit confirmation and is
          recorded in the audit log. We recommend confirming with a professional first.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {state?.error && (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}
        {state?.ok && (
          <Alert variant="success">
            <AlertDescription>Document deleted; an audit record was written.</AlertDescription>
          </Alert>
        )}
        {items.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No documents have passed their retention period yet.
          </p>
        )}
        {items.map((item) => (
          <form key={item.documentId} action={action} className="space-y-2 rounded-md border p-3 text-sm">
            <input type="hidden" name="documentId" value={item.documentId} />
            <p>
              <strong>{item.filename}</strong> — record date {item.recordDate}, eligible since{" "}
              {item.eligibleDate}
            </p>
            <label className="flex items-start gap-2">
              <Checkbox name="professionalConfirmed" value="true" />
              <span>I obtained professional confirmation that this record may be destroyed.</span>
            </label>
            <div className="flex items-center gap-2">
              <Input name="confirmation" placeholder='Type DELETE to confirm' className="w-44" />
              <Button type="submit" variant="destructive" size="sm" disabled={pending}>
                Delete permanently
              </Button>
            </div>
          </form>
        ))}
      </CardContent>
    </Card>
  );
}

function DangerSection() {
  const [state, action, pending] = useActionState(deleteAccountAction, null);
  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <CardTitle>Delete account & administration</CardTitle>
        <CardDescription>
          Marks your account and administration as deleted and signs you out. Export your
          administration first — bookkeeping normally must be kept for 7 years even after stopping.
          Final purge of stored files is a manual operator step described in PRIVACY.md.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-wrap items-center gap-2">
          {state?.error && (
            <Alert variant="destructive" className="w-full">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <Input name="confirmation" placeholder='Type: DELETE MY ADMINISTRATION' className="w-72" />
          <Button type="submit" variant="destructive" disabled={pending}>
            Delete everything
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
