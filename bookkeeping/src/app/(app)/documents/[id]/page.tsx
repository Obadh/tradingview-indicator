import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBusiness } from "@/lib/server/context";
import { prisma } from "@/lib/server/db";
import { storage } from "@/lib/server/storage";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DOCUMENT_STATUS_LABELS } from "@/lib/labels";
import { formatDateNl } from "@/lib/domain/dates";
import { DocumentMetaForm } from "./meta-form";
import type { ExtractionResult } from "@/lib/server/ocr";

export const dynamic = "force-dynamic";

export default async function DocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { business } = await requireBusiness();
  const { id } = await params;
  const doc = await prisma.document.findFirst({
    where: { id, businessId: business.id, deletedAt: null },
    include: {
      versions: { orderBy: { version: "asc" } },
      links: {
        include: {
          transaction: { select: { id: true, description: true, date: true, status: true } },
          invoice: { select: { id: true, number: true } },
        },
      },
      uploadedBy: { select: { name: true, email: true } },
    },
  });
  if (!doc) notFound();

  const previewUrl = await storage().signedUrl(doc.storageKey, 600);
  const downloadUrl = previewUrl.includes("?")
    ? `${previewUrl}&download=1`
    : `${previewUrl}?download=1`;
  const extraction = doc.extraction as unknown as ExtractionResult | null;
  const isImage = doc.mimeType.startsWith("image/");
  const isPdf = doc.mimeType === "application/pdf";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="break-all text-xl font-semibold">{doc.title || doc.originalFilename}</h1>
          <p className="text-sm text-muted-foreground">
            Uploaded {formatDateNl(doc.uploadedAt.toISOString().slice(0, 10))} by{" "}
            {doc.uploadedBy.name ?? doc.uploadedBy.email} · {(doc.sizeBytes / 1024).toFixed(0)} KB ·{" "}
            {doc.mimeType}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={doc.status === "CONFIRMED" ? "success" : "warning"}>
            {DOCUMENT_STATUS_LABELS[doc.status]}
          </Badge>
          <Button asChild variant="outline" size="sm">
            <a href={downloadUrl}>Download original</a>
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
            <CardDescription>
              The preview never modifies the original file (checksum{" "}
              <code className="break-all text-xs">{doc.sha256.slice(0, 16)}…</code>).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isPdf && (
              <iframe src={previewUrl} title="Document preview" className="h-[600px] w-full rounded border" />
            )}
            {isImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt={`Preview of ${doc.originalFilename}`} className="max-h-[600px] w-auto rounded border" />
            )}
            {!isPdf && !isImage && (
              <p className="text-sm text-muted-foreground">
                No inline preview for this file type. Use “Download original”.
              </p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          {extraction && Object.keys(extraction.fields ?? {}).length > 0 && (
            <Alert variant="info">
              <AlertTitle>Suggested values (require your confirmation)</AlertTitle>
              <AlertDescription>
                <p className="mb-2 text-xs">
                  Extracted by {extraction.provider}. Suggestions are never saved as bookkeeping
                  data until you confirm them in an expense or income form.
                </p>
                <dl className="grid grid-cols-2 gap-1 text-sm">
                  {Object.entries(extraction.fields).map(([field, v]) => (
                    <div key={field} className="contents">
                      <dt className="text-muted-foreground">{field}</dt>
                      <dd>
                        {v.value}{" "}
                        <span className="text-xs text-muted-foreground">
                          ({Math.round(v.confidence * 100)}% confidence)
                        </span>
                      </dd>
                    </div>
                  ))}
                </dl>
              </AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <DocumentMetaForm
                document={{
                  id: doc.id,
                  category: doc.category,
                  title: doc.title ?? "",
                  documentDate: doc.documentDate?.toISOString().slice(0, 10) ?? "",
                  notes: doc.notes ?? "",
                  status: doc.status === "UPLOADED" ? "NEEDS_REVIEW" : doc.status,
                }}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Attached to</CardTitle>
              <CardDescription>
                A document can be attached to one or more accounting records.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {doc.links.length === 0 && (
                <p className="text-muted-foreground">
                  Not attached yet. Create an{" "}
                  <Link className="text-primary underline" href={`/expenses/new?documentId=${doc.id}`}>
                    expense
                  </Link>{" "}
                  or{" "}
                  <Link className="text-primary underline" href={`/income/new?documentId=${doc.id}`}>
                    income entry
                  </Link>{" "}
                  from this document.
                </p>
              )}
              {doc.links.map((link) => (
                <p key={link.id}>
                  {link.transaction && (
                    <Link className="text-primary underline" href={`/transactions/${link.transaction.id}`}>
                      Transaction: {link.transaction.description} (
                      {formatDateNl(link.transaction.date)})
                    </Link>
                  )}
                  {link.invoice && (
                    <Link className="text-primary underline" href={`/invoices/${link.invoice.id}`}>
                      Invoice {link.invoice.number ?? "(draft)"}
                    </Link>
                  )}
                </p>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>File history</CardTitle>
              <CardDescription>
                Version 1 is always the untouched original. New versions are additive; nothing is
                ever overwritten.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1 text-sm">
                {doc.versions.map((v) => (
                  <li key={v.id}>
                    v{v.version} — {v.note ?? "file"} · {(v.sizeBytes / 1024).toFixed(0)} KB ·{" "}
                    <code className="text-xs">{v.sha256.slice(0, 12)}…</code>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
