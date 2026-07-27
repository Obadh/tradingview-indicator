import Link from "next/link";
import { requireBusiness } from "@/lib/server/context";
import { prisma } from "@/lib/server/db";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import type { Prisma } from "@prisma/client";

export const metadata = { title: "Invoices" };
export const dynamic = "force-dynamic";

const STATUS_BADGES: Record<string, "success" | "warning" | "secondary" | "outline" | "destructive"> = {
  DRAFT: "warning",
  FINALIZED: "secondary",
  SENT: "secondary",
  PAID: "success",
  PARTIALLY_PAID: "warning",
  OVERDUE: "destructive",
  CREDITED: "outline",
  VOID: "outline",
};

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { business } = await requireBusiness();
  const params = await searchParams;
  const where: Prisma.InvoiceWhereInput = { businessId: business.id };
  if (params.status) where.status = params.status as never;

  const invoices = await prisma.invoice.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    take: 200,
    include: { contact: { select: { name: true } } },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Sales invoices</h1>
          <p className="text-sm text-muted-foreground">
            Sequential numbering without gaps. Finalized invoices are immutable — corrections go
            through credit notes.
          </p>
        </div>
        <Button asChild>
          <Link href="/invoices/new">New invoice</Link>
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Number</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Issue date</TableHead>
            <TableHead className="text-right">Total incl. VAT</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                No invoices yet.
              </TableCell>
            </TableRow>
          )}
          {invoices.map((inv) => (
            <TableRow key={inv.id}>
              <TableCell>
                <Link href={`/invoices/${inv.id}`} className="font-medium text-primary underline">
                  {inv.number ?? `(draft${inv.kind === "CREDIT_NOTE" ? " credit note" : ""})`}
                </Link>
              </TableCell>
              <TableCell>{inv.contact.name}</TableCell>
              <TableCell>{inv.issueDate ? formatDateNl(inv.issueDate) : "—"}</TableCell>
              <TableCell className="text-right tabular-nums">{formatCents(inv.totalIncVatCents)}</TableCell>
              <TableCell>
                <Badge variant={STATUS_BADGES[inv.status] ?? "secondary"}>{inv.status.toLowerCase()}</Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
