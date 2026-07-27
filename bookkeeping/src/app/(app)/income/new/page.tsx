import { requireBusiness } from "@/lib/server/context";
import { prisma } from "@/lib/server/db";
import { MoneyFlowForm } from "@/components/money-flow-form";
import { createIncomeAction } from "@/server/actions/income";
import { Alert, AlertDescription } from "@/components/ui/alert";
import Link from "next/link";

export const metadata = { title: "New income" };
export const dynamic = "force-dynamic";

export default async function NewIncomePage({
  searchParams,
}: {
  searchParams: Promise<{ documentId?: string }>;
}) {
  const { business } = await requireBusiness();
  const params = await searchParams;

  const [categories, vatCodes] = await Promise.all([
    prisma.category.findMany({
      where: { businessId: business.id, kind: "INCOME", deletedAt: null },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, defaultVatCodeId: true },
    }),
    prisma.vATCode.findMany({
      where: { businessId: business.id, validTo: null },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true, ratePermille: true, treatment: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">New income</h1>
        <p className="text-sm text-muted-foreground">
          Client invoices, App Store / Google Play payouts, ad or subscription revenue.
        </p>
      </div>
      <Alert variant="info">
        <AlertDescription>
          Moving money from your own personal account to the business account is <em>not</em>{" "}
          income — record it as an{" "}
          <Link href="/transactions/owner" className="text-primary underline">
            owner contribution or transfer
          </Link>{" "}
          instead, so it never inflates your profit.
        </AlertDescription>
      </Alert>
      <MoneyFlowForm
        mode="income"
        categories={categories}
        vatCodes={vatCodes}
        documentId={params.documentId}
        action={createIncomeAction}
      />
    </div>
  );
}
