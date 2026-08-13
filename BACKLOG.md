# Broker Desk Backlog

> BACKLOG.md and the linked local task cards are authoritative for task
> scope, status, dependencies, and completion evidence. GitHub Issues and
> historical handoffs may mirror information but do not define it.
>
> Valid statuses: Proposed, Ready, In Progress, In Review, Blocked, Done.

| ID | Priority | Task | Status | Depends on | Card | Completion evidence |
|---|---:|---|---|---|---|---|
| TASK-001 | P0 | Establish the pure governance baseline | Done | — | [TASK-001](docs/tasks/TASK-001.md) | Governance-only commit; checker and diff checks pass |
| TASK-002 | P0 | Decompose and register the mixed WIP by diff fragment | In Review | TASK-001 | [TASK-002](docs/tasks/TASK-002.md) | Fragment-level candidates recorded; unresolved fragments remain Needs Review |
| TASK-011 | P0 | Repair governance baseline metadata and document residue | Done | TASK-001 | [TASK-011](docs/tasks/TASK-011.md) | No patch residue; branch and baseline metadata agree; governance checks pass |
| TASK-012 | P0 | MIG-001 unify governance entrypoints | Done | — | [TASK-012](docs/tasks/TASK-012.md) | Entry documents converge on AGENTS.md, current context, and the assigned task card |
| TASK-003 | P0 | Close the input-material merge completion loop | Proposed | TASK-002 | [TASK-003](docs/tasks/TASK-003.md) | Selection, confirmation, result, failure, and refresh evidence |
| TASK-004 | P0 | Consolidate template-library and official-template boundaries | Proposed | TASK-002 | [TASK-004](docs/tasks/TASK-004.md) | Role-aware entry, visibility, and installation evidence |
| TASK-005 | P0 | Separate official template draft and publish states | Proposed | TASK-004 | [TASK-005](docs/tasks/TASK-005.md) | Independent draft save, publish, immutable version, and failure evidence |
| TASK-006 | P1 | Normalize entity-detail return paths | Proposed | TASK-002 | [TASK-006](docs/tasks/TASK-006.md) | Broader case, party, and property return-path evidence |
| TASK-006A | P1 | Case detail return to the organize center | Proposed | TASK-002 | [TASK-006A](docs/tasks/TASK-006A.md) | Candidate-only card; browser evidence required before Ready |
| TASK-007 | P0 | Diagnose duplicated template field characters | Proposed | TASK-002 | [TASK-007](docs/tasks/TASK-007.md) | Layer-separated visual diagnosis |
| TASK-008 | P0 | Complete archive/restore/audit for one record type | Proposed | TASK-002 | [TASK-008](docs/tasks/TASK-008.md) | Permission, lifecycle, idempotency, and audit evidence |
| TASK-009 | P1 | Resolve homepage output-state ambiguity | Proposed | TASK-003 | [TASK-009](docs/tasks/TASK-009.md) | Missing-field and output-ready acceptance evidence |
| TASK-010 | P0 | Re-run closed-pilot acceptance | Blocked | TASK-005, TASK-007, TASK-009 | [TASK-010](docs/tasks/TASK-010.md) | External, browser, PDF, permission, recovery, and two-device evidence |

## Current status boundary

- TASK-002 remains In Review; Needs Review is an evidence label, not a task
  lifecycle status.
- TASK-011 is Done and governance-only; it did not change business code or
  historical recovery references.
- TASK-003 and TASK-006A remain Proposed. Neither is Ready.
- TASK-006A is the only narrowed candidate business trial in this baseline.
- No business task is implemented by the pure governance baseline commit.
