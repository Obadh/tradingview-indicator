# Implementation plan

Personal bookkeeping and document organization for a Dutch eenmanszaak
(sole proprietor building mobile apps and websites).

> The application assists with bookkeeping. It does **not** replace a
> bookkeeper, accountant, or tax adviser, and it never presents tax
> estimates as final amounts.

## Architecture at a glance

- **Next.js (App Router) + TypeScript strict.** Server Components for data
  display, Server Actions + route handlers for mutations, React Hook Form +
  Zod on interactive forms.
- **PostgreSQL + Prisma.** All money is integer euro cents; percentages are
  basis points; exchange rates are exact decimals. UUID identifiers.
- **Double-entry underneath, simple UI on top.** Every finalized financial
  event writes balanced journal lines (`Transaction` + `TransactionLine`
  against a minimal chart of accounts). The normal UI shows plain
  income/expense forms; an advanced journal view exposes the ledger.
- **Documents are immutable.** Originals are stored once under a
  content-addressed key with a SHA-256 checksum, versions are additive, and
  deletion only happens through the explicit retention flow with an audit
  record.
- **Everything auditable.** A central `audit()` helper records actor,
  timestamp, old/new values, reason, and hashed IP/session for every change
  to financial data. The app has no code path that updates or deletes audit
  rows.
- **Privacy first.** No analytics, no external calls by default. OCR and
  malware scanning are provider interfaces; the only bundled OCR provider is
  a local deterministic stub. External providers require explicit opt-in
  with a stored consent timestamp.
- **Versioned VAT rules.** VAT rates/treatments and their Dutch return-box
  mappings live in the `VATCode` table (`rulesVersion`, `validFrom`), not in
  UI code.
- **Storage abstraction.** `StorageDriver` interface with a local filesystem
  driver (development) and an S3 driver (production, presigned URLs, private
  bucket).
- **Single user now, multi-tenant later.** Every row carries `businessId`;
  access goes through `Membership` (role OWNER today, ACCOUNTANT/READONLY
  reserved). All queries are scoped by the authenticated membership.

## Repository layout

```
bookkeeping/
  prisma/            schema, migrations, seed (demo data, clearly fictional)
  src/
    app/             App Router routes
      (auth)/        login, register, MFA
      (app)/         authenticated app (dashboard, documents, money, ...)
      api/           auth, upload/download, export streaming
    components/      UI (shadcn-style primitives in components/ui)
    lib/
      domain/        pure domain logic: money, vat, journal, sequencing,
                     reconciliation, depreciation, retention (fully unit-tested)
      server/        db, auth, audit, storage, ocr, malware, rate limiting
      validation/    zod schemas shared by forms and actions
    server/actions/  server actions per domain
  tests/             vitest unit tests (domain logic)
  e2e/               Playwright end-to-end tests
  docs/              all project documentation
```

## Phases

1. **Foundation (this phase).** Scaffold, Prisma schema + first migration,
   plan, assumptions register, folder structure.
2. **Auth & onboarding.** Credentials auth (bcrypt) with optional TOTP,
   registration limited to the first user, rate limiting, security headers,
   storage drivers, onboarding wizard, app shell.
3. **Money & documents.** Document upload (checksum, dedupe, categories,
   preview/download), expense and income workflows with journal generation,
   owner contributions/withdrawals/transfers, bank accounts, CSV import
   wizard, reconciliation.
4. **VAT & output.** VAT periods and preparation summary, period locking and
   corrections, sales invoices with sequential numbering + PDF + credit
   notes, reports with CSV/XLSX/PDF/JSON export, export-administration ZIP.
5. **Quality.** Tests (unit + e2e), full documentation set, demo seed data,
   accessibility pass, security review.

After every phase: `pnpm typecheck && pnpm lint && pnpm test`.

## Deliberately deferred (visible, documented)

- CAMT.053 / MT940 import (CSV wizard ships first; interface allows adding
  parsers).
- Automatic VAT filing (v1 prepares a summary only, by design).
- External OCR providers (interface + consent flow ship; only local stub
  bundled).
- Background job queue (document processing is fast enough inline for v1; an
  in-process queue abstraction exists for the export job).
