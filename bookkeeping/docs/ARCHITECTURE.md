# Architecture

## Stack

Next.js (App Router, React Server Components) · TypeScript strict ·
Tailwind CSS + shadcn-style components · PostgreSQL + Prisma · Auth.js
(credentials + TOTP) · Zod · Vitest · Playwright · pnpm.

## Layering

```
src/lib/domain/     Pure, dependency-free domain logic (fully unit tested):
                    money (integer cents, bigint math), vat (versioned
                    rules + period summary), journal (chart of accounts,
                    balanced journal builders), reconciliation (explainable
                    matching), bank-csv, depreciation, retention,
                    invoice-validation, filenames, dates, completeness.
src/lib/server/     Infrastructure: prisma client, auth, crypto
                    (AES-256-GCM field encryption, SHA-256), audit,
                    rate limiting, storage drivers (local/S3), OCR and
                    malware provider interfaces, invoice PDF, reports,
                    export ZIP, dashboard/vat/transaction queries.
src/server/actions/ Server actions per feature = the write API. Every
                    action: authenticates, scopes by membership, validates
                    with Zod, delegates to domain logic, audits.
src/app/            Routes. Server components read; client components are
                    small islands (forms, wizards). API route handlers only
                    where streams/files are involved (upload, file serving,
                    report downloads, auth).
```

## Key invariants

1. **Money is integer cents.** Parsing goes through string decomposition;
   multiplication/division through bigint with half-up rounding
   (`src/lib/domain/money.ts`). Percentages are basis points (0–10000).
   Exchange rates are exact decimal strings (Prisma `Decimal(20,10)`).
2. **Double-entry always balances.** `Transaction` is the financial event;
   `TransactionLine` rows are its journal (exactly one of debit/credit per
   line). `assertBalanced` runs when journals are built *and* inside every
   persistence path; a transaction cannot reach CONFIRMED/RECONCILED/LOCKED
   unbalanced.
3. **Owner flows never touch profit.** Contribution = Dr bank / Cr owner
   contributions (equity). Withdrawal = Dr owner withdrawals / Cr bank.
   Own transfer = asset ↔ asset. Unit tests assert no P&L account appears.
4. **Documents are immutable.** Version 1 is the original; storage drivers
   refuse overwrites (`wx` flag / S3 exists-check); derived files are new
   versions. Deletion exists only in the audited retention flow.
5. **Locked periods are closed.** Marking a VAT period filed locks it and
   its transactions; edits then require `CORRECTION` transactions dated in
   an open period, linked via `correctsTransactionId`.
6. **Everything is audited.** `audit()` writes actor, action, entity,
   old/new values (sensitive keys redacted), reason, hashed IP. There is no
   update/delete code path for audit rows.
7. **Suggestions are never data.** OCR extraction, VAT-code defaults, match
   suggestions and asset suggestions all require explicit confirmation, and
   uncertain international records are forced into "needs tax review".

## Multi-tenant readiness

Every domain row carries `businessId`. Access goes through `Membership`
(role OWNER; ACCOUNTANT/READONLY reserved). `requireBusiness()` resolves the
caller's membership and every query filters on that `businessId` —
client-supplied business ids are never trusted. Adding multi-company or
accountant access later means: allow multiple memberships per user, add a
business switcher, and enforce role checks in the actions.

## VAT rules versioning

VAT rates/treatments and Dutch return-box mappings live in the `VATCode`
table (`rulesVersion`, `validFrom`/`validTo`), seeded from
`DEFAULT_VAT_CODES`. A rate change is new rows with a new `validFrom`; the
period summary records which `rulesVersion` produced it, and locked periods
snapshot their summary JSON.

## Background work

The export runs as a tracked `ExportJob` (status, params, checksum,
summary). It executes inline today — fine for a single user — but the job
table and status model let a queue be introduced without schema changes.
Document processing (checksum, validation, optional stub extraction) is
fast enough to run in the upload request.

## Status models

- Document: UPLOADED → PROCESSING → NEEDS_REVIEW → CONFIRMED → ARCHIVED
- Transaction: DRAFT → NEEDS_REVIEW → CONFIRMED → RECONCILED → LOCKED,
  plus CORRECTED (superseded) and VOID (audited, never silent)
- Tax period: NOT_PREPARED → IN_PROGRESS → READY_FOR_REVIEW →
  FILED_MANUALLY (locked) → CORRECTED
