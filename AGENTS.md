# Repository Execution Rules

These rules govern every task in this repository.

## Authority and boundaries

- The canonical repository is this checkout. Do not use sibling copies or
  generated .next* directories as working repositories.
- BACKLOG.md and the task cards under docs/tasks/ are the task authority.
- docs/operations/CURRENT_WORKING_CONTEXT.md is the only active handoff and
  active-progress entry.
- PRODUCT.md contains stable product facts. ARCHITECTURE.md describes the
  committed main architecture. Historical documents are reference only.
- DESIGN.md, CLAUDE*.md, docs/PROJECT_MEMORY.md,
  docs/operations/PM_CONTROL.md, and dated handoffs must not override the
  active task authority.
- A task card must have exactly one task identifier and one valid status:
  Proposed, Ready, In Progress, In Review, Blocked, or Done.

## Start

1. Read this file, then docs/operations/CURRENT_WORKING_CONTEXT.md and the
   assigned task card.
2. Read PRODUCT.md and ARCHITECTURE.md only as needed for the assigned task.
3. Run git status --short and inspect the relevant diff before editing.
4. Confirm that the requested files and behavior belong to the assigned task.

## Scope

- One task changes one defect, one page, or one bounded governance result.
- Do not silently enlarge scope, implement a downstream task, or redesign the
  product.
- A governance-only task may modify governance documents and governance
  checking scripts, but must not modify src/ or other business behavior.
- Preserve unrelated work. Never use git reset --hard, git checkout --,
  git clean, history rewriting, or equivalent destructive operations.

## Verification

- Every modification must run an explicit verification command with visible
  output.
- Run the task-card checks, git diff --check, and git status --short.
- Passing a static check does not prove browser, runtime, data, permission, or
  recovery acceptance when the task requires those forms of evidence.
- Do not mark a task Done or Ready when required evidence is absent.

## Commit and stop

- Stage only the current task's files.
- Inspect the staged diff before committing.
- Commit the scoped result after verification passes. Do not push unless the
  product owner explicitly asks.
- Update BACKLOG.md, the task card, and the short current context when the
  task result changes.
- Stop when the task is committed, blocked by a missing decision/evidence, or
  two consecutive rounds produce no new diff or validation result. Start the
  next task separately.
*** Delete File: broker-desk-web-dev/PRODUCT.md
