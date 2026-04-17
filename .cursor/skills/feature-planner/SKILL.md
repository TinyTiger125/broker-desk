# Skill: Feature Planner

## When to use
- New feature request
- Non-trivial refactor
- Any work crossing more than one module

## Source Of Truth
- If conflict exists, follow `CLAUDE.md` first, then `.cursor/rules/*`.

## Steps
1. Classify request into one:
   - import
   - core_data
   - output
   - template
   - ai_future
2. Confirm scope:
   - in current phase?
   - out-of-scope but extensibility-only?
3. Map impacts:
   - entities
   - APIs/actions
   - pages
   - tests/checks
4. Propose minimal delivery slice with acceptance checks.

## Output format
- Goal
- Scope decision (in/out)
- Impacted files/modules
- Implementation order
- Verification plan

