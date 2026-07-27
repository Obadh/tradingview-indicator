# Deployment

The application is designed for **self-hosting** (privacy-first). Any Node
20+ host with PostgreSQL works: a small VPS, a home server, or a PaaS you
trust with your financial data.

## Production checklist

1. **HTTPS only.** Terminate TLS at a reverse proxy (Caddy/nginx/Traefik)
   and add HSTS. Example (Caddy):

   ```
   boekhouding.example.com {
     reverse_proxy 127.0.0.1:3000
     header Strict-Transport-Security "max-age=31536000; includeSubDomains"
   }
   ```

2. **Environment.** Set in the service environment (never in git):
   - `DATABASE_URL` (dedicated role; see AuditLog hardening in SECURITY.md)
   - `AUTH_SECRET`, `APP_ENCRYPTION_KEY` (32-byte random, backed up!)
   - `AUTH_URL=https://boekhouding.example.com`
   - `ALLOW_REGISTRATION=false` **after** creating the owner account
   - `STORAGE_DRIVER=s3` + S3 credentials (private bucket), or `local`
     with the storage path on an encrypted, backed-up volume
   - optional: `MALWARE_SCANNER=clamav`, `OCR_PROVIDER=stub`

3. **Build & run.**

   ```bash
   pnpm install --frozen-lockfile
   pnpm db:deploy          # prisma migrate deploy
   pnpm build
   pnpm start              # or a systemd unit / container
   ```

   Example systemd unit:

   ```ini
   [Unit]
   Description=Bookkeeping
   After=network.target postgresql.service

   [Service]
   WorkingDirectory=/srv/bookkeeping
   EnvironmentFile=/etc/bookkeeping.env
   ExecStart=/usr/bin/pnpm start
   Restart=on-failure
   User=bookkeeping
   NoNewPrivileges=true
   ProtectSystem=strict
   ReadWritePaths=/srv/bookkeeping/var

   [Install]
   WantedBy=multi-user.target
   ```

4. **Database.** Postgres 15+; enable at-rest encryption at the volume or
   provider level; apply the AuditLog `REVOKE` from SECURITY.md; schedule
   `pg_dump` backups (BACKUP_AND_RESTORE.md).

5. **Upgrades.**

   ```bash
   # 1. Backup first (BACKUP_AND_RESTORE.md)
   git pull
   pnpm install --frozen-lockfile
   pnpm db:deploy
   pnpm build && systemctl restart bookkeeping
   ```

6. **Monitoring.** Watch disk space (uploads + Postgres), the systemd
   journal for `error` lines (logs contain no sensitive values), and make a
   habit of checking the in-app audit log.

## Container option

A minimal Dockerfile approach: `node:22-slim`, copy the repo, `pnpm install
--frozen-lockfile && pnpm build`, run `pnpm start` with the environment
above, mount `var/storage` as a volume. Compose it with the provided
`docker-compose.yml` Postgres service.

## What NOT to do

- Do not expose Postgres or MinIO publicly.
- Do not run with `ALLOW_REGISTRATION=true` after the owner exists.
- Do not put the app behind third-party analytics/CDN injection — the CSP
  will (intentionally) break such injections.
