# Domain Docs

This is a single-context repo.

Before using engineering skills such as `diagnose`, `tdd`, `to-prd`, `to-issues`, `triage`, `zoom-out`, or `improve-codebase-architecture`, read the domain context that matches the task.

## Primary Domain Files

- `docs/README.md`: documentation map, current directories, and archive rules.
- `CONTEXT.md` at the repo root: canonical domain glossary and product boundaries.
- Read the relevant professional files under `docs/product/`, `docs/engineering/`, or `docs/operations/` only when the task requires them.
- `docs/archive/legacy-project-memory/PROJECT_MEMORY_2026_08_06.md`: historical snapshot only; use it for traceability, never as the current domain source.
- `docs/product/PRODUCT_TOPOLOGY.md`: product value topology and V1 product center.
- `docs/product/V1_INPUT_FILE_MODEL.md`: input-side source file model and extraction-review principles.
- `docs/product/V1_CASE_WORKBENCH.md`: case workbench model, trust states, and required sections.
- `docs/product/V1_GUARANTEE_APPLICATION_OUTPUT.md`: guarantee company application output scope and template constraints.
- `docs/product/V1_AI_CORRECTION_LEARNING.md`: implicit AI correction learning loop from user-confirmed review/save/export actions.
- `docs/product/V1_AI_MODEL_SELECTION.md`: OpenAI model routing, Responses API surface, and AI runtime guardrails.
- `docs/product/MULTI_TENANT_PERMISSION_MODEL.md`: tenant, membership, lifecycle-wide permissions, template governance, AI gates, and audit release gates.
- `docs/operations/PM_CONTROL.md`: PM-led multi-agent operating mode and role boundaries.

## ADRs

Architecture Decision Records should live under `docs/adr/`.

No ADR directory is required until there is a real decision worth recording. Create ADRs only when the decision is hard to reverse, surprising without context, and the result of a real trade-off.

## Vocabulary Discipline

Use the terms in `CONTEXT.md` when writing:

- PRDs
- GitHub issue titles
- agent task briefs
- test names
- architecture reports
- diagnosis hypotheses

Do not drift into generic CRM, property management, OCR, or PDF-generator language unless the user explicitly changes the product direction.

If a required concept is missing from `CONTEXT.md`, run a `grill-with-docs` style clarification and update the glossary before publishing durable issues.
