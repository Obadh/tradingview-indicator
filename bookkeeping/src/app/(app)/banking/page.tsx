import Link from "next/link";
import { requireBusiness } from "@/lib/server/context";
import { prisma } from "@/lib/server/db";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCents } from "@/lib/domain/money";
import { formatDateNl } from "@/lib/domain/dates";
import { RECONCILIATION_STATE_LABELS } from "@/lib/labels";
import { BankLineActions } from "./bank-line-actions";
import type { Prisma } from "@prisma/client";

export const metadata = { title: "Banking" };
export const dynamic = "force-dynamic";

export default async function BankingPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; account?: string }>;
}) {
  const { business } = await requireBusiness();
  const params = await searchParams;

  const accounts = await prisma.bankAccount.findMany({
    where: { businessId: business.id, deletedAt: null },
    orderBy: { kind: "asc" },
  });

  const where: Prisma.BankTransactionWhereInput = { businessId: business.id };
  if (params.account) where.bankAccountId = params.account;
  if (params.state === "unreconciled") {
    where.state = { in: ["UNMATCHED", "SUGGESTED", "PARTIALLY_MATCHED"] };
  } else if (params.state) {
    where.state = params.state as never;
  }

  const lines = await prisma.bankTransaction.findMany({
    where,
    orderBy: { bookingDate: "desc" },
    take: 200,
    include: { bankAccount: { select: { name: true, kind: true } } },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Banking</h1>
          <p className="text-sm text-muted-foreground">
            Import bank statements and match them to invoices and expenses. Matching is always
            explained — never a black box.
          </p>
        </div>
        <Button asChild>
          <Link href="/banking/import">Import CSV</Link>
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {accounts.map((a) => (
          <Card key={a.id}>
            <CardContent className="p-4">
              <p className="font-medium">{a.name}</p>
              <p className="text-sm text-muted-foreground">
                {a.kind === "PERSONAL" ? "Personal account" : a.kind === "CASH" ? "Cash" : "Business account"}
                {a.iban && ` · ${a.iban}`}
              </p>
              {a.kind === "PERSONAL" && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Only business-related lines are kept for personal accounts.
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <Link className="underline" href="/banking">
          All
        </Link>
        <Link className="underline" href="/banking?state=unreconciled">
          Unreconciled
        </Link>
        {Object.entries(RECONCILIATION_STATE_LABELS).map(([s, label]) => (
          <Link key={s} className="underline" href={`/banking?state=${s}`}>
            {label}
          </Link>
        ))}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Account</TableHead>
            <TableHead>Counterparty</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                No bank transactions. Import a CSV export from your bank to get started.
              </TableCell>
            </TableRow>
          )}
          {lines.map((l) => (
            <TableRow key={l.id}>
              <TableCell className="whitespace-nowrap">{formatDateNl(l.bookingDate)}</TableCell>
              <TableCell>{l.bankAccount.name}</TableCell>
              <TableCell>{l.counterpartyName ?? "—"}</TableCell>
              <TableCell className="max-w-xs truncate">{l.description ?? l.reference ?? "—"}</TableCell>
              <TableCell className={`text-right tabular-nums ${l.amountCents < 0 ? "" : "text-success"}`}>
                {formatCents(l.amountCents)}
              </TableCell>
              <TableCell>
                <Badge variant={l.state === "MATCHED" ? "success" : l.state === "UNMATCHED" ? "warning" : "secondary"}>
                  {RECONCILIATION_STATE_LABELS[l.state]}
                </Badge>
              </TableCell>
              <TableCell>
                <BankLineActions bankTransactionId={l.id} state={l.state} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
