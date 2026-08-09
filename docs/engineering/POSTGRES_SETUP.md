# Postgres Deployment Boundary

This document describes the production boundary. It is not a shortcut for turning a local demo into a hosted tenant service.

## Local development

Local development may use the in-memory repository or a disposable local Postgres database. It must use mock or anonymous data only. Do not put real identity documents, contracts, income data, or client contact information into a local tunnel environment.

```bash
DATA_DRIVER=postgres
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/broker_desk_dev
npm run db:migrate
```

For the shared pre-production beta, use a managed cloud Postgres database before application hosting is set up. The application server can remain local while it connects to the shared database. Runtime schema changes are forbidden: apply `npm run db:migrate` first, then start the application.

## Initial platform owner bootstrap

The first platform owner is a controlled one-time operation. Do not make the first Clerk user who signs in an owner automatically.

1. The intended owner signs in through Clerk once, so a local `users` row is created and linked to their external identity.
2. With the shared database connection configured locally, run:

```bash
node --env-file=.env.local scripts/bootstrap-initial-platform-owner.mjs --email=OWNER_EMAIL
```

For an empty beta database with exactly one real Clerk user, the controlled alternative avoids placing an email in shell history:

```bash
node --env-file=.env.local scripts/bootstrap-initial-platform-owner.mjs --latest-clerk-user
```

The script refuses to run if the email has not completed a Clerk sign-in, if the controlled alternative finds anything other than exactly one real Clerk user, or if an active platform owner already exists. It creates a dedicated internal workspace and one active `platform_owner` membership. That active membership is the normal authorization source for the platform account and official-template pages. `BROKER_DESK_PLATFORM_OWNER_IDS` is only a controlled bootstrap/recovery allow-list. Use `/platform/accounts` after that point to create tenant accounts and invite customer owners.

The local database must be separate from staging and production. The application only uses the in-memory repository outside production; production deliberately refuses that fallback.

## Production prerequisites

Before starting a production runtime, configure all of the following in the cloud secret manager. Do not store any of these values in the repository.

```bash
NODE_ENV=production
DATA_DRIVER=postgres
DATABASE_URL=postgresql://brokerdesk_runtime:PASSWORD@HOST:5432/broker_desk_production?sslmode=verify-full
# Webhook-only account lifecycle connection. Do not use in page requests.
DATABASE_ADMIN_URL=postgresql://brokerdesk_admin:PASSWORD@HOST:5432/broker_desk_production?sslmode=verify-full
BROKER_DESK_AUTH_MODE=clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...
CLERK_SECRET_KEY=...
# Optional but recommended: Clerk JWT public key for networkless session verification.
CLERK_JWT_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
# Closed beta currently supports private database-backed attachments.
# object_private remains a future adapter and is deliberately rejected until implemented.
ATTACHMENT_STORAGE_MODE=postgres_private
DOCUMENT_READING_PROVIDER=remote
DOCUMENT_READING_ENDPOINT=...
DOCUMENT_READING_API_TOKEN=...
DOCUMENT_READING_ALLOWED_HOSTS=reader.example.com
BROKER_DESK_IMPORT_WORKER_ENABLED=true
BROKER_DESK_IMPORT_WORKER_SCHEDULE="every 1 minute"
BROKER_DESK_IMPORT_WORKER_TOKEN=at-least-32-random-characters
BROKER_DESK_APP_URL=https://app.example.com
BROKER_DESK_EDGE_RATE_LIMIT_ENFORCED=true
BROKER_DESK_EDGE_RATE_LIMIT_POLICY_ID=public-beta-v1
BROKER_DESK_PRODUCTION_DATA_RUNTIME_APPROVED=true
```

`BROKER_DESK_PRODUCTION_DATA_RUNTIME_APPROVED=true` is an operational release gate, not an application setting to enable early. Set it only after migration, RLS negative testing, backup restore testing, private attachment access testing, import-worker testing, and the release checklist are complete.

Production authentication is Clerk only. The development-only demo and trusted-header modes are intentionally disabled when `NODE_ENV=production`.

## Database migration workflow

SQL migrations are immutable files in `db/migrations/`. The application does not create or alter production tables on first request.

1. Use a dedicated migration role that can perform DDL. Keep the runtime role unable to alter schema and without `BYPASSRLS`. The webhook-only admin role is separate from both roles.
2. Backup the database and verify the target environment.
3. Run migrations once:

```bash
NODE_ENV=production BROKER_DESK_RUN_MIGRATIONS=true DATABASE_MIGRATION_URL=... npm run db:migrate
```

4. Confirm `broker_desk_schema_migrations` records every migration with its checksum.
5. Run the RLS cross-tenant negative test as the runtime application role.
6. Only then enable `BROKER_DESK_PRODUCTION_DATA_RUNTIME_APPROVED=true` for the runtime service.

Editing an applied migration is rejected by its checksum. Add a new migration instead.

## Runtime roles

The current database owner is suitable for local migration work only. It must
not be used by a hosted application process because database owners can bypass
RLS. Before a public beta, create the two constrained login roles described in
[`postgres_runtime_roles.sql`](postgres_runtime_roles.sql):

- `brokerdesk_runtime`: page and server-action queries only; subject to RLS.
- `brokerdesk_admin`: Clerk webhook lifecycle calls and the import worker's
  atomic queue claim only; it has no direct access to business tables.

Run the role script as the migration role after applying migrations. It needs
two newly generated, unique passwords passed through `psql` variables; do not
place them in source control. Then configure `DATABASE_URL` with
`brokerdesk_runtime` and `DATABASE_ADMIN_URL` with `brokerdesk_admin`.

The application verifies that neither account has `SUPERUSER` or `BYPASSRLS`
in production. Until this is completed, production mode deliberately refuses
to start against an owner connection such as `neondb_owner`.

Before enabling a public runtime, run the same check with the runtime
connection, not the migration connection:

```bash
DATABASE_URL=postgresql://brokerdesk_runtime:... npm run test:postgres-rls
```

It is read-only. A failure for `neondb_owner` is expected and confirms that
the owner connection has not accidentally been accepted as the application
role.

## Health endpoint

`/api/health/data` returns only a generic availability state. It never exposes a database driver, database host, migration error, or stack trace. Detailed diagnostics belong in protected logs and alerting.

## Data isolation

RLS is defined in `db/migrations/20260727_001_tenant_rls.sql`. Tenant access is derived from:

```text
Clerk session -> users.external_auth_subject -> active tenant_memberships -> tenant_id
```

The runtime must execute requests as a role subject to RLS. A privileged provider service key or database owner connection is not an acceptable tenant-runtime role because it can bypass RLS.

The Clerk webhook uses `DATABASE_ADMIN_URL` only to bind or suspend a local user identity and activate an already-created invitation. It is not available to page rendering, server actions, or tenant repositories. This separation is required because webhook delivery has no end-user Clerk session from which an RLS scope can be derived.

## Attachments and document reading

For the current closed-beta architecture, `postgres_private` stores attachment bytes in the tenant-scoped database and serves them only after session authorization. It is a deliberate low-operations choice for a limited beta, not an unlimited file-storage strategy. Before broad rollout, replace it with a tested private object-storage adapter and retention lifecycle.

The current macOS-native identity document reader is development-only. Production document reading must be submitted to a configured HTTPS remote service and processed asynchronously; it must not depend on a local Swift or macOS executable. The reader endpoint must appear in `DOCUMENT_READING_ALLOWED_HOSTS`; arbitrary endpoint URLs are rejected. Worker deployment, authentication, retries and failure handling are defined in [`../operations/IMPORT_WORKER_RUNBOOK.md`](../operations/IMPORT_WORKER_RUNBOOK.md).
