import Link from "next/link";
import { requireBusiness } from "@/lib/server/context";
import { listTransactions } from "@/lib/server/queries/transactions";
import { TransactionTable } from "@/components/transaction-table";
import { Button } from "@/components/ui/button";
import { TRANSACTION_TYPE_LABELS } from "@/lib/labels";

export const metadata = { title: "Transactions" };
export const dynamic = "force-dynamic";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; status?: string; from?: string; to?: string; missing?: string }>;
}) {
  const { business } = await requireBusiness();
  const params = await searchParams;
  const rows = await listTransactions(business.id, params);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Transactions</h1>
          <p className="text-sm text-muted-foreground">
            All financial events, including owner contributions/withdrawals and transfers between
            your own accounts (which never affect profit).
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/transactions/owner">Owner contribution / withdrawal / transfer</Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <Link className="underline" href="/transactions">
          All
        </Link>
        {Object.entries(TRANSACTION_TYPE_LABELS)
          .filter(([t]) => !["DEPRECIATION", "CORRECTION", "UNKNOWN"].includes(t))
          .map(([t, label]) => (
            <Link key={t} className="underline" href={`/transactions?type=${t}`}>
              {label}
            </Link>
          ))}
        <Link className="underline" href="/transactions?missing=document">
          Without documents
        </Link>
      </div>

      {(params.from || params.to) && (
        <p className="text-sm text-muted-foreground">
          Showing {params.from ?? "…"} to {params.to ?? "…"} —{" "}
          <Link href="/transactions" className="underline">
            clear
          </Link>
        </p>
      )}

      <TransactionTable rows={rows} emptyText="No transactions match this filter." />
    </div>
  );
}
