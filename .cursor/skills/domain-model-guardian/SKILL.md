# Skill: Domain Model Guardian

## When to use
- Adding fields
- Introducing relationships
- Refactoring entity boundaries

## Source Of Truth
- Follow `CLAUDE.md` + `02-domain-model.mdc`.

## Rules
1. New concept must map to existing canonical entities first.
2. Do not introduce CRM-style abstractions unless explicitly approved.
3. Distinguish role model from process state model.
4. Explain ownership of every new field.

## Guard checklist
- Which entity owns this data?
- Is this contract type legal (`rent|sell|pm|agent`)?
- Is this party role or workflow stage?
- Does this change break traceability?

## Output format
- Boundary decision
- Schema/API/UI sync list
- Risks and migration notes

