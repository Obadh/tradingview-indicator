/**
 * Authentication: Auth.js (next-auth v5) with a credentials provider —
 * email + strong password (bcrypt) and optional TOTP MFA. Sessions are JWT
 * cookies (httpOnly, sameSite=lax, secure in production) with a 12-hour
 * absolute expiry. Login attempts are persisted for rate limiting/lockout.
 */

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import * as OTPAuth from "otpauth";
import { z } from "zod";
import { prisma } from "./db";
import { decryptString } from "./crypto";
import { loginAllowed, recordLoginAttempt } from "./rate-limit";
import { audit } from "./audit";

const credentialsSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
  totp: z.string().max(10).optional(),
});

export const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

export function verifyTotp(encryptedSecret: string, token: string): boolean {
  const secret = decryptString(encryptedSecret);
  const totp = new OTPAuth.TOTP({
    issuer: "Boekhouding",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
  return totp.validate({ token, window: 1 }) !== null;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: {
    strategy: "jwt",
    maxAge: SESSION_MAX_AGE_SECONDS,
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
        totp: {},
      },
      authorize: async (raw, request) => {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password, totp } = parsed.data;
        const ip =
          request?.headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

        if (!(await loginAllowed(email, ip))) {
          // Locked out: fail without revealing whether the account exists.
          return null;
        }

        const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
        const passwordOk =
          user?.passwordHash != null && (await bcrypt.compare(password, user.passwordHash));
        // Always run a compare to keep timing consistent for unknown users.
        if (!user?.passwordHash) {
          await bcrypt.compare(password, "$2a$12$C6UzMDM.H6dfI/f/IKcEeO7ZUcHzTuvDVSpDGF9DVzWkPLRUXo0y6");
        }

        let ok = !!user && passwordOk;
        if (ok && user!.totpSecretEncrypted && user!.totpEnabledAt) {
          ok = !!totp && verifyTotp(user!.totpSecretEncrypted, totp);
        }

        await recordLoginAttempt(email, ip, !!ok, user?.id ?? null);
        await audit(
          { actorUserId: ok ? user!.id : null, ip },
          { action: ok ? "login" : "login-failed", entityType: "User", entityId: user?.id ?? null },
        );
        if (!ok || !user || user.deletedAt) return null;
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.sub && session.user) session.user.id = token.sub;
      return session;
    },
  },
});
