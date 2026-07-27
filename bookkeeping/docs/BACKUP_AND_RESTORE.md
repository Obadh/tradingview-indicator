# Backup and restore

A complete backup consists of **both**:

1. the PostgreSQL database (all records, audit log, checksums), and
2. the document storage (original uploaded files and export ZIPs).

One without the other is not a usable administration.

## Manual encrypted backup (recommended monthly, and before upgrades)

```bash
STAMP=$(date +%F)
# 1. Database
pg_dump "$DATABASE_URL" -Fc -f "backup-$STAMP.dump"

# 2. Documents (local driver; for S3 see below)
tar -czf "backup-$STAMP-storage.tar.gz" -C bookkeeping/var storage

# 3. Encrypt both (age or gpg; example with age)
age -p -o "backup-$STAMP.dump.age" "backup-$STAMP.dump"
age -p -o "backup-$STAMP-storage.tar.gz.age" "backup-$STAMP-storage.tar.gz"
shred -u "backup-$STAMP.dump" "backup-$STAMP-storage.tar.gz"
```

Store the encrypted files off-machine (external disk + one off-site copy).
Also back up your `.env` **secrets** (`AUTH_SECRET`, `APP_ENCRYPTION_KEY`)
in a password manager — without `APP_ENCRYPTION_KEY` the encrypted fields
(omzetbelastingnummer, TOTP secrets) are unrecoverable.

### S3 storage

Use bucket versioning + replication, or mirror periodically:

```bash
aws s3 sync s3://my-bucket "backup-$STAMP-storage/" --source-region eu-central-1
```

## Restore procedure

```bash
# 1. Fresh database
createdb bookkeeping
age -d backup-2026-07-01.dump.age > backup.dump
pg_restore -d "$DATABASE_URL" --clean --if-exists backup.dump

# 2. Documents
age -d backup-2026-07-01-storage.tar.gz.age | tar -xzf - -C bookkeeping/var

# 3. Same APP_ENCRYPTION_KEY and AUTH_SECRET in .env, then:
pnpm db:generate && pnpm build && pnpm start
```

## Integrity check

Every document row stores the SHA-256 of its original file. After a restore
(or periodically), verify storage against the database:

```bash
psql "$DATABASE_URL" -At -c \
  'SELECT "sha256" || \'  \' || \'var/storage/\' || "storageKey" FROM "Document" WHERE "deletedAt" IS NULL' \
  | sha256sum -c -
```

Any mismatch means the stored file differs from what was originally
uploaded — investigate before trusting that document.

The export ZIP also contains `audit/document-checksums.csv` so a bookkeeper
can verify integrity independently (`sha256sum -c` against the exported
files).

## Backup reminders

The Reminder model includes a `BACKUP` kind; create one (Settings →
reminders are listed on the dashboard) at your preferred cadence. The app
deliberately does not auto-upload backups anywhere — that would conflict
with the privacy-first design.

## Disaster recovery

1. Provision Postgres + Node host (see DEPLOYMENT.md).
2. Restore the database and storage as above.
3. Restore `.env` secrets from your password manager.
4. Run the integrity check.
5. Sign in and verify: dashboard totals, a few documents open correctly,
   the latest export job is present.

Recovery point = your last backup; keep at least 3 generations.
