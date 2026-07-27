import Link from "next/link";
import { requireBusiness } from "@/lib/server/context";
import { prisma } from "@/lib/server/db";
import { parseAmountToCents } from "@/lib/domain/money";
import { isoDateToUtc, formatDateNl } from "@/lib/domain/dates";
import { formatCents } from "@/lib/domain/money";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { VAT_TREATMENT_LABELS, TRANSACTION_STATUS_LABELS } from "@/lib/labels";
import { SavedFilters } from "./saved-filters";
import type { Prisma } from "@prisma/client";

export const metadata = { title: "Search" };
export const dynamic = "force-dynamic";

interface SearchParams {
  q?: string;
  status?: string;
  treatment?: string;
  category?: string;
  amount?: string;
  from?: string;
  to?: string;
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { business, user } = await requireBusiness();
  const params = await searchParams;
  const hasQuery = Object.values(params).some((v) => v);

  const categories = await prisma.category.findMany({
    where: { businessId: business.id, deletedAt: null },
    orderBy: [{ kind: "asc" }, { sortOrder: "asc" }],
    select: { id: true, name: true, kind: true },
  });
  const savedFilters = await prisma.savedFilter.findMany({
    where: { businessId: business.id, userId: user.id, deletedAt: null },
    orderBy: { name: "asc" },
  });

  let transactions: Awaited<ReturnType<typeof searchTransactions>> = [];
  let documents: Awaited<ReturnType<typeof searchDocuments>> = [];
  if (hasQuery) {
    [transactions, documents] = await Promise.all([
      searchTransactions(business.id, params),
      searchDocuments(business.id, params),
    ]);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Search</h1>
        <p className="text-sm text-muted-foreground">
          Search across suppliers, customers, invoice numbers, amounts, descriptions, notes,
          payment references and document filenames.
        </p>
      </div>

      <form method="get" className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="search-q">Text</Label>
          <Input id="search-q" name="q" defaultValue={params.q ?? ""} placeholder="Supplier, invoice number, description, IBAN…" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="search-amount">Amount (EUR)</Label>
          <Input id="search-amount" name="amount" defaultValue={params.amount ?? ""} placeholder="e.g. 121,00" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="search-status">Review status</Label>
          <Select id="search-status" name="status" defaultValue={params.status ?? ""}>
            <option value="">Any</option>
            {Object.entries(TRANSACTION_STATUS_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="search-treatment">VAT treatment</Label>
          <Select id="search-treatment" name="treatment" defaultValue={params.treatment ?? ""}>
            <option value="">Any</option>
            {Object.entries(VAT_TREATMENT_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="search-category">Category</Label>
          <Select id="search-category" name="category" defaultValue={params.category ?? ""}>
            <option value="">Any</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.kind.toLowerCase()})
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="search-from">From</Label>
          <Input id="search-from" name="from" type="date" defaultValue={params.from ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="search-to">To</Label>
          <Input id="search-to" name="to" type="date" defaultValue={params.to ?? ""} />
        </div>
        <div className="flex items-end gap-2">
          <Button type="submit">Search</Button>
          <Button asChild variant="ghost">
            <Link href="/search">Clear</Link>
          </Button>
        </div>
      </form>

      <SavedFilters
        savedFilters={savedFilters.map((f) => ({
          id: f.id,
          name: f.name,
          criteria: f.criteria as Record<string, string>,
        }))}
        currentCriteria={params as Record<string, string>}
        hasQuery={hasQuery}
      />

      {hasQuery && (
        <>
          <section className="space-y-2">
            <h2 className="font-medium">Transactions ({transactions.length})</h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Party</TableHead>
                  <TableHead>Invoice no.</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>{formatDateNl(t.date)}</TableCell>
                    <TableCell>
                      <Link className="text-primary underline" href={`/transactions/${t.id}`}>
                        {t.description}
                      </Link>
                    </TableCell>
                    <TableCell>{t.contact?.name ?? "—"}</TableCell>
                    <TableCell>{t.invoiceNumber ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCents(t.amountCents)}</TableCell>
                    <TableCell>{TRANSACTION_STATUS_LABELS[t.status]}</TableCell>
                  </TableRow>
                ))}
                {transactions.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-4 text-center text-muted-foreground">
                      No matching transactions.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </section>
          <section className="space-y-2">
            <h2 className="font-medium">Documents ({documents.length})</h2>
            <ul className="space-y-1 text-sm">
              {documents.map((d) => (
                <li key={d.id}>
                  <Link className="text-primary underline" href={`/documents/${d.id}`}>
                    {d.title || d.originalFilename}
                  </Link>{" "}
                  <span className="text-muted-foreground">({d.category.toLowerCase().replace(/_/g, " ")})</span>
                </li>
              ))}
              {documents.length === 0 && <li className="text-muted-foreground">No matching documents.</li>}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

async function searchTransactions(businessId: string, params: SearchParams) {
  const where: Prisma.TransactionWhereInput = { businessId };
  if (params.q) {
    where.OR = [
      { description: { contains: params.q, mode: "insensitive" } },
      { notes: { contains: params.q, mode: "insensitive" } },
      { invoiceNumber: { contains: params.q, mode: "insensitive" } },
      { paymentReference: { contains: params.q, mode: "insensitive" } },
      { businessPurpose: { contains: params.q, mode: "insensitive" } },
      { contact: { name: { contains: params.q, mode: "insensitive" } } },
    ];
  }
  if (params.status) where.status = params.status as never;
  if (params.category) where.categoryId = params.category;
  if (params.treatment) {
    where.lines = { some: { vatCode: { treatment: params.treatment as never } } };
  }
  if (params.amount) {
    try {
      const cents = parseAmountToCents(params.amount);
      where.OR = [...(where.OR ?? []), { amountCents: cents }, { amountCents: -cents }];
    } catch {
      // ignore unparsable amount
    }
  }
  if (params.from || params.to) {
    where.date = {
      ...(params.from ? { gte: isoDateToUtc(params.from) } : {}),
      ...(params.to ? { lte: isoDateToUtc(params.to) } : {}),
    };
  }
  return prisma.transaction.findMany({
    where,
    orderBy: { date: "desc" },
    take: 100,
    include: { contact: { select: { name: true } } },
  });
}

async function searchDocuments(businessId: string, params: SearchParams) {
  if (!params.q) return [];
  return prisma.document.findMany({
    where: {
      businessId,
      deletedAt: null,
      OR: [
        { originalFilename: { contains: params.q, mode: "insensitive" } },
        { title: { contains: params.q, mode: "insensitive" } },
        { notes: { contains: params.q, mode: "insensitive" } },
      ],
    },
    orderBy: { uploadedAt: "desc" },
    take: 50,
  });
}
