import { requireBusiness } from "@/lib/server/context";
import { maskIdentifier } from "@/lib/server/crypto";
import { listRetentionEligible } from "@/server/actions/settings";
import { SettingsForms } from "./settings-forms";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { business, user } = await requireBusiness();
  const settings = business.settings!;
  const retentionEligible = await listRetentionEligible();

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Business profile, tax settings, security, privacy and data management.
        </p>
      </div>
      <SettingsForms
        business={{
          legalName: business.legalName,
          tradeName: business.tradeName ?? "",
          kvkNumber: business.kvkNumber ?? "",
          vatIdMasked: maskIdentifier(business.vatId),
          hasObNumber: !!business.obNumberEncrypted,
          obNumberMasked: business.obNumberEncrypted ? "••••••••••" : "",
          addressLine1: business.addressLine1 ?? "",
          postalCode: business.postalCode ?? "",
          city: business.city ?? "",
          email: business.email ?? "",
          phone: business.phone ?? "",
          iban: business.iban ?? "",
          kvkRegisteredOn: business.kvkRegisteredOn?.toISOString().slice(0, 10) ?? "",
        }}
        settings={{
          invoicePrefix: settings.invoicePrefix,
          vatFilingFrequency: settings.vatFilingFrequency,
          korStatus: settings.korStatus,
          accountingBasis: settings.accountingBasis,
          defaultPaymentTermDays: settings.defaultPaymentTermDays,
          retentionYears: settings.retentionYears,
          assetThreshold: (settings.assetThresholdCents / 100).toFixed(0),
          ocrProviderEnabled: settings.ocrProviderEnabled,
          ocrProviderConfigured: (process.env.OCR_PROVIDER ?? "none") !== "none",
        }}
        security={{
          mfaEnabled: !!user.totpEnabledAt,
          email: user.email,
        }}
        retentionEligible={retentionEligible}
      />
    </div>
  );
}
