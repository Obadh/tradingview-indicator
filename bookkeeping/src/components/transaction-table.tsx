import Link from "next/link";
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
import { TRANSACTION_STATUS_LABELS, TRANSACTION_TYPE_LABELS } from "@/lib/labels";

export interface TransactionRow {
  id: string;
  date: Date;
  description: string;
  type: string;
  status: string;
  reviewFlag: string;
  amountCents: number;
  currency: string;
  contactName: string | null;
  categoryName: string | null;
  hasDocuments: boolean;
}

export function statusBadgeVariant(status: string) {
  switch (status) {
    case "CONFIRMED":
    case "RECONCILED":
      return "success" as const;
    case "LOCKED":
      return "secondary" as const;
    case "VOID":
    case "CORRECTED":
      return "outline" as const;
    default:
      return "warning" as const;
  }
}

export function TransactionTable({ rows, emptyText }: { rows: TransactionRow[]; emptyText: string }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Description</TableHead>
          <TableHead>Party</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>Type</TableHead>
          <TableHead className="text-right">Amount (incl. VAT)</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Docs</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 && (
          <TableRow>
            <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
              {emptyText}
            </TableCell>
          </TableRow>
        )}
        {rows.map((t) => (
          <TableRow key={t.id}>
            <TableCell className="whitespace-nowrap">{formatDateNl(t.date)}</TableCell>
            <TableCell>
              <Link href={`/transactions/${t.id}`} className="font-medium text-primary underline">
                {t.description}
              </Link>
              {t.reviewFlag === "NEEDS_TAX_REVIEW" && (
                <Badge variant="warning" className="ml-2">
                  needs tax review
                </Badge>
              )}
            </TableCell>
            <TableCell>{t.contactName ?? "—"}</TableCell>
            <TableCell>{t.categoryName ?? "—"}</TableCell>
            <TableCell className="whitespace-nowrap text-xs">{TRANSACTION_TYPE_LABELS[t.type]}</TableCell>
            <TableCell className="text-right tabular-nums">{formatCents(t.amountCents)}</TableCell>
            <TableCell>
              <Badge variant={statusBadgeVariant(t.status)}>{TRANSACTION_STATUS_LABELS[t.status]}</Badge>
            </TableCell>
            <TableCell>{t.hasDocuments ? "✓" : <span className="text-warning">—</span>}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
