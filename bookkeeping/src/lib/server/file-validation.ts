/**
 * Upload validation: allowed types, size limits, and magic-byte checks so a
 * file's content must match its claimed type. HEIC support depends on the
 * browser for preview but files are always stored as originals.
 */

export const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES ?? 26_214_400);

export interface AllowedType {
  mime: string;
  extensions: string[];
  matches(buf: Buffer): boolean;
}

const startsWith = (buf: Buffer, bytes: number[], offset = 0) =>
  bytes.every((b, i) => buf[offset + i] === b);

export const ALLOWED_TYPES: AllowedType[] = [
  { mime: "application/pdf", extensions: ["pdf"], matches: (b) => startsWith(b, [0x25, 0x50, 0x44, 0x46]) },
  { mime: "image/jpeg", extensions: ["jpg", "jpeg"], matches: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  {
    mime: "image/png",
    extensions: ["png"],
    matches: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  },
  {
    mime: "image/heic",
    extensions: ["heic", "heif"],
    // ISO-BMFF: "ftyp" at offset 4 with a heic/heif/mif1 brand.
    matches: (b) =>
      startsWith(b, [0x66, 0x74, 0x79, 0x70], 4) &&
      ["heic", "heix", "heif", "mif1", "msf1"].includes(b.subarray(8, 12).toString("latin1")),
  },
  {
    mime: "text/xml",
    extensions: ["xml", "ubl"],
    matches: (b) => /^\s*<\?xml|^\s*</.test(b.subarray(0, 256).toString("utf8")),
  },
  {
    mime: "text/csv",
    extensions: ["csv"],
    // CSV has no magic bytes; require it to be valid UTF-8-ish text.
    matches: (b) => !b.subarray(0, 4096).includes(0),
  },
];

const MIME_ALIASES: Record<string, string> = {
  "application/xml": "text/xml",
  "text/plain": "text/csv", // browsers often label CSV as text/plain
  "application/vnd.ms-excel": "text/csv", // legacy label some banks use for CSV
  "image/heif": "image/heic",
};

export interface FileValidationResult {
  ok: boolean;
  normalizedMime?: string;
  error?: string;
}

export function validateUpload(
  buf: Buffer,
  claimedMime: string,
  filename: string,
): FileValidationResult {
  if (buf.length === 0) return { ok: false, error: "The file is empty." };
  if (buf.length > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      error: `The file is larger than the maximum of ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MiB.`,
    };
  }
  const ext = filename.toLowerCase().match(/\.([a-z0-9]{1,8})$/)?.[1] ?? "";
  const normalized = MIME_ALIASES[claimedMime] ?? claimedMime;

  // Prefer a type whose magic bytes match the content.
  const byContent = ALLOWED_TYPES.find((t) => t.matches(buf));
  if (!byContent) {
    return {
      ok: false,
      error: "Unsupported file type. Allowed: PDF, JPG, PNG, HEIC, XML/UBL, CSV.",
    };
  }
  // The extension or claimed type must be consistent with the content type.
  const extOk = byContent.extensions.includes(ext);
  const mimeOk = normalized === byContent.mime;
  if (!extOk && !mimeOk) {
    return {
      ok: false,
      error: `The file content looks like ${byContent.mime} but the name/type says otherwise. Rename the file or export it again.`,
    };
  }
  return { ok: true, normalizedMime: byContent.mime };
}
