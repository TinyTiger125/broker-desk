# Broker Desk Current Architecture

> Baseline: committed main at 11fe7fc9d0616aa7c3197ef80eb3fe440c6de9c9.
> This file describes committed main only. Safety branches, WIP snapshots,
> uncommitted changes, and proposed task behavior are not architecture facts.

## Runtime

- Next.js App Router with React and Tailwind.
- Server Actions in src/app/actions.ts handle durable mutations.
- Route handlers under src/app/api/ handle health, uploads, imports,
  downloads, workspace boundaries, webhooks, and QA fixtures.
- Local development uses npm run dev; release-like verification uses
  npm run build followed by npm start.

## Application boundaries

- Frontstage routes in committed main include /, /import-center,
  /organize-center, /cases/[id], /parties, /properties, /output-center,
  and /templates.
- Backstage routes include /platform/* and selected /settings/* routes.
- Authentication and workspace resolution use the existing Clerk integration,
  local user records, tenant memberships, and tenant-session helpers.
- The committed main template flow includes tenant template installation and
  preview/download paths. Proposed governance task cards do not imply that a
  future draft/publish contract is complete.

## Data and persistence

- The repository/data abstraction is exposed through src/lib/data.ts, with
  memory and PostgreSQL implementations.
- PostgreSQL migrations are under db/migrations/.
- Tenant scope is resolved server-side before business reads or writes.
- Source material, extraction review, case data, output drafts, generated
  outputs, audit records, and template data are separate application concerns.

## Verification entry points

npm run test:workflow-rules
npm run typecheck
npm run lint
npm run test:regression
npm run build

Task-specific commands belong in the task card. A passing command is evidence
for that command only; it does not establish browser, production, permission,
or cross-device acceptance by itself.

## Known boundary

The safety branch safety/wip-mixed-worktree-20260812 and WIP snapshot
6f199375467bbfedd77bc90d80a53c423d4c9969 are recovery references. They are
not part of this baseline and their business changes are not described here.
*** Delete File: broker-desk-web-dev/BACKLOG.md
