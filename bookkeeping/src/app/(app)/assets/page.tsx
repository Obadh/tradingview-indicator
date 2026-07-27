import { requireBusiness } from "@/lib/server/context";
import { prisma } from "@/lib/server/db";
import { formatCents } from "@/lib/domain/money";
import { formatDateNl } from "@/lib/domain/dates";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AssetForms } from "./asset-forms";

export const metadata = { title: "Assets" };
export const dynamic = "force-dynamic";

export default async function AssetsPage() {
  const { business } = await requireBusiness();
  const assets = await prisma.asset.findMany({
    where: { businessId: business.id, deletedAt: null },
    orderBy: { purchaseDate: "desc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Asset register</h1>
        <p className="text-sm text-muted-foreground">
          Larger purchases (default threshold €{((business.settings?.assetThresholdCents ?? 45000) / 100).toFixed(0)}{" "}
          excl. VAT) are usually depreciated over several years instead of expensed at once. The
          app suggests; you decide.
        </p>
      </div>

      <Alert variant="info">
        <AlertDescription>
          Depreciation is booked per year with an explicit button — never automatically. The
          default is straight-line over 60 months with no residual value; adjust per asset where
          needed and confirm the useful life with your adviser.
        </AlertDescription>
      </Alert>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Asset</TableHead>
            <TableHead>Purchased</TableHead>
            <TableHead className="text-right">Price excl. VAT</TableHead>
            <TableHead className="text-right">Business %</TableHead>
            <TableHead className="text-right">Life (months)</TableHead>
            <TableHead className="text-right">Annual depreciation</TableHead>
            <TableHead>Book depreciation</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {assets.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                No assets yet. Register one below, or tick “Book as asset” on an expense.
              </TableCell>
            </TableRow>
          )}
          {assets.map((a) => (
            <TableRow key={a.id}>
              <TableCell className="font-medium">{a.name}</TableCell>
              <TableCell>{formatDateNl(a.purchaseDate)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatCents(a.purchasePriceExVatCents)}</TableCell>
              <TableCell className="text-right">{a.businessUseBp / 100}%</TableCell>
              <TableCell className="text-right">{a.usefulLifeMonths}</TableCell>
              <TableCell className="text-right tabular-nums">
                {a.annualDepreciationCents != null ? formatCents(a.annualDepreciationCents) : "—"}
              </TableCell>
              <TableCell>
                <AssetForms.BookDepreciation assetId={a.id} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <AssetForms.NewAsset />
    </div>
  );
}
