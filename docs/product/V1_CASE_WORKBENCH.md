# V1 Case Workbench

## Purpose

The product must not stop at file upload and PDF export.

The central operating layer is a case workbench: a structured, editable, reviewable business workspace that replaces the broker's Excel workbook.

Core chain:

Input files -> deterministic extraction -> AI-assisted suggestions where needed -> human review -> editable case workbench -> confirmed case data -> guarantee application draft -> official PDF output.

The case workbench is where the broker corrects, completes, compares, and confirms data before any output consumes it.

## Product Principle

The workbench is a digital Excel replacement, not a passive database page.

Editable fields should be generated from the canonical field catalog. The workbench may show only a prioritized subset by default, but field names, grouping, input kind, and output links must not drift into a separate hand-maintained field list.

2026-06-20 information-architecture decision:

- Treat the workbench as a reusable case dossier, not as a guarantee-application pre-form.
- Use a shallow information tree for orientation, but do not rely on the tree as the whole workflow.
- Pair the tree with issue queues, search, field states, and source evidence.
- Keep output-specific draft facts, company-specific options, and render fragments outside the default case dossier tree.
- Source of truth for this structure: `docs/product/V1_CASE_INFORMATION_ARCHITECTURE.md`.

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

## V1 Guarantee Application Section Legacy

For the guarantee application V1 path, the workbench previously prioritized sections needed by guarantee company application forms:

1. 物件・契約条件
2. 申込者・賃借人
3. 勤務先・収入
4. 緊急連絡先・連帯保証人
5. 同居人
6. 取扱店・管理会社
7. 保証プラン・会社別項目
8. 未入力・要確認
9. 入力ファイル・出典

These sections are still useful as field coverage for the current guarantee-company path, but they are not the final broker-facing information architecture. The durable navigation should move toward the case dossier tree in `V1_CASE_INFORMATION_ARCHITECTURE.md`, while guarantee-company-specific fields stay in the output draft layer.

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
- treat every user edit as a reusable global rule

The product should make AI uncertainty visible. The user should see a concise review list, such as:

- `AI候補: 確認してください`
- `出典が弱い項目`
- `複数ファイルで不一致`
- `出力前に必要な未入力項目`

## AI Correction Learning In The Workbench

The case workbench is the highest-value learning surface because it is where the broker turns candidates into confirmed business facts.

When the user saves or proceeds from the workbench, the system should:

1. capture the current confirmed case snapshot
2. compare it with the AI/rule candidate snapshot that populated the workbench
3. classify meaningful differences as correction events
4. preserve source evidence, field key, template, confidence, and user decision
5. send only appropriate correction events into experience draft generation

The workbench must distinguish:

- AI extracted wrong value
- AI extracted right value with wrong format
- source was missing and user filled the value manually
- user chose between conflicting source files
- user applied team/local wording preference
- user intentionally left a value unknown

Only the first two are direct AI extraction failures. The others are workflow knowledge or user preference.

User-facing UX should remain simple. The broker edits and saves. Any learning, diffing, and experience drafting happens backstage unless the user opens a secondary correction/history view.

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
10. Save/proceed creates correction events for meaningful AI/rule-vs-confirmed differences.

The user should not need to compare every imported field manually. The product's job is to reduce the review surface.

## Phase A Implementation Baseline

The case workbench must now behave as the main post-input operating page:

- Default view: show `要対応` fields first, not the complete field catalog.
- Attention definition: required missing fields for the selected output target, uncertain fields, AI candidates, conflicts, and intentionally unknown fields.
- Output target: the workbench must know which guarantee company template the broker is preparing.
- Template switching: the broker can switch the current guarantee company target inside the workbench.
- Filters: `要対応`, `出力に必要`, `全項目`, plus trust-state filters.
- Field action: the broker can edit the value and choose `入力値を使う`, `不明として残す`, or `候補を使わない`.
- Field controls: high-frequency field types should use business-aware controls, not one generic text input. Examples: phone, email, date, money, number-with-unit, address textarea, and broker-friendly select options for gender, spouse, housing type, employment type, identity document type, and relationship.
- Bulk confirmation: when visible AI candidates already have values, the broker can confirm the visible candidates in one save action instead of opening every field one by one.
- Save behavior: `不明` and `不採用` clear the confirmed value so output does not silently consume it.
- Save behavior: `入力値を使う` must mark a visible value as confirmed even if the displayed value did not change; otherwise an AI candidate can remain stuck in candidate state after the broker explicitly accepted it.
- Evidence: each field with extraction history exposes source sheet/cell/range, confidence, method, review status, and candidate value inline.
- Evidence summary: each field should show a concise judgement before the detail drawer: candidate value, source location, method, confidence, and an action-oriented hint.
- Evidence action: if a source candidate exists, the broker can save that field from the candidate summary without manually copying the value.
- Secondary evidence: long correction history and full source review stay behind a collapsed section.
- Navigation: output-center links back to the workbench with `guaranteeTemplate` preserved, so the broker does not fill the wrong target.
- Navigation: workbench filters and saves must preserve the selected guarantee template context.
- Priority queue: for V1 guarantee application work, the workbench should sort review work in this order: current-application blockers, trusted candidates, low-confidence items, required fields with no source candidate, then other attention fields.
- Queue scope: this priority order is for the guarantee application path only. Future business workflows may introduce different queue rules.

This is the minimum acceptable workbench posture before adding more output templates: the user should know what to fix first, why it is flagged, and whether it will be allowed into output.

## Data Architecture

V1 can stay JSON-first, but it must preserve three distinct concepts:

1. `ExtractionReview`: source evidence and field-level extraction/review decisions.
2. `BrokerageCase.confirmedDataJson`: confirmed business facts used across the product.
3. `GuaranteeApplicationDraft`: output-specific completion state for one selected guarantee company.
4. `CorrectionEvent`: durable evidence of meaningful differences between candidate, confirmed, and output-adjusted states.
5. `ExperienceUpdate`: scoped lesson or regression candidate generated from correction events.

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
- creates output-template scoped correction events when saved, so repeated company-option edits can improve later draft assistance without changing reusable case facts

For V1, `ふれんず保証` should be the first draft target.

The draft must not bypass the workbench. It should start from confirmed case data, allow output-specific completion, and then feed the official PDF overlay.

## Phase B Implementation Baseline

The first Phase B slice makes the company-specific draft a visible workbench layer, not a hidden PDF-preview side effect.

Implemented baseline:

- The case workbench has a `会社別草稿` section anchored at `#guarantee-template-drafts`.
- The selected guarantee company template is preserved when editing draft fields.
- Draft fields are loaded from `getGuaranteeDraftFieldDefinitions(templateId)`, so 全保連, 日本セーフティー, Jリース, インシュア, and ふれんず保証 each expose their own company-specific fields.
- Saving the draft uses `GuaranteeApplicationDraft`, not `BrokerageCase.confirmedDataJson`.
- Required draft missing count is shown separately from common case-data missing count.
- The workbench main action sends the broker to the draft section when common fields are complete but company-specific required draft fields are still missing.
- PDF preview remains the official-form visual correction surface; it should not be the primary place to discover or complete company-specific business options.
- The workbench, output center, and PDF preview all show the same draft readiness and draft saved-at state.
- Output center and preview links for company-specific missing fields return to the workbench draft section.
- Preview-side company-specific edits still save into the same `GuaranteeApplicationDraft`, but the preview page labels this as final form correction, not the primary data-entry surface.

Acceptance boundary:

- Company-specific options must not pollute reusable case facts.
- Output readiness must be calculated from confirmed common case data plus the selected template draft.
- The broker-facing path should remain: input -> workbench correction -> company-specific draft -> official-form preview -> PDF.

## Workbench UX Requirements

The case workbench should behave like a structured case-data editor:

- dossier tree navigation
- issue queue entry points
- search across labels, keys, aliases, values, and source clues
- grouped rows
- editable values
- status badges
- source/evidence popover or side panel
- missing and needs-review filters
- conflict view
- save changes
- secondary output readiness summary
- deep links from output readiness/missing items to the editable field group

Priority filters:

1. `出力に必要`
2. `確認が必要`
3. `AI候補`
4. `未入力`
5. `不一致`
6. `確認済み`

The default view should not overwhelm the broker. Start with required missing and uncertain fields, then allow expansion into all fields.

`整理情報` should not default to a guarantee-application checklist. Output readiness stays useful, but it is a consumer of the case dossier, not the page's information architecture.

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
9. Save/proceed actions create auditable correction events without adding mandatory user-facing AI training work.
10. One-off user edits are not promoted into global AI rules without scope and promotion gates.
