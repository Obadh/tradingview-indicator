import Link from "next/link";
import { requireBusiness } from "@/lib/server/context";
import { prisma } from "@/lib/server/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCents } from "@/lib/domain/money";
import { formatDateNl } from "@/lib/domain/dates";
import { TRANSACTION_TYPE_LABELS } from "@/lib/labels";
import { ReviewItemActions } from "./review-actions";

export const metadata = { title: "Review inbox" };
export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const { business } = await requireBusiness();

  const [transactions, documents] = await Promise.all([
    prisma.transaction.findMany({
      where: { businessId: business.id, status: { in: ["DRAFT", "NEEDS_REVIEW"] } },
      orderBy: { date: "desc" },
      take: 100,
      include: {
        contact: { select: { name: true } },
        documentLinks: { select: { id: true }, take: 1 },
      },
    }),
    prisma.document.findMany({
      where: { businessId: business.id, status: { in: ["UPLOADED", "NEEDS_REVIEW"] }, deletedAt: null },
      orderBy: { uploadedAt: "desc" },
      take: 100,
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Review inbox</h1>
        <p className="text-sm text-muted-foreground">
          Everything that still needs a decision from you. Nothing here is final yet.
        </p>
      </div>

      <section className="space-y-3" aria-labelledby="review-transactions">
        <h2 id="review-transactions" className="font-medium">
          Transactions to review ({transactions.length})
        </h2>
        {transactions.length === 0 && (
          <p className="text-sm text-muted-foreground">Nothing to review. Nice and tidy.</p>
        )}
        {transactions.map((t) => (
          <Card key={t.id}>
            <CardHeader className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base">
                    <Link href={`/transactions/${t.id}`} className="text-primary underline">
                      {t.description}
                    </Link>
                  </CardTitle>
                  <CardDescription>
                    {formatDateNl(t.date)} · {TRANSACTION_TYPE_LABELS[t.type]}
                    {t.contact && <> · {t.contact.name}</>} · {formatCents(t.amountCents)}
                    {t.isPreRegistration && (
                      <Badge variant="warning" className="ml-2">
                        pre-registration
                      </Badge>
                    )}
                    {t.reviewFlag === "NEEDS_TAX_REVIEW" && (
                      <Badge variant="warning" className="ml-2">
                        needs tax review
                      </Badge>
                    )}
                  </CardDescription>
                </div>
                <ReviewItemActions
                  transactionId={t.id}
                  hasDocument={t.documentLinks.length > 0}
                  reviewFlag={t.reviewFlag}
                />
              </div>
            </CardHeader>
          </Card>
        ))}
      </section>

      <section className="space-y-3" aria-labelledby="review-documents">
        <h2 id="review-documents" className="font-medium">
          Documents to process ({documents.length})
        </h2>
        {documents.length === 0 && (
          <p className="text-sm text-muted-foreground">All documents are processed.</p>
        )}
        {documents.map((d) => (
          <Card key={d.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4">
              <div>
                <Link href={`/documents/${d.id}`} className="font-medium text-primary underline">
                  {d.title || d.originalFilename}
                </Link>
                <p className="text-sm text-muted-foreground">
                  Uploaded {formatDateNl(d.uploadedAt.toISOString().slice(0, 10))}
                </p>
              </div>
              <div className="flex gap-2 text-sm">
                <Link className="underline" href={`/expenses/new?documentId=${d.id}`}>
                  Create expense
                </Link>
                <Link className="underline" href={`/income/new?documentId=${d.id}`}>
                  Create income
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
