import Link from "next/link";
import { requireBusiness } from "@/lib/server/context";
import { prisma } from "@/lib/server/db";
import { formatDateNl } from "@/lib/domain/dates";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LetterForm } from "./letter-form";

export const metadata = { title: "Official letters" };
export const dynamic = "force-dynamic";

export default async function LettersPage() {
  const { business } = await requireBusiness();
  const [letters, letterDocs] = await Promise.all([
    prisma.officialLetter.findMany({
      where: { businessId: business.id, deletedAt: null },
      orderBy: [{ responseDeadline: "asc" }, { createdAt: "desc" }],
      include: { document: { select: { id: true, originalFilename: true } } },
    }),
    prisma.document.findMany({
      where: {
        businessId: business.id,
        deletedAt: null,
        category: { in: ["BELASTINGDIENST_LETTER", "KVK_DOCUMENT"] },
      },
      orderBy: { uploadedAt: "desc" },
      select: { id: true, originalFilename: true, title: true },
      take: 50,
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Letters from KVK and Belastingdienst</h1>
        <p className="text-sm text-muted-foreground">
          Track official correspondence and response deadlines. Reminders are only created from
          deadlines you confirm yourself.
        </p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Sender</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Reference</TableHead>
            <TableHead>Tax type / period</TableHead>
            <TableHead>Deadline</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Document</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {letters.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                No letters registered. Upload the scan under Documents (type “Belastingdienst
                letter” or “KVK document”), then register it below.
              </TableCell>
            </TableRow>
          )}
          {letters.map((l) => (
            <TableRow key={l.id}>
              <TableCell className="font-medium">{l.sender}</TableCell>
              <TableCell>{l.letterDate ? formatDateNl(l.letterDate) : "—"}</TableCell>
              <TableCell>{l.referenceNumber ?? "—"}</TableCell>
              <TableCell>
                {[l.taxType, l.period].filter(Boolean).join(" / ") || "—"}
              </TableCell>
              <TableCell>
                {l.responseDeadline ? (
                  <Badge variant={l.status === "DONE" ? "success" : "warning"}>
                    {formatDateNl(l.responseDeadline)}
                  </Badge>
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell>{l.status.toLowerCase().replace("_", " ")}</TableCell>
              <TableCell>
                {l.document ? (
                  <Link className="text-primary underline" href={`/documents/${l.document.id}`}>
                    {l.document.originalFilename}
                  </Link>
                ) : (
                  "—"
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <LetterForm documents={letterDocs.map((d) => ({ id: d.id, label: d.title || d.originalFilename }))} />
    </div>
  );
}
