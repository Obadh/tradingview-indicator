import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/db";
import { requireBusinessApi, AuthorizationError } from "@/lib/server/context";
import { storage } from "@/lib/server/storage";
import { audit } from "@/lib/server/audit";

export const runtime = "nodejs";

/**
 * Session-protected object serving for the local storage driver. The key
 * must belong to a document (or export) of the caller's business — never
 * arbitrary paths. S3 deployments use presigned URLs instead of this route.
 */
export async function GET(request: Request) {
  let ctx;
  try {
    ctx = await requireBusinessApi();
  } catch (e) {
    if (e instanceof AuthorizationError) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    throw e;
  }
  const url = new URL(request.url);
  const key = url.searchParams.get("key") ?? "";
  const download = url.searchParams.get("download") === "1";

  // Authorization: the key must be registered to this business.
  const [version, exportJob] = await Promise.all([
    prisma.documentVersion.findFirst({
      where: { storageKey: key, document: { businessId: ctx.business.id } },
      include: { document: { select: { id: true, originalFilename: true } } },
    }),
    prisma.exportJob.findFirst({
      where: { storageKey: key, businessId: ctx.business.id },
    }),
  ]);
  if (!version && !exportJob) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const data = await storage().get(key);
  const filename = version
    ? version.document.originalFilename
    : `administration-export-${exportJob!.id.slice(0, 8)}.zip`;
  const mime = version ? version.mimeType : "application/zip";

  if (version) {
    await audit(
      { businessId: ctx.business.id, actorUserId: ctx.userId },
      { action: "download", entityType: "Document", entityId: version.document.id },
    );
  }

  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": mime,
      "Content-Length": String(data.length),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename.replace(/[^\w.\- ]/g, "_")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
