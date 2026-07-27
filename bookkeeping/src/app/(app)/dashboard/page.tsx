import Link from "next/link";
import { requireBusiness } from "@/lib/server/context";
import { prisma } from "@/lib/server/db";
import { dashboardData } from "@/lib/server/queries/dashboard";
import { formatCents } from "@/lib/domain/money";
import { formatDateNl } from "@/lib/domain/dates";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

function MoneyTile({
  title,
  cents,
  href,
  sub,
}: {
  title: string;
  cents: number;
  href: string;
  sub?: string;
}) {
  return (
    <Link href={href} className="block rounded-lg border bg-card p-4 shadow-sm hover:bg-secondary/50">
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{formatCents(cents)}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </Link>
  );
}

function CountTile({ title, count, href }: { title: string; count: number; href: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-lg border bg-card p-4 shadow-sm hover:bg-secondary/50"
    >
      <span className="text-sm">{title}</span>
      <Badge variant={count > 0 ? "warning" : "success"}>{count}</Badge>
    </Link>
  );
}

export default async function DashboardPage() {
  const { business } = await requireBusiness();
  const settings = business.settings!;
  const [data, openReminders] = await Promise.all([
    dashboardData(business.id, settings.vatFilingFrequency),
    prisma.reminder.findMany({
      where: { businessId: business.id, status: "OPEN", deletedAt: null },
      orderBy: { dueDate: "asc" },
      take: 8,
    }),
  ]);
  const resultCents = {
    month: data.month.incomeCents - data.month.expenseCents,
    quarter: data.quarter.incomeCents - data.quarter.expenseCents,
    year: data.year.incomeCents - data.year.expenseCents,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Every number links to the records it was calculated from. Amounts are accounting
          estimates, not final tax figures.
        </p>
      </div>

      {settings.korStatus === "ENROLLED" && (
        <Alert variant="info">
          <AlertTitle>KOR enrolled</AlertTitle>
          <AlertDescription>
            You indicated you use the small businesses scheme (KOR). You then normally charge no
            VAT and cannot reclaim VAT. Discuss the details with your adviser — the VAT figures
            below may not apply to you.
          </AlertDescription>
        </Alert>
      )}

      <section aria-labelledby="income-heading" className="space-y-2">
        <h2 id="income-heading" className="font-medium">
          Income (excluding VAT)
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <MoneyTile title="This month" cents={data.month.incomeCents} href={`/transactions?type=BUSINESS_INCOME&from=${data.month.from}&to=${data.month.to}`} />
          <MoneyTile title="This quarter" cents={data.quarter.incomeCents} href={`/transactions?type=BUSINESS_INCOME&from=${data.quarter.from}&to=${data.quarter.to}`} />
          <MoneyTile title="This year" cents={data.year.incomeCents} href={`/transactions?type=BUSINESS_INCOME&from=${data.year.from}&to=${data.year.to}`} />
        </div>
      </section>

      <section aria-labelledby="expenses-heading" className="space-y-2">
        <h2 id="expenses-heading" className="font-medium">
          Expenses (excluding VAT)
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <MoneyTile title="This month" cents={data.month.expenseCents} href={`/transactions?type=BUSINESS_EXPENSE&from=${data.month.from}&to=${data.month.to}`} />
          <MoneyTile title="This quarter" cents={data.quarter.expenseCents} href={`/transactions?type=BUSINESS_EXPENSE&from=${data.quarter.from}&to=${data.quarter.to}`} />
          <MoneyTile title="This year" cents={data.year.expenseCents} href={`/transactions?type=BUSINESS_EXPENSE&from=${data.year.from}&to=${data.year.to}`} />
        </div>
      </section>

      <section aria-labelledby="result-heading" className="space-y-2">
        <h2 id="result-heading" className="font-medium">
          Estimated result (income − expenses){" "}
          <span className="text-xs font-normal text-muted-foreground">
            — an accounting estimate, not taxable profit
          </span>
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <MoneyTile title="This month" cents={resultCents.month} href={`/reports/profit-loss?from=${data.month.from}&to=${data.month.to}`} />
          <MoneyTile title="This quarter" cents={resultCents.quarter} href={`/reports/profit-loss?from=${data.quarter.from}&to=${data.quarter.to}`} />
          <MoneyTile title="This year" cents={resultCents.year} href={`/reports/profit-loss?from=${data.year.from}&to=${data.year.to}`} />
        </div>
      </section>

      <section aria-labelledby="vat-heading" className="space-y-2">
        <h2 id="vat-heading" className="font-medium">
          VAT — {data.vatQuarterLabel}{" "}
          <span className="text-xs font-normal text-muted-foreground">estimates, verify before filing</span>
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <MoneyTile title="VAT collected on sales" cents={data.vatCollectedCents} href="/vat" />
          <MoneyTile title="Potentially recoverable VAT" cents={data.vatRecoverableCents} href="/vat" />
          <MoneyTile
            title="Estimated VAT balance"
            cents={data.vatBalanceCents}
            href="/vat"
            sub={data.vatBalanceCents >= 0 ? "Estimated amount payable" : "Estimated refund"}
          />
        </div>
        {data.nextVatDeadline && (
          <Card>
            <CardHeader className="p-4">
              <CardTitle className="text-sm font-medium">
                Upcoming VAT filing deadline (typical): {formatDateNl(data.nextVatDeadline.date)} for{" "}
                {data.nextVatDeadline.label}
              </CardTitle>
              <CardDescription>
                Based on the usual rule (one month after the period). Always check the date in your
                own Belastingdienst letter.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </section>

      <section aria-labelledby="todo-heading" className="space-y-2">
        <h2 id="todo-heading" className="font-medium">
          Needs your attention
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <CountTile title="Documents requiring review" count={data.documentsNeedingReview} href="/documents?status=needs-review" />
          <CountTile title="Transactions requiring review" count={data.transactionsNeedingReview} href="/review" />
          <CountTile title="Transactions without documents" count={data.transactionsWithoutDocuments} href="/transactions?missing=document" />
          <CountTile title="Documents without matched payment" count={data.documentsWithoutPayments} href="/documents?filter=no-payment" />
          <CountTile title="Draft invoices with missing details" count={data.invoicesMissingDetails} href="/invoices?status=DRAFT" />
          <CountTile title="Unreconciled bank transactions" count={data.unreconciledBankLines} href="/banking?state=unreconciled" />
        </div>
      </section>

      {openReminders.length > 0 && (
        <section aria-labelledby="reminders-heading" className="space-y-2">
          <h2 id="reminders-heading" className="font-medium">
            Reminders
          </h2>
          <Card>
            <CardContent className="space-y-1 p-4 text-sm">
              {openReminders.map((r) => (
                <p key={r.id}>
                  <span className="font-medium">{formatDateNl(r.dueDate)}</span> — {r.title}
                  {r.letterId && (
                    <>
                      {" "}
                      <Link className="text-primary underline" href="/letters">
                        (letter)
                      </Link>
                    </>
                  )}
                </p>
              ))}
            </CardContent>
          </Card>
        </section>
      )}

      <section aria-labelledby="completeness-heading" className="space-y-2">
        <h2 id="completeness-heading" className="font-medium">
          Bookkeeping completeness
        </h2>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <span className="text-3xl font-semibold tabular-nums">{data.completeness.score}</span>
              <span className="text-sm text-muted-foreground">/ 100</span>
              <div
                role="progressbar"
                aria-valuenow={data.completeness.score}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Bookkeeping completeness score"
                className="h-2 flex-1 overflow-hidden rounded-full bg-secondary"
              >
                <div className="h-full bg-primary" style={{ width: `${data.completeness.score}%` }} />
              </div>
            </div>
            <ul className="mt-3 grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
              {data.completeness.components.map((c) => (
                <li key={c.key}>
                  {c.label}: {c.earned}/{c.weight}
                  {c.openItems > 0 && ` (${c.openItems} open)`}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
