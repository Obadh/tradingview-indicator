import { requireBusiness } from "@/lib/server/context";
import { prisma } from "@/lib/server/db";
import { todayAmsterdam, formatDateNl } from "@/lib/domain/dates";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TimeEntryForm } from "./time-form";

export const metadata = { title: "Time tracking" };
export const dynamic = "force-dynamic";

export default async function TimePage() {
  const { business } = await requireBusiness();
  const year = Number(todayAmsterdam().slice(0, 4));
  const [entries, yearTotal] = await Promise.all([
    prisma.timeEntry.findMany({
      where: { businessId: business.id, deletedAt: null },
      orderBy: { date: "desc" },
      take: 100,
      include: { project: { select: { name: true } } },
    }),
    prisma.timeEntry.aggregate({
      where: {
        businessId: business.id,
        deletedAt: null,
        date: { gte: new Date(`${year}-01-01T00:00:00Z`), lte: new Date(`${year}-12-31T00:00:00Z`) },
      },
      _sum: { minutes: true },
    }),
  ]);
  const totalHours = (yearTotal._sum.minutes ?? 0) / 60;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Time tracking</h1>
          <p className="text-sm text-muted-foreground">
            {year}: <strong>{totalHours.toFixed(1)} hours</strong> recorded.
          </p>
        </div>
        <Button asChild variant="outline">
          <a href={`/api/reports/hours?from=${year}-01-01&to=${year}-12-31&format=csv`}>
            Export hours {year} (CSV)
          </a>
        </Button>
      </div>

      <Alert variant="info">
        <AlertDescription>
          Some Dutch tax facilities depend on hours worked for the business (urencriterium — often
          1.225 hours/year). Recording hours here documents them, but it does <strong>not</strong>{" "}
          automatically qualify you for any deduction — discuss your situation with an adviser.
        </AlertDescription>
      </Alert>

      <TimeEntryForm />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Project</TableHead>
            <TableHead>Activity</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="text-right">Hours</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                No time entries yet.
              </TableCell>
            </TableRow>
          )}
          {entries.map((e) => (
            <TableRow key={e.id}>
              <TableCell>{formatDateNl(e.date)}</TableCell>
              <TableCell>{e.project?.name ?? "—"}</TableCell>
              <TableCell>{e.activityType ?? "—"}</TableCell>
              <TableCell>{e.description ?? "—"}</TableCell>
              <TableCell className="text-right tabular-nums">{(e.minutes / 60).toFixed(2)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
