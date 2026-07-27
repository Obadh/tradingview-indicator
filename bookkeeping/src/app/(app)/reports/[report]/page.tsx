import { notFound } from "next/navigation";
import { requireBusiness } from "@/lib/server/context";
import { buildReport, REPORTS } from "@/lib/server/reports";
import { todayAmsterdam } from "@/lib/domain/dates";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const dynamic = "force-dynamic";

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ report: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { business } = await requireBusiness();
  const { report: key } = await params;
  const sp = await searchParams;
  if (!REPORTS[key]) notFound();

  const today = todayAmsterdam();
  const from = sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : `${today.slice(0, 4)}-01-01`;
  const to = sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) ? sp.to : today;
  const report = await buildReport(key, business.id, { from, to });
  if (!report) notFound();

  const exportBase = `/api/reports/${key}?from=${from}&to=${to}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{report.title}</h1>
        <p className="text-sm text-muted-foreground">{report.description}</p>
        <p className="text-xs text-muted-foreground">
          Generated {report.generatedAt} · period {from} to {to}
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-3" method="get">
        <div className="space-y-1.5">
          <Label htmlFor="report-from">From</Label>
          <Input id="report-from" type="date" name="from" defaultValue={from} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="report-to">To</Label>
          <Input id="report-to" type="date" name="to" defaultValue={to} />
        </div>
        <Button type="submit" variant="outline">
          Apply
        </Button>
        <div className="ml-auto flex gap-2">
          {(["csv", "xlsx", "pdf", "json"] as const).map((f) => (
            <Button key={f} asChild size="sm" variant="outline">
              <a href={`${exportBase}&format=${f}`}>Export {f.toUpperCase()}</a>
            </Button>
          ))}
        </div>
      </form>

      <Table>
        <TableHeader>
          <TableRow>
            {report.columns.map((c) => (
              <TableHead key={c.key} className={c.align === "right" ? "text-right" : ""}>
                {c.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {report.rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={report.columns.length} className="py-8 text-center text-muted-foreground">
                No data in this period.
              </TableCell>
            </TableRow>
          )}
          {report.rows.map((row, i) => (
            <TableRow key={i}>
              {report.columns.map((c) => (
                <TableCell key={c.key} className={c.align === "right" ? "text-right tabular-nums" : ""}>
                  {row[c.key] ?? ""}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {report.footnote && <p className="text-sm text-muted-foreground">{report.footnote}</p>}
    </div>
  );
}
