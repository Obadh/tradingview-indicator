# Eenmanszaak boekhouding

Personal bookkeeping and document organization for a Dutch sole proprietor
(eenmanszaak) who builds mobile apps and websites.

> **Important.** This software assists with bookkeeping. It does **not**
> replace a bookkeeper, accountant, or tax adviser. All VAT and income-tax
> figures are estimates for preparation, never final amounts, and the app
> never files anything with the Belastingdienst.

## What it does

- **Documents** — upload invoices/receipts (PDF, JPG, PNG, HEIC, XML/UBL,
  CSV) with drag-and-drop or phone camera. Originals are preserved
  byte-for-byte with SHA-256 checksums; duplicates are detected; nothing is
  ever overwritten.
- **Expenses & income** — plain-English forms with per-line VAT rates,
  foreign currencies with explicit exchange rates, mixed business/private
  use, pre-registration (aanloopkosten) flagging, platform payouts with
  commissions.
- **Owner flows** — private deposits, withdrawals and own-account transfers
  that can never touch profit.
- **Banking** — CSV import with a column-mapping wizard (ING/Rabobank/bunq
  presets), duplicate detection, and explainable match suggestions.
  Personal accounts keep only the business lines you select.
- **VAT** — versioned VAT codes, quarterly/monthly/yearly preparation
  summaries mapped to the Dutch return boxes, period locking after manual
  filing, corrections with a full audit trail, zero-return reminders.
- **Invoices** — compliant sales invoices with gapless sequential numbers,
  immutable finalized PDFs, credit notes for corrections, reverse-charge
  wording for EU B2B.
- **Reports & export** — 17 reports (CSV/XLSX/PDF/JSON) and an "export
  administration" ZIP with originals, ledgers, checksum manifest, audit log
  and README for your bookkeeper or a requested inspection.
- **Double-entry underneath** — every finalized event books balanced journal
  lines; an advanced journal view is one click away.
- **Audit trail** — every change to financial data records who, when, old
  and new values, and why. Audit records cannot be edited from the app.

## Quick start

```bash
cd bookkeeping
cp .env.example .env       # then edit: generate AUTH_SECRET and APP_ENCRYPTION_KEY
pnpm install
pnpm db:up                 # local PostgreSQL via docker compose
pnpm db:migrate            # apply migrations
pnpm db:seed               # optional: fictional demo data
pnpm dev                   # http://localhost:3000
```

Demo login after seeding: `demo@example.com` / `demo-password-123456`
(all seeded records are clearly marked `[DEMO]` and use test identifiers).

See [docs/SETUP.md](docs/SETUP.md) for full setup, including S3 storage and
optional providers.

## Verification

```bash
pnpm typecheck   # TypeScript strict
pnpm lint        # ESLint
pnpm test        # unit tests (money, VAT, journals, reconciliation, ...)
pnpm test:e2e    # Playwright end-to-end journey (needs Postgres running)
pnpm build       # production build
```

## Documentation

| File | Contents |
| --- | --- |
| [docs/SETUP.md](docs/SETUP.md) | Local setup, environment variables, providers |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, data model, domain rules |
| [docs/SECURITY.md](docs/SECURITY.md) | Security measures and hardening guidance |
| [docs/PRIVACY.md](docs/PRIVACY.md) | Privacy controls, consent, data deletion |
| [docs/BACKUP_AND_RESTORE.md](docs/BACKUP_AND_RESTORE.md) | Backups, restore, integrity checks |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Production deployment |
| [docs/TESTING.md](docs/TESTING.md) | Test strategy and how to run tests |
| [docs/DUTCH_BOOKKEEPING_ASSUMPTIONS.md](docs/DUTCH_BOOKKEEPING_ASSUMPTIONS.md) | Every tax/bookkeeping assumption, classified |
| [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) | Phased implementation plan |

## Known limitations (deliberate, visible)

- CAMT.053 / MT940 bank imports are not implemented yet (CSV wizard covers
  all banks; the import model already stores the format).
- VAT returns are prepared, never submitted — by design in v1.
- No external OCR provider is bundled; the interface + consent flow exist,
  and a local deterministic stub (`OCR_PROVIDER=stub`) works offline.
- Malware scanning defaults to off; a ClamAV adapter is included
  (`MALWARE_SCANNER=clamav`).
- Single user per installation; the data model already supports multiple
  businesses and accountant roles for later.
