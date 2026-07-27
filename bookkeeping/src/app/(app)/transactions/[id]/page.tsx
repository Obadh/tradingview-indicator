import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBusiness } from "@/lib/server/context";
import { prisma } from "@/lib/server/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCents } from "@/lib/domain/money";
import { formatDateNl } from "@/lib/domain/dates";
import { TRANSACTION_STATUS_LABELS, TRANSACTION_TYPE_LABELS } from "@/lib/labels";
import { statusBadgeVariant } from "@/components/transaction-table";
import { TransactionActions } from "./transaction-actions";

export const dynamic = "force-dynamic";

export default async function TransactionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { business } = await requireBusiness();
  const { id } = await params;
  const txn = await prisma.transaction.findFirst({
    where: { id, businessId: business.id },
    include: {
      lines: {
        orderBy: { sortOrder: "asc" },
        include: {
          ledgerAccount: { select: { code: true, name: true } },
          vatCode: { select: { code: true, name: true } },
        },
      },
      contact: true,
      category: true,
      documentLinks: { include: { document: { select: { id: true, originalFilename: true, title: true } } } },
      corrects: { select: { id: true, description: true } },
      correctedBy: { select: { id: true, description: true } },
      reconciliations: {
        include: { bankTransaction: { select: { id: true, bookingDate: true, amountCents: true } } },
      },
    },
  });
  if (!txn) notFound();

  const totalDebit = txn.lines.reduce((s, l) => s + l.debitCents, 0);
  const totalCredit = txn.lines.reduce((s, l) => s + l.creditCents, 0);
  const inLockedState = ["LOCKED", "CORRECTED", "VOID"].includes(txn.status);

  const auditRows = await prisma.auditLog.findMany({
    where: { businessId: business.id, entityType: "Transaction", entityId: txn.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { actor: { select: { name: true, email: true } } },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">{txn.description}</h1>
          <p className="text-sm text-muted-foreground">
            {TRANSACTION_TYPE_LABELS[txn.type]} · {formatDateNl(txn.date)}
            {txn.contact && <> · {txn.contact.name}</>}
            {txn.category && <> · {txn.category.name}</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {txn.reviewFlag !== "NONE" && (
            <Badge variant="warning">
              {txn.reviewFlag === "NEEDS_TAX_REVIEW" ? "Needs tax review" : "Needs advice"}
            </Badge>
          )}
          <Badge variant={statusBadgeVariant(txn.status)}>
            {TRANSACTION_STATUS_LABELS[txn.status]}
          </Badge>
        </div>
      </div>

      {txn.isPreRegistration && (
        <Alert variant="warning">
          <AlertTitle>Pre-registration expense</AlertTitle>
          <AlertDescription>
            This cost predates the KVK registration. Whether it is deductible depends on the
            circumstances — confirm with the Belastingdienst rules or an adviser.
          </AlertDescription>
        </Alert>
      )}
      {txn.reviewFlag === "NEEDS_TAX_REVIEW" && (
        <Alert variant="warning">
          <AlertTitle>Needs tax review</AlertTitle>
          <AlertDescription>
            This record involves international or uncertain VAT treatment. Check it (or collect it
            for your adviser via “Needs advice”) before relying on the VAT figures.
          </AlertDescription>
        </Alert>
      )}
      {txn.corrects && (
        <Alert variant="info">
          <AlertDescription>
            This is a correction of{" "}
            <Link className="underline" href={`/transactions/${txn.corrects.id}`}>
              {txn.corrects.description}
            </Link>
            .
          </AlertDescription>
        </Alert>
      )}
      {txn.correctedBy.length > 0 && (
        <Alert variant="info">
          <AlertDescription>
            This record was corrected by{" "}
            {txn.correctedBy.map((c) => (
              <Link key={c.id} className="underline" href={`/transactions/${c.id}`}>
                {c.description}
              </Link>
            ))}
            . It is kept unchanged for the audit trail.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Total (incl. VAT)</dt>
              <dd className="tabular-nums">{formatCents(txn.amountCents)}</dd>
              <dt className="text-muted-foreground">VAT</dt>
              <dd className="tabular-nums">{formatCents(txn.vatAmountCents)}</dd>
              {txn.currency !== "EUR" && (
                <>
                  <dt className="text-muted-foreground">Original amount</dt>
                  <dd>
                    {txn.originalAmountCents != null &&
                      `${(txn.originalAmountCents / 100).toFixed(2)} ${txn.currency}`}
                    {txn.exchangeRate && ` @ ${txn.exchangeRate} (${txn.exchangeRateSource ?? "no source"})`}
                  </dd>
                </>
              )}
              {txn.invoiceNumber && (
                <>
                  <dt className="text-muted-foreground">Invoice number</dt>
                  <dd>{txn.invoiceNumber}</dd>
                </>
              )}
              {txn.paymentDate && (
                <>
                  <dt className="text-muted-foreground">Payment date</dt>
                  <dd>{formatDateNl(txn.paymentDate)}</dd>
                </>
              )}
              <dt className="text-muted-foreground">Paid</dt>
              <dd>{txn.isPaid ? (txn.paidPersonally ? "Yes — personally (owner contribution)" : "Yes") : "Not yet"}</dd>
              {txn.isMixedUse && (
                <>
                  <dt className="text-muted-foreground">Business use</dt>
                  <dd>
                    {txn.businessUseBp / 100}% cost · {txn.vatRecoveryBp / 100}% VAT ·{" "}
                    {txn.itDeductibleBp / 100}% income tax
                    {txn.mixedUseNote && <> — {txn.mixedUseNote}</>}
                  </dd>
                </>
              )}
              {txn.businessPurpose && (
                <>
                  <dt className="text-muted-foreground">Business purpose</dt>
                  <dd>{txn.businessPurpose}</dd>
                </>
              )}
              {txn.supplierCountry && txn.supplierCountry !== "NL" && (
                <>
                  <dt className="text-muted-foreground">Supplier country</dt>
                  <dd>{txn.supplierCountry}{txn.isReverseCharge && " · reverse charged"}</dd>
                </>
              )}
              {txn.notes && (
                <>
                  <dt className="text-muted-foreground">Notes</dt>
                  <dd className="whitespace-pre-wrap">{txn.notes}</dd>
                </>
              )}
            </dl>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Documents</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {txn.documentLinks.length === 0 && (
                <p className="text-muted-foreground">
                  No document attached.{" "}
                  <Link href="/documents" className="text-primary underline">
                    Upload one
                  </Link>{" "}
                  and attach it from the document page.
                </p>
              )}
              {txn.documentLinks.map((l) => (
                <p key={l.id}>
                  <Link href={`/documents/${l.document.id}`} className="text-primary underline">
                    {l.document.title || l.document.originalFilename}
                  </Link>
                </p>
              ))}
            </CardContent>
          </Card>

          {txn.reconciliations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Bank matches</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                {txn.reconciliations.map((m) => (
                  <p key={m.id}>
                    {formatDateNl(m.bankTransaction.bookingDate)} ·{" "}
                    {formatCents(m.bankTransaction.amountCents)} — {m.reason}
                  </p>
                ))}
              </CardContent>
            </Card>
          )}

          <TransactionActions
            transactionId={txn.id}
            status={txn.status}
            reviewFlag={txn.reviewFlag}
            locked={inLockedState}
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Journal entries (advanced view)</CardTitle>
          <CardDescription>
            The double-entry bookkeeping behind this record. Debits always equal credits — the
            record cannot be finalized otherwise.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>VAT code</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {txn.lines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>
                    {l.ledgerAccount.code} — {l.ledgerAccount.name}
                  </TableCell>
                  <TableCell>{l.description ?? ""}</TableCell>
                  <TableCell>{l.vatCode?.code ?? ""}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {l.debitCents ? formatCents(l.debitCents) : ""}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {l.creditCents ? formatCents(l.creditCents) : ""}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={3}>Total</TableCell>
                <TableCell className="text-right tabular-nums">{formatCents(totalDebit)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCents(totalCredit)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
          <CardDescription>Audit trail — recorded automatically, cannot be edited.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm">
            {auditRows.map((a) => (
              <li key={a.id}>
                {a.createdAt.toISOString().replace("T", " ").slice(0, 16)} —{" "}
                {a.actor?.name ?? a.actor?.email ?? "system"}: {a.action}
                {a.reason && <> ({a.reason})</>}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
