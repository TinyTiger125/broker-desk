# Stitch V2 Alignment Audit

Date: 2026-06-05

Source reviewed:
- `/Users/laineyzhu/Downloads/stitch (1).zip`
- `/tmp/broker-desk-stitch-v2/stitch/broker_desk/DESIGN.md`

Scope:
- Preserve Stitch V2 as the source design language.
- Avoid product-manager-led redesign beyond necessary functional alignment.
- Keep the app as a compact operational workbench, not a marketing landing page or card-heavy feature plugin.

Changes applied:
- Home page now follows the Stitch V2 workbench shape: daily task header, urgent case card, work queue, recent imports, and output readiness.
- Output center now follows the Stitch V2 output shape: case summary, pre-output missing checklist, guarantee template cards, and folded advanced/detail sections.
- Global Material Symbols CSS was corrected to use the package-compatible font settings and fixed icon sizing, preventing icon names from leaking into visible UI.

Validation artifacts:
- `05-current-home-after-alignment.png`
- `06-current-output-after-alignment.png`
- `09-output-icons-sized.png`
- `10-current-home-final.png`

Deferred:
- Deeper case workbench layout alignment.
- Official PDF editable preview polish.
- Replacing Material Symbols with component icons across the whole codebase.
