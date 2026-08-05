# Postgres Deployment Boundary

This document describes the production boundary. It is not a shortcut for turning a local demo into a hosted tenant service.

## Local development

Local development may use the in-memory repository or a disposable local Postgres database. It must use mock or anonymous data only. Do not put real identity documents, contracts, income data, or client contact information into a local tunnel environment.

```bash
DATA_DRIVER=postgres
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/broker_desk_dev
npm run db:migrate
```

The local database must be separate from staging and production. The application only uses the in-memory repository outside production; production deliberately refuses that fallback.

## Production prerequisites

Before starting a production runtime, configure all of the following in the cloud secret manager. Do not store any of these values in the repository.

```bash
NODE_ENV=production
DATA_DRIVER=postgres
DATABASE_URL=postgresql://RUNTIME_ROLE:PASSWORD@HOST:5432/broker_desk_production
BROKER_DESK_AUTH_MODE=clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...
CLERK_SECRET_KEY=...
ATTACHMENT_STORAGE_MODE=object_private
BROKER_DESK_ATTACHMENT_SIGNED_URL_ENDPOINT=...
DOCUMENT_READING_PROVIDER=remote
DOCUMENT_READING_ENDPOINT=...
DOCUMENT_READING_API_TOKEN=...
BROKER_DESK_PRODUCTION_DATA_RUNTIME_APPROVED=true
```

`BROKER_DESK_PRODUCTION_DATA_RUNTIME_APPROVED=true` is an operational release gate, not an application setting to enable early. Set it only after the migration, RLS negative test, backup restore test, private object-store test, and operational checklist in `docs/operations/P0_PRODUCTION_READINESS_RUNBOOK_2026_07_29.md` are complete.

Production authentication is Clerk only. The development-only demo and trusted-header modes are intentionally disabled when `NODE_ENV=production`.

## Database migration workflow

SQL migrations are immutable files in `db/migrations/`. The application does not create or alter production tables on first request.

1. Use a dedicated migration role that can perform DDL. Keep the runtime role unable to alter schema and without `BYPASSRLS`.
2. Backup the database and verify the target environment.
3. Run migrations once:

```bash
NODE_ENV=production BROKER_DESK_RUN_MIGRATIONS=true DATABASE_URL=... npm run db:migrate
```

4. Confirm `broker_desk_schema_migrations` records every migration with its checksum.
5. Run the RLS cross-tenant negative test as the runtime application role.
6. Only then enable `BROKER_DESK_PRODUCTION_DATA_RUNTIME_APPROVED=true` for the runtime service.

Editing an applied migration is rejected by its checksum. Add a new migration instead.

## Health endpoint

`/api/health/data` returns only a generic availability state. It never exposes a database driver, database host, migration error, or stack trace. Detailed diagnostics belong in protected logs and alerting.

## Data isolation

RLS is defined in `db/migrations/20260727_001_tenant_rls.sql`. Tenant access is derived from:

```text
Clerk session -> users.external_auth_subject -> active tenant_memberships -> tenant_id
```

The runtime must execute requests as a role subject to RLS. A privileged provider service key or database owner connection is not an acceptable tenant-runtime role because it can bypass RLS.

## Attachments and document reading

Production attachments must live in a private object store and be delivered only through tenant-authorized, short-lived access. Local private files are a development implementation only.

The current macOS-native identity document reader is development-only. Production document reading must be submitted to the configured remote service and processed asynchronously; it must not depend on a local Swift or macOS executable.
