#!/usr/bin/env bash
# Reset the dedicated e2e database + storage, migrate, then start the app.
# Invoked by playwright.config.ts as the webServer command.
set -euo pipefail

E2E_DATABASE_URL="${DATABASE_URL:?DATABASE_URL must be set by playwright.config.ts}"
DB_NAME="${E2E_DATABASE_URL##*/}"
ADMIN_URL="${E2E_DATABASE_URL%/*}/postgres"

psql "$ADMIN_URL" -q -c "DROP DATABASE IF EXISTS ${DB_NAME}" -c "CREATE DATABASE ${DB_NAME}"
pnpm exec prisma migrate deploy
rm -rf ./var/e2e-storage

exec pnpm exec next start -p 3100
