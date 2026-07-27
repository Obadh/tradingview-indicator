import Link from "next/link";
import { REPORTS } from "@/lib/server/reports";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Reports" };

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Reports</h1>
        <p className="text-sm text-muted-foreground">
          Every report supports a date range and CSV, XLSX, PDF and JSON export, and always shows
          when and with which filters it was generated.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries(REPORTS).map(([key, def]) => (
          <Card key={key}>
            <CardContent className="p-4">
              <Link href={`/reports/${key}`} className="font-medium text-primary underline">
                {def.title}
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
