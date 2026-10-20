# BD-MODEL-INTAKE-20261018-02 implementation card

## Baseline

- Candidate: `bd-release-selected-20261013`
- Branch: `task/bd-model-intake-20261018-01`
- Base commit: `0c26ceeda3804e1cfa3b64272820a7bd2e9dabcd`
- Pre-existing dirty files are preserved: `AGENTS.md`, `src/app/actions.ts`, `src/app/cases/[id]/page.tsx`, `src/app/globals.css`, `src/app/import-center/page.tsx`, `src/components/home-module-preferences.tsx`, and `scripts/test-upload-readiness-action-behavior.mjs`.

## Exact intended write set

- Property document reader contract, prompt and metadata: `src/lib/object-reader-contract.ts`, `src/lib/openai-object-reader.ts`, `src/lib/ai/model-routing.ts`.
- Property document queue/worker and persistence adapter: `src/lib/object-import-contract.ts`, `src/lib/identity-import-queue.ts`, `src/lib/identity-import-processor.ts`, `src/lib/object-import-processor-adapter.ts`, `src/lib/object-import-repository.ts`, `src/lib/object-import-repository.memory.ts`, `src/lib/object-import-repository.postgres.ts`, `src/lib/object-import-review.ts`, `src/lib/data.memory.ts`, `src/lib/data.postgres.ts`, `src/lib/data.ts`.
- Upload/review surfaces: `src/app/object-import-actions.ts`, `src/components/object-import-upload.tsx`, `src/components/object-import-status-badge.tsx`, `src/components/case-association-manager.tsx`, `src/components/property-object-import-section.tsx`, `src/app/properties/[id]/edit/page.tsx`, `src/app/cases/[id]/page.tsx`, `src/app/import-center/page.tsx`.
- Local schema and focused verification: the property-intake migration under `db/migrations/20261018_*`, the `not_found` state migration under `db/migrations/20261019_001_*`, `scripts/test-object-reader-contract.mjs`, `scripts/test-object-reader-pipeline.mjs`, `scripts/test-object-import-pipeline.mjs`, and `scripts/test-object-import-postgres-confirmation.mjs`. Runtime-role provisioning remains owned by `scripts/provision-postgres-runtime-roles.mjs`; this task does not add a duplicate role-provisioning migration.

No production configuration, remote schema, deployment, push, raw supplied PDF, unredacted screenshot, API response, or secret is in scope. Existing dirty files remain unchanged unless a listed upload/review file requires an additive integration hunk.

## Availability at intake

The authorized local provider is available through the existing private configuration; the configured model path is OpenAI Responses (the model name is recorded only in private evidence). The API key is injected process-only and is never stored in this repository or printed. The durable local test database is the parent-managed isolated PostgreSQL instance; its explicit URL is supplied through `DATABASE_DEVELOPMENT_URL` when running the regression script, and the non-superuser/non-BYPASSRLS role is supplied through `BROKER_DESK_DATABASE_ROLE`. The local app/proxy is bound to `127.0.0.1:3003`/`127.0.0.1:3004`; no production database or deployment is used.

## Current status at freeze

- Both PostgreSQL confirmation paths persist all 14 existing property-profile fields with explicit column mapping. The restricted-role matrix and the `not_found` terminal matrix pass in `/private/tmp/brokerdesk-intake-pg-evidence-20261019.json`; cross-tenant RLS readback was independently verified by the parent in a rolled-back transaction.
- Property review now returns invalid values to the corresponding property or case surface with a localized message and leaves the candidate unchanged for correction. Confirmed edited values show separately from the model candidate with localized labels.
- Failed or subject-conflict property sources now have one explicit, source-scoped retry action. It locks job and target together, rebases the target version, preserves the original attachment and bounded reader history, resets only model-owned candidates, protects human confirmations, and rejects duplicate/concurrent retries. The property card exposes this action only for failed/conflict targets and only within the one-retry budget.
- Retry behavior is covered by `scripts/test-object-import-retry.mjs` and a rollback-only constrained PostgreSQL regression at `scripts/test-object-import-retry-postgres.mjs`; the latter produced `/private/tmp/brokerdesk-object-retry-pg-evidence.json` against the parent-managed `brokerdesk_intake_20261019` database with `brokerdesk_runtime` (`rolsuper=false`, `rolbypassrls=false`).
- Object attempt budget is claimed immediately before the provider call, including provider exceptions and recovery from a stale `processing` target; persistence does not double-count successful responses, and the processor blocks direct worker/API re-entry after the initial attempt plus one explicit retry. The memory regression covers two failures, one retry, second failure, provider-call suppression on a third invocation, and processing recovery counting.
- The provider page guard and output budget are implemented before the provider call. The actual four-file provider responses and source manifest remain private; they are evidence only and are not runtime fixtures.
- The parent-owned browser run uses a separate synthetic property and four uploaded files. Its worker/model outcome and any bounded retry remain parent-owned evidence; this task did not start a second provider run.
- `scripts/test-object-import-postgres-confirmation.mjs` runs the local matrix by default and requires an explicit `DATABASE_DEVELOPMENT_URL`; real provider mode additionally requires process-only `OPENAI_API_KEY` and `BROKER_DESK_SOURCE_DIR`, or the explicit existing-job mode (`BROKER_DESK_REAL_PROPERTY_ID` plus `BROKER_DESK_EXISTING_JOB_IDS`).

## Acceptance mapping

- Four typed property document categories remain independently uploadable; absent categories never block property creation.
- Candidate keys are limited to existing property-profile fields (`name`, `furigana`, `area`, `address`, `roomNumber`, `postalCode`, `usage`, `sizeSqm`, `listingPrice`, `listingRent`, `listingCommonFee`, `managementFee`, `repairFee`, `notes`) and existing `property.*`/`lease.*` case fields. Sale-contract, registry, structure, parcel, area-basis and seller-disclosure facts without a matching key remain in the source document.
- `sizeSqm` candidates retain source/page/basis evidence and are marked unclear or conflict when the source basis is not explicit; `listingPrice` candidates require explicit human confirmation and do not prove a contracted price or payment.
- Every readable candidate carries page and exact excerpt, optional visual location, uncertainty, source attachment, document type and subject attribution.
- Existing confirmed values stay unchanged; conflicts and unreadable/missing states remain reviewable and do not become false or zero values.
- Provider/model/usage metadata and failures are persisted when the configured provider path returns them.
- Existing identity import remains source-specific and is extended only after property flow behavior is covered.
