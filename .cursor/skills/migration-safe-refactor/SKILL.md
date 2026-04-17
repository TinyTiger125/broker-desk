# Skill: Migration-Safe Refactor

## When to use
- Direction shifts
- Large module rewiring
- Schema/service/route refactors with compatibility risk

## Source Of Truth
- Follow `CLAUDE.md` and active sprint boundaries.

## Process
1. Inventory current behavior (what must not break).
2. Define target behavior (what changes now vs later).
3. Split into safe slices:
   - schema/data compatibility
   - service/action compatibility
   - UI route compatibility
4. Provide fallback/rollback note per slice.

## Mandatory verification
- `npm run lint`
- `CI=1 npm run build`
- `npm run test:ja-terms`
- `npm run test:regression`

## Output format
- Before/after matrix
- Compatibility risks
- Incremental rollout steps
- Verification results

