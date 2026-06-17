# Stitch V2 Review: Broker Desk

## Verdict

Stitch V2 is a meaningful improvement over V1.

It now covers the full product surface:

- landing page
- app home
- input center
- extraction review
- case workbench
- output center
- editable PDF preview
- cases / work queue
- data / insight
- template library
- AI experience review

However, it is not ready to implement directly.

Recommended decision:

```text
Use V2 as the structural baseline, but require a focused V3 polish before implementation.
```

V2 solves the biggest V1 issue: it no longer looks like only a single PDF feature.

But it still has three major problems:

1. Product language is still mixed between platform and `申込書作成`.
2. The PDF preview remains visually unacceptable for an official-form product.
3. Japanese broker-facing copy is still polluted by English and internal/system language.

## Screen Health Summary

| Screen | Health | Decision |
| --- | --- | --- |
| Landing page | Medium | Redesign hero and copy polish required |
| App home / today task | Medium-high | Usable structure, but nav/product naming must change |
| Input center | High | Strong candidate for implementation baseline |
| Extraction review | High | Strong candidate, with Japanese copy cleanup |
| Case workbench | High | Strong structural baseline, needs case-header and output-link polish |
| Output center | Medium-high | Good functional logic, needs more output-platform framing |
| Editable PDF preview | Low | Must redesign before implementation |
| Cases / work queue | Medium-high | Good baseline, needs Japanese terminology cleanup |
| Data / insight | Medium | Useful, but still too dashboard-like in places |
| Template library | Medium | Useful admin concept, too technical for ordinary users |
| AI experience review | Medium-low | Correct internal concept, too English/admin-heavy |

## What V2 Gets Right

### 1. Full Product Surface Exists

This version finally includes the necessary product areas.

That is a major improvement.

The product now reads as:

```text
input -> extraction review -> workbench -> output -> data/templates/admin
```

This is much closer to the desired platform.

### 2. Input Center Is Directionally Correct

The input center now has:

- source type selection
- drag-and-drop area
- extraction status
- file-level success/error states
- clear next action to the workbench

This page is close to usable as the implementation direction.

Needed polish:

- replace English filenames in visible mock data with more Japanese-real examples
- make `案件ワークベンチへ進む` depend on successful extraction / draft creation
- make error recovery clearer

### 3. Extraction Review Is Strong

The extraction review page has the right model:

- source document on the left
- candidate list in the center
- summary / proceed action on the right
- accept / modify / reject style actions

This is one of the strongest pages in V2.

Needed polish:

- replace `SOURCE DOCUMENT` with `元資料`
- replace `AI値を破棄` with more user-natural copy such as `候補を使わない`
- make "source evidence" behavior more explicit

### 4. Case Workbench Structure Is Now Close

The case workbench now shows:

- case identifier
- status
- section navigation
- issue queues
- editable fields
- source preview

This is close to the product center we want.

Needed polish:

- show property / applicant / output target in the header, not only `TR-2023-0042`
- add a clearer "next output" or "selected output" link
- remove top-tab ambiguity where `Output` appears active while the page is a workbench
- make the side source preview feel like source evidence, not final output

### 5. Output Center Logic Is Good

The output center now shows:

- selected case
- blocking checklist
- template cards
- preview action
- gated download

This matches the intended exit layer.

Needed polish:

- frame guarantee applications as the first output category, not the whole output universe
- add future output categories in a restrained way
- show exact jump targets for missing fields

### 6. Data Layer Exists

The data/insight page is useful because it makes the product feel expandable beyond forms.

It includes:

- weekly output count
- cases in progress
- input-waiting blocks
- case status chart
- missing-field trends

This is directionally right.

Needed polish:

- reduce BI/dashboard feeling
- focus more on "what is stuck and what to do"
- avoid big vanity metrics that do not drive daily work

## Critical Problems To Fix Before Implementation

### 1. PDF Preview Is Still Not Acceptable

This is the largest blocker.

The V2 PDF preview uses a large abstract gradient/fake document background.

That directly violates the product requirement:

```text
official form fixed, input boxes editable
```

For this product, the official form is the trust object.

If the preview does not look like a real form, users will not trust the output.

V3 requirement:

- use a realistic official-form-like canvas
- show visible cells, ruled lines, and form structure
- keep the official form background white/black/gray, not gradient
- input boxes must sit inside actual cells
- show alignment guide lines only as subtle edit aids
- right panel should list input fields and readiness
- download button should be visibly gated if any required field is unresolved

Do not use abstract document art here.

### 2. Navigation Still Uses The Wrong Product Primary

The sidebar still starts with:

```text
申込書作成
```

This keeps pulling the product back into "application-form tool" territory.

V3 navigation should use:

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

If `申込書作成` remains, it should appear as a workflow card or output category, not as the main product home.

### 3. English Is Still Too Visible

Examples:

- `Input`
- `Organize`
- `Output`
- `Source Document`
- `Work Queue`
- `Recent Imports`
- `AI CONFIDENCE`
- `Learning Queue`
- `Review Human Corrections`
- `Update Mapping`
- `System Status`
- `Production Center`

This makes the product feel like an internal prototype, not a Japanese broker tool.

V3 requirement:

- customer-facing app UI should be Japanese-first
- English can remain only as small internal secondary metadata if absolutely necessary
- convert key labels:
  - `Input` -> `資料を入れる`
  - `Organize` -> `情報を整理する`
  - `Output` -> `資料を出力する`
  - `Source Document` -> `元資料`
  - `Work Queue` -> `案件一覧` or `進行中の案件`
  - `Recent Imports` -> `最近取り込んだ資料`
  - `AI CONFIDENCE` -> `AI候補の信頼度` or avoid showing as a main KPI
  - `Learning Queue` -> `AI経験レビュー`
  - `Update Mapping` -> `配置を調整`

### 4. Landing Page Is Too Abstract And Too Empty

V2 landing page improved positioning copy, but visually it is too abstract.

The hero still lacks a concrete product screenshot or product-like composition.

It should not just show a simple three-box diagram.

V3 landing hero should show:

```text
files / upload card
+ missing-field queue
+ case workbench fields
+ official output preview
```

The hero needs to make the product's actual work visible within the first viewport.

### 5. Product Feels Too Harsh / System-Like

The dark sidebar and heavy border style create operational seriousness, but some screens feel like internal back-office admin software.

This is risky because the competitive edge should be:

```text
high usability despite complex paperwork
```

V3 should:

- keep precision
- reduce hard-black dominance
- increase work-surface clarity
- make primary actions easier to find
- keep the daily flow friendly enough for small brokers

### 6. Template Library Is Too Technical

The template page includes:

- `Update Mapping`
- `System Status`
- `Calibration Logs`
- English company aliases

This is admin-facing, but even then it should use broker/product language.

V3 requirement:

- `Update Mapping` -> `入力位置を調整`
- `Calibration Logs` -> `位置調整履歴`
- `System Status` -> `テンプレート状態`
- clearly separate user template selection from admin template maintenance

### 7. AI Experience Page Is Conceptually Right But Too Internal

The AI learning page correctly expresses:

```text
AI original value -> human correction -> approve into future learning
```

That is product-aligned.

But the screen is too English and too model-operations-like.

V3 requirement:

- make it clearly admin-only
- use Japanese-first copy
- show source evidence or correction reason
- avoid implying the user is training a model directly

Better framing:

```text
過去の修正を今後の候補に反映する
```

## Recommended V3 Request To Stitch

Ask Stitch to do a focused V3 polish, not another full restart.

The structure is now mostly right.

V3 should focus on:

1. Replace the PDF preview with a real official-form-like page.
2. Replace English/customer-facing labels with Japanese broker-facing labels.
3. Change navigation so `ワークベンチ` is the home, not `申込書作成`.
4. Make the landing hero show an actual product workflow composition.
5. Soften the severe internal-system feel while preserving precision.
6. Convert template and AI admin pages from technical language to product language.

## Implementation Recommendation

Do not implement Stitch V2 as-is.

Use these as implementation baselines:

- Input Center
- Extraction Review
- Case Workbench
- Output Center
- Cases / Work Queue

Do not use these as-is:

- Landing page
- Editable PDF Preview
- Template Library
- AI Experience Review
- Data / Insight

The fastest path is:

```text
Stitch V3 polish -> approve product language and PDF preview -> implement app shell + core flow first
```
