# Skill: Template Editor UI

## When to use
- Template settings page updates
- Versioning/diff/activation interactions
- Variable mapping preview improvements

## Objective
Build a governance-friendly template center, not a generic rich-text editor.

## Required First-Class Features
1. Template list and state
2. Version list and apply/rollback confirmations
3. Variable mapping preview
4. Enable/disable controls with audit trail

## Design Rules
- Keep legal/format governance obvious.
- Actions must be explicit and reversible where possible.
- Do not hide version actions behind ambiguous UI.

## Checklist
- Can user identify active template/version quickly?
- Is rollback guarded and auditable?
- Can user preview variable binding before output generation?

