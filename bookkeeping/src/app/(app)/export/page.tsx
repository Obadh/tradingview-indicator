import { requireBusiness } from "@/lib/server/context";
import { prisma } from "@/lib/server/db";
import { storage } from "@/lib/server/storage";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExportForm } from "./export-form";

export const metadata = { title: "Export administration" };
export const dynamic = "force-dynamic";

export default async function ExportPage() {
  const { business } = await requireBusiness();
  const jobs = await prisma.exportJob.findMany({
    where: { businessId: business.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  const jobsWithUrls = await Promise.all(
    jobs.map(async (j) => ({
      ...j,
      url:
        j.status === "COMPLETED" && j.storageKey
          ? await storage().signedUrl(j.storageKey, 600)
          : null,
    })),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Export administration</h1>
        <p className="text-sm text-muted-foreground">
          One ZIP with your original documents, ledgers, VAT summaries, reports, checksums and
          audit log in a predictable folder structure.
        </p>
      </div>

      <Alert variant="info">
        <AlertTitle>You do not need to send this anywhere proactively</AlertTitle>
        <AlertDescription>
          This export organizes your administration for yourself, your bookkeeper, or a requested
          inspection by the Belastingdienst. Store it safely; share it only when asked.
        </AlertDescription>
      </Alert>

      <ExportForm currentYear={new Date().getFullYear()} firstYear={business.settings?.firstFinancialYear ?? new Date().getFullYear()} />

      <Card>
        <CardHeader>
          <CardTitle>Previous exports</CardTitle>
          <CardDescription>Each export records its parameters, checksum and summary.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {jobsWithUrls.length === 0 && (
            <p className="text-sm text-muted-foreground">No exports yet.</p>
          )}
          {jobsWithUrls.map((j) => {
            const p = j.params as { scopeLabel?: string };
            const s = j.summary as { documents?: number; transactions?: number; missingDocuments?: number; unresolvedItems?: number } | null;
            return (
              <div key={j.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
                <div>
                  <p className="font-medium">{p.scopeLabel ?? "Export"}</p>
                  <p className="text-muted-foreground">
                    {j.createdAt.toISOString().slice(0, 16).replace("T", " ")} ·{" "}
                    {j.sizeBytes ? `${(j.sizeBytes / 1024 / 1024).toFixed(1)} MB` : ""}
                    {s && ` · ${s.documents} docs, ${s.transactions} transactions`}
                    {s && (s.unresolvedItems ?? 0) > 0 && ` · ${s.unresolvedItems} unresolved`}
                    {j.sha256 && ` · sha256 ${j.sha256.slice(0, 12)}…`}
                  </p>
                  {j.error && <p className="text-destructive">{j.error}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={j.status === "COMPLETED" ? "success" : j.status === "FAILED" ? "destructive" : "warning"}>
                    {j.status.toLowerCase()}
                  </Badge>
                  {j.url && (
                    <Button asChild size="sm" variant="outline">
                      <a href={`${j.url}${j.url.includes("?") ? "&" : "?"}download=1`}>Download ZIP</a>
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
