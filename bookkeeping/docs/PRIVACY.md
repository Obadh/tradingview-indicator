# Privacy

This application is privacy-first and designed for self-hosting: your
financial administration stays on infrastructure you control.

## Defaults

- **No analytics, no telemetry, no external calls.** The CSP forbids the
  browser from talking to any third-party origin; the server makes no
  outbound requests in its default configuration (no exchange-rate feeds,
  no CDN assets, no fonts).
- **No external OCR.** Document extraction is off by default. The only
  bundled provider is a local stub that never touches the network.
- **User documents are never used to train AI models.**

## Consent

- Enabling document extraction requires an explicit consent checkbox in
  Settings; the consent timestamp and provider name are stored
  (`ocrConsentAt`) and the change is audit-logged.
- If a future external provider is configured, files are only sent after
  that same explicit consent, and this is stated in the consent text.
- Exports optionally include the decrypted omzetbelastingnummer only when
  the owner ticks a checkbox per export.

## Personal bank data

- Personal-account CSV imports are parsed transiently; only the lines the
  user explicitly selects are stored, the full statement is not retained,
  and the wizard warns about the privacy implications. Unrelated private
  transactions never become bookkeeping entries.

## Data subject controls

- **Export**: the "Export administration" wizard produces a complete ZIP
  (all documents + machine-readable data); reports export as JSON.
- **Deletion**: Settings → "Delete account & administration" (typed
  confirmation) marks the account and business deleted and is audited.
  Because Dutch law generally requires keeping the administration for 7
  years even after stopping, hard deletion is a deliberate second step for
  the operator:
  1. secure a final export,
  2. delete DB rows for the business (or drop the database),
  3. delete the storage prefix `businesses/<id>/`,
  4. destroy backups per your retention policy.
- **Retention**: documents past the retention period are deletable only
  through the audited retention flow (typed confirmation, professional-
  confirmation checkbox, audit record).

## Data minimization

- IP addresses are never stored raw (only purpose-prefixed SHA-256 hashes
  for rate limiting/audit).
- Sensitive identifiers are masked in the UI; revealing is audited.
- Logs exclude query parameters and document contents.

## Privacy notice template (for the owner's own records)

> PixelForge Apps (example) processes its business administration with a
> self-hosted bookkeeping application. Data stored: business contacts,
> invoices, bank transaction lines selected as business-related, and
> uploaded business documents. Legal basis: legal obligation (fiscale
> bewaarplicht) and legitimate interest (running the business). Retention:
> 7 years (bookkeeping) unless a longer statutory period applies. No data
> is shared with third parties except the bookkeeper/tax adviser and the
> Belastingdienst when legally required. Hosting: self-hosted at
> <provider/location>. Contact: <owner email>.
