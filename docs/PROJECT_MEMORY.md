# Broker Desk Project Memory

Last updated: 2026-07-01

This file is the fixed project-memory entrypoint for Broker Desk.

Every future PM, development, QA, UX, or template-authoring agent should read this file first, then follow the linked deep documents only when the current task requires detail.

## Update Rule

Update this file whenever a durable product decision, implementation milestone, acceptance result, known risk, or next-step priority changes.

Do not record secrets, API keys, private customer identifiers, or one-off terminal noise here.

Use this file for:

- current product positioning
- current implementation state
- active phase and next actions
- high-risk constraints
- template-quality status
- durable PM decisions
- links to deeper docs

Do not use this file for:

- full task transcripts
- large code diffs
- temporary debugging logs
- speculative ideas that have not become product direction

## Fixed Read Order

1. `docs/PROJECT_MEMORY.md`: current source of truth and next-step index.
2. `docs/README.md`: current documentation map and archive rules.
3. `CONTEXT.md`: domain language and product boundary.
4. `docs/product/PRODUCT_TOPOLOGY.md`: product value topology and phase model.
5. `docs/operations/PM_CONTROL.md`: multi-agent operating model and historical task board.
6. Task-specific docs:
   - current handoff: `docs/operations/DEVELOPMENT_HANDOFF_2026_07_01.md`
   - previous handoff: `docs/operations/DEVELOPMENT_HANDOFF_2026_06_27.md`
   - input: `docs/product/V1_INPUT_FILE_MODEL.md`
   - workbench: `docs/product/V1_CASE_WORKBENCH.md`
   - case information architecture: `docs/product/V1_CASE_INFORMATION_ARCHITECTURE.md`
   - guarantee output: `docs/product/V1_GUARANTEE_APPLICATION_OUTPUT.md`
   - PDF template factory: `docs/product/PDF_TEMPLATE_AUTHORING_EXPERIENCE.md`
   - field catalog: `docs/product/CANONICAL_FIELD_CATALOG.md`
   - AI learning: `docs/product/V1_AI_CORRECTION_LEARNING.md`
   - model routing: `docs/product/V1_AI_MODEL_SELECTION.md`
   - multi-tenant permissions: `docs/product/MULTI_TENANT_PERMISSION_MODEL.md`
   - runtime stability: `docs/engineering/RUNTIME_STABILITY_AND_ARCHITECTURE.md`

If these documents conflict, treat this file as the current routing layer, then update the stale document or record the conflict here.

## Product Position

Broker Desk is a real-estate business information center for small Japanese real-estate brokers and small agencies that do not need Salesforce-scale CRM but need a reliable replacement for repetitive Excel, Word, and manual PDF workflows.

The current core promise is:

```text
1. 資料を入れる
2. 足りない項目だけ確認する
3. 申込書を出す
```

In product terms:

```text
Input convenience -> editable case workbench -> output convenience
```

The product should feel like a faster structured Excel workbench, not a generic CRM, not a PDF editor, and not an AI chat product.

2026-06-20 information-architecture decision:

- `整理信息` is the product's case dossier workbench, not a guarantee-application pre-form.
- The workbench should organize data by a finite property-case information model: participants, property, contract terms, employment/income, identity documents, related companies, source evidence, and issue states.
- A tree is useful as the dossier map, but it must be paired with issue queues, search, field states, and source evidence. A pure tree would become a collapsed spreadsheet.
- Output modules should run their own missing-field checks. Output-specific draft fields and render fragments must not pollute the reusable case dossier.
- First implementation slice is in place: the field catalog exposes derived information-tree metadata; the case workbench renders the dossier tree, issue summary, search, field path/importance chips, and a `not_applicable` decision.
- Durable source: `docs/product/V1_CASE_INFORMATION_ARCHITECTURE.md`.

2026-06-24 AI and input-system decision:

- Broker Desk AI is not an upgraded RPA layer. RPA automates stable clicks; Broker Desk AI is valuable only when it understands messy source material, proposes structured candidates, detects conflicts, classifies ownership, and returns auditable changes for human approval.
- A `Skill` is a bounded capability, a `Tool` is a product action, and an `Agent` is the orchestrated workflow that assembles context, invokes skills/tools, proposes changes, and waits for approval before durable writes.
- The model is not the memory system. Broker Desk's own database state is product memory: confirmed case data, source evidence, correction events, rejected suggestions, approved AI experience notes, template bindings, output snapshots, tenant preferences, and permission rules.
- `建档导入` must be treated as object routing plus material intake, not as a raw upload page.
- Users must be able to create a case, subject, or property before any upload; each create path should open an editable workflow with expected fields present even when values are empty.
- Uploads can happen before or after ownership is chosen, but unassigned material must not silently write confirmed facts into case, subject, or property records.
- Durable sources: `docs/product/PRODUCT_TOPOLOGY.md`, `docs/product/V1_AI_CORRECTION_LEARNING.md`, `docs/product/V1_INPUT_FILE_MODEL.md`.

2026-06-27 input-system implementation checkpoint:

- The product frontstage is now organized around `资料管理中心`, `建档导入`, `整理信息`, and `输出文件`.
- `资料管理中心` is no longer a generic "today's tasks" screen. It now attempts to show the relationship between cases, subjects / related parties, properties, and imported material.
- `建档导入` is now an ownership-routing and material-intake surface. It can start from a new case, an existing case, or unassigned intake; upload remains a method inside that flow.
- `整理信息` is now an object-center list for cases, subjects, properties, and unassigned intake. It is not only a case list and not only a guarantee-application preparation page.
- New case, subject, and property actions now open dedicated editable workflows instead of only adding placeholder rows.
- The case workbench has begun moving from a global save model toward per-field-card saves.
- Current UX is not finished: the home screen and object center are functionally closer to the product direction, but still need spacing, hierarchy, and broker-first simplification before pilot-quality acceptance.
- Durable source: `docs/operations/DEVELOPMENT_HANDOFF_2026_06_27.md`.

2026-07-01 pre-friend-test checkpoint:

- Final pre-friend-test audit cycle completed.
- The current code supports a blank business-data friend-test mode through `BROKER_DESK_SEED_MODE=blank` and default Chinese UI through `BROKER_DESK_DEFAULT_LOCALE=zh`.
- A QA full-data seed/reset lifecycle is in place for repeatable audits. `npm run test:regression` now creates full QA data, runs the regression suite, and clears business data on exit.
- QA endpoints are local test tooling: local loopback is allowed in development, production requires a token, and non-loopback forwarded hosts are rejected to reduce ngrok exposure risk.
- Output-center missing-field links now route to real case-workbench nodes or guarantee-preview sections instead of stale anchors.
- Friend-test feedback must be collected against the V1 chain, not against isolated features. Use `docs/operations/FRIEND_TEST_CHECKLIST_2026_07_02.md` for tester tasks, pass/fail signals, and issue severity.
- Current external-test command:

```bash
BROKER_DESK_AUTH_MODE=demo BROKER_DESK_ENABLE_DEMO_AUTH=true BROKER_DESK_SEED_MODE=blank BROKER_DESK_DEFAULT_LOCALE=zh npx next dev --webpack
```

- Validation passed before handoff: `npx tsc --noEmit --pretty false`, `npm run lint -- --quiet`, `npm run build`, and `npm run test:regression`.
- Known runtime caution: after mixing production build and dev server runs, Next dev cache can produce missing manifest/runtime errors. Stop the dev server, remove `.next`, and restart with `npx next dev --webpack`.
- Durable source: `docs/operations/DEVELOPMENT_HANDOFF_2026_07_01.md`.

2026-07-14 terminology review checkpoint:

- The current UI terminology review package has been regenerated from the active development branch.
- Practical friend review should use the Japanese package `docs/operations/ui-terminology-ja-business-review.csv`; Chinese review files are primarily developer aids.
- First-pass quick Japanese review can use `docs/operations/ui-terminology-ja-starter-review.csv`, not the full export.
- Japanese terminology dictionary: `docs/operations/PRODUCT_TERMINOLOGY_DICTIONARY_JA_2026_07_14.md`.
- Reviewer handoff: `docs/operations/UI_TERMINOLOGY_REVIEW_HANDOFF_2026_07_14.md`.
- Product glossary: `docs/operations/PRODUCT_TERMINOLOGY_DICTIONARY_2026_07_14.md`.
- Durable rule: product UI terms can be localized, but raw business data such as names, addresses, building names, company names, filenames, and official form labels should not be hard-translated.

## Target User

Primary V1 user:

- Japanese real-estate broker or very small real-estate company.
- Currently uses Excel, downloaded guarantee-company PDFs, manual copy/paste, Preview/WPS, and repeated hand entry.
- Pain is repetitive data entry and official form production, especially address, phone, postal code, birth date, rent, workplace, guarantor, and emergency-contact fields.

The initial market wedge is guarantee-company application documents, because this is high-frequency, repetitive, format-strict work.

## Non-Negotiable Product Rules

- Official company PDFs must not be redrawn, restyled, or replaced by lookalike forms.
- Filling is allowed only inside intended blank spaces.
- Broker-facing workflow must stay simple; coordinate maps, field keys, segment rules, and template calibration are backstage/admin tools.
- The workbench is the center. Input and output are convenience surfaces around the same confirmed case data.
- Multi-tenant permissions must be centered on the full source-file -> extraction -> review -> workbench -> output -> audit lifecycle, not on guarantee-company PDF output alone.
- AI is a supporting layer for extraction, uncertainty marking, correction learning, and future customer intake. AI is not final truth and should not silently overwrite durable data.
- User corrections and template fixes must create reusable product-owned experience, not rely on model private memory.
- Template-level position changes are high-risk production assets and must be protected from accidental broker edits.

## Current Technical Baseline

Application:

- Next.js App Router.
- Local development normally uses `npm run dev -- --port 3002`, but the official-form template factory must be verified against a real hydrated browser before use.
- If `next dev` shows broken interactivity, missing `/_next/static/chunks/main-app.js`, missing `app-pages-internals.js`, or `.next/dev/server/middleware-manifest.json` errors, do not keep calibrating templates. Stop, clean `.next`, and use `npm run build` plus `next start -p 3002` as the recovery path until the dev-server issue is isolated.
- Data abstraction through `src/lib/data.ts`.
- Current default local driver is memory unless `.env` selects Postgres.
- Important warning: memory driver resets runtime-created data after server restart. Template layout JSON is persisted separately.

PDF / output:

- PDF generation uses official source PDFs/raster backgrounds plus overlay text/checkmarks.
- The five guarantee-company forms do not expose useful AcroForm fields.
- Template coordinates and custom boxes are stored in `.broker-desk/friends-guarantee-layouts.json`.
- Common render logic is in `src/lib/friends-guarantee-pdf.ts`.
- Download gating is in `src/lib/guarantee-download-gate.ts`.
- Template authoring UI is currently in the preview/calibration surface and should move to admin/backstage before release.

AI:

- OpenAI Responses API is the selected baseline.
- `gpt-5.5` is the high-accuracy default in product docs; smaller models are only for bounded low-risk tasks.
- Correction events and approved AI experience notes are the product-owned memory mechanism.

## Current Data Model Direction

Broker Desk is moving toward a product-owned standard field catalog.

Current source:

- `src/lib/case-field-catalog.ts`
- `docs/product/CANONICAL_FIELD_CATALOG.md`
- `docs/product/V1_CASE_INFORMATION_ARCHITECTURE.md`

Product rule:

1. Input files fill canonical case fields.
2. The workbench lets users confirm and edit canonical fields.
3. Output templates bind to canonical fields or template-specific options.
4. Render fragments are derived at output time.

Examples of render fragments that should not become user-maintained fields:

- postal code 3+4 cells
- phone part 1/2/3
- birth year/month/day
- name family/given split
- address prefecture/municipality/street
- amount digit cells

## Current Frontstage Flow

The intended broker-facing flow is:

1. Upload or enter source material.
2. System extracts and proposes structured case data.
3. Broker only reviews missing, uncertain, or output-blocking items.
4. Broker saves confirmed data into the case workbench.
5. Broker selects a guarantee company.
6. System prepares company-specific draft fields.
7. Broker previews the official form only when needed.
8. System generates/prints/downloads the official PDF.

Anything resembling field mapping, source schema, coordinate editing, PDF box binding, or split-cell rules must be hidden from normal brokers.

## Current Feature Status

Implemented or materially present:

- Import center and extraction-review path.
- Case workbench with editable confirmed case data.
- Template-scoped guarantee-company draft layer.
- Official-form preview with editable overlay boxes.
- Direct PDF generation and download gate.
- Five guarantee-company template registry:
  - 1 全保連
  - 2 日本セーフティー
  - 3 Jリース
  - 4 インシュア
  - 5 ふれんず保証
- Standard field catalog.
- Phase 1 tenant/session foundation:
  - `tenants` and `tenant_memberships` exist in memory/Postgres data layers.
  - tenants now carry `accountType`, lifecycle `status`, and `purchasedSeatCount` for seat-based B2B account control.
  - active tenant can resolve from membership/cookie/default membership.
  - initial role/action permission matrix exists for tenant, case, source, extraction, record, review, output, template, AI, and audit actions.
  - `/api/tenant/session` exposes the resolved user, tenant, membership, and role for diagnostics.
- AI correction-event and approved-experience skeleton.
- Phase 2 tenant-scoped business data access on the main application path:
  - business records carry `tenantId` in memory and Postgres repositories.
  - pages, server actions, and frontstage APIs resolve a tenant session and pass tenant scope into repository calls.
  - cross-tenant regression covers cases, source jobs, review items, guarantee drafts, correction events, AI drafts, attachments, generated outputs, and template settings/versions.
- Phase 3-5 local tenant governance hardening:
  - high-risk role defaults are conservative: ordinary brokers cannot download final outputs, override extraction results, publish templates, or run template AI pre-match by default.
  - `requireTenantSession` supports multi-action permission checks, and AI field pre-match now requires both template and AI pre-match permissions.
  - production demo auth fallback is disabled unless `BROKER_DESK_ENABLE_DEMO_AUTH=true`; real production login is still a separate release requirement.
  - `/settings/members` provides tenant member list, local member creation, role update, suspension/reactivation, last-owner protection, and audit logging.
  - `/platform/accounts` provides PlatformOwner-only tenant account lifecycle management: create individual/company account, set purchased seats, create initial invited owner, send/retry Clerk invitation, display invitation/binding status, and update trial/active/suspended/cancelled status.
  - member invite/reactivation is blocked when it would exceed purchased seats.
  - `/platform/templates` provides a PlatformOwner-only official-template factory overview; production PlatformOwner access must be explicitly configured through `BROKER_DESK_PLATFORM_OWNER_IDS`.
  - official guarantee-application PDF downloads are recorded as generated outputs with case/template/data/draft/layout snapshots and audit logs.
  - `npm run test:tenant-governance` covers role guardrails, member operations, template layout snapshot capture, and output snapshot persistence.
- Phase 6 production auth / RLS foundation:
  - `BROKER_DESK_AUTH_MODE=trusted_header` can accept an upstream IdP/auth-proxy identity only when the shared ingress secret header is present.
  - `BROKER_DESK_AUTH_MODE=clerk` is the selected production identity path. Clerk owns login/session identity; Postgres `users.external_auth_subject` bridges Clerk `userId` to Broker Desk's local user.
  - Clerk first login links to an invited local user by email when possible; otherwise it creates a local user without tenant membership, so tenant access still fails closed until membership is granted.
  - `/api/webhooks/clerk` verifies Clerk signatures, maps Clerk users to `users.external_auth_subject`, activates invited memberships on user create/update, and suspends local memberships when a Clerk user is deleted.
  - production auth fails closed by default when no real auth mode is configured.
  - `users.external_auth_subject` is the bridge from immutable external identity subject to internal Broker Desk user ID.
  - `docs/engineering/postgres_rls.sql` defines the first Supabase/Postgres RLS baseline for tenant-owned tables, global user/tenant/membership reads, and no anonymous business-table grants.
  - `npm run test:production-security` covers production demo-auth lockout, Clerk configuration guardrails, trusted-header signature enforcement, and RLS SQL coverage.
- Stitch-based visual direction has been partially integrated.
- 2026-06-27 input-system scaffold:
  - `/` is now a data-management center with search, relationship-oriented lanes, object list, current-object panel, and recent updates.
  - `/import-center` is now framed as ownership-first material intake instead of plain upload.
  - `/organize-center` lists cases, subjects / related parties, properties, and unassigned intake with type/status/search filters.
  - `/cases/new`, `/parties/new`, and `/properties/new` provide object-specific create flows.
  - `/cases/[id]` has a per-field-card save component for the case workbench.
  - identity-document upload supports multiple files with local count and size validation.

Not yet release-ready:

- Template calibration still appears in the frontstage preview surface.
- Five guarantee-company templates are not all at the same quality level.
- Company-specific checkbox/plan option output is incomplete on some templates.
- Some UI still mixes broker workflow and admin/template-factory controls.
- Concrete Clerk project configuration, live keys, hosted-domain redirects, and production webhook sync are not implemented or verified in this workspace.
- Clerk dashboard-level public sign-up restriction is not verified in this workspace; the app-level `/sign-up` page is closed, but production must also enforce this in Clerk configuration.
- `users.external_auth_subject` is not backfilled for real production users.
- `docs/engineering/postgres_rls.sql` has not been applied to a live production database in this workspace.
- Local member creation is not real email invitation or SSO provisioning.
- Live Clerk invitation delivery and webhook delivery are not verified in this workspace because real Clerk keys/project settings are not present.
- AI usage quota/cost accounting is not implemented yet.
- Database RLS SQL exists as a baseline, but service-layer tenant scoping remains the only verified runtime guard until the SQL is applied and tested on the production database.
- The 2026-06-27 input-system route split is not yet a finished design system. It is a functional scaffold that still needs browser QA and layout refinement.
- `资料管理中心` still needs a serious UX pass. It should become a clear broker operating console, not a dense object table.
- Subject and property editing flows are still much shallower than the case workbench.
- Some advanced import/template language and controls remain accessible in current routes and must be gated or demoted before external users.

## Guarantee Template Status

General rule:

- Prefer stable automatic output for fields that are position-safe.
- Leave unstable or high-variance fields for electronic/manual completion.
- Use admin template calibration to improve repeatable automatic output.

Template notes:

### 5 ふれんず保証

Most mature initial template. It established the practical template-authoring method: official background preserved, overlay text calibrated, preview correction, drag/resize, template-level save, visual QA.

### 1 全保連

High-frequency target and strategically important. Text extraction is poor, so visual calibration and field binding are the practical route. User manually calibrated many boxes. Must preserve official form exactly.

### 2 日本セーフティー

High-resolution replacement source exists: `/Users/laineyzhu/Desktop/房产专家资料库/日本セーフティー(1).pdf`. Use the HD source, not the earlier low-quality file.

### 3 Jリース

Current active work item.

As of 2026-06-11:

- User manually refined many boxes.
- Current saved template has 50 custom fields, all bound.
- Full mock case data was written into `case_fixture_friends_guarantee_pdf`.
- Official download for `j_lease_individual_v1` passed after fixing duration-year printing.
- Key split fields render correctly in preview:
  - driver license 12 digits
  - postal code 3+4
  - phone part 1/2/3
  - birth year/month/day
  - years employed as years only
- Remaining issue: `Jリース保証プラン` and `家賃送金サービス` company-specific option boxes are still empty/not truly printed. Checkbox/plan mapping needs a dedicated follow-up.

### 4 インシュア

Active but not yet considered at the same quality level as the best-calibrated templates. Needs full-data visual QA after 1/2/3 are stable.

## Latest Durable Code Decisions

2026-06-11:

- Numeric segmented `valuePart` must split by digits, not whitespace tokens. This protects postal-code 3+4 style boxes.
- Download gate must check final printable overlay value, not raw field value. Example: `2年8ヶ月` should pass if printed as `2`.
- Jリース `applicant.yearsEmployed` needs `durationYears` transform.
- Visual smoke is necessary but insufficient. It confirms visible fill deltas, not per-cell correctness. Browser/DOM inspection and human visual review are still required for template acceptance.

## Current Open Risks

- PDF form filling is the highest-risk part of the product because official PDFs are final visual documents, not structured editable documents.
- If source files are low quality or scanned, coordinate precision becomes fragile.
- Allowing users to alter template-level coordinates in frontstage can destroy global output quality.
- Memory driver creates false persistence confidence for case data; template JSON persists separately.
- Existing docs are partially stale because the project direction shifted from generic output/CRM pages toward guarantee-company application production.
- Runtime instability can silently turn the template authoring UI into static HTML. Visible buttons are not enough; the acceptance check must prove React hydration and toolbar actions work in a real browser.

## Future Tenant Permission Model For Template Editing

Decision recorded on 2026-06-16:

- Do not expose the current template factory directly to ordinary broker users.
- Ordinary broker users may correct only the current application output: field values, one-off position/size/font fixes, and problem feedback.
- Company admins or advanced tenant users may maintain private tenant template variants, isolated from the official global template.
- Internal template authors may maintain and promote official templates after QA.
- Template state should be layered as:

```text
official global template
  -> tenant private template variant
    -> current-case one-off correction
```

## Multi-Tenant Permission Model

Decision recorded on 2026-06-18:

- The permission model must protect Broker Desk as a real-estate document workbench, not only as a guarantee-company application output tool.
- The primary protected lifecycle is:

```text
SourceFile
  -> ExtractionJob
  -> ExtractionReview
  -> Case Workbench / Confirmed Case Data
  -> OutputArtifact
  -> AuditLog / CorrectionEvent / ExperienceUpdate
```

- A tenant represents a real-estate company, branch, or workspace.
- A user is only a login identity; authority comes from `Membership`.
- All business data must be tenant-scoped unless it is a platform-level official template or catalog.
- Guarantee-company application templates should become one `OutputTemplate.type = "guarantee_application"`, not the center of the permission architecture.
- See `docs/product/MULTI_TENANT_PERMISSION_MODEL.md` before implementing auth, tenant data access, permission checks, template governance, AI gates, or audit UI.

Required permission/UX rules:

- A broker correction must not silently write into the global template.
- Tenant template saves need explicit versioning, audit logs, preview validation, and rollback.
- Official template promotion requires internal review and crop-level PDF QA.
- Account settings and tenant permissions should eventually distinguish `broker`, `tenant_template_admin`, and `internal_template_author`.
- User feedback and one-off corrections should become candidate evidence for future template improvements, not automatic global changes.

## Guarantee Form Automation Boundary

Decision recorded on 2026-06-16:

- The near-term guarantee form target is high-coverage automation, not full automation.
- Treat roughly 90% deterministic text, number, postal-code, phone, date, and money filling as the first useful acceptance target.
- Do not add ordinary PM/admin checkbox-box authoring just to chase 100% completion. Checkbox and radio behavior should remain hard-coded, template-specific, or manually confirmed until the risk model is clearer.
- Fields without a trusted source fact or deterministic transform, such as age boxes derived from birth date without an approved application-date rule, should stay manual/confirmation-needed rather than being filled with plausible but unsafe values.
- The right product measure is "less repetitive typing with legally safe output", not "every visible blank is filled by the system".

## Runtime Incident Log

### 2026-06-11: Template toolbar visible but non-interactive

Symptom:

- In the official PDF calibration preview, toolbar controls such as `入力欄を追加`, `字段预匹配`, `位置手柄`, and `吸着弱` were visible but did nothing.

Confirmed cause:

- The page was rendered as static HTML because the Next.js client runtime did not load.
- `/_next/static/chunks/main-app.js` and `/_next/static/chunks/app-pages-internals.js` returned 404 in dev mode.
- The `.next/dev` build output was inconsistent and later produced missing `.next/dev/server/middleware-manifest.json` errors.

Correct diagnosis method:

1. Use a real browser automation check, not only visual inspection.
2. Verify the toolbar action changes state, for example `吸着弱 -> 吸着OFF`.
3. Verify `入力欄を追加` increases the overlay-box count.
4. Check network responses for missing Next client chunks.

Recovery used:

- Back up `.broker-desk/friends-guarantee-layouts.json` before touching runtime state.
- Clean/rebuild `.next`.
- Use production mode as a stable recovery path: `npm run build`, then `next start -p 3002`.
- Do not change template coordinate JSON while debugging runtime hydration.

Architecture lesson:

- The template factory is now product-critical. It needs a stable authoring runtime, startup health checks, and browser-level smoke tests before PM/admin calibration work begins.
- A dev server that can silently lose React hydration is not acceptable as the only operating mode for template calibration.
- `CLAUDE.md` contains historical notes and may conflict with current Codex docs. Treat this file as the current routing index.

## Current Next Steps

Immediate:

1. Bring up the 2026-06-27 handoff version on the next device and verify the documented acceptance gate.
2. Refine `资料管理中心` until it clearly works as a broker console: search, object relationship map, actionable attention list, and creation/continuation routes.
3. Continue the input-system polish around object-specific workflows: new case, new subject, new property, and unassigned intake.
4. Keep batch file reading available after ownership is chosen, so documents can bulk-fill an existing record.
5. Preserve the current 1/2/3/4/5 template coordinate state and avoid accidental overwrite.

Near term:

1. Harden per-field-card save behavior in the case workbench with browser QA.
2. Add richer subject and property profile workflows instead of leaving them as shallow create forms.
3. Move or gate internal import mapping and template-factory controls behind admin/backstage semantics.
4. Harden production auth integration and persistent-database migration verification.
5. Add denial tests for high-risk permissions: template publish, source delete, final download, AI pre-match overwrite, and member role changes.
6. Keep ordinary broker flow strictly: create/route material -> organize confirmed facts -> output documents.

Before closed pilot:

1. Switch pilot data to persistent storage.
2. Add minimum role boundary: broker user vs admin/template-author.
3. Lock official template versions and make template saves explicit/reversible.
4. Prepare a small real-data acceptance pack with Excel input, person data, and five PDF outputs.
5. Produce a concise broker-facing demo route that hides all template-factory controls.

## Verification Commands

Common checks:

```bash
npx tsc --noEmit --pretty false
npm run lint -- --quiet
npm run test:case-field-catalog
npm run test:guarantee-download-gate
npm run test:guarantee-autofill-policy
npm run test:guarantee-print-fit
npm run test:tenant-session
```

Template visual smoke:

```bash
BASE_URL=http://localhost:3002 CASE_ID=case_fixture_friends_guarantee_pdf TEMPLATE_ID=j_lease_individual_v1 npm run smoke:guarantee-visual
```

Manual preview:

```text
http://localhost:3002/guarantee-applications/j_lease_individual_v1/preview?caseId=case_fixture_friends_guarantee_pdf
```

Direct PDF:

```text
http://localhost:3002/api/guarantee-applications/j_lease_individual_v1/download?caseId=case_fixture_friends_guarantee_pdf
```

## Change Log

### 2026-06-11

- Created this fixed project-memory entrypoint because project knowledge had become scattered across PM, topology, template, field-catalog, and acceptance documents.
- Recorded current product position, template-factory boundary, standard-field direction, active Jリース status, and next-step priorities.
- Added an explicit rule that future durable decisions and acceptance results must be appended here.
- Added Japanese postal-code lookup as deterministic master data: input postal code can auto-complete prefecture, municipality, and town area from a local Japan Post index. AI must not be used for this step. Postal-derived address prefixes are allowed to assist address entry and output fragments, but prefix-only completion must remain reviewable so it does not hide missing street/building details.

### 2026-06-18

- Cleaned and reorganized project documentation into product, engineering, operations, and archive buckets; `.broker-desk/friends-guarantee-layouts.json` is tracked as the current template calibration asset.
- Added Phase 1 tenant/session foundation: tenant and membership data models, active tenant resolution, conservative role/action permission matrix, diagnostic tenant session API, and regression coverage.
- Explicit boundary: Phase 1 does not yet prove production multi-tenant safety. Phase 2 must add `tenant_id` business data scoping and cross-tenant denial tests before closed pilot risk is materially reduced.
- Added the seat-based B2B account lifecycle foundation: tenants can be individual/company accounts with purchased seats and trial/active/suspended/cancelled status; `/platform/accounts` lets PlatformOwner create/update accounts, while tenant member allocation remains constrained by purchased seats.
- Closed the app-level public `/sign-up` route to match the business model: Broker Desk accounts are provisioned/invited, not publicly self-created.
- Added the first real-account provisioning loop: new platform owners and tenant-added members start as invited seats, Clerk invitation sending is wired through the server-side Clerk Invitations API when configured, `/api/webhooks/clerk` binds/deletes external identities, and invited memberships activate on Clerk login/webhook sync.
- Clerk platform-owner bootstrap now accepts either local `users.id` values or Clerk `user_...` subjects in `BROKER_DESK_PLATFORM_OWNER_IDS`; this avoids requiring an unstable local memory user id during first real-login setup.
- Local Clerk bootstrap has a PlatformOwner tenant fallback for local testing: a configured PlatformOwner without tenant membership can use the seeded default tenant as a temporary `platform_owner` session and, in memory mode, read through the seeded `user_demo` data view so product-module navigation does not 500 or lose the example case. It is default-on only outside production runtime; `next start` local testing requires `BROKER_DESK_ENABLE_PLATFORM_OWNER_TENANT_FALLBACK=true`. This is not a production tenant-access rule.

### 2026-06-21

- Started the `整理信息` IA rebuild: the case workbench now has a case-dossier tree, derived node status, cross-field search, queue/status filters, and a `not_applicable` field decision for facts that do not apply to a case.
- Product boundary recorded: `整理信息` is the reusable case-data center, not a guarantee-application pre-form. Guarantee applications, quotes, ads, and future output documents must consume confirmed case dossier data and run their own missing-field checks.
- The main editable case-data form is visually prioritized before guarantee-application readiness and company-specific draft controls. Saving from that form preserves the current tree/search/filter context so brokers can work inside a narrowed information category without being bounced back to a default output view.

### 2026-06-24

- Recorded the AI/RPA boundary: Broker Desk AI should handle semantic extraction, ownership classification, conflict detection, and auditable proposals, not act as a screen-clicking automation layer.
- Recorded the Agent/Skill/Tool boundary: skills are bounded capabilities, tools are product actions, and the agent is a controlled workflow with human approval before durable writes.
- Recorded the memory boundary: product memory lives in Broker Desk's database and audit records, not in the external model's private memory.
- Recentered the input direction on owner-first creation and routing: users can create cases, subjects, or properties before uploading files; uploaded files can then fill or update those chosen owners.

### 2026-06-27

- Added a device-transfer handoff document: `docs/operations/DEVELOPMENT_HANDOFF_2026_06_27.md`.
- Updated the frontstage navigation direction around `资料管理中心`, `建档导入`, `整理信息`, and `输出文件`.
- Implemented the first object-center scaffold: homepage relationship map, organize-center object list, and dedicated create flows for cases, subjects, and properties.
- Added per-field-card save behavior to the case workbench as a step away from one global save button.
- Recorded that this is not a finished UX state. The next pass must simplify density, hierarchy, object routing, and broker-facing language before treating it as pilot-ready.

### 2026-07-12

- Added a development-branch handoff document: `docs/operations/DEVELOPMENT_HANDOFF_2026_07_12.md`.
- Preserved the boundary that `dev/friend-test-fixes-20260702` is not merged into `main` without explicit user approval.
- Recorded friend-test driven input-system changes: compact intake controls, route-first import, object-oriented organization, per-field-card save, required/optional field administration, and a visual case-workbench dossier map.
- The case workbench `资料地图` is no longer a count-only navigation tree. It now presents selected-category field rows with value/status visibility and links unresolved items to the editing cards.
- Last development verification before handoff: `npm run lint`, `npm run build`, and `BASE_URL=http://localhost:3001 npm run test:regression` all passed.
