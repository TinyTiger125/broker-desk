# V1 Case Workbench

## Purpose

The product must not stop at file upload and PDF export.

The central operating layer is a case workbench: a structured, editable, reviewable business workspace that replaces the broker's Excel workbook.

Core chain:

Input files -> deterministic extraction -> AI-assisted suggestions where needed -> human review -> editable case workbench -> confirmed case data -> guarantee application draft -> official PDF output.

The case workbench is where the broker corrects, completes, compares, and confirms data before any output consumes it.

## Product Principle

The workbench is a digital Excel replacement, not a passive database page.

Excel-like meaning:

- fields are already structured
- sections are already named by business meaning
- missing items are visible
- uncertain items are flagged
- user can edit directly
- source evidence is available when needed
- output readiness is calculated from the current data state

Unlike Excel, the user should not manually inspect every cell after import. The system should guide attention to the fields that need review.

## Data Trust States

Every relevant field should carry a trust state:

| State | Meaning | Output Behavior |
| --- | --- | --- |
| `confirmed` | Accepted from extraction or manually entered by user | Can be used in output |
| `edited` | User changed the extracted value | Can be used in output |
| `ai_suggested` | AI proposed value but user has not accepted it | Cannot be used as final output fact |
| `needs_review` | System is unsure, conflict exists, or source confidence is low | Cannot be used silently |
| `missing` | Required for a selected output but no value exists | Blocks or warns before output |
| `conflict` | Multiple sources disagree | User must choose or edit final value |
| `rejected` | User rejected extracted/suggested value | Cannot be used in output |
| `unknown` | User intentionally leaves value unknown | Output remains blank or blocked depending on requirement |

User-facing labels should be broker-friendly:

- `確認済み`
- `修正済み`
- `AI候補`
- `確認が必要`
- `未入力`
- `不一致`
- `不採用`
- `不明`

Avoid primary user-facing terms:

- mapping
- schema
- coordinate
- raw key
- JSON

## Required Workbench Sections

For the guarantee application V1 path, the case workbench should prioritize sections needed by guarantee company application forms:

1. 物件・契約条件
2. 申込者・賃借人
3. 勤務先・収入
4. 緊急連絡先・連帯保証人
5. 同居人
6. 取扱店・管理会社
7. 保証プラン・会社別項目
8. 未入力・要確認
9. 入力ファイル・出典

The workbench may later expand for sales contracts, important matters, advertisements, and financial reports, but V1 must stay aligned with guarantee application output.

## AI Role In The Workbench

AI is an attention and suggestion layer, not the source of truth.

AI may:

- mark suspicious or low-confidence fields
- propose values from ambiguous text
- normalize addresses, names, dates, phone numbers, and money fields
- explain why two source files may conflict
- suggest which missing fields are required by a selected guarantee company

AI must not:

- silently confirm legal/application facts
- overwrite confirmed user edits
- fill official output without user acceptance
- hide uncertainty from the broker

The product should make AI uncertainty visible. The user should see a concise review list, such as:

- `AI候補: 確認してください`
- `出典が弱い項目`
- `複数ファイルで不一致`
- `出力前に必要な未入力項目`

## User Workflow

Recommended V1 workflow:

1. Upload input file.
2. System extracts candidate values and marks confidence/source.
3. User enters the case workbench.
4. Workbench shows grouped fields with statuses.
5. User reviews only the fields that need attention first.
6. User edits, confirms, rejects, or leaves unknown.
7. Confirmed/edited values update `BrokerageCase.confirmedDataJson`.
8. Output readiness updates per guarantee company template.
9. User proceeds to guarantee application draft and official PDF output.

The user should not need to compare every imported field manually. The product's job is to reduce the review surface.

## Data Architecture

V1 can stay JSON-first, but it must preserve three distinct concepts:

1. `ExtractionReview`: source evidence and field-level extraction/review decisions.
2. `BrokerageCase.confirmedDataJson`: confirmed business facts used across the product.
3. `GuaranteeApplicationDraft`: output-specific completion state for one selected guarantee company.

`GuaranteeApplicationDraft` is recommended for the next slice. It should store:

- case id
- guarantee company template id
- draft field values
- field statuses
- source: confirmed case / manual / AI suggestion / template option
- missing required fields
- last reviewed at
- export readiness

PDF export should read from confirmed case data plus saved draft values, never directly from raw import extraction or unaccepted AI suggestions.

## Guarantee Application Draft Boundary

The case workbench and the guarantee application draft have different responsibilities.

Case workbench:

- stores general case facts
- replaces the broker's main Excel workbook
- supports editing, review states, missing fields, conflicts, and source evidence
- should be reusable across outputs

Guarantee application draft:

- belongs to one case and one guarantee company template
- stores company-specific completion state
- stores manual values that do not belong in the general case facts
- stores selected plan/options/consent checks
- calculates whether this specific application is ready to export
- prevents output when required draft/company fields are missing

For V1, `ふれんず保証` should be the first draft target.

The draft must not bypass the workbench. It should start from confirmed case data, allow output-specific completion, and then feed the official PDF overlay.

## Workbench UX Requirements

The case workbench should behave like a structured editing table:

- grouped rows
- editable values
- status badges
- source/evidence popover or side panel
- missing and needs-review filters
- conflict view
- save changes
- output readiness summary
- deep links from output readiness/missing items to the editable field group

Priority filters:

1. `出力に必要`
2. `確認が必要`
3. `AI候補`
4. `未入力`
5. `不一致`
6. `確認済み`

The default view should not overwhelm the broker. Start with required missing and uncertain fields, then allow expansion into all fields.

## Missing Field Navigation

Missing-field reminders are not enough by themselves.

Every missing or needs-review item shown in output readiness should be actionable:

- if the field is a general case fact, link to the relevant case workbench group
- if the field is guarantee-company-specific, link to the guarantee application draft section
- preserve the selected case and selected guarantee template when navigating
- highlight or anchor the destination section when feasible

The user should not need to manually search the product for where to fill a missing value.

Recommended output-center action labels:

- `案件ワークベンチで入力`
- `申込書ドラフトで入力`
- `不足項目を確認`

This is part of the Excel-replacement promise: the product should tell the broker what is missing and take them directly to the place where it can be fixed.

## PM Acceptance Criteria

Case workbench work is acceptable only when:

1. The product has a clear editable layer between input review and output.
2. Output does not consume raw extraction or unaccepted AI suggestions.
3. The user can see which fields are confirmed, edited, AI-suggested, missing, conflicting, rejected, or unknown.
4. The user can directly edit and save fields in business groups.
5. Missing/uncertain output-required fields are highlighted without requiring the user to manually check every field.
6. `保証会社申込書` readiness is calculated from the workbench data state.
7. User-facing language remains broker-friendly and avoids technical mapping/schema terminology.
8. Missing/needs-review reminders provide direct navigation to the editable workbench or draft section.
