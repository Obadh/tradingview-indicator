/**
 * Storage abstraction for original documents. Objects are immutable:
 * `put` refuses to overwrite an existing key, uploads never replace
 * originals, and nothing is ever publicly accessible. Downloads go through
 * authenticated app routes (local driver) or short-lived signed URLs (S3).
 */

import { LocalStorageDriver } from "./local";
import { S3StorageDriver } from "./s3";

export interface StorageDriver {
  /** Store an object; throws if the key already exists (immutability). */
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  /** Permanent removal — only used by the audited retention-deletion flow. */
  delete(key: string): Promise<void>;
  /**
   * A URL the authenticated user can fetch the object from, valid for
   * `expiresInSeconds`. The local driver returns an app route (session-
   * protected); the S3 driver returns a presigned URL.
   */
  signedUrl(key: string, expiresInSeconds: number, downloadName?: string): Promise<string>;
}

let driver: StorageDriver | null = null;

export function storage(): StorageDriver {
  if (driver) return driver;
  const kind = process.env.STORAGE_DRIVER ?? "local";
  if (kind === "s3") {
    driver = new S3StorageDriver();
  } else {
    driver = new LocalStorageDriver(process.env.STORAGE_LOCAL_PATH ?? "./var/storage");
  }
  return driver;
}

/** Content-addressed key layout: businesses/<id>/documents/<uuid>/<n>-original */
export function documentStorageKey(businessId: string, documentId: string, version: number): string {
  return `businesses/${businessId}/documents/${documentId}/v${version}`;
}

export function exportStorageKey(businessId: string, exportJobId: string): string {
  return `businesses/${businessId}/exports/${exportJobId}.zip`;
}
