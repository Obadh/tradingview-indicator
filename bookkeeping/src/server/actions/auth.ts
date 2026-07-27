"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { AuthError } from "next-auth";
import { prisma } from "@/lib/server/db";
import { signIn, signOut } from "@/lib/server/auth";
import { audit } from "@/lib/server/audit";
import { rateLimit } from "@/lib/server/rate-limit";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const registerSchema = z.object({
  email: z.string().email("Enter a valid email address").max(200),
  name: z.string().min(1, "Enter your name").max(120),
  password: z
    .string()
    .min(12, "Use at least 12 characters — a short sentence works well")
    .max(200),
});

/**
 * Registration creates the owner account. It is only open while no user
 * exists (single-user v1) and ALLOW_REGISTRATION is not "false".
 */
export async function registerAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!rateLimit(`register:${ip}`, 5, 60_000)) {
    return { ok: false, error: "Too many attempts. Try again in a minute." };
  }

  const parsed = registerSchema.safeParse({
    email: formData.get("email"),
    name: formData.get("name"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const userCount = await prisma.user.count();
  if (userCount > 0 || process.env.ALLOW_REGISTRATION === "false") {
    return {
      ok: false,
      error: "Registration is closed: the owner account already exists.",
    };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const user = await prisma.user.create({
    data: {
      email: parsed.data.email.toLowerCase(),
      name: parsed.data.name,
      passwordHash,
    },
  });
  await audit(
    { actorUserId: user.id, ip },
    { action: "create", entityType: "User", entityId: user.id, newValues: { email: user.email } },
  );
  redirect("/login?registered=1");
}

export async function loginAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    await signIn("credentials", {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      totp: String(formData.get("totp") ?? ""),
      redirectTo: "/dashboard",
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        ok: false,
        error:
          "Sign-in failed. Check your email, password and (if enabled) authenticator code. After repeated failures the account is temporarily locked.",
      };
    }
    throw error; // NEXT_REDIRECT on success
  }
}

export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
