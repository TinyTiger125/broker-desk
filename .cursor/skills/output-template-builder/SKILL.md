# Skill: Output Template Builder

## When to use
- Output document generation
- Template settings/versioning
- Output quality gate and traceability

## Source Of Truth
- Follow `CLAUDE.md` + `04-output-center.mdc`.

## Required principles
1. No hardcoded output-only logic for business documents.
2. Output binds to template version and document metadata.
3. Generation must pass quality gate before write.
4. History must be queryable and exportable.

## Checklist
- document type is one of current supported set
- template version selected or explicitly unbound
- actor + timestamp + source refs recorded
- document number generated and persisted

## Output format
- Template/data mapping
- Generation flow
- Validation and fallback
- Traceability fields

