/**
 * Rate limiting. In-memory sliding window for per-instance limits (uploads,
 * general mutations) plus a persistent login limiter backed by the
 * LoginAttempt table so lockouts survive restarts.
 */

import { prisma } from "./db";
import { hashIp } from "./crypto";

const windows = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (windows.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    windows.set(key, hits);
    return false;
  }
  hits.push(now);
  windows.set(key, hits);
  // Opportunistic cleanup to bound memory.
  if (windows.size > 10_000) {
    for (const [k, v] of windows) {
      if (v.every((t) => now - t >= windowMs)) windows.delete(k);
    }
  }
  return true;
}

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 10;

export async function loginAllowed(email: string, ip: string | null): Promise<boolean> {
  const since = new Date(Date.now() - LOGIN_WINDOW_MS);
  const ipHash = hashIp(ip);
  const failures = await prisma.loginAttempt.count({
    where: {
      success: false,
      createdAt: { gte: since },
      OR: [{ email: email.toLowerCase() }, ...(ipHash ? [{ ipHash }] : [])],
    },
  });
  return failures < LOGIN_MAX_FAILURES;
}

export async function recordLoginAttempt(
  email: string,
  ip: string | null,
  success: boolean,
  userId?: string | null,
): Promise<void> {
  await prisma.loginAttempt.create({
    data: {
      email: email.toLowerCase(),
      ipHash: hashIp(ip) ?? "unknown",
      success,
      userId: userId ?? null,
    },
  });
}
