import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBusiness } from "@/lib/server/context";
import { prisma } from "@/lib/server/db";
import { vatPeriodData } from "@/lib/server/queries/vat";
import { formatCents } from "@/lib/domain/money";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { VAT_TREATMENT_LABELS } from "@/lib/labels";
import { PeriodStatusForm } from "./period-status-form";

export const dynamic = "force-dynamic";

export default async function VatPeriodPage({
  params,
}: {
  params: Promise<{ year: string; period: string }>;
}) {
  const { business } = await requireBusiness();
  const { year: yearStr, period: periodStr } = await params;
  const year = Number(yearStr);
  const periodNo = Number(periodStr);
  if (!Number.isInteger(year) || !Number.isInteger(periodNo)) notFound();

  const settings = business.settings!;
  const freq = settings.vatFilingFrequency === "UNKNOWN" ? "QUARTERLY" : settings.vatFilingFrequency;
  const data = await vatPeriodData(business.id, freq, year, periodNo);
  const period = await prisma.taxPeriod.findFirst({
    where: { businessId: business.id, type: "VAT", year, periodNo },
  });
  const s = data.summary;
  const hasActivity =
    s.includedTransactionIds.length > 0 || s.excludedTransactionIds.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">VAT preparation — {data.range.label}</h1>
        <p className="text-sm text-muted-foreground">
          {data.range.start} to {data.range.end} · VAT rules version {s.rulesVersion}
        </p>
      </div>

      <Alert variant="warning">
        <AlertTitle>Preparation summary — verify before submitting to the Belastingdienst.</AlertTitle>
        <AlertDescription>
          These amounts are estimates assembled from your confirmed records. This app never files
          anything automatically. File yourself at Mijn Belastingdienst Zakelijk (or via your
          adviser), then mark the period as filed here to lock it.
        </AlertDescription>
      </Alert>

      {!hasActivity && (
        <Alert variant="info">
          <AlertTitle>No transactions in this period</AlertTitle>
          <AlertDescription>
            If you are required to file, you must still submit a zero return (nihilaangifte) — an
            empty period does not remove the obligation.
          </AlertDescription>
        </Alert>
      )}

      {data.reviewTransactions.length > 0 && (
        <Alert variant="warning">
          <AlertTitle>{data.reviewTransactions.length} record(s) excluded — need review first</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {data.reviewTransactions.map((t) => (
                <li key={t.id}>
                  <Link className="underline" href={`/transactions/${t.id}`}>
                    {t.description}
                  </Link>{" "}
                  ({t.reason})
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Dutch VAT return boxes (rubrieken)</CardTitle>
            <CardDescription>Mapping follows the standard omzetbelasting return.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Box</TableHead>
                  <TableHead className="text-right">Base</TableHead>
                  <TableHead className="text-right">VAT</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {s.boxes.map((b) => (
                  <TableRow key={b.box}>
                    <TableCell>{b.label}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {b.baseCents !== 0 ? formatCents(b.baseCents) : ""}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatCents(b.vatCents)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-medium">
                  <TableCell>Estimated balance (5a − 5b)</TableCell>
                  <TableCell></TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCents(s.estimatedBalanceCents)}{" "}
                    {s.estimatedBalanceCents >= 0 ? "(payable)" : "(refund)"}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Breakdown by treatment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <h3 className="mb-1 font-medium">Sales (excl. VAT)</h3>
              {Object.keys(s.salesByTreatment).length === 0 && <p className="text-muted-foreground">None</p>}
              {Object.entries(s.salesByTreatment).map(([t, v]) => (
                <p key={t} className="flex justify-between">
                  <span>{VAT_TREATMENT_LABELS[t] ?? t}</span>
                  <span className="tabular-nums">
                    {formatCents(v.baseCents)} (VAT {formatCents(v.vatCents)})
                  </span>
                </p>
              ))}
            </div>
            <div>
              <h3 className="mb-1 font-medium">Purchases (excl. VAT)</h3>
              {Object.keys(s.purchasesByTreatment).length === 0 && <p className="text-muted-foreground">None</p>}
              {Object.entries(s.purchasesByTreatment).map(([t, v]) => (
                <p key={t} className="flex justify-between">
                  <span>{VAT_TREATMENT_LABELS[t] ?? t}</span>
                  <span className="tabular-nums">
                    {formatCents(v.baseCents)} (VAT {formatCents(v.vatCents)})
                  </span>
                </p>
              ))}
            </div>
            <div className="border-t pt-2">
              <p className="flex justify-between">
                <span>Output VAT</span>
                <span className="tabular-nums">{formatCents(s.outputVatCents)}</span>
              </p>
              <p className="flex justify-between">
                <span>Self-assessed VAT (reverse charge / EU / import)</span>
                <span className="tabular-nums">{formatCents(s.reverseChargeVatCents)}</span>
              </p>
              <p className="flex justify-between">
                <span>Input VAT (potentially recoverable)</span>
                <span className="tabular-nums">−{formatCents(s.inputVatCents)}</span>
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Included: {s.includedTransactionIds.length} record(s) · Excluded/for review:{" "}
              {s.needsReviewTransactionIds.length}.{" "}
              <Link className="underline" href={`/transactions?from=${data.range.start}&to=${data.range.end}`}>
                Show all records in this period
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>

      <PeriodStatusForm
        year={year}
        periodNo={periodNo}
        currentStatus={period?.status ?? "NOT_PREPARED"}
        locked={!!period?.lockedAt}
        blockedByReview={data.reviewTransactions.length > 0}
      />
    </div>
  );
}
