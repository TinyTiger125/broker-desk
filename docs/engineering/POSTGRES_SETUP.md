# Postgres Setup

## 1) Configure env
Edit `.env`:

```bash
DATA_DRIVER=postgres
DATABASE_URL=postgresql://USER:PASSWORD@HOST:6543/postgres?sslmode=require
```

If `DATA_DRIVER` is not `postgres` or `DATABASE_URL` is empty, app will use in-memory mode.

Production auth must not rely on the local demo actor fallback.

Selected production path:

```bash
DATA_DRIVER=postgres
BROKER_DESK_AUTH_MODE=clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=replace-with-clerk-publishable-key
CLERK_SECRET_KEY=replace-with-clerk-secret-key
CLERK_WEBHOOK_SIGNING_SECRET=replace-when-webhooks-are-enabled
BROKER_DESK_PLATFORM_OWNER_IDS=comma-separated-local-user-ids-or-clerk-user-ids
BROKER_DESK_CLERK_INVITATION_REDIRECT_URL=https://your-domain.example.com/sign-in
```

The app maps Clerk `userId` to `users.external_auth_subject`. `BROKER_DESK_PLATFORM_OWNER_IDS` may contain either local `users.id` values or Clerk `user_...` IDs. If a tenant admin has already invited a member by email, the first Clerk login links that Clerk subject to the existing local user; otherwise a local user is created without tenant membership and tenant access remains denied until membership is granted.

Clerk is the identity provider. Broker Desk's business authorization remains in Postgres:

```text
Clerk session -> users.external_auth_subject -> tenant_memberships -> role permissions
```

Broker Desk account creation is not public self-sign-up. In production:

- Use `/platform/accounts` as the platform-owner lifecycle console for opening individual/company tenant accounts and setting purchased seats.
- Configure `BROKER_DESK_PLATFORM_OWNER_IDS` explicitly. In production there is no implicit `user_demo` platform owner fallback.
- Keep tenant member allocation inside `tenant_memberships`; member invite/reactivation is blocked when it exceeds `tenants.purchased_seat_count`.
- Platform-created owners and tenant-added members start as `tenant_memberships.status = 'invited'`; they consume a seat but cannot access tenant data until Clerk login/webhook binding activates the membership.
- Disable or restrict public sign-up in the Clerk project configuration as well as in the app UI. The repository closes `/sign-up`, but Clerk dashboard configuration is still an external production control.

Do not use Clerk organization roles as the direct source of business permissions until the mirror/sync contract is explicitly designed and tested.

Clerk webhook setup:

- Endpoint: `/api/webhooks/clerk`
- Required secret: `CLERK_WEBHOOK_SIGNING_SECRET`
- Required events for the current MVP:
  - `user.created`
  - `user.updated`
  - `user.deleted`

Webhook behavior:

- `user.created` / `user.updated`: map Clerk `user.id` to `users.external_auth_subject`, match an invited local user by email, and activate any invited memberships for that user.
- `user.deleted`: clear the external subject and suspend that user's active/invited memberships.
- The route verifies Clerk signatures through `verifyWebhook`; unsigned webhook calls must be rejected.

Legacy / alternative auth-proxy path:

```bash
BROKER_DESK_AUTH_MODE=trusted_header
BROKER_DESK_AUTH_TRUSTED_HEADER_SECRET=replace-with-ingress-shared-secret
BROKER_DESK_AUTH_SUBJECT_HEADER=x-brokerdesk-auth-subject
BROKER_DESK_AUTH_EMAIL_HEADER=x-brokerdesk-auth-email
BROKER_DESK_AUTH_NAME_HEADER=x-brokerdesk-auth-name
BROKER_DESK_AUTH_SECRET_HEADER=x-brokerdesk-auth-secret
```

The app maps `x-brokerdesk-auth-subject` to `users.external_auth_subject`. In production, the upstream proxy must strip client-supplied auth headers, inject its own verified headers, and include the shared secret header. Without that configuration, production auth fails closed.

## 2) Start app
```bash
npm install
npm run dev
```

## 3) Verify data driver health
Open:
- `http://localhost:3000/api/health/data`

Expected:
- memory mode: `{"ok":true,"driver":"memory","checkedAt":"..."}`
- postgres mode: `{"ok":true,"driver":"postgres","checkedAt":"..."}`

If connection fails, API returns `500` with error message.

## 4) First-run behavior
The app will auto-create required tables on first data access.
A default demo user is auto-created if `users` is empty.
The output template settings table (`output_template_settings`) is also auto-created and seeded.

## 5) Optional manual schema init
You can also run SQL manually in a managed Postgres SQL console using:
- `docs/engineering/postgres_schema.sql`
- `docs/engineering/postgres_rls.sql`

## 6) Current note
Postgres persistence uses the same function signatures as the memory repository. Existing pages/actions do not need to change when switching driver.

The RLS baseline is intentionally separate from the auto-created schema because local direct-connection development may not have managed-provider roles. Apply `postgres_rls.sql` in the production Postgres project after `users.external_auth_subject` has been backfilled for real users.

RLS policy model:

- Tenant-owned business tables use `tenant_id`.
- `users.external_auth_subject` stores the immutable IdP subject.
- `tenant_memberships` remains the authority boundary.
- Tenant access is allowed only when the membership is active and the tenant lifecycle status is `trial` or `active`.
- No Broker Desk business table is granted to `anon`.
- `authenticated` access is granted only when that database role exists.

## 7) Regression check (recommended)
After local server starts, run:

```bash
BASE_URL=http://127.0.0.1:3000 npm run test:regression
```

This verifies:
- data-driver health endpoint
- intake parse API
- dashboard critical modules
- output templates rendering
- board stage update API (forward + rollback)
- production auth fail-closed behavior
- Clerk auth configuration guardrails
- RLS baseline coverage for tenant-owned tables
