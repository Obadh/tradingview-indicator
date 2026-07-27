# Security

This application holds highly sensitive financial data. This document lists
the implemented measures and the hardening expected from the operator.

## Authentication & sessions

- Credentials sign-in with bcrypt (cost 12) password hashes; minimum
  password length 12 characters; timing-consistent verification for unknown
  accounts.
- Optional TOTP MFA (RFC 6238, ±1 step window). The TOTP secret is stored
  AES-256-GCM encrypted; enabling requires a verified code, disabling
  requires a valid code.
- JWT session cookies: httpOnly, SameSite=Lax, `__Secure-` + Secure in
  production, absolute expiry 12 hours (automatic session expiration).
- Registration is only open while no user exists (single-owner) and can be
  forced shut with `ALLOW_REGISTRATION=false`.
- Login attempts are persisted with hashed IPs; more than 10 failures per
  email or IP in 15 minutes locks sign-in (survives restarts).

## Authorization

- Every server action / route handler resolves the caller's membership
  (`requireBusiness*`) and scopes all queries by that `businessId`.
  Client-provided business or record ids are never trusted without an
  ownership check.
- File serving (`/api/files`) verifies that the requested storage key
  belongs to a document or export of the caller's business.
- Middleware redirects all unauthenticated app routes to /login.

## Transport & headers

- Strict Content-Security-Policy (self-only for scripts/connect/fonts;
  no external origins at all), X-Frame-Options DENY, nosniff,
  Referrer-Policy no-referrer, COOP, restricted Permissions-Policy —
  see `next.config.ts`.
- Deploy behind HTTPS only (see DEPLOYMENT.md); HSTS should be set by the
  reverse proxy.

## Input & file handling

- All input is validated with Zod; Prisma parameterizes every query
  (no string-built SQL anywhere).
- Uploads: size limit (default 25 MiB), allowlisted types, magic-byte
  content checks that must match the claimed type, path-traversal-proof
  storage keys, immutable objects (overwrites refused), SHA-256 checksums.
- Malware-scanning provider interface; ClamAV adapter included
  (`MALWARE_SCANNER=clamav`). A failed scan blocks the upload.
- React escapes all output (XSS); no `dangerouslySetInnerHTML` is used.

## CSRF

- Mutations go through Next.js Server Actions, which are POST-only,
  same-origin enforced (Origin/Host checks built into Next.js) and carry
  non-guessable action ids. Auth.js applies its own CSRF token on the
  credentials endpoint. Cookies are SameSite=Lax.

## Secrets & sensitive data

- All secrets come from environment variables; none are committed.
- The omzetbelastingnummer (may contain the owner's BSN) and TOTP secrets
  are encrypted at the application layer (AES-256-GCM,
  `APP_ENCRYPTION_KEY`) and masked in the UI; revealing them is an audited
  action.
- Logs never contain query parameters, passwords, tokens or document
  contents; audit rows redact keys matching password/secret/token, and IPs
  are stored only as salted-purpose hashes.
- Signed, short-lived URLs for S3 objects (≤ 15 min); the bucket must be
  private. The local driver serves files only through the authenticated
  route.

## Rate limiting

- Persistent login limiter (above) plus in-memory sliding-window limits on
  registration and uploads. For multi-instance deployments put a reverse
  proxy limiter (e.g. nginx `limit_req`) in front as well.

## Audit trail

- Append-only `AuditLog` (actor, action, entity, old/new values, reason,
  hashed IP). The application has no update/delete path for audit rows.
- Recommended DB-level hardening for production:

```sql
REVOKE UPDATE, DELETE ON "AuditLog" FROM app_user;
```

(run as a superuser against the application role).

## Encryption at rest (design)

- Database: enable disk/volume encryption or PostgreSQL TDE at the
  infrastructure level; managed Postgres providers encrypt at rest by
  default.
- Object storage: the S3 driver requests SSE (AES256) per object; local
  storage should live on an encrypted volume.
- Application layer: only the most sensitive small fields are additionally
  encrypted (see above) so that database leaks do not expose them.

## Dependency & platform notes

- `pnpm audit` in CI is recommended; dependencies are pinned via the
  lockfile.
- Prisma migrations are the only schema-change mechanism.

## Reporting a vulnerability

Self-hosted software: report issues to the repository owner privately.
