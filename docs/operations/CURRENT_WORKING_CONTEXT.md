# Broker Desk Current Working Context

> Canonical active-work entrypoint.
>
> Last updated: 2026-08-12.
>
> Read this first after a context reset. It supersedes dated handoffs on active
> runtime, priorities, and operating rules. Dated handoffs remain historical
> snapshots.

## Mandatory Task Protocol

- One task changes exactly one defect or one page. Split multi-defect or multi-page requests into separate tasks.
- Every modification must run one explicit verification command after the edit.
- When verification passes, commit the scoped diff immediately. Do not move to another item in the same task.
- Start the next item as a new task.
- This file is the only authoritative active-progress file.
- `docs/PROJECT_MEMORY.md` is stable memory only; do not put attempts, failures, transient debugging, or per-task progress there.
- If two consecutive turns contain only analysis/read output and no diff or test output, terminate the task and start a new task.

## Process Rule Change (2026-08-12)

- The repository task protocol above is mandatory for all future work.
- Verification command for this rule change: `npm run test:workflow-rules`.
- Verification result: passed.

## Product And Release Position

- Japanese real-estate brokerage information center.
- V1 core: ingest source materials -> extract, review, and confirm -> organize
  case data -> generate official documents.
- Current candidate: `v0.2.0-rc.2`.
- No public deployment yet. Do not create paid infrastructure or services
  without explaining cost and obtaining approval.
- This is not a generic CRM, OCR wrapper, PDF editor, or AI chat interface.

## Non-Negotiable Product Rules

- One local app before public beta: `http://localhost:3000`. Do not maintain
  parallel development and test applications.
- Clerk identity plus tenant membership scopes data and actions.
- A platform administrator can edit all official published or unpublished
  templates. Official save and publish create an explicit shared version.
- Users browse and install templates into their workspace. New user workspaces
  begin with no templates. A tenant-local copy never mutates the official
  template.
- Cross-device output must use shared official template layout and version
  assets, never workstation-local calibration.
- Organize information independently of Output. Output runs its own
  completeness checks.
- AI can extract, classify, compare, and recommend. AI must not silently
  confirm facts.
- Keep field keys, mapping rules, model reasoning, and internal quality
  language out of broker UI.
- Completed actions require explicit result feedback and visible state change.
- No destructive git operation. Do not push unless the user explicitly asks. After the current task's verification passes, commit the scoped diff immediately.

## Runtime And Data

- Next.js App Router, Clerk authentication, and Neon-hosted PostgreSQL through
  a connection string. Secrets live only in `.env.local`.
- The local app is not production infrastructure. Ngrok is external testing
  only and requires both the local host and tunnel to remain running.
- Platform configuration uses persisted tenant and membership records. Never
  assume a user has tenant membership without verifying it.
- Development performance must be measured before it is claimed fixed. Keep
  loading views stable and avoid blank-page layout flashes.

## Verified Product Baseline

- Five Japanese guarantee-company official templates have manually mapped
  fields. The supported boundary is high-accuracy manual confirmation, not
  universal checkbox automation.
- Template Library separates official distribution from tenant-local use.
  Admin editing needs direct access; normal users only browse, install, and use.
- Main workflow navigation: Workspace, Input, Organize, Output. Settings and
  resources are secondary account surfaces.
- Record lifecycle is archive and restore first. Destructive deletion needs a
  retained audit record and explicit permission.
- Product copy must be customer-facing. Avoid raw IDs, AI thoughts,
  prompt-like explanations, and implementation details.

## Active Repair Queue

1. Input merge completion: selection target -> explicit final confirmation ->
   progress -> result summary -> route to review. A selected target alone is
   not a completed action.
2. Template editor: official save and publish must persist, refresh version and
   timestamp, and give clear feedback. Review role and tenant routing.
3. Template visual issue: diagnose duplicated digit characters in fields.
   Distinguish source-PDF values, overlay duplicates, and stale preview state
   before changing mappings.
4. Template IA: remove or consolidate redundant official-template list versus
   library preview. Include latest update time where template selection needs it.
5. Organize navigation: detail screens need a return to the organize
   selector/list while preserving relevant filters. Return to Workspace is not
   sufficient.
6. Confirmation UX: per-item confirm and non-use actions must update list state
   and give a short visible success transition. Motion must not delay
   persistence.
7. Lifecycle: complete archive, restore, auditing, permissions, and migration
   safety for cases, subjects, properties, and materials.
8. Performance: investigate slow page transitions, use appropriately sized
   stable skeletons only while data is pending, and eliminate old-layout flashes.
9. Public-beta hardening: tenant isolation, migration and recovery rehearsal,
   backups, rate limits, error reporting, and privacy/access review.

## Release Gates Before Public Deployment

- The same generated PDF visually matches across two devices using the same
  official version.
- Tenant isolation is verified for owner, member, and no-membership cases.
- Archive, restore, and audit history are verified.
- Schema migration and rollback or recovery rehearsal are verified.
- Backup and restore, storage handling, rate limiting, error monitoring, and
  privacy/access checklist are completed.
- Focused browser acceptance and PDF visual regression run after template edits.

## Working Method

- Reproduce before diagnosis; make a narrow change; run focused verification;
  state what was and was not tested.
- Prefer existing repository patterns and structured data access.
- Do not turn product pages into documentation. User-facing copy must answer an
  immediate action or state.
- When a task resumes, read this file, then `docs/PROJECT_MEMORY.md`,
  `CONTEXT.md`, and only the task-specific source document.
- Update this file only for a durable change in active baseline, rules,
  environment, or active queue. Keep dated handoffs untouched as history.

## Read Next

1. `docs/PROJECT_MEMORY.md`
2. `CONTEXT.md`
3. `docs/product/PRODUCT_TOPOLOGY.md`
4. `docs/operations/RELEASE_V0.2.0_RC2_2026_08_09.md`
5. The task-specific source document
