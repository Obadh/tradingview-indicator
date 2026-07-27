import { NextResponse } from "next/server";
import { requireBusinessApi, AuthorizationError } from "@/lib/server/context";
import { buildReport } from "@/lib/server/reports";
import { reportToCsv, reportToJson, reportToPdf, reportToXlsx } from "@/lib/server/reports/serialize";
import { audit } from "@/lib/server/audit";
import { todayAmsterdam } from "@/lib/domain/dates";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ report: string }> }) {
  let ctx;
  try {
    ctx = await requireBusinessApi();
  } catch (e) {
    if (e instanceof AuthorizationError) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    throw e;
  }
  const { report: key } = await params;
  const url = new URL(request.url);
  const today = todayAmsterdam();
  const from = url.searchParams.get("from") ?? `${today.slice(0, 4)}-01-01`;
  const to = url.searchParams.get("to") ?? today;
  const format = url.searchParams.get("format") ?? "csv";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }

  const report = await buildReport(key, ctx.business.id, { from, to });
  if (!report) return NextResponse.json({ error: "Unknown report" }, { status: 404 });

  await audit(
    { businessId: ctx.business.id, actorUserId: ctx.userId },
    { action: "export", entityType: "Report", entityId: key, newValues: { from, to, format } },
  );

  const filename = `${key}_${from}_${to}`;
  const headers = (name: string, type: string) => ({
    "Content-Type": type,
    "Content-Disposition": `attachment; filename="${name}"`,
    "Cache-Control": "private, no-store",
  });

  switch (format) {
    case "csv":
      return new NextResponse(reportToCsv(report), {
        headers: headers(`${filename}.csv`, "text/csv; charset=utf-8"),
      });
    case "json":
      return new NextResponse(reportToJson(report), {
        headers: headers(`${filename}.json`, "application/json"),
      });
    case "xlsx":
      return new NextResponse(new Uint8Array(await reportToXlsx(report)), {
        headers: headers(
          `${filename}.xlsx`,
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ),
      });
    case "pdf":
      return new NextResponse(new Uint8Array(await reportToPdf(report)), {
        headers: headers(`${filename}.pdf`, "application/pdf"),
      });
    default:
      return NextResponse.json({ error: "Unknown format" }, { status: 400 });
  }
}
