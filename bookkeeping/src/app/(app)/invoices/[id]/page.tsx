import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBusiness } from "@/lib/server/context";
import { prisma } from "@/lib/server/db";
import { storage } from "@/lib/server/storage";
import { validateInvoice } from "@/lib/domain/invoice-validation";
import { formatCents } from "@/lib/domain/money";
import { formatDateNl } from "@/lib/domain/dates";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InvoiceForm } from "../invoice-form";
import { InvoiceActions } from "./invoice-actions";

export const dynamic = "force-dynamic";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { business } = await requireBusiness();
  const { id } = await params;
  const invoice = await prisma.invoice.findFirst({
    where: { id, businessId: business.id },
    include: {
      lines: { orderBy: { sortOrder: "asc" }, include: { vatCode: true } },
      contact: true,
      creditsInvoice: { select: { id: true, number: true } },
      creditNotes: { select: { id: true, number: true, status: true } },
      pdfDocument: { select: { id: true, storageKey: true } },
      allocations: { include: { payment: true } },
    },
  });
  if (!invoice) notFound();

  const isDraft = invoice.status === "DRAFT";
  const pdfUrl = invoice.pdfDocument
    ? await storage().signedUrl(invoice.pdfDocument.storageKey, 600)
    : null;

  const warnings = validateInvoice({
    direction: "ISSUED",
    supplierName: business.legalName,
    supplierAddress: business.addressLine1,
    customerName: invoice.contact.name,
    customerAddress: invoice.contact.addressLine1,
    customerVatId: invoice.contact.vatId,
    invoiceNumber: invoice.number ?? "draft",
    invoiceDate: invoice.issueDate?.toISOString().slice(0, 10) ?? null,
    description: invoice.lines[0]?.description ?? null,
    lines: invoice.lines.map((l) => ({
      netCents: l.lineExVatCents,
      vatCents: l.lineVatCents,
      ratePermille: l.vatRatePermille,
    })),
    treatment: invoice.reverseChargeWording ? "REVERSE_CHARGE_SALE" : null,
  });

  if (isDraft) {
    const vatCodes = await prisma.vATCode.findMany({
      where: {
        businessId: business.id,
        validTo: null,
        treatment: { in: ["DOMESTIC_HIGH", "DOMESTIC_LOW", "DOMESTIC_ZERO", "REVERSE_CHARGE_SALE", "EXEMPT", "OUTSIDE_SCOPE"] },
      },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true, ratePermille: true, treatment: true },
    });
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">
            {invoice.kind === "CREDIT_NOTE" ? "Draft credit note" : "Draft invoice"}
          </h1>
          <Badge variant="warning">draft — no number yet</Badge>
        </div>
        {invoice.creditsInvoice && (
          <Alert variant="info">
            <AlertDescription>
              This credit note corrects invoice{" "}
              <Link className="underline" href={`/invoices/${invoice.creditsInvoice.id}`}>
                {invoice.creditsInvoice.number}
              </Link>
              .
            </AlertDescription>
          </Alert>
        )}
        {warnings.length > 0 && (
          <Alert variant="warning">
            <AlertTitle>Checks before finalizing</AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-4">
                {warnings.map((w) => (
                  <li key={w.code}>{w.message}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}
        <InvoiceForm
          vatCodes={vatCodes}
          defaultPaymentTermDays={invoice.paymentTermDays}
          initial={{
            invoiceId: invoice.id,
            contactName: invoice.contact.name,
            contactAddress: invoice.contact.addressLine1 ?? "",
            contactPostalCode: invoice.contact.postalCode ?? "",
            contactCity: invoice.contact.city ?? "",
            contactCountry: invoice.contact.country,
            contactVatId: invoice.contact.vatId ?? "",
            issueDate: invoice.issueDate?.toISOString().slice(0, 10) ?? "",
            supplyDate: invoice.supplyDate?.toISOString().slice(0, 10) ?? "",
            paymentTermDays: invoice.paymentTermDays,
            reverseCharge: !!invoice.reverseChargeWording,
            notes: invoice.notes ?? "",
            lines: invoice.lines.map((l) => ({
              description: l.description.replace(/^Credit: /, ""),
              quantity: l.quantity.toString(),
              unitPrice: (Math.abs(l.unitPriceExVatCents) / 100).toFixed(2).replace(".", ","),
              vatCodeId: l.vatCodeId ?? "",
            })),
          }}
        />
        <InvoiceActions invoiceId={invoice.id} status={invoice.status} kind={invoice.kind} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">
            {invoice.kind === "CREDIT_NOTE" ? "Credit note" : "Invoice"} {invoice.number}
          </h1>
          <p className="text-sm text-muted-foreground">
            {invoice.contact.name} · issued {invoice.issueDate && formatDateNl(invoice.issueDate)}
            {invoice.dueDate && ` · due ${formatDateNl(invoice.dueDate)}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={invoice.status === "PAID" ? "success" : "secondary"}>{invoice.status.toLowerCase()}</Badge>
          {pdfUrl && (
            <Button asChild variant="outline" size="sm">
              <a href={`${pdfUrl}${pdfUrl.includes("?") ? "&" : "?"}download=1`}>Download PDF</a>
            </Button>
          )}
        </div>
      </div>

      <Alert variant="info">
        <AlertDescription>
          This invoice is finalized and can no longer be edited — that keeps your numbering intact
          for the Belastingdienst. Need to correct it? Create a credit note below.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Lines</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit price</TableHead>
                <TableHead className="text-right">VAT</TableHead>
                <TableHead className="text-right">Amount (excl. VAT)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoice.lines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>{l.description}</TableCell>
                  <TableCell className="text-right">{l.quantity.toString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCents(l.unitPriceExVatCents)}</TableCell>
                  <TableCell className="text-right">{(l.vatRatePermille / 10).toFixed(0)}%</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCents(l.lineExVatCents)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={4}>Subtotal excl. VAT</TableCell>
                <TableCell className="text-right tabular-nums">{formatCents(invoice.totalExVatCents)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell colSpan={4}>VAT</TableCell>
                <TableCell className="text-right tabular-nums">{formatCents(invoice.totalVatCents)}</TableCell>
              </TableRow>
              <TableRow className="font-medium">
                <TableCell colSpan={4}>Total incl. VAT</TableCell>
                <TableCell className="text-right tabular-nums">{formatCents(invoice.totalIncVatCents)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
          {invoice.reverseChargeWording && (
            <p className="mt-2 text-sm font-medium">{invoice.reverseChargeWording}</p>
          )}
        </CardContent>
      </Card>

      {invoice.allocations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Payments received</CardTitle>
            <CardDescription>One invoice can be paid in several payments.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {invoice.allocations.map((a) => (
              <p key={a.id}>
                {formatDateNl(a.payment.date)} — {formatCents(a.amountCents)}
                {a.payment.reference && ` · ${a.payment.reference}`}
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      {invoice.creditNotes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Credit notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {invoice.creditNotes.map((c) => (
              <p key={c.id}>
                <Link className="text-primary underline" href={`/invoices/${c.id}`}>
                  {c.number ?? "(draft credit note)"}
                </Link>{" "}
                — {c.status.toLowerCase()}
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      <InvoiceActions invoiceId={invoice.id} status={invoice.status} kind={invoice.kind} />
    </div>
  );
}
