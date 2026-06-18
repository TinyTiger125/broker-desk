# Multi-Tenant Permission Model

Date: 2026-06-18

## Decision

Broker Desk's multi-tenant and permission model must be centered on the full real-estate document workflow:

```text
Source files
  -> input extraction
  -> extraction review
  -> case workbench
  -> confirmed case data
  -> output artifacts
  -> audit and correction learning
```

It must not be centered on guarantee-company PDF output.

Guarantee-company applications are one important V1 output family, but they are only one consumer of confirmed case data. The permission system must protect the whole information lifecycle: uploaded source material, extracted candidates, reviewed facts, workbench edits, generated outputs, template assets, AI usage, and audit records.

## Product Boundary

Broker Desk is a structured business-information workbench for small Japanese real-estate brokerage teams.

The product is not:

- a single-user PDF filler
- a generic CRM
- a full property-management system
- a generic OCR storage system
- an autonomous AI decision-maker

The release-ready permission model should therefore answer these questions first:

1. Which company or office owns this work?
2. Which members can see or edit this case?
3. Which users can upload and extract source files?
4. Which users can confirm structured case data?
5. Which users can create, approve, or download outputs?
6. Which users can edit reusable templates?
7. Which users can call AI functions, and under what cost/privacy limits?
8. Which operations must be auditable?

## Target Customer Shape

The expected customer is a small real-estate company, branch office, or broker team.

The tenant should represent the operating organization, not a single document type:

```text
Tenant = company, branch, or workspace
User = login identity
Membership = user's role inside one tenant
Case = one business transaction or document-work package
```

A user may belong to multiple tenants. A case belongs to exactly one tenant in the MVP model.

Do not introduce headquarters/branch inheritance, cross-tenant sharing, or field-level visibility in the first implementation unless concrete paying users require them.

## Core Objects

### Identity And Organization

```text
Tenant
User
Membership
TenantInvitation
TenantSetting
```

`Tenant` owns business data. `User` is only a login identity. `Membership` is the authority boundary.

### Work Objects

```text
Case
SourceFile
ExtractionJob
ExtractionReview
CanonicalRecord
ReviewTask
OutputArtifact
AuditLog
CorrectionEvent
ExperienceUpdate
```

Definitions:

- `Case`: one transaction or document-work unit.
- `SourceFile`: uploaded Excel, PDF, scan, image, or customer-provided file.
- `ExtractionJob`: deterministic or AI-assisted processing of a source file.
- `ExtractionReview`: field-level decision layer: accepted, edited, rejected, unknown, conflict.
- `CanonicalRecord`: confirmed business facts stored through the case field catalog.
- `ReviewTask`: human attention item for missing, uncertain, conflicting, or approval-required fields.
- `OutputArtifact`: generated business output, such as a guarantee-company application, customer summary, lease package, owner notice, or report.
- `AuditLog`: durable operation record.
- `CorrectionEvent`: structured before/after evidence from user corrections.
- `ExperienceUpdate`: reviewed product-owned learning that may guide future AI behavior.

### Template Objects

```text
OutputTemplate
OfficialTemplate
TenantTemplate
TemplateVersion
CaseOutputDraft
```

Definitions:

- `OutputTemplate`: generic output template abstraction.
- `OfficialTemplate`: platform-maintained base template, usually read-only to tenants.
- `TenantTemplate`: tenant-private variant derived from an official template.
- `TemplateVersion`: immutable version used for production output.
- `CaseOutputDraft`: output-specific values and edits for one case and one output template.

Guarantee-company forms should be modeled as:

```text
OutputTemplate.type = "guarantee_application"
```

They should not define the top-level permission architecture.

## Tenant Scope Rule

All business-owned tables must include `tenant_id` unless they are global platform catalog tables.

Tenant-scoped:

- cases
- source files
- extraction jobs
- extraction reviews
- canonical records / confirmed data
- review tasks
- output drafts
- output artifacts
- tenant templates
- template versions
- attachments
- correction events
- experience updates
- audit logs

Global or platform-scoped:

- users
- tenants
- memberships
- official output template definitions
- platform template assets
- system-level QA fixtures

For every API, server action, job, or download route, the service must resolve:

```text
session user
  -> active tenant
  -> membership
  -> permission
  -> resource tenant ownership
```

Do not trust `tenantId` from the request body. It may identify the requested workspace, but it must be verified against the authenticated user's membership.

## Roles

Use a small role set first. Do not solve every future enterprise hierarchy in MVP.

```text
PlatformOwner
TenantOwner
TenantAdmin
Manager
Broker
DataOperator
Reviewer
Viewer
```

### PlatformOwner

Internal operator role.

Can:

- manage official templates
- run platform QA tools
- inspect system health
- support tenant incidents under audit

This role should not be available inside ordinary tenant member management.

### TenantOwner

Business owner of the workspace.

Can:

- manage tenant settings
- manage members and billing
- view all tenant cases
- manage tenant templates
- approve and download final outputs
- view audit logs
- configure AI feature access

### TenantAdmin

Operational administrator.

Can:

- manage members except owners
- view and manage all cases
- upload and review source files
- manage tenant template drafts and published versions
- approve outputs
- view audit logs

### Manager

Branch or team lead.

Can:

- view team or all assigned cases
- assign cases
- review high-risk fields
- approve output readiness where tenant policy allows
- download final outputs
- view operational audit for managed cases

### Broker

Primary frontstage user.

Can:

- create and manage own or assigned cases
- upload source files
- review and edit case data
- generate previews and drafts
- download final outputs if tenant policy allows

Should not:

- publish reusable templates
- change tenant-level settings
- run bulk AI template pre-matching unless explicitly granted

### DataOperator

Back-office or assistant role.

Can:

- upload source files
- run extraction
- review missing and uncertain fields
- edit confirmed case data where assigned
- prepare output drafts

May be restricted from:

- final output download
- member management
- template publish
- billing/settings

This role matters because Broker Desk is a document-preparation workbench, not only a sales tool.

### Reviewer

Approval role.

Can:

- inspect source evidence
- approve reviewed case facts
- approve final outputs
- resolve review tasks

May be read-only outside review/approval actions.

### Viewer

Read-only role.

Can:

- view permitted cases and outputs
- inspect audit where tenant policy allows

Cannot:

- upload
- edit
- run AI
- generate final documents
- publish templates

## Permission Actions

Permission checks should be action-based, not page-based.

### Tenant And Member

```text
tenant.read
tenant.update_settings
tenant.manage_billing
member.invite
member.update_role
member.remove
audit.view
```

### Case

```text
case.create
case.read_own
case.read_assigned
case.read_team
case.read_all
case.update_own
case.update_assigned
case.assign
case.close
case.delete
```

### Input And Extraction

```text
source.upload
source.read
source.delete
source.download_original
extract.run
extract.view_result
extract.accept_result
extract.override_result
extract.reject_result
```

### Workbench And Canonical Data

```text
record.read
record.read_sensitive
record.update
record.confirm
record.mark_unknown
record.resolve_conflict
review_task.create
review_task.resolve
review_task.approve
```

### Output

```text
output.preview
output.create_draft
output.update_draft
output.generate_final
output.download_final
output.delete
```

### Template

```text
template.view
template.copy_official
template.edit_draft
template.ai_prematch
template.publish
template.rollback
template.archive
template.manage_official
```

### AI

```text
ai.extract
ai.review_assist
ai.field_prematch
ai.preflight
ai.experience_review
ai.override_existing_values
```

`ai.override_existing_values` must be separate. It is higher risk than asking AI to fill empty candidates.

## Suggested MVP Permission Matrix

| Capability | Owner | Admin | Manager | Broker | DataOperator | Reviewer | Viewer |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Manage tenant settings | yes | limited | no | no | no | no | no |
| Manage members | yes | yes, except owners | no | no | no | no | no |
| Create cases | yes | yes | yes | yes | limited | no | no |
| Read all tenant cases | yes | yes | policy | no | no | no | no |
| Read assigned cases | yes | yes | yes | yes | yes | yes | yes |
| Upload source files | yes | yes | yes | yes | yes | no | no |
| Run extraction | yes | yes | yes | yes | yes | no | no |
| Confirm case data | yes | yes | yes | yes | yes | yes | no |
| Approve review tasks | yes | yes | yes | no by default | no by default | yes | no |
| Preview outputs | yes | yes | yes | yes | yes | yes | yes |
| Generate final output | yes | yes | yes | policy | no by default | yes | no |
| Download final output | yes | yes | yes | policy | no by default | yes | no |
| Edit tenant template draft | yes | yes | limited | no by default | no | no | no |
| Publish tenant template | yes | yes | no by default | no | no | no | no |
| Manage official template | platform only | no | no | no | no | no | no |
| Use AI extraction | yes | yes | yes | yes | yes | no | no |
| Use AI template prematch | yes | yes | no by default | no | no | no | no |
| View audit | yes | yes | limited | own actions | no by default | limited | no |

This matrix is intentionally conservative. Product usability should be tuned by tenant policies after the core service-side checks exist.

## Case Visibility

MVP should support three visibility scopes:

```text
own
assigned
all_tenant
```

Do not introduce complex branch inheritance yet.

Recommended rules:

- Owner/Admin: `all_tenant`.
- Manager: `assigned` plus optional `team` later.
- Broker/DataOperator/Reviewer: `assigned` by default.
- Viewer: `assigned` read-only.

Every case should have:

```text
tenant_id
created_by_user_id
owner_user_id
assigned_user_ids or case_members
status
```

If multiple users collaborate on one case, use a `case_members` table instead of overloading a single `owner_user_id`.

## Template Governance

Template editing is high risk because a bad template can corrupt many future outputs.

Use layered template state:

```text
official global template
  -> tenant private template draft
    -> tenant published template version
      -> current-case output draft / one-off correction
```

### Official Template

Owned by PlatformOwner.

Used as a clean source and upgrade path.

Ordinary tenants can copy it but cannot mutate it.

### Tenant Template Draft

Owned by one tenant.

Editable by TenantOwner/TenantAdmin or a future explicit template-maintainer role.

Draft changes do not affect production outputs until published.

### Tenant Published Template Version

Immutable version used for normal output generation.

Every generated `OutputArtifact` must store:

```text
template_id
template_version_id
field_mapping_snapshot
layout_snapshot
generated_by
generated_at
```

### Case One-Off Correction

Belongs to one case/output draft only.

Useful for fixing one application without polluting tenant or official templates.

Promoting a one-off correction into a tenant template requires an explicit template permission and audit event.

## AI Permission Model

AI access is not one permission.

Separate it by risk:

1. Extraction assist: proposes candidates from source files.
2. Review assist: highlights missing/conflicting fields.
3. Template pre-match: binds empty template boxes to field catalog keys.
4. Existing-value overwrite: replaces existing field binding/value.
5. Output preflight: flags risk before final PDF generation.
6. Experience review: turns correction events into reusable notes.

Rules:

- AI must not silently confirm case facts.
- AI must not overwrite confirmed values unless user has explicit overwrite permission.
- AI template pre-match should only operate safely on empty or replaceable boxes.
- Tenant AI usage must be auditable and eventually quota-limited.
- Promoted experience updates must be scoped: case, user/team, source template, output template, field catalog, or platform candidate.

Minimum runtime fields:

```text
tenant.ai_enabled
tenant.ai_monthly_quota
ai_job.tenant_id
ai_job.user_id
ai_job.case_id
ai_job.task_type
ai_job.model
ai_job.status
ai_job.cost_estimate
ai_job.created_at
```

## Audit Requirements

Audit is not optional for release.

Must audit:

- login and tenant switching
- member invite, role change, removal
- source upload and deletion
- extraction job creation
- extraction review accept/edit/reject/unknown
- confirmed case data update
- final output generation and download
- template draft edit
- template publish, rollback, archive
- AI field pre-match
- AI overwrite of existing values
- official template promotion

Audit entries should include:

```text
tenant_id
user_id
action
target_type
target_id
case_id, when applicable
before_snapshot, for high-risk changes
after_snapshot, for high-risk changes
ip/user_agent, when available
created_at
```

Do not store unnecessary raw PII in broad audit summaries. Store stable references and scoped snapshots where needed for traceability.

## Data Isolation Rules

### Service Layer

Every repository call that reads or writes tenant-owned data should receive `tenantId`.

Bad:

```text
getCase(caseId)
```

Better:

```text
getCaseForTenant(tenantId, caseId)
```

Or:

```text
requireCaseAccess(user, tenantId, caseId, "case.read_assigned")
```

### API Layer

Every API/server action should use one of:

```text
requireTenantSession()
requireTenantPermission(action)
requireCasePermission(caseId, action)
requireTemplatePermission(templateId, action)
```

The current `getDefaultUser` and actor-cookie switching model must not survive production release.

### Database Layer

Indexes should support tenant-scoped lookups:

```text
(tenant_id, id)
(tenant_id, created_at)
(tenant_id, case_id)
(tenant_id, status)
```

For Postgres production, Row Level Security may be considered later, but the first required step is explicit service-layer tenant scoping and tests.

## OutputArtifact Rule

Every generated output must be reproducible or explainable.

Store:

```text
tenant_id
case_id
output_type
template_id
template_version_id
generated_by_user_id
input_data_snapshot
draft_value_snapshot
field_mapping_snapshot
layout_snapshot
downloaded_at
downloaded_by_user_id
```

This applies to guarantee-company applications and future outputs.

## Migration Sequence

### Phase 1: Auth And Tenant Foundation

Goal: remove the false single-user model.

Implementation status as of 2026-06-18: partially implemented as a foundation.

Implemented:

- Memory and Postgres data layers now include `tenants` and `tenant_memberships`.
- Active tenant resolution exists through membership, optional tenant cookie, and default active membership.
- `requireTenantSession` exists for route/server-side callers.
- Initial action-based role matrix exists for owner/admin/manager/broker/data-operator/reviewer/viewer/platform-owner.
- `/api/tenant/session` can expose the resolved tenant session for diagnostics.

Not implemented yet:

- Real external identity provider login.
- Systematic replacement of demo/default user semantics.
- Full enforcement across every frontstage route and server action.

Tasks:

1. Add real authenticated user session.
2. Add `tenants` and `memberships`.
3. Add active tenant resolution.
4. Disable actor switching in production by default.
5. Add `requireTenantSession` helper.
6. Add initial Owner/Admin/Broker roles.

Exit criteria:

- No production route uses arbitrary actor cookie identity.
- Every user action has a resolved tenant.

### Phase 2: Tenant-Scoped Data Access

Goal: prevent cross-tenant data leaks.

Implementation status as of 2026-06-18: implemented for the main application path, with production hardening still required.

Implemented:

- Business-owned memory and Postgres records now carry `tenant_id`/`tenantId` for CRM records, quote records, source import jobs, brokerage cases, extraction review items, guarantee drafts, correction events, AI experience drafts, attachments, generated outputs, and output template settings/versions.
- Repository reads/writes accept tenant scope and filter by tenant before returning records.
- Frontstage pages, server actions, download APIs, upload APIs, hub export, and QA helper APIs resolve `requireTenantSession` and pass tenant scope into data access.
- Cross-tenant regression coverage exists in `npm run test:tenant-data-access`.
- The default local data set is backfilled into `tenant_cherry` for compatibility.

Still required before production:

- Real identity provider integration; the current session helper still starts from the local/demo user model.
- Persistent Postgres migration rehearsal against a copy of production-like data.
- Database-level RLS or equivalent defense in depth after service-layer scope is stable.
- Permission-denial tests for destructive or high-risk actions.

Tasks:

1. Add `tenant_id` to business tables.
2. Backfill seed/local data into a default tenant.
3. Change repository functions to tenant-scoped reads/writes.
4. Add tests that tenant A cannot access tenant B cases, files, drafts, attachments, outputs, templates, or audit logs.

Exit criteria:

- Cross-tenant access tests fail before guard and pass after guard.
- No frontstage route can read a case by id without tenant scoping.

### Phase 3: Permission Helper And Route Enforcement

Goal: make permission checks systematic.

Implementation status as of 2026-06-18: implemented for the high-risk local release path, with production auth still external.

Implemented:

- `requireTenantSession` can require one or multiple permission actions.
- Ordinary broker and data-operator defaults no longer include final-output download or extraction override.
- AI template field pre-match requires both `template.ai_prematch` and `ai.field_prematch`.
- Template settings publish requires both `template.edit_draft` and `template.publish`.
- Guarantee preview template-level layout save requires template edit and publish permission.
- Member invite, role update, and suspension require server-side member permissions.
- `npm run test:tenant-session` and `npm run test:tenant-governance` cover the high-risk role matrix.

Tasks:

1. Implement action-based permission map.
2. Add helpers for tenant, case, source, output, template, and AI actions.
3. Wire helpers into API routes and server actions.
4. Add denial tests for high-risk actions.

Exit criteria:

- Template publish, final download, AI pre-match, source delete, and member management all require server-side permission.

### Phase 4: Template Governance

Goal: protect reusable output assets.

Implementation status as of 2026-06-18: partially implemented as a local governance boundary.

Implemented:

- `/platform/templates` is a PlatformOwner-only official guarantee-template overview.
- PlatformOwner access is separate from tenant membership and must be explicitly configured in production through `BROKER_DESK_PLATFORM_OWNER_IDS`; local development defaults to `user_demo`.
- Official guarantee-template layout snapshots can be captured from the current local layout store.
- Official guarantee-application downloads create generated output records with case, template, data, draft, field mapping, and layout snapshots.
- Template-level save from the preview flow is server-side permission gated.

Still required before external release:

- Move actual coordinate editing out of the broker-facing preview surface.
- Add explicit draft -> publish workflow for guarantee layout changes instead of immediately writing local layout JSON.
- Store immutable published guarantee-template versions in the database or an equivalent versioned artifact store.

Tasks:

1. Separate official template from tenant template.
2. Add tenant template draft and published version.
3. Make production output use published versions only.
4. Store template/layout snapshots on `OutputArtifact`.
5. Add publish and rollback audit.

Exit criteria:

- Ordinary brokers cannot mutate reusable template state.
- Draft template changes do not affect final outputs until published.
- Historical generated outputs remain bound to the version used at generation time.

### Phase 5: AI Governance

Goal: prevent uncontrolled AI cost, privacy, and overwrite risk.

Implementation status as of 2026-06-18: permission-gated, not quota-complete.

Implemented:

- AI field pre-match is blocked unless the user has both template pre-match and AI field pre-match permissions.
- Existing blank-template safety metadata is still required before pre-match runs.
- Approved AI experience retrieval is tenant/template scoped in the existing retrieval regression.

Still required before external release:

- Persistent AI job records with token/cost estimates.
- Tenant AI quota and usage dashboard.
- Separate production policy for model selection and sensitive-data redaction.

Tasks:

1. Add AI task records and tenant usage tracking.
2. Gate AI calls by action type.
3. Separate empty-box pre-match from existing-value overwrite.
4. Add quota and audit hooks.
5. Attach approved experience retrieval only within tenant/source/template scope.

Exit criteria:

- AI calls are attributable to tenant/user/task.
- AI cannot overwrite confirmed data or existing template bindings without explicit permission.

### Phase 6: Production Auth And Database Isolation

Goal: remove demo identity from the production path and make tenant isolation enforceable below the service layer.

Implementation status as of 2026-06-18: foundation implemented, live production database verification still required.

Implemented:

- Production auth fails closed by default when `BROKER_DESK_AUTH_MODE` is not configured.
- `BROKER_DESK_AUTH_MODE=trusted_header` supports an upstream IdP/auth-proxy integration through signed server-side headers.
- `users.external_auth_subject` separates internal Broker Desk user IDs from immutable external identity-provider subjects.
- `docs/engineering/postgres_rls.sql` defines the first Supabase/Postgres RLS baseline around `tenant_id`, `external_auth_subject`, and active `tenant_memberships`.
- `npm run test:production-security` checks production demo-auth lockout, trusted-header secret enforcement, and RLS table coverage.

Still required before external release:

- A concrete IdP/proxy deployment, with header stripping/injection verified outside the app.
- Backfill `users.external_auth_subject` for every real production user.
- Apply and verify `docs/engineering/postgres_rls.sql` against the production Supabase/Postgres database.
- Use a database role that does not bypass RLS for any user-facing Data API path.
- Add a live RLS verification query that proves tenant A cannot read tenant B as `authenticated`.
- Remove `BROKER_DESK_ENABLE_DEMO_AUTH=true` from all production deployments.

Tasks:

1. Select and deploy the production IdP/proxy.
2. Strip incoming auth headers at the edge and inject verified signed headers.
3. Backfill `users.external_auth_subject`.
4. Apply RLS SQL in production.
5. Verify cross-tenant denial through the same role/path external clients would use.

Exit criteria:

- No production business route resolves a user from local demo fallback.
- A user without active membership cannot read or mutate tenant data through service APIs or database policies.

### Phase 7: Admin UI

Goal: expose permissions safely after the backend is enforceable.

Implementation status as of 2026-06-18: member-management foundation implemented.

Implemented:

- `/settings/members` lists tenant members, adds local members, updates roles, suspends/reactivates members, prevents self-suspension, prevents removing the last active owner, and audits member changes.
- Existing `/audit-log` remains the operational audit viewer.
- Existing `/settings/output-templates` remains tenant output-template settings and version history.

Still required before external release:

- Real invitation email flow tied to the production identity provider.
- Tenant settings and billing UI.
- AI quota/permission settings UI.
- Move official-template editing to a dedicated backstage experience.

Tasks:

1. Tenant settings page.
2. Member management page.
3. Role assignment.
4. Template management backstage page.
5. Audit viewer.
6. AI usage/permission settings.

Exit criteria:

- UI reflects service-layer permissions.
- Hiding a button is never the only enforcement.

## What Not To Build Yet

Do not build these until the basic tenant boundary is proven:

- headquarters/branch/team inheritance
- field-level PII permissions
- cross-tenant case sharing
- customer portal
- template marketplace
- per-field legal approval workflow
- ordinary-user template marketplace publishing
- automatic AI template publish

These may become useful, but implementing them before tenant isolation will create complexity without solving the immediate release risk.

## Release Gate

Broker Desk should not be offered to external users until these are true:

1. Authenticated users exist.
2. Every business object is tenant-scoped.
3. Server-side permissions protect all write/download/AI/template actions.
4. Ordinary users cannot mutate global or official templates.
5. Final outputs store template and data snapshots.
6. Audit logs capture high-risk operations.
7. Cross-tenant access tests exist and pass.

The five guarantee-company templates may be functionally good enough for continued internal calibration, but they do not make the product production-safe without this permission boundary.
