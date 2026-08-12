# Broker Desk Documentation Map

## Authority

- docs/operations/CURRENT_WORKING_CONTEXT.md is the only active handoff and
  active-progress file.
- BACKLOG.md and docs/tasks/ are the local task authority.
- PRODUCT.md contains stable product facts.
- ARCHITECTURE.md describes the committed main architecture.
- DESIGN.md, CLAUDE*.md, docs/PROJECT_MEMORY.md,
  docs/operations/PM_CONTROL.md, dated handoffs, plans, and reports are
  historical or reference material unless a task explicitly cites them.

## Read order

1. AGENTS.md
2. docs/operations/CURRENT_WORKING_CONTEXT.md
3. The assigned card under docs/tasks/
4. PRODUCT.md and ARCHITECTURE.md as needed
5. Deeper product, engineering, operations, or acceptance documents only when
   the assigned task requires them

## Document placement

- Product direction and domain models: docs/product/
- Runtime, database, and architecture details: docs/engineering/
- PM process, compliance, terminology, and operating procedures:
  docs/operations/
- Acceptance evidence and screenshots: docs/acceptance/
- Agent briefs and reusable checks: docs/agents/
- Superseded material: docs/archive/

## Historical files

Historical files are retained for traceability. They must not present
themselves as the current task board, current progress source, or current
handoff. When a historical file conflicts with the active context, local
task cards, PRODUCT.md, or ARCHITECTURE.md, it loses.

## DESIGN.md

DESIGN.md is retained as a design-contract candidate. Its unique decisions
will later be reviewed and split into the appropriate product or engineering
documents. This baseline does not perform that split.
