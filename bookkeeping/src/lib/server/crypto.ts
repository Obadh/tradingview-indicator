/**
 * Application-layer encryption for especially sensitive fields
 * (omzetbelastingnummer, TOTP secrets) and hashing helpers.
 * AES-256-GCM with a key from APP_ENCRYPTION_KEY (base64, 32 bytes).
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "crypto";

function key(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) throw new Error("APP_ENCRYPTION_KEY is not set");
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error("APP_ENCRYPTION_KEY must be 32 bytes (base64)");
  return buf;
}

export function encryptString(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(".");
}

export function decryptString(payload: string): string {
  const [version, ivB64, tagB64, dataB64] = payload.split(".");
  if (version !== "v1" || !ivB64 || !tagB64 || !dataB64) {
    throw new Error("Unrecognized encrypted payload");
  }
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString(
    "utf8",
  );
}

/** SHA-256 hex digest of a buffer (document checksums). */
export function sha256Hex(data: Buffer | Uint8Array | string): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Privacy-preserving IP hash for audit logs and rate limiting. */
export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return createHash("sha256").update(`ip:${ip}`).digest("hex").slice(0, 32);
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Mask a sensitive identifier: keep first 2 and last 2 chars. */
export function maskIdentifier(value: string | null | undefined): string {
  if (!value) return "";
  const v = value.trim();
  if (v.length <= 4) return "•".repeat(v.length);
  return `${v.slice(0, 2)}${"•".repeat(Math.min(v.length - 4, 8))}${v.slice(-2)}`;
}
