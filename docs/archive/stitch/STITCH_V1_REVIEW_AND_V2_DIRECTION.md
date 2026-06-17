# Stitch V1 Review And V2 Direction: Broker Desk

## Verdict

Stitch V1 is directionally better than the current product UI, but it is not ready to implement as the new frontend.

It has useful pieces:

- a calmer professional visual system
- a visible three-step workflow
- a workbench page with source evidence
- a PDF preview concept with save/download controls

But it still fails the most important product-positioning test:

```text
Does this feel like a real estate information intake, organization, production, and output center?
```

Current answer:

```text
Partially. It still feels too much like an申込書/PDF tool with a generic SaaS dashboard skin.
```

## What V1 Gets Right

### 1. The Three-Step Flow Is Finally Visible

The app home and landing page use:

```text
資料を入れる -> 情報を整理する -> 資料を出力する
```

This is the correct core line. Keep it.

### 2. The Case Workbench Structure Is Promising

The workbench page has a useful structure:

- left: case sections
- center: field review
- right: source document evidence

This correctly expresses:

```text
source material -> structured field -> human confirmation
```

Keep this model, but expand it into a true case-level workbench.

### 3. PDF Preview Has The Right Product Moment

The PDF preview includes:

- editable input boxes
- confirmed / AI candidate / missing states
- save to case
- save to template
- gated download

These are important and should remain.

## Critical Problems

### 1. Landing Page Hero Sends The Wrong Product Signal

The hero visual shows a generic analytics laptop / dashboard.

This is wrong for Broker Desk.

It makes the product look like:

- BI dashboard
- CRM
- sales analytics
- generic SaaS back office

The hero must instead show the actual production loop:

```text
source files + missing-field review + case workbench + official output preview
```

V2 requirement:

- replace the dashboard laptop visual
- show paperwork, files, field review, and official form output
- make the first screen instantly say "paperwork production workbench", not "data dashboard"

### 2. The Product Still Leans Too Narrowly Toward Application Forms

The UI still anchors heavily on:

```text
申込書作成
```

This is acceptable as the first V1 workflow, but not as the whole platform identity.

The platform identity should be:

```text
資料入力・情報整理・資料出力
```

V2 requirement:

- top-level app framing should be `不動産業務ワークベンチ` or `情報整理・出力センター`
- `申込書作成` should be the active workflow, not the product category
- guarantee application forms should be presented as the first supported output type

### 3. Missing Required Product Screens

V1 only includes:

- landing
- app home
- workbench
- PDF preview

Missing from the product story:

- source upload / input center
- extraction review
- output center
- cases / work queue
- data / insight page
- template / output library

Without these, the product still feels like a few stitched pages, not a complete platform.

V2 requirement:

- add at least low-fidelity but coherent screens for the missing product areas
- especially add `Input Center`, `Output Center`, and `Data / Insight`

### 4. App Home Is Too Thin

The home page is too empty and behaves like a single demo task card.

It should answer:

- what cases are active?
- what is blocked?
- what was recently imported?
- what can be output now?
- what should I do next?

V2 requirement:

- keep one primary next action
- add a compact work queue
- add readiness summaries for active cases
- add recent source issues with direct actions
- avoid vanity KPI panels

### 5. Case Workbench Is Too Narrow

The workbench currently looks like only:

```text
申込者情報 確認
```

It needs to feel like the case's central operating surface.

V2 requirement:

- show case-level header: property, applicant, selected output, readiness
- include business sections:
  - 物件・部屋
  - 契約条件
  - 申込者・賃借人
  - 本人確認
  - 勤務先・収入
  - 緊急連絡先・連帯保証人
  - 同居人
  - 取扱店・管理会社
  - 保証会社別項目
- keep attention-first filters:
  - 申込書で止まる
  - 確認が必要
  - 高信頼候補
  - 候補なし
  - すべて

### 6. PDF Preview Uses A Fake Blurred Form

The current PDF preview screenshot uses an abstract blurred paper image.

This is unacceptable for this product.

The official form is the trust object. If the form looks fake, the product moment collapses.

V2 requirement:

- show a real official-form-like canvas with visible rows, cells, and field boundaries
- make the form background protected
- input boxes should sit precisely inside official form spaces
- show alignment guide lines and snapping only when editing

### 7. Calibration UI Uses Wrong Language

The PDF preview says:

```text
抽出エンジンの感度
```

This is not the user's job.

It exposes internal system logic and will confuse brokers.

V2 replacement:

```text
入力枠の位置調整
グリッドに合わせる
ガイド線を表示
入力枠を追加
この案件に保存
テンプレートに保存
位置をリセット
```

### 8. Too Much English For A Japanese Broker Tool

Examples:

- `Professional Workbench`
- `Source Document`
- `CASE-20231024-A`
- English-heavy design-language labels

English is acceptable internally, but the product UI should be Japanese-first.

V2 requirement:

- use `ブローカーデスク` as the customer-facing product name
- keep English only where it is conventional or secondary
- replace `Source Document` with `元資料`
- replace generic English headings with Japanese business terms

### 9. Visual System Is Credible But Too Severe

The dark navy sidebar and hard borders create discipline, but the app risks feeling heavy and enterprise-like.

This matters because the product must beat painful old software through ease and clarity.

V2 requirement:

- keep precision and density
- soften the overall weight
- reduce dark-sidebar dominance
- preserve white work surfaces
- use color primarily for state and action, not decoration

### 10. Data / Insight Is Only A Nav Item

The brief asks for a future platform data layer.

V1 only adds `データ` in the nav.

V2 requirement:

Add a practical data page, not a broad BI dashboard.

It should show:

- active cases by status
- outputs created this week
- cases blocked by missing fields
- most common missing fields
- templates used
- AI candidate acceptance / correction trend

The page should answer:

```text
何が詰まっているか
何が出力できるか
何が改善されているか
```

## V2 Page Set Required

Stitch V2 should generate these screens:

1. Landing page
2. App home / today task
3. Input center / source upload
4. Extraction review
5. Case workbench
6. Output center
7. Editable official PDF preview
8. Cases / work queue
9. Data / insight
10. Templates / output library

## V2 Navigation Recommendation

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

Do not make `申込書作成` the top-level product identity.

Use it as:

```text
current workflow / output type
```

## V2 Landing Page Direction

Hero should show:

```text
files entering
-> case data becoming structured
-> missing items highlighted
-> official output preview
```

Hero copy:

```text
ブローカーデスク
不動産業務の資料入力・整理・出力センター

Excel・PDF・本人確認資料から情報を取り込み、
物件・申込者・契約情報を整理し、
必要な申込書や業務資料をすばやく作成します。
```

CTA:

```text
資料を入れて始める
```

Secondary CTA:

```text
出力できる資料を見る
```

## V2 Acceptance Criteria

V2 is acceptable only if:

1. The product no longer looks like a generic dashboard.
2. The first screen clearly communicates real estate paperwork production.
3. The user can understand the input -> organize -> output loop in ten seconds.
4. `申込書作成` is shown as a workflow, not the whole product category.
5. The workbench feels like the central case operating surface.
6. Input center and output center exist as independent product surfaces.
7. PDF preview shows a real official-form-like structure, not a blurred fake document.
8. Calibration language is user-facing and not engine-facing.
9. Data / insight exists as practical operational visibility.
10. The Japanese UI copy feels natural for small real estate brokers.
