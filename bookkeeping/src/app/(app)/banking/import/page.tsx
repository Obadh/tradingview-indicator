import { requireBusiness } from "@/lib/server/context";
import { prisma } from "@/lib/server/db";
import { ImportWizard } from "./import-wizard";

export const metadata = { title: "Import bank CSV" };
export const dynamic = "force-dynamic";

export default async function BankImportPage() {
  const { business } = await requireBusiness();
  const accounts = await prisma.bankAccount.findMany({
    where: { businessId: business.id, deletedAt: null },
    orderBy: { kind: "asc" },
    select: { id: true, name: true, kind: true },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Import bank CSV</h1>
        <p className="text-sm text-muted-foreground">
          Export a CSV from your bank’s website, then map its columns here. The mapping works with
          any bank; presets exist for ING, Rabobank and bunq. (CAMT.053 and MT940 are planned; CSV
          works today.)
        </p>
      </div>
      <ImportWizard accounts={accounts} />
    </div>
  );
}
