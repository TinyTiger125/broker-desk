# Development Handoff - 2026-07-12

> Historical handoff only. It is not the current progress source or active
> task authority. Use CURRENT_WORKING_CONTEXT.md and local task cards.

This handoff freezes the current development branch state for work on another device.

## Branch And Merge Boundary

- Repository: `https://github.com/TinyTiger125/broker-desk.git`
- Worktree used for this handoff: `broker-desk-web-dev`
- Branch to continue from: `dev/friend-test-fixes-20260702`
- Main/test worktree: `broker-desk-web`
- Main/test port: `3000`
- Development port: `3001`

Do not merge this branch into `main` until the user explicitly approves the merge. The friend-test fixes are still being evaluated in the development environment.

## Product State

The current product direction is:

- Broker-facing system, not public self-service onboarding.
- Main loop: create or route data owner -> organize confirmed facts -> output documents.
- `建档导入` is the intake and routing entrance, not just an upload screen.
- `整理信息` is the durable case-data workbench. It must stay output-neutral; document-specific missing checks belong in `输出文件`.
- Automated PDF filling for the first five guarantee-company application forms is temporarily sealed as a working milestone. Future changes should avoid disturbing saved template coordinates unless the task explicitly targets template authoring.

## Implemented Since Friend Test

Friend feedback drove this branch. The current implementation includes:

- Simplified frontstage IA around `资料管理中心`, `建档导入`, `整理信息`, and `输出文件`.
- Removed or rewrote obvious internal/product-planning language from main user-facing flows.
- Added terminology export/import workflow for user-facing copy review.
- Added compact intake controls so upload areas consume less vertical space.
- Added a route-first intake model: new case, existing case supplement, or temporary unassigned intake.
- Added object-oriented organization paths for cases, subjects, and properties.
- Reworked case workbench editing so unresolved fields appear first and completed fields leave the active queue.
- Added per-field-card dirty-save behavior instead of relying only on one global save.
- Added admin-side management for case workbench required/optional field behavior.
- Updated the case workbench `资料地图` from a count-only tree into a visual table/matrix:
  - top category rows show progress and status,
  - the selected category shows field-level rows,
  - each row shows current value or missing state,
  - unresolved rows link to the matching edit card on the right.

## Latest Validation

Last verified in the development worktree:

```bash
npm run lint
npm run build
BASE_URL=http://localhost:3001 npm run test:regression
```

Result: all three passed.

The regression was run against the development service on `3001`. The main/test service on `3000` was not modified for this handoff.

## Known Runtime Notes

- Local main/test service may run on `3000`.
- Local development service may run on `3001`.
- Do not treat local process state as source of truth after moving devices. Restart services from the checked-out branch.
- `.env.local` and provider secrets are intentionally ignored and must be recreated manually on the new device.
- `screenlog.*` is local runtime output and intentionally ignored.

## New Device Bootstrap

Use this sequence on the next device:

```bash
git clone https://github.com/TinyTiger125/broker-desk.git
cd broker-desk
git fetch origin
git checkout dev/friend-test-fixes-20260702
npm install
```

Then copy local environment variables into `.env.local`. Do not commit `.env.local`.

For development:

```bash
npm run dev -- -p 3001
```

For verification:

```bash
npm run lint
npm run build
BASE_URL=http://localhost:3001 npm run test:regression
```

## Next Work

Recommended next sequence:

1. Visually verify the new left-side `资料地图` table/matrix on the case workbench.
2. If the matrix is accepted, continue friend-feedback cleanup in the development branch only.
3. Re-run lint, build, and regression after each large UI/data-flow change.
4. Only after explicit user approval, prepare a merge review from `dev/friend-test-fixes-20260702` into `main`.

## Current Non-Goals

- Do not add a task/calendar system just to make the homepage busier.
- Do not move output-document readiness checks back into `整理信息`.
- Do not expose template factory controls to normal broker users.
- Do not train a custom model. AI memory should live in database records, audit trails, field mappings, and correction logs.
