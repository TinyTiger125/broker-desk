# Repository Execution Rules

These rules are mandatory for every Codex task in this repository.

## Scope

- One task changes exactly one defect or one page.
- Split multi-defect or multi-page requests before editing.
- Do not mix unrelated refactors, documentation cleanup, or product changes.

## Verify Then Commit

- Every modification must run one explicit verification command after the edit.
- The command must produce visible pass/check output.
- When verification passes, immediately commit only the current task's scoped diff.
- Before commit, inspect `git diff --check`, `git status --short`, and the staged diff; never stage unrelated pre-existing changes.
- Record the command and result in `docs/operations/CURRENT_WORKING_CONTEXT.md` before commit.
- Do not push unless the user explicitly asks.

## Task Boundary

- Start the next item as a new task after committing the current task.
- Do not continue to the next defect after the current task is committed.

## Progress And Memory

- Only authoritative active-progress file: `docs/operations/CURRENT_WORKING_CONTEXT.md`.
- Dated handoffs, reports, plans, and acceptance docs are historical or task-specific references, not alternate progress authorities.
- `docs/PROJECT_MEMORY.md` is stable facts, durable decisions, durable release gates, and links only.
- Never put attempts, failures, transient debugging output, or per-task progress in `docs/PROJECT_MEMORY.md`.

## No-Progress Guard

- If two consecutive turns contain only analysis/read output and no diff or test output, terminate the current task and start a new task.
