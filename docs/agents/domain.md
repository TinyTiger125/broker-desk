# Domain Docs

This is a single-context repo.

Before using engineering skills such as `diagnose`, `tdd`, `to-prd`, `to-issues`, `triage`, `zoom-out`, or `improve-codebase-architecture`, read the domain context that matches the task.

## Primary Domain Files

- `CONTEXT.md` at the repo root: canonical domain glossary and product boundaries.
- `docs/PRODUCT_TOPOLOGY.md`: product value topology and V1 product center.
- `docs/V1_INPUT_FILE_MODEL.md`: input-side source file model and extraction-review principles.
- `docs/V1_CASE_WORKBENCH.md`: case workbench model, trust states, and required sections.
- `docs/V1_GUARANTEE_APPLICATION_OUTPUT.md`: guarantee company application output scope and template constraints.
- `docs/PM_CONTROL.md`: PM-led multi-agent operating mode and role boundaries.

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
