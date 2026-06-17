# Stitch V2 Implementation Decision

## Decision

Stitch V2 is accepted as the frontend style and information-architecture baseline.

We will not ask Stitch for another full redesign.

Reason:

- V2 already establishes the full product surface.
- The visual language is close enough for implementation.
- Remaining issues are either detail-level UI polish or domain-specific PDF work that Stitch cannot solve without our official PDF originals.

This decision does not mean copying Stitch V2 exactly.

Correct implementation approach:

```text
Use Stitch V2 as the design direction.
Implement with product corrections inside our own codebase.
```

## Product Baseline To Keep

Keep the V2 direction for:

- overall precise / calm / operational visual tone
- dark left navigation plus white work surfaces, unless later usability tests prove it too heavy
- thin borders, compact spacing, small radii
- workflow structure:
  - `資料を入れる`
  - `情報を整理する`
  - `資料を出力する`
- full product page set:
  - landing page
  - app home
  - input center
  - extraction review
  - case workbench
  - output center
  - official PDF preview
  - cases / work queue
  - data / insight
  - templates
  - AI experience review
- trust-state UI:
  - `確認済み`
  - `AI候補`
  - `確認が必要`
  - `未入力`
  - `不一致`
- source evidence next to extracted data
- readiness-gated output
- data/insight and AI experience as secondary platform layers

## Corrections We Will Make Internally

### 1. Product Navigation

Stitch V2 still uses `申込書作成` too prominently.

Implementation should use platform-first navigation:

Primary:

- `ワークベンチ`
- `資料を入れる`
- `案件`
- `出力`
- `テンプレート`

Secondary:

- `データ`
- `AI経験レビュー`
- `監査ログ`
- `設定`

`申込書作成` should appear as a workflow or output type, not as the product's main identity.

### 2. Customer-Facing Japanese Copy

Stitch V2 includes too much English.

During implementation, convert visible customer-facing labels to Japanese.

Examples:

- `Input` -> `資料を入れる`
- `Organize` -> `情報を整理する`
- `Output` -> `資料を出力する`
- `Source Document` -> `元資料`
- `Work Queue` -> `進行中の案件`
- `Recent Imports` -> `最近取り込んだ資料`
- `Learning Queue` -> `AI経験レビュー`
- `Update Mapping` -> `入力位置を調整`
- `System Status` -> `テンプレート状態`
- `Calibration Logs` -> `位置調整履歴`

English may remain only where it is secondary metadata or an internal/admin-only label.

### 3. Official PDF Preview

Do not use Stitch V2's fake PDF preview background.

We will build this ourselves using official PDF originals.

Implementation requirements:

- official PDF/image background must be the real template or a faithful rendered version of it
- form lines and layout are fixed
- user can edit only input boxes/values, not the official form
- input boxes can be dragged, resized, added, deleted
- guide lines and light snapping are available during edit
- user can save field positions for current case
- user can save field positions to template
- download remains gated by required-field readiness

This is domain-specific and should not be delegated to Stitch.

### 4. Landing Page Hero

Stitch V2 landing direction is acceptable, but too abstract.

Implementation should create a stronger first-viewport product signal:

```text
source files
+ missing-field review
+ case workbench fields
+ official output preview
```

Do not use generic analytics-dashboard imagery.

### 5. Template And AI Admin Language

Template and AI pages are secondary/admin surfaces.

They can retain denser UI, but user-facing wording should be product language, not engineering language.

Use:

- `入力位置を調整`
- `テンプレート状態`
- `位置調整履歴`
- `過去の修正を今後の候補に反映する`

Avoid:

- `Update Mapping`
- `Field coordinates`
- `Learning model`
- `Extraction engine`

## Implementation Priority

### Phase 1: Product Shell And Core Flow

Implement:

1. app shell / navigation
2. app home / today's work
3. input center
4. extraction review
5. case workbench
6. output center

Goal:

```text
User understands and can move through the product's main production line.
```

### Phase 2: Official PDF Preview Rebuild

Implement internally with official PDF originals:

1. real PDF preview surface
2. editable input boxes
3. alignment guides
4. save to case/template
5. readiness-gated download

Goal:

```text
The preview earns trust because it looks like the official form and behaves like controlled form filling.
```

### Phase 3: Secondary Platform Layers

Implement:

1. cases / work queue
2. template library
3. data / insight
4. AI experience review

Goal:

```text
The product feels expandable without making daily workflow heavy.
```

## Acceptance Criteria For Development

The implementation should be judged against these criteria:

1. The user can understand the core flow within ten seconds:
   `資料を入れる -> 情報を整理する -> 資料を出力する`.
2. The app feels like a real estate information/work output center, not a PDF plugin.
3. The workbench is the central operating surface.
4. Missing/uncertain/blocking fields always have a direct fix path.
5. PDF preview uses real official templates, not abstract placeholder art.
6. Japanese broker-facing labels are Japanese-first.
7. AI appears as candidate/review/support intelligence, not a chatbot-first product.
8. Data and AI admin pages remain secondary and do not interfere with the daily workflow.

## Final Product Direction

Use Stitch V2 as the style baseline.

Internally correct product semantics, Japanese copy, navigation hierarchy, and official PDF preview fidelity.

Do not wait for Stitch to solve domain-specific PDF behavior.
