import { promises as fs } from "fs";
import path from "path";
import type { StorageDriver } from "./index";

/**
 * Local filesystem driver for development and fully local self-hosting.
 * Keys are validated against path traversal before touching the disk.
 */
export class LocalStorageDriver implements StorageDriver {
  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    if (!/^[a-zA-Z0-9/._-]+$/.test(key) || key.includes("..")) {
      throw new Error("Invalid storage key");
    }
    const abs = path.resolve(this.root, key);
    const rootAbs = path.resolve(this.root);
    if (!abs.startsWith(rootAbs + path.sep)) {
      throw new Error("Storage key escapes the storage root");
    }
    return abs;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const file = this.resolve(key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    // "wx" fails if the file exists — originals are immutable.
    await fs.writeFile(file, data, { flag: "wx" });
  }

  async get(key: string): Promise<Buffer> {
    return fs.readFile(this.resolve(key));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    await fs.unlink(this.resolve(key));
  }

  async signedUrl(key: string, _expiresInSeconds: number, downloadName?: string): Promise<string> {
    // Local objects are served by the session-protected /api/files route.
    const params = new URLSearchParams({ key });
    if (downloadName) params.set("name", downloadName);
    return `/api/files?${params.toString()}`;
  }
}
