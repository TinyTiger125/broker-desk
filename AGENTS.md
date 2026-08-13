# Repository Execution Rules

These are the permanent rules shared by every agent and human contributor.
They do not define product direction, page details, business workflows, or
historical progress.

## Canonical repository and start

- The canonical repository is `/Users/laineyzhu/Documents/独立开发项目/房产专家/broker-desk-web-dev`.
- Do not use sibling copies, generated directories, or the parent project
  directory as a working repository.
- Before editing, verify the canonical path, current branch, expected base,
  and `git status --short --branch --untracked-files=all`.
- Read in this order: `AGENTS.md`,
  `docs/operations/CURRENT_WORKING_CONTEXT.md`, the assigned card under
  `docs/tasks/`, then only the product, architecture, and professional files
  required by that card.

## Authority and task scope

- `AGENTS.md` is the only permanent cross-role rule file.
- `BACKLOG.md` and the assigned task card define the current task scope,
  status, acceptance evidence, and completion boundary.
- `docs/operations/CURRENT_WORKING_CONTEXT.md` is the only active handoff and
  active-progress entry.
- `PRODUCT.md` contains stable product facts. `ARCHITECTURE.md` contains the
  committed architecture. Other documents are read only when the task calls
  for them; historical documents never override current authority.
- One task changes one bounded result. Do not silently enlarge its scope or
  implement a downstream task.

## Modification authorization

- Modify only files explicitly listed by the assigned task card.
- Preserve unrelated user work. Do not move, delete, regenerate, or rewrite
  files unless the task explicitly authorizes that exact action.
- A governance-only task may change governance documents and the direct
  governance checker needed to validate them, but must not change `src/`,
  database migrations, runtime behavior, public assets, or business config.
- If a required change is outside the card, stop and report the exact file and
  reason instead of assuming authorization.

## Git safety

- Work only on the assigned branch and keep `main` and recovery/WIP refs
  unchanged unless explicitly authorized.
- Never use `git reset --hard`, `git checkout --`, `git clean`, history rewrite,
  force push, or an equivalent destructive operation.
- Inspect the diff before staging. Stage only the current task's files.
- Commit one scoped result after verification. Do not push unless explicitly
  authorized.

## Verification and independent review

- Every change requires visible, task-card-defined verification output,
  `git diff --check`, and a final `git status --short`.
- Static checks do not prove runtime, browser, data, permission, or recovery
  behavior unless that evidence is explicitly collected.
- Implementation and independent review are sequential. The implementer
  finishes and exits before a separate reviewer starts.
- Do not mark a task `Done` or `Ready` while required evidence is missing.

## Agent lifecycle

- The project manager is the only agent allowed to create subagents.
- At most two subagents may be active at once, and no subagent may create a
  child agent.
- Do not run two agents against the same write set. Keep implementation and
  review sequential and independent.
- A subagent stops after its assigned result, on a real blocker, or after two
  consecutive rounds without new evidence, a useful diff, or validation.
- Close completed or blocked subagents before phase handoff. Do not keep an
  idle agent alive or create a permanent team.

## Stop and handoff

- Stop for an unexpected worktree change, baseline mismatch, out-of-scope
  access, security/data risk, missing decision, or required destructive action.
- A normal wait timeout is not evidence of failure; request a bounded status
  report before deciding whether to stop an agent.
- Before handoff, record the current task status, changed files, verification,
  commit, known risks, and next task in the active context. Then stop; do not
  start the next task in the same handoff.
