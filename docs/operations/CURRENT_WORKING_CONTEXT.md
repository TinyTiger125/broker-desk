# Broker Desk Current Working Context

> This is the only active handoff and active-progress entry.
> Last updated: 2026-08-13.

## 当前任务

完成 TASK-011 后，进入 TASK-002 的 diff 片段级归属审查。

## 当前分支与基点

- Branch: governance/clean-baseline-20260812
- Base: local main and governance baseline at fedb4c96e5f7b5e33caef977c5defd78ecf24ac9
- Recovery branch: safety/wip-mixed-worktree-20260812; preserve unchanged.
- WIP snapshot: 6f199375467bbfedd77bc90d80a53c423d4c9969; preserve unchanged.
- No src/ business code is in scope for this baseline.

## 当前状态

- TASK-001: Done after governance-only verification.
- TASK-002: In Review; fragment-level attribution remains evidence work.
- TASK-011: Done; governance metadata and document residue were repaired and independently reviewed.
- TASK-003: Proposed.
- TASK-006A: Proposed; not Ready and not implemented.
- TASK-004, TASK-005, TASK-006, TASK-007, TASK-008, TASK-009 remain Proposed.
- TASK-010 remains Blocked.

## 下一项任务

当前唯一任务：完成 TASK-002 的 diff 片段级归属审查并重新审查治理基线。

## 边界

- Do not implement TASK-006A or any business task in this handoff.
- The candidate address for TASK-006A is /organize-center?type=case.
- Lifecycle returnTo, party/property pages, browser back, q preservation, and
  global navigation are outside TASK-006A.
- BACKLOG.md and docs/tasks/ define task scope and status.
- Historical handoffs, CLAUDE files, PM_CONTROL, PROJECT_MEMORY, and DESIGN.md
  are not current progress authority.

## 验证记录

- Before commit: git status --short, git diff --check,
  npm run test:workflow-rules, relevant document checks, git diff --stat,
  and git diff.
- Required final proof: no src/ path changed; branch history is directly
  based on main; no task is Done or Ready by business inference.

## 当前交接入口

Read this file first, then the assigned task card, PRODUCT.md, and
ARCHITECTURE.md as needed. Stop after the governance commit; do not start
TASK-006A in the same task.
