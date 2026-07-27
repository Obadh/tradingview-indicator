import Link from "next/link";
import { requireBusiness } from "@/lib/server/context";
import { listTransactions } from "@/lib/server/queries/transactions";
import { TransactionTable } from "@/components/transaction-table";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Income" };
export const dynamic = "force-dynamic";

export default async function IncomePage() {
  const { business } = await requireBusiness();
  const rows = await listTransactions(business.id, { type: "BUSINESS_INCOME" });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Income</h1>
          <p className="text-sm text-muted-foreground">
            Client invoices, platform payouts, and other business income. Own-account transfers are
            never income.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/invoices/new">Create sales invoice</Link>
          </Button>
          <Button asChild>
            <Link href="/income/new">Record income</Link>
          </Button>
        </div>
      </div>
      <TransactionTable rows={rows} emptyText="No income recorded yet." />
    </div>
  );
}
