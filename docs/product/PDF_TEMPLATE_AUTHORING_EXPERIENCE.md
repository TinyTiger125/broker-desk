# PDF Template Authoring Experience

Date: 2026-06-10

This document captures the working method learned while calibrating the first guarantee company application templates. Future AI agents should read this before creating or repairing any official PDF output template.

## Core Position

Broker Desk is not building a generic PDF editor.

The user-facing promise is:

```text
資料を入れる -> 足りない項目だけ確認する -> 申込書を出す
```

PDF template authoring is backstage production work. It exists so brokers can get a near one-click application output later. The customer should not feel that they are mapping PDF coordinates, configuring schemas, or maintaining split data fragments.

## Frontstage vs Backstage

### Frontstage Broker Workflow

The broker should only experience:

- upload source documents
- confirm or complete missing business facts in the case workbench
- choose a guarantee company
- preview the official form if needed
- export or print

The broker should not be asked to maintain:

- coordinate maps
- source field keys
- transform functions
- grid-cell counts
- page-level layout overrides
- template calibration records

### Backstage Template Factory

The internal template factory is allowed to be complex because it is one-time production work per official form version.

Backstage authoring includes:

- official PDF source management
- raster or PDF background fidelity checks
- overlay box creation
- box drag, resize, add, and delete
- field binding
- value transform selection
- segment/grid-cell configuration
- selected-box font-size override
- template-level save
- visual QA
- regression fixture creation

This tooling should eventually move behind PM/admin access. It should not become the default customer workflow.

### Admin Boundary

The 1/2/3/4/5 guarantee-company template calibration work is highest-level product production work. It is part of Broker Desk's proprietary automation factory for near one-click official-form filling.

Default rule:

- PM/admins may create, delete, resize, move, bind, split, and save template boxes.
- Brokers should only receive the finished output workflow: upload, confirm missing facts, preview, export.
- Template-level changes must be protected from accidental edits because one wrong save can damage every future case using that official form.
- This authoring capability should move to a backstage admin surface before any real customer release.
- It should return to frontstage only if many customers later need to maintain their own private form variants, and even then behind explicit role and version controls.

## Non-Negotiable Official Form Rule

Guarantee company forms are official source documents.

The product may:

- place text, digits, or checkmarks into intended blank areas
- flatten the result into an output PDF
- provide a preview surface for correction

The product must not:

- redraw the form
- move lines or boxes
- rewrite labels or legal notices
- crop, stretch, or restyle the source template
- generate a lookalike replacement form

If the official source is low quality, the correct response is to acquire a better source or create a better overlay strategy. It is not acceptable to redraw an unofficial equivalent.

## Authoring Artifact Model

Each template is an asset, not a case.

Template-level state should include:

- source PDF or source raster identity
- page count and page dimensions
- default overlay fields
- deleted built-in overlay field keys
- custom overlay fields
- layout overrides
- split/segment box definitions
- field binding metadata
- template version
- QA status

Case-level state may include:

- temporary preview edits for the current case
- broker-entered draft values
- one-off layout or value corrections before export

Case-specific edits must not silently pollute other templates. Template-level save must be an explicit authoring action.

## Binding Model

An overlay box should bind to semantic case data plus a transform. It should not store the current fixture value as its permanent value.

Recommended shape:

```json
{
  "sourceFieldKey": "applicant.birthDate",
  "valueFormat": "dateDay",
  "align": "center",
  "segment": {
    "enabled": false
  }
}
```

The persistent template asks:

```text
Which business field should this box render, and in what form?
```

It should not ask:

```text
What exact text did today's test case happen to contain?
```

## Position-Based Prebinding

Template authors should not bind every newly drawn box from zero when the form already has a stable visual structure.

The internal authoring surface should support a prebinding pass:

- read the current saved or in-progress box positions
- compare each unbound custom box against known default fields and form-specific landmark candidates
- use box proximity, segment count, field type, and split transform intent to propose a source field
- preserve any field that was already intentionally bound by the author
- mark proposed bindings directly on the boxes so the author can click and audit them quickly

Prebinding is a labor-saving guess, not approval. The author still reviews wrong guesses, adjusts field binding or transform, and saves the template only after the visible output is acceptable.

Selection and movement must be separate interactions. Clicking a box should only select it for binding inspection. Moving or resizing a box must require an explicit handle, because accidental sub-pixel position drift destroys hours of template calibration work.

Field binding must be navigable by template and form region. A flat list of every possible case field is not acceptable for template authoring once multiple guarantee company forms are active. The binding UI should drill down by guarantee form, then by the official form section or table heading, then by field.

## AI Field Prematching

The `字段预匹配` control is an internal template-factory accelerator.

Intended workflow:

1. The template author manually draws all fillable boxes in the right positions and sizes.
2. The template author runs field prematching.
3. AI may propose source field bindings, display formats, and split rules from box geometry, nearby known template candidates, field labels, field kinds, and section order.
4. The author reviews visible filled output on the form.
5. Only the explicit template save action promotes the reviewed result into reusable template state.

Hard boundary:

- AI prematching produces candidates, not confirmed template truth.
- AI prematching is a blank-template bulk setup action. It should run only when the current custom boxes are unbound and empty.
- If any custom box already has a source binding or typed value, the control must stop instead of mixing a half-manual template with a bulk AI pass.
- It must not save a template automatically.
- It must not bind checkboxes/radio buttons as part of the current 90% automation target.
- It must not create new case facts or alter confirmed case data.
- The request payload should avoid sending real customer values; field keys, labels, value kinds, coordinates, and segment metadata are sufficient for the first experimental version.

Non-goal for the first version:

- No "replace existing bindings" mode.
- No "continue matching only the remaining empty boxes" mode after the author has already started manual binding.
- Those modes require explicit reset/versioning/confirmation design because a single accidental click can destroy a partially reviewed template.

## Transform Taxonomy

### Date

Use date transforms for year, month, and day boxes.

Supported intent:

- full date
- `dateYear`
- `dateYearShort`
- `dateMonth`
- `dateDay`
- compact numeric date where needed

Do not model `year`, `month`, and `day` as separate broker-maintained workbench fields unless the source business fact is truly separate. The workbench fact is one birth date or one move-in date. The output template decides how to split it.

### Phone

Japanese phone numbers often appear as three groups on paper forms.

Supported intent:

- full phone
- digits only
- `phonePart1`
- `phonePart2`
- `phonePart3`

Examples:

- `090-1234-5678` -> `090`, `1234`, `5678`
- `03-1234-5678` -> `03`, `1234`, `5678`

Do not expose phone fragments to the broker. Fragments are render-time output transforms.

### Address

Japanese addresses should be treated as one broker-facing fact, with render-time fragments for official forms.

Supported intent:

- full address
- postal code
- prefecture
- municipality
- street or block detail
- remainder after prefecture

Example:

```text
東京都品川区大崎4-5-6
```

Can become:

- prefecture: `東京都`
- municipality: `品川区`
- street: `大崎4-5-6`

For addresses, AI can help normalize or split ambiguous cases, but ordinary users should not be asked to audit every micro-fragment. If confidence is low, keep the broker-facing field as one address and use preview/manual completion for the unsafe target boxes.

### Money And Digits

Money, phone, postal code, and other fixed-cell numeric fields should use grid/segment rendering when the form has visible individual cells.

Acceptance rule:

- one digit per cell
- digit visually centered in the cell
- no compression into fewer cells
- no overflow across cell borders
- actual cell count must be counted from the official form

Segment fields are formatting instructions, not business data.

### Text

Text transforms such as first token, rest tokens, family name, given name, or kana variants are allowed only when the official form clearly separates those concepts and the source data supports the split.

Do not use generic "front half / back half" behavior for structured fields such as date, phone, or address. Structured fields need domain transforms.

Selected overlay boxes, including built-in default boxes and custom boxes, may carry an admin-authored `size` override. This is the desired print size for that exact box, while renderer-side shrink-to-fit remains a safety rail against overflow. Do not expose a global font-size control to brokers; this is template-factory calibration data.

For overlay boxes with an explicit `size` override, do not silently clamp the selected `size` down to the box height. Small official-form cells often need a visually larger font than the drawn overlay rectangle height suggests. Preview and downloaded PDF must honor the same selected box font size, then shrink only when horizontal fit would otherwise fail.

## AI Role In Template Authoring

AI should help the internal template factory, not become a visible burden for brokers.

Useful AI tasks:

- detect candidate blank boxes on an official form image
- infer nearby labels and propose source field bindings
- estimate whether a box is text, date, phone, postal code, money, checkbox, or grid-cell
- propose cell counts for grid fields
- propose transform types such as `dateDay`, `phonePart2`, or `addressMunicipality`
- flag likely overflow or misalignment risk
- compare generated output against the source image and describe visual failures
- summarize repeated human corrections into template authoring rules

AI suggestions are not final runtime behavior. PM/admin or QA must approve a template asset before it becomes deterministic product behavior.

Runtime output should be deterministic:

```text
confirmed case data -> approved template binding -> transform -> overlay render -> PDF
```

## Recommended Authoring Loop For A New Official Template

1. Acquire the official PDF or the best available official raster source.
2. Confirm page count, page dimensions, and whether the PDF has real AcroForm fields.
3. If no AcroForm fields exist, treat the form as fixed background plus overlay.
4. Create an initial overlay field inventory.
5. Delete false-positive boxes.
6. Add missing boxes.
7. Resize each box to the actual printable area, not just approximate text position.
8. For strict grid fields, count the cells and configure segment rendering.
9. Bind each box to a semantic source field plus a transform.
10. Mark unsafe fields as manual or candidate instead of pretending they are certified.
11. Save the stable layout at template scope.
12. Generate a complete fixture case with ordinary values.
13. Generate stress fixtures with long names, short names, long addresses, short addresses, and full optional data.
14. Render preview and download routes.
15. Visually inspect source alignment, grid centering, text overflow, and checkbox placement.
16. Add or update regression scripts for the fixed behavior.
17. Record remaining unsafe fields and activate only the certified set.

## QA Gates

Before a template can be treated as production-ready, verify:

- official background is unchanged
- preview and download routes use the same template assumptions
- required certified fields appear in the correct visual region
- multi-cell fields use one character per cell
- phone/postal/date/money fields are centered and count-correct
- long text either fits, shrinks safely, wraps safely, or stays manual
- deleted boxes do not reappear after reload
- template-level save survives case switching and server restart
- case-specific values do not become template defaults
- final PDF is readable in ordinary PDF viewers

If a field cannot be trusted, leave it as preview/manual. A blank field is better than a plausible but wrong legal application fact.

## What Future Agents Must Not Do

Do not:

- expose template authoring as the normal customer path
- ask brokers to maintain split fields such as phone part 2 or address municipality
- save fixture values into template bindings
- overfit one case by hard-coding its value or current drag state
- redraw official form lines
- promote AI guesses directly into active templates
- claim full automation when only certified minimum output is proven
- treat visual existence of a PDF as quality proof

## Current Learned Implementation Rules

The current implementation should preserve these rules:

- Custom overlay fields may bind to `sourceFieldKey`.
- Source-bound custom fields should save no fixed fixture value.
- Custom fields and deleted fields are template-scoped unless the user explicitly saves only the current case.
- `dateYear`, `dateYearShort`, `dateMonth`, and `dateDay` are first-class transforms.
- `phonePart1`, `phonePart2`, and `phonePart3` are first-class transforms.
- `addressPrefecture`, `addressMunicipality`, `addressStreet`, and related address transforms are first-class transforms.
- Segment rendering supports fixed cell counts and should be used for strict digit grids.
- Money-like case fields such as rent, fees, deposits, key money, and deductions must render as `amount` segments with right alignment, even if an old custom box was saved as plain left-aligned digits.
- Binding UI should filter field choices by transform type and transform choices by field type.
- Date, phone, address, duration, and ordinary text are separate transform families, not one loose option list.
- Japanese overlay fonts must be verified through an actual rendered PDF. Some macOS fonts look valid in code but render as garbled glyphs when subset-embedded; non-subset embedding with a proven Japanese font is safer than a lighter font that corrupts output.
- Repeated rows such as `coOccupants.0`, `coOccupants.1`, and `coOccupants.2` should support group selection and group copy. The copy must preserve box geometry and transform rules, but migrate source bindings from one row index to the next instead of copying fixture values.

## Preview Must Match Output

The editable preview is an authoring instrument. It must show the same value that the final PDF renderer will print.

Rules:

- When a source-bound box changes binding or display format, update the visible preview value immediately.
- Do not show raw address text in boxes configured as prefecture, municipality, street, or prefecture-rest fragments.
- Do not show raw phone numbers in boxes configured as phone part 1, part 2, part 3, or digits-only.
- Do not keep stale display values after switching a box from one field family to another.
- Preview text should adapt to the box height and estimated width, because template authors judge placement by what they see.
- PDF rendering should apply the same height/width fit limits, so preview calibration and downloaded output do not diverge.
- Do not expose baseline font-size controls in the default authoring strip. Template authors should resize the box; the system should choose the usable font size.

If preview and PDF output disagree, the template factory becomes misleading and future forms will repeat the same calibration failures.

## Template Save Data-Loss Guard

Template calibration state is product-owned production data. A save action must never silently drop boxes.

Observed failure mode on 2026-06-15:

- the authoring UI generated new custom field keys with a template-scoped dotted form
- the server-side custom-field sanitizer accepted only the older `custom.xxx` shape
- newly drawn boxes were visible in the browser, but were filtered out during template save
- after redirect/reload, the author saw the boxes disappear because the persisted template only contained the sanitized subset

Required rule:

- the frontend key generator and backend sanitizer must accept the same custom field key grammar
- the preview save action must compare submitted custom-field count against sanitized custom-field count
- if submitted fields are rejected by sanitation, the server must abort the save instead of persisting a partial template
- if the hidden custom-field payload is missing or unreadable, the server must not overwrite existing template custom fields with an empty set
- before any risky template persistence change, publish a new immutable platform version; legacy JSON export is backup only

## Long-Term Product Direction

The useful product moat is not that a human can drag boxes.

The moat is:

```text
official forms -> internal template factory -> approved deterministic template assets -> broker one-click output
```

The calibration UI is the factory. The broker-facing product is the finished service.

Future AI work should reduce internal template-authoring effort first:

- auto-detect boxes
- auto-label boxes
- auto-propose bindings
- auto-detect grid counts
- auto-run visual diff QA
- auto-generate regression fixtures

Only after the internal authoring loop becomes stable should the same mechanism be considered for broader document families such as quotation sheets, property summaries, contracts, reports, or AI-customer-service document intake.
