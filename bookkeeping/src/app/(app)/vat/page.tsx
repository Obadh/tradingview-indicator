import Link from "next/link";
import { requireBusiness } from "@/lib/server/context";
import { prisma } from "@/lib/server/db";
import { todayAmsterdam } from "@/lib/domain/dates";
import { typicalVatDeadline } from "@/lib/domain/vat";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TAX_PERIOD_STATUS_LABELS } from "@/lib/labels";

export const metadata = { title: "VAT" };
export const dynamic = "force-dynamic";

export default async function VatPage() {
  const { business } = await requireBusiness();
  const settings = business.settings!;
  const frequency = settings.vatFilingFrequency;

  if (frequency === "UNKNOWN") {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">VAT</h1>
        <Alert variant="warning">
          <AlertTitle>Filing frequency unknown</AlertTitle>
          <AlertDescription>
            The app does not guess your VAT obligations. Look up the filing frequency in the letter
            you received from the Belastingdienst after registration and set it in{" "}
            <Link className="underline" href="/settings">
              Settings
            </Link>
            . Quarterly is the most common.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const today = todayAmsterdam();
  const currentYear = Number(today.slice(0, 4));
  const firstYear = settings.firstFinancialYear ?? currentYear;
  const periodsPerYear = frequency === "MONTHLY" ? 12 : frequency === "QUARTERLY" ? 4 : 1;

  const existing = await prisma.taxPeriod.findMany({
    where: { businessId: business.id, type: "VAT" },
  });
  const byKey = new Map(existing.map((p) => [`${p.year}-${p.periodNo}`, p]));

  const rows: { year: number; periodNo: number; label: string; deadline: string; status: string; locked: boolean }[] = [];
  for (let year = firstYear; year <= currentYear; year++) {
    for (let p = 1; p <= periodsPerYear; p++) {
      const periodNo = frequency === "YEARLY" ? 0 : p;
      const endMonth = frequency === "MONTHLY" ? p : frequency === "QUARTERLY" ? p * 3 : 12;
      const deadline = typicalVatDeadline({ year, month: endMonth });
      const period = byKey.get(`${year}-${periodNo}`);
      const label =
        frequency === "MONTHLY" ? `${year}-${String(p).padStart(2, "0")}` : frequency === "QUARTERLY" ? `Q${p} ${year}` : `${year}`;
      // Hide far-future periods.
      const startsInFuture =
        year > currentYear ||
        (frequency !== "YEARLY" && year === currentYear && (p - 1) * (12 / periodsPerYear) + 1 > Number(today.slice(5, 7)));
      if (startsInFuture) continue;
      rows.push({
        year,
        periodNo,
        label,
        deadline: `${deadline.year}-${String(deadline.month).padStart(2, "0")}-${String(deadline.day).padStart(2, "0")}`,
        status: period?.status ?? "NOT_PREPARED",
        locked: !!period?.lockedAt,
      });
      if (frequency === "YEARLY") break;
    }
  }
  rows.reverse();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">VAT periods</h1>
        <p className="text-sm text-muted-foreground">
          Filing frequency: {frequency.toLowerCase()} (as entered from your Belastingdienst letter).
          Deadlines shown are the typical rule — always check your own letter.
        </p>
      </div>

      {settings.korStatus === "ENROLLED" && (
        <Alert variant="info">
          <AlertDescription>
            You are enrolled in the KOR: you normally charge no VAT and cannot reclaim it. These
            summaries may not apply — discuss with your adviser.
          </AlertDescription>
        </Alert>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Period</TableHead>
            <TableHead>Typical deadline</TableHead>
            <TableHead>Status</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.label}>
              <TableCell className="font-medium">{r.label}</TableCell>
              <TableCell>{r.deadline}</TableCell>
              <TableCell>
                <Badge variant={r.locked ? "secondary" : r.status === "NOT_PREPARED" ? "warning" : "success"}>
                  {TAX_PERIOD_STATUS_LABELS[r.status]}
                  {r.locked && " · locked"}
                </Badge>
              </TableCell>
              <TableCell>
                <Link
                  className="text-primary underline"
                  href={`/vat/${r.year}/${r.periodNo}`}
                >
                  Open preparation summary
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
