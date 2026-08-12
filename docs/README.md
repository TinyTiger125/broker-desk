# Broker Desk Documentation Map

This directory is organized by decision status and operating purpose.

## Read Order

For normal product, engineering, QA, or agent work, read in this order:

1. `docs/operations/CURRENT_WORKING_CONTEXT.md`
2. `docs/PROJECT_MEMORY.md`
3. `CONTEXT.md`
4. The task-specific document listed below

`docs/operations/CURRENT_WORKING_CONTEXT.md` is the only authoritative active-progress file. Use it for active task scope, runtime, priorities, and operating rules. Dated handoffs, reports, plans, and acceptance documents are historical or task-specific references, not alternate progress authorities. If it conflicts with older documents, trust it first, then `docs/PROJECT_MEMORY.md`, then the newest dated operations or release document.

## Current Product Sources

Files in `docs/product/` describe current product direction and product-owned models.

| File | Purpose |
| --- | --- |
| `docs/product/BROKER_DESK_PRODUCT_TECHNICAL_CHARTER_2026_07_15.md` | Current product positioning, AI-native target form, module boundaries, technical architecture, roadmap, and pilot gates. |
| `docs/product/PRODUCT_TOPOLOGY.md` | Product position, value topology, and priority rule. |
| `docs/product/V1_INPUT_FILE_MODEL.md` | Source-file import, extraction, review, and trust model. |
| `docs/product/V1_CASE_WORKBENCH.md` | Case workbench behavior, trust states, and review workflow. |
| `docs/product/V1_CASE_INFORMATION_ARCHITECTURE.md` | Case dossier information tree, issue queues, evidence layer, and Excel-replacement workbench structure. |
| `docs/product/V1_GUARANTEE_APPLICATION_OUTPUT.md` | Guarantee-company application output model. |
| `docs/product/CANONICAL_FIELD_CATALOG.md` | Standard case field catalog and aliases. |
| `docs/product/PDF_TEMPLATE_AUTHORING_EXPERIENCE.md` | Internal PDF template authoring and calibration workflow. |
| `docs/product/V1_AI_CORRECTION_LEARNING.md` | Correction-event and AI experience learning loop. |
| `docs/product/AI_EXPERIENCE_MODEL_CONTEXT_CHAIN.md` | Internal AI experience handoff chain for future model context injection. |
| `docs/product/V1_AI_MODEL_SELECTION.md` | OpenAI model routing and AI runtime boundary. |
| `docs/product/MULTI_TENANT_PERMISSION_MODEL.md` | Tenant, membership, lifecycle-wide permissions, template governance, and release gates. |
| `docs/product/RECORD_LIFECYCLE.md` | Soft-archive and restore rules for cases, parties, properties, permissions, and data retention. |

## Engineering Sources

Files in `docs/engineering/` describe runtime, persistence, and operational architecture.

| File | Purpose |
| --- | --- |
| `docs/engineering/RUNTIME_STABILITY_AND_ARCHITECTURE.md` | Dev/runtime stability rules and release-like verification guidance. |
| `docs/engineering/GUARANTEE_TEMPLATE_PUBLICATION.md` | Official template publication, tenant installation, and cross-device PDF consistency contract. |
| `docs/operations/RELEASE_V0.2.0_RC1_2026_08_05.md` | Unified public-beta candidate baseline, scope, verification gate, and versioning rule. |
| `docs/engineering/POSTGRES_SETUP.md` | Postgres/Supabase setup and driver switching. |
| `docs/engineering/postgres_schema.sql` | Manual SQL schema reference. |
| `docs/engineering/postgres_rls.sql` | Supabase/Postgres RLS baseline for tenant isolation. |

## Operations Sources

Files in `docs/operations/` describe PM control, terminology, and market constraints.

| File | Purpose |
| --- | --- |
| `docs/operations/DEVELOPMENT_HANDOFF_2026_06_27.md` | Current device-transfer handoff: implementation state, risks, and next steps as of 2026-06-27. |
| `docs/operations/DEVELOPMENT_HANDOFF_2026_07_01.md` | Final pre-friend-test handoff: blank seed mode, QA lifecycle, external test state, and known risks. |
| `docs/operations/DEVELOPMENT_HANDOFF_2026_07_12.md` | Current development-branch handoff: friend-test fixes, input workbench state, validation status, and no-merge boundary. |
| `docs/operations/FRIEND_TEST_CHECKLIST_2026_07_02.md` | External friend-test task checklist, pass/fail signals, and issue severity for the V1 chain. |
| `docs/operations/PM_CONTROL.md` | Historical PM task board and multi-agent operating model. |
| `docs/operations/JP_COMPLIANCE_CHECKLIST.md` | Japan real-estate compliance mapping checklist. |
| `docs/operations/JA_TERMINOLOGY_STYLE_GUIDE.md` | Japanese terminology style guide. |
| `docs/operations/UI_TERMINOLOGY_WORKFLOW.md` | CSV export/import workflow for UI terminology review. |
| `docs/operations/UI_TERMINOLOGY_REVIEW_HANDOFF_2026_07_14.md` | Friend-review handoff for the current UI terminology package. |
| `docs/operations/UI_TERMINOLOGY_REVIEW_GUIDE_JA_2026_07_14.md` | Chinese instructions for a Japanese terminology quick review CSV. |
| `docs/operations/PRODUCT_TERMINOLOGY_DICTIONARY_JA_2026_07_14.md` | Japanese product glossary for the current practical terminology review. |
| `docs/operations/PRODUCT_TERMINOLOGY_DICTIONARY_2026_07_14.md` | Product-level glossary and terminology decisions for the July terminology review. |

## QA And Evidence

| Directory | Purpose |
| --- | --- |
| `docs/acceptance/` | Formal acceptance reports and screenshots. |
| `docs/design-audit/` | Visual audit evidence and screenshot comparisons. |
| `docs/agents/` | Agent task briefs and domain read instructions. |

Current full-product audit:

- `docs/design-audit/product-charter-20260715/README.md`

## Archive

`docs/archive/` contains historical documents that may explain earlier decisions but are not current source-of-truth documents.

Before using archived material, check whether `docs/PROJECT_MEMORY.md`, `CONTEXT.md`, or a current `docs/product/` file supersedes it.

## New Document Rule

Do not add a new root-level document by default.

Use this placement rule:

- Product direction or domain model: `docs/product/`
- Runtime, database, architecture, or deployment: `docs/engineering/`
- PM process, compliance, terminology, or operating model: `docs/operations/`
- Acceptance output or screenshots: `docs/acceptance/`
- Agent prompt or reusable task brief: `docs/agents/`
- Historical or superseded material: `docs/archive/`

If a new document becomes durable product truth, add only its stable fact or index entry to `docs/PROJECT_MEMORY.md` and this map; never create a second active-progress file.
