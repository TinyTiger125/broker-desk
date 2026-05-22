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
- auto-fill from confirmed data
- show missing required fields
- preserve official format
- export/print ready PDF

Output must not read raw extraction data or unaccepted AI suggestions. It should consume only confirmed case data and saved output draft values.

## Topology

```text
Source Files
  -> Input Extraction
    -> Review Signals
      -> Case Workbench
        -> Confirmed Case Data
          -> Output Draft
            -> Official PDF / Print
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
```

## Feature Priority Rule

When deciding priority, use this order:

1. Does it strengthen the workbench as an Excel replacement?
2. Does it reduce manual re-entry or manual checking?
3. Does it make uncertain/missing/conflicting data easier to review?
4. Does it improve reuse of confirmed case data?
5. Does it make a standard output faster or more reliable?

Do not prioritize features that only add modules without strengthening the input -> workbench -> output chain.

## Current V1 Product Spine

V1 should now focus on this spine:

1. Known input templates can be imported and extracted.
2. Extracted values enter a reviewable state.
3. User can work in an editable case workbench.
4. Workbench shows confirmed, edited, AI-suggested, missing, conflicting, rejected, and unknown states.
5. Output readiness is calculated from workbench data.
6. `ふれんず保証` can export from confirmed case data.
7. Other guarantee templates can be added after the workbench spine is solid.

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
- field status badges
- missing/needs-review filter
- AI candidate state
- source evidence access
- save back to confirmed case data
- guarantee application readiness summary

### Phase B: Guarantee Application Draft

Goal:

Add an output-specific completion layer between case data and PDF.

Must include:

- selected guarantee company
- required field checklist
- manual company-specific fields
- draft save
- export readiness

### Phase C: One Template To Production Quality

Goal:

Make `ふれんず保証` broker-usable.

Must include:

- official template fidelity
- readable Japanese font rendering
- reliable coordinates
- no blank no-case export
- stable happy-path regression
- manual visual QA checklist

### Phase D: Expand Templates

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

## PM Guardrails

- Input and output are convenience surfaces; the workbench is the product center.
- AI is an assistant for attention, uncertainty, and suggestions, not final truth.
- Official output templates must remain unchanged.
- Users should review problem fields first, not manually re-check every field.
- The product should feel like a faster structured Excel, not a technical configuration system.
- Every new feature must strengthen the same topology instead of creating a side module.

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
