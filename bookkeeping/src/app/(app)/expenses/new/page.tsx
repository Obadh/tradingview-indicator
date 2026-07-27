import { requireBusiness } from "@/lib/server/context";
import { prisma } from "@/lib/server/db";
import { MoneyFlowForm } from "@/components/money-flow-form";
import { createExpenseAction } from "@/server/actions/expenses";
import type { ExtractionResult } from "@/lib/server/ocr";

export const metadata = { title: "New expense" };
export const dynamic = "force-dynamic";

export default async function NewExpensePage({
  searchParams,
}: {
  searchParams: Promise<{ documentId?: string }>;
}) {
  const { business } = await requireBusiness();
  const params = await searchParams;

  const [categories, vatCodes] = await Promise.all([
    prisma.category.findMany({
      where: { businessId: business.id, kind: "EXPENSE", deletedAt: null },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, suggestAsset: true, defaultVatCodeId: true },
    }),
    prisma.vATCode.findMany({
      where: { businessId: business.id, validTo: null },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true, ratePermille: true, treatment: true },
    }),
  ]);

  // Extraction suggestions from the linked document — suggestions only, the
  // user confirms every field by reviewing/adjusting the pre-filled form.
  let suggested: Record<string, string> | undefined;
  if (params.documentId) {
    const doc = await prisma.document.findFirst({
      where: { id: params.documentId, businessId: business.id, deletedAt: null },
    });
    const extraction = doc?.extraction as unknown as ExtractionResult | null;
    if (extraction?.fields) {
      suggested = {};
      for (const [k, v] of Object.entries(extraction.fields)) {
        if (v?.value) suggested[k] = v.value;
      }
      if (doc?.originalFilename && !suggested.description) {
        suggested.description = doc.originalFilename.replace(/\.[a-z0-9]+$/i, "");
      }
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">New expense</h1>
        <p className="text-sm text-muted-foreground">
          {params.documentId
            ? "Pre-filled values are suggestions from the document — check every field before saving."
            : "Record a purchase invoice or receipt."}
        </p>
      </div>
      <MoneyFlowForm
        mode="expense"
        categories={categories}
        vatCodes={vatCodes}
        documentId={params.documentId}
        suggested={suggested}
        kvkRegisteredOn={business.kvkRegisteredOn?.toISOString().slice(0, 10) ?? null}
        assetThresholdCents={business.settings?.assetThresholdCents ?? 45000}
        action={createExpenseAction}
      />
    </div>
  );
}
