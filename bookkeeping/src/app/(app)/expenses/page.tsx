import Link from "next/link";
import { requireBusiness } from "@/lib/server/context";
import { listTransactions } from "@/lib/server/queries/transactions";
import { TransactionTable } from "@/components/transaction-table";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Expenses" };
export const dynamic = "force-dynamic";

export default async function ExpensesPage() {
  const { business } = await requireBusiness();
  const rows = await listTransactions(business.id, { type: "BUSINESS_EXPENSE" });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Expenses</h1>
          <p className="text-sm text-muted-foreground">
            Purchase invoices and receipts. Attach the original document to every expense.
          </p>
        </div>
        <Button asChild>
          <Link href="/expenses/new">New expense</Link>
        </Button>
      </div>
      <TransactionTable rows={rows} emptyText="No expenses recorded yet." />
    </div>
  );
}
