/**
 * Request context helpers: authenticated session, active business scoping,
 * and the audit context. Every server action and route handler must go
 * through requireUser()/requireBusiness() — queries are always scoped to the
 * caller's membership, never to client-provided business ids.
 */

import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { prisma } from "./db";
import type { AuditContext } from "./audit";

export class AuthorizationError extends Error {}

export const requireUser = cache(async () => {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt) redirect("/login");
  return user;
});

/**
 * The caller's active business via their membership. V1 is single-business:
 * the first membership wins. Redirects to onboarding when none exists.
 */
export const requireBusiness = cache(async () => {
  const user = await requireUser();
  const membership = await prisma.membership.findFirst({
    where: { userId: user.id, business: { deletedAt: null } },
    include: { business: { include: { settings: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) redirect("/onboarding");
  return { user, membership, business: membership.business };
});

/** Like requireBusiness but throws instead of redirecting (API routes). */
export async function requireBusinessApi() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) throw new AuthorizationError("Not authenticated");
  const membership = await prisma.membership.findFirst({
    where: { userId, business: { deletedAt: null } },
    include: { business: { include: { settings: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) throw new AuthorizationError("No business");
  return { userId, membership, business: membership.business };
}

export async function auditContext(businessId?: string | null): Promise<AuditContext> {
  const session = await auth();
  const h = await headers();
  return {
    businessId: businessId ?? null,
    actorUserId: session?.user?.id ?? null,
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    sessionId: null,
  };
}
