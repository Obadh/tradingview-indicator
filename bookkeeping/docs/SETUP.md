# Setup

## Prerequisites

- Node.js 20+ (22 recommended)
- pnpm 9+ (`corepack enable`)
- Docker (for local PostgreSQL) or a PostgreSQL 15+ server

## 1. Configure environment

```bash
cd bookkeeping
cp .env.example .env
```

Generate the two secrets (both required):

```bash
openssl rand -base64 32   # -> AUTH_SECRET
openssl rand -base64 32   # -> APP_ENCRYPTION_KEY (must be 32 bytes base64)
```

`APP_ENCRYPTION_KEY` encrypts the omzetbelastingnummer and TOTP secrets at
the application layer. **Losing it makes those fields unreadable**; store it
in your password manager.

All variables are documented inline in [.env.example](../.env.example).

## 2. Database

```bash
pnpm db:up        # starts postgres:16 via docker compose (port 5432)
pnpm db:migrate   # applies prisma/migrations
```

Without Docker: create a database and set `DATABASE_URL` accordingly, then
run `pnpm db:migrate`.

## 3. Run

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

On first visit, register the owner account (registration closes itself
afterwards), then complete the onboarding wizard.

### Demo data (optional, fictional)

```bash
pnpm db:seed
```

Creates `demo@example.com` / `demo-password-123456` with clearly-marked
fictional records (KVK test number range, example.com, `[DEMO]` prefixes).
Never run the seed against a production database.

## 4. Document storage

Development default is the local filesystem (`STORAGE_DRIVER=local`,
files under `var/storage/`, git-ignored). For production use any
S3-compatible service:

```
STORAGE_DRIVER=s3
S3_ENDPOINT=...        # empty for AWS
S3_REGION=eu-central-1
S3_BUCKET=my-private-bucket
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_FORCE_PATH_STYLE=true   # MinIO/Scaleway; false for AWS
```

The bucket must be private; the app only ever hands out short-lived
presigned URLs. A local MinIO is available via
`docker compose --profile s3 up -d minio`.

## 5. Optional providers (privacy-first: all off by default)

- `OCR_PROVIDER=stub` — local, deterministic text extraction (no network).
  The user must additionally enable extraction in Settings and consent.
  `none` (default) disables extraction entirely; the app is fully usable
  without it.
- `MALWARE_SCANNER=clamav` with `CLAMD_SOCKET=/var/run/clamav/clamd.ctl`
  scans uploads via a local ClamAV daemon; failures block the upload.

## 6. Verify the installation

```bash
pnpm verify       # typecheck + lint + unit tests
pnpm test:e2e     # full browser journey (uses a separate e2e database)
```
