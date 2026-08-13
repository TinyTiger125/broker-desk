# V1 Case Information Architecture

Last updated: 2026-06-27

## Purpose

The `整理信息` module must become the structured case information center of Broker Desk.

It is not enough to show a flatter or prettier field table. The product is replacing the broker's many Excel files, not one spreadsheet. Those Excel files exist because brokers need to distinguish customers, properties, cases, source documents, and different output preparations. Broker Desk should merge that scattered work into one reusable case dossier and then expose the dossier through task-specific views.

## Product Decision

The case workbench should be organized around the property-case information model, not around one output document.

The current V1 output workflow is the guarantee-company application. It should
run its own missing-field checks when the user starts that workflow. Quotes,
ads, contracts, and other document workflows remain future candidates or
compatibility surfaces and are not parallel V1 output paths.

The `整理信息` module should instead answer:

- What do we know about this case?
- Which facts are confirmed, candidate, conflicting, missing, not applicable, or intentionally unknown?
- Where did each important fact come from?
- What should the broker resolve next?
- How can the broker find a fact without knowing which Excel sheet or form used to contain it?

This keeps the workbench from becoming a guarantee-application pre-form while still making output faster because outputs consume the confirmed case dossier.

## Core Principle

Use a tree for orientation, not as the whole workflow.

A tree answers "where does this fact belong?" It does not answer "what should I do first?" A pure tree would become a collapsed spreadsheet and still force the broker to inspect too much manually.

The workbench must combine five patterns:

1. Case summary: the current case, property, parties, and overall data state.
2. Issue queue: missing, AI candidate, conflict, stale, and recently imported facts.
3. Information tree: business-object navigation for the case dossier.
4. Search: fast lookup across field labels, aliases, values, source names, and Japanese/Chinese terms.
5. Evidence drawer: source file, extraction text, confidence, review history, and edit history for the selected fact.

## Information Layers

### 1. Core Case Dossier

Stable facts that should be maintained once and reused across outputs.

Examples:

- applicant name, furigana, birth date, phones, email, current address
- property name, room number, postal code, address, usage
- lease rent, common fee, parking fee, move-in date, payment method
- employer, income, employment type, years employed
- emergency contact, guarantor, co-occupants
- brokerage, management company, landlord

These belong to `BrokerageCase.confirmedDataJson` today and future typed case storage later.

### 2. Conditional Workflow Facts

Facts that are valid case data but only apply under conditions.

Examples:

- buyer/seller facts for sales cases
-法人 applicant facts for corporate leases
- parking details only when parking exists
- guarantor facts only when the case uses a guarantor
- co-occupant facts only when co-occupants exist
- business-use property facts only when the property use is business

These should be visible only when the condition applies or when the broker explicitly turns on the group. They must support a user decision of `not_applicable`; otherwise the product will create false missing-field noise.

### 3. Output-Specific Draft Facts

Facts that belong to one output document or one template family.

Examples:

- guarantee company plan choices
- company-specific consent/checkbox values
- one-off draft remarks
- output-only submission date
- render fragments such as postal-code cells, phone segments, birth year/month/day, and amount digit cells

These do not belong in the default information tree. They should live in output draft space, template factory bindings, or render-time derivation.

## Recommended Workbench Shape

```text
Case Header
  property / applicant / deal type / owner / updated time
  data state summary: confirmed, AI candidate, conflict, missing, not applicable

Issue Queue
  need attention / AI candidates / conflicts / missing / recent imports / stale facts

Main Layout
  Left: information tree
  Center: selected node field groups
  Right drawer or overlay: selected field evidence and history

Global Utilities
  search
  all-fields advanced view
  source-file view
```

Do not permanently reserve a right column for output readiness. Output readiness belongs to output workflows. The workbench may show output-related signals only as secondary tags when they explain why a fact is useful, not as the primary organizing principle.

## Current Implementation Status

Implemented in the case workbench:

- A shallow case-dossier tree is shown before the editable field list.
- Node status is derived from child fields and includes confirmed, attention, candidate, conflict, missing, and not-applicable counts.
- Search can narrow the field list by label, field key, current value, tree path, and aliases.
- The main editable field form is the primary working surface after the dossier tree.
- Saving from the main editable form preserves the current tree node, status filter, queue, search text, selected guarantee template, and scroll anchor.
- Output-specific guarantee-application readiness and company-specific draft fields remain on the same page for workflow continuity, but are visually placed after the main case-data editor.
- As of 2026-06-27, the broader `整理信息` entry has been split into an object center for cases, subjects / related parties, properties, and unassigned intake.
- As of 2026-06-27, case creation opens an empty editable case workbench instead of depending on a prior upload.
- As of 2026-06-27, field cards have started moving to per-card save behavior, so edited cards can save individually rather than relying only on a page-level save.

Explicit non-goals for this slice:

- The case workbench is not yet a fully split-pane editor with a dedicated evidence side drawer.
- The existing guarantee-application shortcuts remain available for compatibility and current operational use.
- Output readiness is not removed; it is demoted from the organizing model.
- Subject and property editing are not yet equivalent to the case information tree. They currently have shallow profile forms and need their own object-specific IA before pilot quality.

## Information Tree V1

The tree should stay shallow. Maximum depth is three levels. More depth will hide work rather than organize it.

```text
案件資料
├─ 案件概要
│  ├─ 取引種別・進行状況
│  ├─ 担当・店舗
│  └─ 重要メモ
├─ 参加者
│  ├─ 申込者・賃借人
│  ├─ 同居人・入居者
│  ├─ 緊急連絡先
│  ├─ 連帯保証人
│  └─ 業者担当
├─ 物件
│  ├─ 物件基本
│  ├─ 所在地・郵便番号
│  ├─ 部屋・号室
│  └─ 管理情報
├─ 契約条件
│  ├─ 月額費用
│  ├─ 初期費用
│  ├─ 日付・契約期間
│  └─ 支払条件
├─ 勤務・収入
│  ├─ 勤務先・学校
│  ├─ 職業・雇用形態
│  └─ 収入・勤続
├─ 本人確認資料
│  ├─ 確認資料種別
│  ├─ 在留カード
│  ├─ 運転免許証
│  └─ 保険証
├─ 関係会社
│  ├─ 仲介会社
│  ├─ 管理会社
│  └─ 貸主
└─ 資料來源
   ├─ アップロード文件
   ├─ AI抽出結果
   └─ 手動修正履歴
```

The visible labels can be localized, but the tree should use Japanese real-estate terms as the broker-facing base because the documents and business workflow are Japanese.

## Node Status

Every tree node should show a compact status summary before the broker opens it.

Examples:

- `申込者・賃借人 12/14`
- `契約条件 未入力2`
- `緊急連絡先 AI候補3`
- `本人確認資料 不一致1`
- `同居人 不適用`

Node status should be calculated from child fields. It should not be manually maintained.

Minimum field states:

| State | Meaning |
| --- | --- |
| `confirmed` | Accepted or manually entered fact. |
| `edited` | User changed a source value. |
| `ai_candidate` | AI or rule candidate exists but is not accepted. |
| `needs_review` | Low confidence, weak source, stale source, or ambiguous value. |
| `conflict` | Multiple sources disagree. |
| `missing` | No value where the current case model expects one. |
| `not_applicable` | The broker or rules decide this fact does not apply to this case. |
| `unknown` | The fact may apply, but the broker intentionally leaves it unknown for now. |
| `rejected` | A proposed value was rejected and should not reappear as confirmed. |

`not_applicable` and `unknown` must be separate. Otherwise the system cannot distinguish "this case does not need a guarantor" from "we do not know the guarantor yet."

## Issue Queue

The issue queue should be the default working entry after import or when a case is reopened.

Recommended queue tabs:

1. `要対応`: conflicts, weak sources, low confidence, and important missing fields.
2. `AI候補`: proposed values waiting for confirmation.
3. `不一致`: source conflicts only.
4. `未入力`: expected fields with no value.
5. `最近取込`: values from the most recent import.
6. `確認済み`: recently confirmed or edited facts.

This queue should not be permanently tied to a guarantee-company template. Future workflows may have queue presets such as `申込準備`, `契約前`, `広告準備`, or `売買案件`, but the default organizing model remains the case dossier.

## Search Requirements

Search is a first-class workbench function, not an accessory.

It should match:

- Japanese label: `郵便番号`, `家賃`, `勤務先`
- Chinese label: `邮编`, `租金`, `工作单位`
- field key: `property.postalCode`, `lease.rent`
- aliases: `zip`, `postal`, `rent`, `employer`
- current value: `港区`, `090`, `山田`
- source name: uploaded Excel/PDF filename when possible

Search results should show the tree path and field state, for example:

```text
物件 > 所在地・郵便番号 > 物件郵便番号
申込者・賃借人 > 現住所 > 現住所 郵便番号
緊急連絡先 > 自宅住所 > 緊急連絡先 自宅郵便番号
```

This is necessary because brokers do not always know the product's classification before searching.

## Evidence Layer

The source/evidence layer should not be mixed into the business tree as normal fields.

For a selected fact, show evidence in a drawer, popover, or expandable panel:

- current value
- candidate value
- source file and location
- extraction method
- confidence
- who confirmed or edited it
- previous values
- reason for conflict or low confidence

The default view should stay clean. Evidence is needed when the broker doubts a value, resolves a conflict, or audits a correction.

## Field Priority

Not all fields deserve equal visual weight.

Each field should eventually carry these product attributes:

| Attribute | Purpose |
| --- | --- |
| `businessObject` | person, property, case, lease terms, source, company, etc. |
| `treePath` | where the field appears in the information tree. |
| `importance` | core, conditional, low-frequency, output-specific. |
| `appliesWhen` | rule or condition that makes the field relevant. |
| `sourceTypes` | likely sources such as Excel, identity document, PDF, manual. |
| `trustState` | current fact status. |
| `searchAliases` | Japanese, Chinese, English, source-label aliases. |

Current `src/lib/case-field-catalog.ts` already owns many field labels, value kinds, storage scopes, and aliases. The next product pass should extend or derive tree paths and field importance from the catalog rather than introducing another independent field list.

## Relationship To Existing Catalog Groups

The current catalog groups are useful but too output-shaped for the final workbench navigation:

| Current Catalog Group | V1 Tree Placement |
| --- | --- |
| `application_process` | output process or case timeline, not default core tree |
| `property_lease` | split into `物件` and `契約条件` |
| `applicant` | `参加者 > 申込者・賃借人` |
| `identity_document` | `本人確認資料` |
| `employment_income` | `勤務・収入` |
| `guarantor` | `参加者 > 連帯保証人` |
| `emergency_contact` | `参加者 > 緊急連絡先` |
| `co_occupants` | `参加者 > 同居人・入居者` |
| `broker_management` | `関係会社` plus `案件概要 > 担当・店舗` where appropriate |
| `guarantee_options` | output draft / template-specific layer, not default core dossier |

This lets the product keep the existing catalog while improving the broker-facing mental model.

## UX Rules

- Do not show the full field catalog by default.
- Do not make output readiness the permanent right-side panel of the workbench.
- Do not require users to understand field keys, schema, template bindings, or PDF coordinates.
- Do not show every conditional field as missing.
- Do not hide low-confidence or conflicting facts under a quiet confirmed-looking row.
- Do not let `not_applicable` fields keep generating reminders.
- Do not make source evidence a debug panel; it must explain trust in broker language.
- Keep `全部項目` as an advanced view, not the landing view.

## Implementation Route

### Phase 1: Product Model Alignment

- Add information-tree metadata or a derived tree map on top of `CASE_FIELD_CATALOG_GROUPS`.
- Add field importance: core, conditional, low-frequency, output-specific.
- Add `not_applicable` as a separate workbench field state.
- Define search aliases across Japanese, Chinese, English, and existing source labels.

Implementation baseline as of 2026-06-20:

- `src/lib/case-field-catalog.ts` exposes `CASE_INFORMATION_TREE`, `CaseFieldImportance`, `CaseFieldAppliesWhen`, and `getCaseFieldInformation`.
- `CASE_FIELD_DEFINITIONS` now carries derived `treeNodeId`, `treePath`, `importance`, `appliesWhen`, and `searchAliases`.
- `src/app/cases/[id]/page.tsx` renders a case dossier tree, issue summary, node filtering, search, field path chips, field importance chips, and the `not_applicable` field decision.
- `src/app/actions.ts` persists `not_applicable` as a workbench field status and clears the field value so it does not silently enter output.
- `scripts/check-case-field-catalog.mjs` now fails if the information-architecture exports disappear from the catalog.

### Phase 2: Workbench Layout

- Replace the flat section-first page with header, issue queue, information tree, focused node editor, and evidence drawer.
- Keep the selected-node editor dense and operational; this is not a landing page.
- Show child-node status counts in the tree.
- Preserve current edit/save behavior and correction-event capture.

### Phase 3: Source And Evidence UX

- Make source evidence accessible from each field.
- Add recent import filtering.
- Make conflict resolution explicit: choose source A, source B, edit manually, mark unknown, or mark not applicable.

### Phase 4: Workflow Presets

- Add queue presets for common real-estate work:
  - upload review
  - application preparation
  - contract preparation
  - ad preparation
  - sales case preparation
- Presets change priority, not the underlying data model.

## Acceptance Criteria

The information architecture is working when:

1. A broker can understand the case structure without knowing the old Excel sheets.
2. A broker can resolve the next important data problem without opening every tree node.
3. The same confirmed fact is maintained once and reused by the current
   guarantee-company application and, when approved later, future output
   workflows.
4. Conditional fields stop producing false missing warnings after they are marked not applicable.
5. Output-specific fields no longer pollute the general case dossier.
6. Search finds likely fields even when the broker uses a different language or term.
7. Evidence explains why a value should or should not be trusted.
8. The workbench feels like a structured case dossier, not a raw database editor or a collapsed spreadsheet.
