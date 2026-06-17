# Product Topology

## Positioning

Broker Desk is a fast business workbench for small Japan real estate brokerage teams that currently rely on heavy Excel workflows.

It is not primarily:

- a CRM
- a property management system
- a generic OCR tool
- a PDF generator
- an AI agent that decides facts automatically

The product replaces repetitive Excel work by turning scattered source files into structured, editable, reviewable, and reusable case data, then using that data to produce standard business documents.

AI is not a separate frontstage product. AI is an operator inside this workbench: it reads source files, proposes candidates, highlights uncertainty, prepares outputs, and learns from user-confirmed corrections through product-owned memory.

## Product Value Map

### 1. Convenience Layer: Input

Input is the entry convenience.

It reduces repetitive typing by importing or extracting from existing Excel/PDF/source files.

Input value:

- auto-detect known templates
- extract candidate fields
- preserve source evidence
- mark uncertainty
- use AI only as assistive suggestion

Input is not the product center. It feeds the workbench.

### 2. Core Work Layer: Case Workbench

The case workbench is the product center.

It is the structured replacement for the broker's Excel workbook.

Workbench value:

- grouped business fields
- direct editing
- missing field tracking
- AI candidate review
- conflict resolution
- source evidence lookup
- output readiness
- case-level confirmed data

This is where the broker actually works after input and before output.

If this layer is weak, the product becomes a file uploader plus PDF printer and loses its core positioning.

### 3. Convenience Layer: Output

Output is the exit convenience.

It turns confirmed workbench data into official or standard templates.

Output value:

- select standard template
- auto-fill only certified-safe fields from confirmed data
- show candidate values on the editable official-form preview
- let users electronically complete non-certified fields on the form surface
- show missing required fields
- preserve official format
- export/print ready PDF

Output must not read raw extraction data or unaccepted AI suggestions. It should consume only confirmed case data and saved output draft values. It must also distinguish confirmed business data from fields that are certified safe to auto-print on a specific official PDF template.

### 4. Backstage Layer: AI Correction Learning

AI correction learning is the hidden improvement loop.

It converts normal broker review actions into durable product knowledge:

- AI/rule candidate snapshot
- user-confirmed snapshot
- deterministic diff
- correction event
- scoped experience update
- regression sample when needed
- retrieval context for the next AI task

This layer should not create extra work for the broker. The frontstage action is still edit, save, proceed, preview, and export.

Learning value:

- reduce repeated extraction mistakes
- distinguish AI errors from user-filled missing data
- remember template-level PDF adjustments
- capture long-text and split-field failures
- build regression cases from real user corrections
- make model behavior improve through Broker Desk's state, not through model private memory

## Topology

```text
Source Files
  -> Input Extraction
    -> Review Signals
      -> Case Workbench
        -> Confirmed Case Data
          -> Output Draft
            -> Official PDF / Print
              -> Correction Events / Experience Updates
```

Expanded:

```text
Excel / PDF / Paper Scan
  -> deterministic template detection
  -> extraction candidates
  -> AI assist for uncertainty, normalization, conflict hints
  -> human review
  -> editable case workbench
  -> confirmedDataJson / future stable case fields
  -> guarantee application draft
  -> fixed official PDF overlay
  -> user corrections saved as scoped AI learning context
```

## Feature Priority Rule

When deciding priority, use this order:

1. Does it strengthen the workbench as an Excel replacement?
2. Does it reduce manual re-entry or manual checking?
3. Does it make uncertain/missing/conflicting data easier to review?
4. Does it improve reuse of confirmed case data?
5. Does it make a standard output faster or more reliable?
6. Does it convert confirmed user corrections into reusable product knowledge without increasing broker workload?

Do not prioritize features that only add modules without strengthening the input -> workbench -> output chain.

## Current V1 Product Spine

V1 should now focus on this spine:

1. Known input templates can be imported and extracted.
2. Extracted values enter a reviewable state.
3. User can work in an editable case workbench.
4. Workbench shows confirmed, edited, AI-suggested, missing, conflicting, rejected, and unknown states.
5. Output readiness is calculated from workbench data.
6. `ふれんず保証` can export certified-safe fields from confirmed case data and candidate/manual fields after preview confirmation.
7. Save/proceed/export actions produce correction events when AI/rule candidates differ from confirmed user results.
8. Other guarantee templates can be added after the workbench spine is solid.

## V1 Chain Acceptance

The first product milestone is not "many inputs" or "many outputs".

The milestone is one complete three-step chain:

1. Input OK
2. Edit / organize / summary workbench OK
3. Output OK

Only after this chain is convincing should input and output be copied outward to more source files and more guarantee company templates.

### Input OK

Input is acceptable when:

- known source files can be imported
- candidate values are extracted
- source evidence is preserved
- uncertainty is marked
- AI suggestions are separated from confirmed facts
- the user can move extracted data into the workbench

### Edit / Organize / Summary Workbench OK

The workbench is acceptable when:

- confirmed case data is visible in business groups
- user can edit and save fields
- missing fields are visible
- AI candidates and low-confidence fields are visible
- conflicts are visible
- output-required fields are highlighted
- summary/readiness tells the broker what remains before output

### Output OK

Output is acceptable when:

- a selected official template consumes confirmed workbench data
- missing required data is not fabricated
- only certified-safe fields are auto-printed without preview confirmation
- candidate/manual fields can be completed electronically on the official form surface
- official template background is preserved
- PDF is readable and exportable
- no-case and invalid-case exports are blocked
- regression covers the happy path and safety paths

## Near-Term Roadmap

### Phase A: Close The Workbench Gap

Goal:

Make the case workbench the visible operating surface.

Must include:

- grouped editable fields
- selected guarantee company target
- field status badges
- default attention-first view for missing, uncertain, unknown, conflicted, or AI-candidate fields
- output-required and all-field filters
- AI candidate state
- source evidence access at the field level
- explicit user decisions for use value / leave unknown / reject candidate
- save back to confirmed case data
- guarantee application readiness summary

Current implementation baseline:

- The case page defaults to the fields that need broker attention instead of rendering the full Excel-like field set first.
- Required and attention fields are calculated against the selected guarantee company template, not the union of every template.
- Output-center links preserve the selected template when returning to the workbench.
- Brokers can switch to output-required fields or all fields when needed.
- Each visible field can be edited and marked as usable, unknown, or rejected.
- High-frequency fields now use business-aware controls: select options, phone/email inputs, date placeholders, money/number units, and address text areas.
- Visible AI candidates with values can be confirmed in one save action.
- Saving a confirmed visible value changes its trust state to confirmed instead of leaving it stuck as an AI candidate.
- Field-level source evidence now has an action-oriented summary: candidate value, source location, method, confidence, and guidance before the detailed disclosure.
- A broker can confirm or adopt a field candidate directly from the evidence summary.
- Longer correction history remains secondary.
- Workbench review queues now prioritize the current selected guarantee application: application-blocking fields first, then trusted candidates, low-confidence items, and required fields with no source candidate.
- This queue order is a V1 guarantee-application rule, not a permanent global priority model for future business workflows.

### Phase B: Guarantee Application Draft

Goal:

Add an output-specific completion layer between case data and PDF.

Must include:

- selected guarantee company
- required field checklist
- manual company-specific fields
- draft save
- export readiness

Current implementation baseline:

- The company-specific draft is now edited inside the case workbench before PDF preview.
- Draft fields are template-scoped, so each guarantee company can expose only its own options and consent/check fields.
- Draft save writes `GuaranteeApplicationDraft`; it must not write template-only choices into reusable case facts.
- The workbench distinguishes common missing fields from company-specific missing draft fields.
- The frontstage sequence should read as one production line: `資料を入れる` -> `足りない項目だけ確認` -> `会社別草稿` -> `申込書プレビュー` -> `PDF`.
- Draft readiness and saved-at state should be visible in the workbench, output center, and preview page.
- Company-specific missing fields should navigate to the workbench draft layer, while the preview page remains available for final form-surface correction.
- Draft saves now feed `CorrectionEvent` with trigger `guarantee_draft_save`, so repeated company-option corrections can become output-template scoped experience drafts.

### Phase C: AI Correction Learning Spine

Goal:

Turn normal review/save/export moments into durable AI improvement evidence.

Must include:

- extraction snapshot vs confirmed snapshot
- correction event classification
- source evidence and field scope
- template output correction events
- experience update draft
- promotion rules that prevent one-off edits from becoming global rules
- regression sample creation for official output failures

Current implementation baseline:

- Correction events are emitted from extraction review save, case workbench save, guarantee company draft save, and editable PDF preview save.
- Repeated same-scope corrections generate gated AI experience drafts; one-off/case-only events do not promote automatically.
- Approved-only experience retrieval is available for future AI prompt assembly.

### Phase D: One Template To Production Quality

Goal:

Make `ふれんず保証` broker-usable.

Must include:

- official template fidelity
- readable Japanese font rendering
- reliable coordinates
- no blank no-case export
- stable happy-path regression
- manual visual QA checklist

Current implementation baseline:

- `ふれんず保証` is the default production-quality template target.
- Direct PDF download is guarded by a shared download gate covering common required fields, company draft required fields, template quality, unconfirmed candidate overlay fields, manual unplaced fields, and print-fit blockers.
- `ふれんず保証` print-fit and calibration regression now cover the actual 79-field overlay set instead of a different company template.
- Visual smoke compares generated output against the official source background and requires visible fill deltas in critical regions.

### Phase E: Expand Templates

Goal:

Add the remaining four guarantee companies only after the workbench and one-template path are stable.

Order:

1. ふれんず保証
2. インシュア
3. Jリース
4. 日本セーフティー
5. 全保連

Reason:

Start from simpler/readable one-page templates, then move to harder scanned/garbled templates.

Current implementation baseline:

- The remaining four templates now have active overlay configs and shared direct-download gating.
- Phase E uses `certified minimum output`, not full automatic completion. Only fields that passed normal-sample fit checks are certified for automatic final printing.
- `assisted_candidate` fields are visible on the editable official-form preview and require preview confirmation before final PDF printing.
- `manual_electronic` fields remain easy to complete on the form surface but are not inferred or printed automatically.
- `日本セーフティー` uses a high-resolution official-source raster background because direct overlay text on the downloaded PDF was not visually reliable.
- Regression now covers all five active templates for calibration ledger, print fit, autofill policy, download gate, PDF page fidelity, direct download, and visual smoke.
- PDF coordinate and field-binding work is now treated as an internal template factory, not a broker-facing feature. See `docs/product/PDF_TEMPLATE_AUTHORING_EXPERIENCE.md`.
- Template fields should bind to semantic case fields plus deterministic transforms, so output templates improve without exposing micro-field maintenance to users.

## PM Guardrails

- Input and output are convenience surfaces; the workbench is the product center.
- AI is an assistant for attention, uncertainty, and suggestions, not final truth.
- AI improvement belongs to Broker Desk's correction events, scoped memories, and regression cases, not to the model's private memory.
- Official output templates must remain unchanged.
- Users should review problem fields first, not manually re-check every field.
- The product should feel like a faster structured Excel, not a technical configuration system.
- Every new feature must strengthen the same topology instead of creating a side module.
- PDF calibration, coordinate maps, field bindings, and segment-cell settings are backstage template-authoring assets. They should eventually live behind PM/admin access and should not define the ordinary broker workflow.

## Frontstage Simplification Rule

The default user-facing product must feel like a service counter, not an admin system.

The broker's first-screen mental model should be:

```text
1. 資料を入れる
2. 足りない項目だけ確認する
3. 保証会社申込書を出す
```

All complex capabilities still exist, but they belong behind the main flow:

- field mapping
- import diagnostics
- extraction logs
- source evidence tables
- full field inventory
- output readiness matrices
- template registry details
- internal schema names
- company PDF source filenames

These details should be hidden by default under secondary sections such as `詳細`, `確認ログ`, or `高度な設定`.

### Default Screen Acceptance

For `/`, `/import-center`, `/cases/[id]`, and `/output-center`, the first viewport must answer only four broker questions:

1. What am I doing now?
2. What is missing?
3. What can the system already do for me?
4. What is the next button?

If the screen requires the user to understand mapping, schema, module structure, logs, or readiness math before acting, it fails the V1 product direction.

### Layout Priority

The default layout priority is:

1. current task and selected case
2. one primary next action
3. missing or uncertain items only
4. generated output availability
5. detailed workbench / evidence / diagnostics collapsed below

The app may keep deeper workbench power, but the broker should not meet it until they ask for detail or need to fix a specific missing item.

## Anti-Salesforce Frontstage Rule

The customer-facing product must not feel like a large SaaS system.

Frontstage user experience should be a service flow:

1. 資料を入れる
2. 足りない項目だけ確認する
3. 申込書を出力する

Backstage complexity may include extraction, AI suggestions, field normalization, source evidence, workbench data, draft state, template coordinates, PDF fidelity, and regression checks. These should not be presented as separate first-level user modules.

### What To Hide By Default

Hide or demote by default:

- field mapping UI
- import diagnostics
- trend panels
- audit/log panels
- broad module navigation
- large readiness card grids
- full field tables
- technical source/file names
- internal data concepts such as confirmedDataJson, schema, coordinates, raw keys

### What To Show By Default

Show by default:

- current task
- selected guarantee company
- selected case
- remaining required items
- next action
- download availability

The broker should understand the next action within ten seconds.

### Frontstage MVP Shape

The main screen for V1 should be:

```text
保証会社申込書を作成

Step 1: 資料を入れる
Step 2: 不足項目を確認
Step 3: PDFを出力
```

The detailed workbench remains available as an advanced/editing surface, but the default path should guide the user only to unresolved items and output readiness.
