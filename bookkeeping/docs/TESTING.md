# Testing

## Layers

1. **Unit tests (Vitest)** — `tests/*.test.ts`, pure domain logic:
   - money: exact parsing (comma/dot/thousands), half-up VAT rounding at
     21%/9%, net-from-gross, basis-point allocation (business+private always
     sums to the whole), exact decimal currency conversion;
   - journals: balance enforcement, multi-rate purchase invoices, mixed-use
     splits, EU-service/reverse-charge self-assessment, foreign VAT as cost,
     platform payouts with fees, owner contribution/withdrawal/transfer
     never touching P&L, depreciation entries;
   - VAT: period summary per Dutch return box, reverse-charge in-and-out,
     recovery percentages, exclusion of needs-review/UNKNOWN records,
     zero-period, typical deadline calculation;
   - reconciliation: explainable scoring, partial payments, direction
     rules, duplicate fingerprints; bank-CSV parsing incl. ING Af/Bij
     format and per-row error collection;
   - invoice validation: missing fields, duplicate numbers, VAT mismatch
     tolerance, country/treatment conflicts, pre-registration dates,
     personally-addressed invoices;
   - depreciation schedules (exact totals, rounding in final month),
     retention dates, export filename sanitization, completeness score.

   ```bash
   pnpm test          # or pnpm test:watch
   ```

2. **End-to-end (Playwright)** — `e2e/journey.spec.ts` drives the complete
   owner journey in order: register + onboard → upload Apple invoice →
   pre-registration expense paid personally (fields confirmed) → KVK fee →
   owner contribution → bank CSV import (mapping wizard) → explainable
   match confirmation → App Store payout with commission → quarterly VAT
   preparation summary (with review-blocking) → full administration ZIP
   export with download.

   Requirements: local Postgres reachable via `E2E_DATABASE_URL`
   (default `...localhost:5432/bookkeeping_e2e`) and a production build:

   ```bash
   pnpm build
   pnpm test:e2e
   ```

   The web-server script drops and recreates the dedicated e2e database on
   every run — it never touches development data. If your environment
   provides its own Chromium, point `PLAYWRIGHT_CHROMIUM_PATH` at it.

3. **Static checks** — `pnpm typecheck` (strict TS) and `pnpm lint`.

`pnpm verify` runs typecheck + lint + unit tests.

## Determinism

- All money assertions are integer-cent equalities; no floating point.
- The stub OCR provider is deterministic; e2e fixtures are generated
  in-test (tiny PDFs/CSVs), so runs are reproducible offline.

## Adding tests

Domain logic goes in `src/lib/domain/**` and must be covered by unit tests
in `tests/`. Server actions should stay thin; when an action grows logic,
extract it into the domain layer and test it there.
