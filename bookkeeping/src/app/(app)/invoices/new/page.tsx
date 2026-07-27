import { requireBusiness } from "@/lib/server/context";
import { prisma } from "@/lib/server/db";
import { InvoiceForm } from "../invoice-form";
import { Alert, AlertDescription } from "@/components/ui/alert";

export const metadata = { title: "New invoice" };
export const dynamic = "force-dynamic";

export default async function NewInvoicePage() {
  const { business } = await requireBusiness();
  const vatCodes = await prisma.vATCode.findMany({
    where: {
      businessId: business.id,
      validTo: null,
      treatment: { in: ["DOMESTIC_HIGH", "DOMESTIC_LOW", "DOMESTIC_ZERO", "REVERSE_CHARGE_SALE", "EXEMPT", "OUTSIDE_SCOPE"] },
    },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true, ratePermille: true, treatment: true },
  });
  const missingProfile = !business.kvkNumber || !business.vatId || !business.addressLine1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">New sales invoice</h1>
        <p className="text-sm text-muted-foreground">
          The invoice number is assigned when you finalize — drafts have no number yet.
        </p>
      </div>
      {missingProfile && (
        <Alert variant="warning">
          <AlertDescription>
            Your business profile is missing details required on Dutch invoices (KVK number, VAT ID
            or address). You can draft now, but complete your profile in Settings before
            finalizing.
          </AlertDescription>
        </Alert>
      )}
      <InvoiceForm vatCodes={vatCodes} defaultPaymentTermDays={business.settings?.defaultPaymentTermDays ?? 30} />
    </div>
  );
}
