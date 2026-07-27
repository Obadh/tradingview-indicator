import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/server/db";
import { requireBusinessApi, AuthorizationError } from "@/lib/server/context";
import { audit } from "@/lib/server/audit";
import { sha256Hex } from "@/lib/server/crypto";
import { storage, documentStorageKey } from "@/lib/server/storage";
import { validateUpload, MAX_UPLOAD_BYTES } from "@/lib/server/file-validation";
import { malwareScanner } from "@/lib/server/malware";
import { ocrProvider } from "@/lib/server/ocr";
import { rateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const metaSchema = z.object({
  category: z.enum([
    "PURCHASE_INVOICE",
    "SALES_INVOICE",
    "RECEIPT",
    "BANK_STATEMENT",
    "KVK_DOCUMENT",
    "BELASTINGDIENST_LETTER",
    "CONTRACT",
    "SUBSCRIPTION_INVOICE",
    "APP_STORE_STATEMENT",
    "PAYMENT_PROVIDER_STATEMENT",
    "OTHER",
  ]),
  /** User explicitly confirmed uploading a duplicate of an existing file. */
  allowDuplicate: z.coerce.boolean().default(false),
});

export async function POST(request: Request) {
  let ctx;
  try {
    ctx = await requireBusinessApi();
  } catch (e) {
    if (e instanceof AuthorizationError) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    throw e;
  }
  const { business, userId } = ctx;

  if (!rateLimit(`upload:${userId}`, 60, 60_000)) {
    return NextResponse.json({ error: "Too many uploads, slow down a little." }, { status: 429 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_UPLOAD_BYTES * 1.1) {
    return NextResponse.json({ error: "File too large." }, { status: 413 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file in request." }, { status: 400 });
  }
  const meta = metaSchema.safeParse({
    category: form.get("category") ?? "OTHER",
    allowDuplicate: form.get("allowDuplicate") ?? false,
  });
  if (!meta.success) {
    return NextResponse.json({ error: "Invalid upload metadata." }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const validation = validateUpload(buf, file.type || "application/octet-stream", file.name);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 415 });
  }

  const scan = await malwareScanner().scan(buf);
  if (!scan.clean) {
    await audit(
      { businessId: business.id, actorUserId: userId },
      {
        action: "upload",
        entityType: "Document",
        newValues: { filename: file.name, blocked: "malware-scan" },
      },
    );
    return NextResponse.json(
      { error: "The file was blocked by the malware scanner." },
      { status: 422 },
    );
  }

  const sha256 = sha256Hex(buf);

  // Duplicate detection by checksum. Intentional duplicates need explicit
  // confirmation and are marked as such.
  const existing = await prisma.document.findFirst({
    where: { businessId: business.id, sha256, deletedAt: null },
    select: { id: true, originalFilename: true, uploadedAt: true },
  });
  if (existing && !meta.data.allowDuplicate) {
    return NextResponse.json(
      {
        duplicate: {
          documentId: existing.id,
          filename: existing.originalFilename,
          uploadedAt: existing.uploadedAt.toISOString(),
        },
        error:
          "An identical file (same checksum) was already uploaded. Upload anyway only if you intend to store it twice.",
      },
      { status: 409 },
    );
  }

  const document = await prisma.$transaction(async (tx) => {
    const doc = await tx.document.create({
      data: {
        businessId: business.id,
        category: meta.data.category,
        status: "UPLOADED",
        originalFilename: file.name.slice(0, 255),
        mimeType: validation.normalizedMime!,
        sizeBytes: buf.length,
        sha256,
        storageKey: "pending",
        uploadedById: userId,
        duplicateConfirmed: !!existing,
      },
    });
    const key = documentStorageKey(business.id, doc.id, 1);
    await tx.document.update({ where: { id: doc.id }, data: { storageKey: key } });
    await tx.documentVersion.create({
      data: {
        documentId: doc.id,
        version: 1,
        storageKey: key,
        mimeType: validation.normalizedMime!,
        sizeBytes: buf.length,
        sha256,
        note: "original upload",
      },
    });
    return { ...doc, storageKey: key };
  });

  // Store the original after the DB row exists; put() refuses overwrites.
  await storage().put(document.storageKey, buf, validation.normalizedMime!);

  await audit(
    { businessId: business.id, actorUserId: userId },
    {
      action: "upload",
      entityType: "Document",
      entityId: document.id,
      newValues: {
        filename: document.originalFilename,
        sha256,
        sizeBytes: buf.length,
        category: meta.data.category,
        duplicateConfirmed: !!existing,
      },
    },
  );

  // Optional local OCR suggestions — only when the user enabled a provider.
  const settings = business.settings;
  const provider = ocrProvider();
  if (provider && settings?.ocrProviderEnabled && (!provider.external || settings.ocrConsentAt)) {
    try {
      const extraction = await provider.extract(buf, validation.normalizedMime!, file.name);
      await prisma.document.update({
        where: { id: document.id },
        data: {
          extraction: JSON.parse(JSON.stringify(extraction)),
          extractionStatus: "suggested",
          status: "NEEDS_REVIEW",
        },
      });
    } catch {
      await prisma.document.update({
        where: { id: document.id },
        data: { extractionStatus: "failed", status: "NEEDS_REVIEW" },
      });
    }
  } else {
    await prisma.document.update({
      where: { id: document.id },
      data: { status: "NEEDS_REVIEW", extractionStatus: "none" },
    });
  }

  return NextResponse.json({ documentId: document.id });
}
