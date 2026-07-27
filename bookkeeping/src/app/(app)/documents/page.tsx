import Link from "next/link";
import { requireBusiness } from "@/lib/server/context";
import { prisma } from "@/lib/server/db";
import { UploadDropzone } from "@/components/upload-dropzone";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DOCUMENT_CATEGORY_LABELS, DOCUMENT_STATUS_LABELS } from "@/lib/labels";
import { formatDateNl } from "@/lib/domain/dates";
import type { Prisma } from "@prisma/client";

export const metadata = { title: "Documents" };
export const dynamic = "force-dynamic";

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; category?: string; filter?: string }>;
}) {
  const { business } = await requireBusiness();
  const params = await searchParams;

  const where: Prisma.DocumentWhereInput = { businessId: business.id, deletedAt: null };
  if (params.status === "needs-review") where.status = { in: ["UPLOADED", "NEEDS_REVIEW"] };
  else if (params.status) where.status = params.status as never;
  if (params.category) where.category = params.category as never;
  if (params.filter === "no-payment") {
    where.category = { in: ["PURCHASE_INVOICE", "SALES_INVOICE", "RECEIPT", "SUBSCRIPTION_INVOICE"] };
    where.links = { none: { transaction: { isPaid: true } } };
  }
  if (params.filter === "unlinked") where.links = { none: {} };

  const documents = await prisma.document.findMany({
    where,
    orderBy: { uploadedAt: "desc" },
    take: 200,
    include: { links: { select: { transactionId: true, invoiceId: true } } },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Documents</h1>
        <p className="text-sm text-muted-foreground">
          Original files are preserved exactly as uploaded, with a SHA-256 checksum. Keep the
          original PDF: the Belastingdienst requires digital invoices to stay in their original
          digital form.
        </p>
      </div>

      <UploadDropzone />

      <div className="flex flex-wrap gap-2 text-sm">
        <Link className="underline" href="/documents">
          All
        </Link>
        <Link className="underline" href="/documents?status=needs-review">
          Needs review
        </Link>
        <Link className="underline" href="/documents?filter=unlinked">
          Not attached to a record
        </Link>
        <Link className="underline" href="/documents?filter=no-payment">
          Without matched payment
        </Link>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>File</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Attached</TableHead>
            <TableHead>Uploaded</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {documents.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                No documents yet. Upload your first invoice or receipt above.
              </TableCell>
            </TableRow>
          )}
          {documents.map((doc) => (
            <TableRow key={doc.id}>
              <TableCell>
                <Link href={`/documents/${doc.id}`} className="font-medium text-primary underline">
                  {doc.title || doc.originalFilename}
                </Link>
              </TableCell>
              <TableCell>{DOCUMENT_CATEGORY_LABELS[doc.category]}</TableCell>
              <TableCell>{doc.documentDate ? formatDateNl(doc.documentDate) : "—"}</TableCell>
              <TableCell>
                <Badge
                  variant={
                    doc.status === "CONFIRMED"
                      ? "success"
                      : doc.status === "ARCHIVED"
                        ? "secondary"
                        : "warning"
                  }
                >
                  {DOCUMENT_STATUS_LABELS[doc.status]}
                </Badge>
              </TableCell>
              <TableCell>{doc.links.length > 0 ? `${doc.links.length} record(s)` : "—"}</TableCell>
              <TableCell>{formatDateNl(doc.uploadedAt.toISOString().slice(0, 10))}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
