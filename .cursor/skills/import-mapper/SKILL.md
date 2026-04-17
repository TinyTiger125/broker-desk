# Skill: Import Mapper

## When to use
- Excel/PDF/scan import requests
- Mapping and validation UX
- Import repair flow design

## Source Of Truth
- Follow `CLAUDE.md` + `03-import-center.mdc`.

## Required checks
1. Input source type identified (`excel|pdf|scan|manual`)
2. Mapping table explicit (`source_column -> target_field`)
3. Required-field completeness check present
4. Validation issue code and level defined
5. Fix path is one-click reachable
6. Import job history and status transitions preserved

## Output format
- Mapping spec
- Validation rules
- Error/fix flow
- Data persistence notes
- UX touchpoints

