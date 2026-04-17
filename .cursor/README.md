# Cursor Project Configuration (Broker Desk)

## Purpose
This folder defines project-scoped guidance for coding agents used in this repository.

## Precedence
1. `CLAUDE.md` (single source of truth for this project)
2. `.cursor/rules/*.mdc`
3. `.cursor/skills/*/SKILL.md`

If there is a conflict, follow higher precedence.

## Active Rules
- `rules/00-product-positioning.mdc`
- `rules/01-scope-boundaries.mdc`
- `rules/02-domain-model.mdc`
- `rules/03-import-center.mdc`
- `rules/04-output-center.mdc`
- `rules/07-coding-workflow.mdc`
- `rules/08-ui-ux-constraints.mdc`

## Active Skills
- `skills/feature-planner/SKILL.md`
- `skills/import-mapper/SKILL.md`
- `skills/domain-model-guardian/SKILL.md`
- `skills/output-template-builder/SKILL.md`
- `skills/service-request-traceability/SKILL.md`
- `skills/migration-safe-refactor/SKILL.md`
- `skills/workspace-admin-ui/SKILL.md`
- `skills/import-center-ui/SKILL.md`
- `skills/output-preview-ui/SKILL.md`
- `skills/template-editor-ui/SKILL.md`
- `skills/entity-detail-pattern/SKILL.md`
- `skills/responsive-business-layout/SKILL.md`

## External Tooling (Manual Install In Cursor)
Recommended install order:
1. Figma plugin (design context ingestion)
2. `frontend-design` skill/plugin
3. Playwright/browser automation MCP for screenshot regression

Notes:
- Keep plugin count minimal.
- Prefer workflow quality and implementation readiness over visual gimmicks.
