/**
 * Append-only audit trail. Every change to financial data goes through
 * audit() — there is no update or delete path for audit rows anywhere in
 * the application. See docs/SECURITY.md for DB-level hardening advice.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { hashIp } from "./crypto";

export interface AuditContext {
  businessId?: string | null;
  actorUserId?: string | null;
  ip?: string | null;
  sessionId?: string | null;
}

export interface AuditEvent {
  action:
    | "create"
    | "update"
    | "delete"
    | "soft-delete"
    | "confirm"
    | "finalize"
    | "lock"
    | "unlock"
    | "correct"
    | "upload"
    | "download"
    | "export"
    | "login"
    | "login-failed"
    | "consent"
    | "retention-delete";
  entityType: string;
  entityId?: string | null;
  oldValues?: unknown;
  newValues?: unknown;
  reason?: string | null;
}

/** Strip obviously sensitive keys before persisting values in the log. */
function sanitize(values: unknown): Prisma.InputJsonValue | undefined {
  if (values === undefined || values === null) return undefined;
  const json = JSON.parse(
    JSON.stringify(values, (k, v) =>
      /password|secret|token|encrypted/i.test(k) ? "[redacted]" : v,
    ),
  );
  return json as Prisma.InputJsonValue;
}

export async function audit(
  ctx: AuditContext,
  event: AuditEvent,
  tx?: Prisma.TransactionClient,
): Promise<void> {
  const client = tx ?? prisma;
  await client.auditLog.create({
    data: {
      businessId: ctx.businessId ?? null,
      actorUserId: ctx.actorUserId ?? null,
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId ?? null,
      oldValues: sanitize(event.oldValues),
      newValues: sanitize(event.newValues),
      reason: event.reason ?? null,
      ipHash: hashIp(ctx.ip),
      sessionId: ctx.sessionId ?? null,
    },
  });
}
