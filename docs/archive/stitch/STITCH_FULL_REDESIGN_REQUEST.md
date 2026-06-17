# Stitch Full Redesign Request: Broker Desk

## Request Type

Please do a full product redesign.

This is not a small revision of the previous Stitch V1 output.

The previous version had some useful components, but the product direction was still too narrow and too dashboard-like. Please restart the product design from the positioning below.

## Product Name

```text
ブローカーデスク
```

English internal name:

```text
Broker Desk
```

## Product Positioning

Broker Desk is a real estate business information intake, organization, production, and output center for small Japanese real estate brokers.

It is not only a guarantee company application form tool.

It is not a generic PDF editor.

It is not a CRM.

It is not a BI dashboard.

It is not a chatbot-first AI product.

The product exists to help brokers quickly turn scattered real estate business materials into structured, verified, usable outputs.

Core platform loop:

```text
資料を入れる
-> 情報を整理する
-> 資料を出力する
```

English internal explanation:

```text
Source materials become confirmed case data.
Confirmed case data becomes official documents, summaries, reports, and future customer-facing responses.
```

## Current V1 Beachhead

The first concrete workflow is:

```text
Excel / PDF / identity documents
-> case workbench review and completion
-> guarantee company application form output
```

Supported first output category:

```text
保証会社申込書
```

Supported guarantee companies in V1:

- 全保連
- 日本セーフティー
- Jリース
- インシュア
- ふれんず保証

Important: this is the first high-frequency workflow, not the whole product identity.

## Product Promise

Primary Japanese promise:

```text
不動産業務の資料入力・整理・出力を、ひとつのワークベンチで。
```

More concrete:

```text
Excel・PDF・本人確認資料から情報を取り込み、
物件・申込者・契約情報を整理し、
必要な申込書や業務資料をすばやく作成します。
```

Automation promise:

```text
自動化できる部分は先に進め、判断が必要な部分だけ人に戻します。
```

V1 output promise:

```text
確実に入れられる項目は自動入力し、
足りない項目だけ確認して、
保証会社申込書をプレビュー・補入力・PDF出力できます。
```

Do not promise perfect full automation of every official form field.

## Target User

Primary user:

- Japanese real estate broker
- small brokerage company staff
- solo broker or small team
- works with Excel, official PDF forms, email, LINE, scans, identity documents, and manual notes
- wants speed, accuracy, and low friction
- does not want enterprise complexity
- does not want to understand mapping, schemas, coordinates, OCR confidence math, JSON, or AI training

User mental model:

```text
I already have the source materials.
The system should read what it can.
It should show me only what is missing, uncertain, or blocking.
I correct and complete the workbench.
Then it creates the business output I need.
```

## Design Goal

Make Broker Desk feel like a complete paid business product, not a feature plugin.

The design should communicate:

- operational clarity
- Japanese business credibility
- workflow speed
- structured information control
- document production
- AI-assisted confidence without AI hype
- future extensibility into data views and customer support

The user should feel:

```text
The product prepared the work.
I only need to confirm the exceptions.
```

The user should not feel:

```text
I am operating a database, an AI model, and a PDF editor myself.
```

## What To Keep From Stitch V1

Keep these ideas:

- the three-step workflow:
  - `資料を入れる`
  - `情報を整理する`
  - `資料を出力する`
- professional, calm, dense visual tone
- workbench structure with source evidence
- field states such as confirmed, AI candidate, needs input
- editable PDF preview concept
- save-to-case and save-to-template concepts
- readiness-gated download

## What Must Be Reworked From Stitch V1

### 1. Do Not Use A Generic Dashboard Hero

The previous hero looked like BI / CRM / analytics software.

This is wrong.

The hero visual must show the actual product loop:

```text
source files
+ structured case workbench
+ missing-field review
+ official form output preview
```

The first screen must immediately say:

```text
real estate paperwork and information production
```

Not:

```text
generic dashboard analytics
```

### 2. Do Not Make `申込書作成` The Whole Product Identity

`申込書作成` is an active workflow and V1 output category.

The top-level product category should be broader:

```text
不動産業務の資料入力・整理・出力センター
```

or:

```text
不動産仲介の情報整理・申込書作成ワークベンチ
```

### 3. Do Not Use Fake Blurred PDF Backgrounds

The official form preview is a core trust surface.

It must look like a real official form:

- visible cells
- visible field boundaries
- protected background
- input boxes placed precisely into form spaces
- clear missing / confirmed / AI candidate states

Do not use an abstract blurred paper image.

### 4. Do Not Expose Internal Technical Language

Avoid user-facing words such as:

- mapping
- schema
- raw field key
- coordinate
- OCR confidence math
- extraction engine sensitivity
- JSON

Replace technical logic with broker-facing language:

- `入力枠の位置調整`
- `ガイド線を表示`
- `グリッドに合わせる`
- `出典を見る`
- `候補を使う`
- `修正して使う`
- `不足項目を確認`
- `確認済みPDFをダウンロード`

### 5. Do Not Make It Salesforce-Like

Avoid:

- too many primary modules
- broad CRM dashboard
- sales pipeline metaphors
- heavy KPI homepage
- generic entity management

Daily use should stay simple:

```text
What case am I working on?
What is missing?
What can be output now?
What is the next action?
```

## AI Positioning

AI is a backstage assistant layer inside the product.

AI should not be the frontstage product identity.

Show AI as:

- `AI候補`
- `確認が必要`
- `不一致`
- `出典が弱い項目`
- `自動識別`
- `自動補完`
- `前回の修正から学習`

AI helps with:

- extracting candidates from source files
- normalizing names, addresses, dates, phone numbers, and money fields
- detecting conflicts
- marking uncertain fields
- finding missing items for the selected output
- learning from user corrections
- future customer-response drafting grounded in confirmed case data

Do not design a central chatbot as the product's main surface.

Future AI customer support may exist, but it must be grounded in confirmed workbench data and broker approval.

## Automation Positioning

The platform is powered by:

```text
automation rules + AI assistance + human confirmation
```

Rules handle stable business logic:

- required fields by output type
- output readiness gate
- minimum safe auto-fill fields
- template-specific missing items
- print-fit warnings
- field overflow warnings
- correction event logging
- template calibration saving

AI handles fuzzy work:

- extraction
- normalization
- uncertainty detection
- candidate suggestion
- learning from corrections

Humans confirm business truth.

## Required Page Set

Please generate a coherent product design system and the following full page set.

### 1. Landing Page

Purpose:

- explain the product category
- show this is for Japanese real estate brokers
- show the complete input -> organize -> output loop
- show guarantee company applications as the first concrete workflow
- make the product feel like a credible paid product

Hero copy:

```text
ブローカーデスク
不動産業務の資料入力・整理・出力センター

Excel・PDF・本人確認資料から情報を取り込み、
物件・申込者・契約情報を整理し、
必要な申込書や業務資料をすばやく作成します。
```

Primary CTA:

```text
資料を入れて始める
```

Secondary CTA:

```text
出力できる資料を見る
```

Hero visual:

```text
source files -> case workbench -> missing item review -> official output preview
```

Do not show a generic analytics laptop.

### 2. App Home / Today Task

Purpose:

- show active work
- show next action
- show current cases
- show what is blocked
- show what can be output

It should not be a broad dashboard.

It should have:

- one primary next action
- active case card
- compact work queue
- recent imports
- blocked/missing items summary
- ready-to-output summary

Suggested heading:

```text
今日の業務
```

or:

```text
不動産業務ワークベンチ
```

### 3. Input Center / Source Upload

Purpose:

```text
資料を入れる
```

Should support the feeling of:

- drag and drop materials
- choose source type
- see extraction status
- continue to review

Source types:

- `Excel`
- `PDF`
- `本人確認資料`
- `物件資料`
- `その他`

Actions:

- `資料を追加`
- `抽出結果を確認`
- `案件ワークベンチへ進む`

### 4. Extraction Review

Purpose:

```text
資料から見つけた情報を確認する
```

Recommended layout:

- left: source preview / evidence
- center: extracted candidate fields
- right: case summary and next action

Candidate actions:

- `候補を使う`
- `修正して使う`
- `不明として残す`
- `候補を使わない`
- `出典を見る`

### 5. Case Workbench

This is the product center.

It should feel like:

```text
a structured, guided, intelligent Excel replacement
```

Not:

```text
a raw database admin panel
```

Required elements:

- case-level header
- property/applicant/output target summary
- readiness status
- missing / uncertain / conflict queue
- source evidence
- editable structured fields
- trust badges

Business sections:

- `物件・部屋`
- `契約条件`
- `申込者・賃借人`
- `本人確認`
- `勤務先・収入`
- `緊急連絡先・連帯保証人`
- `同居人`
- `取扱店・管理会社`
- `保証会社別項目`

Attention filters:

- `申込書で止まる`
- `確認が必要`
- `高信頼候補`
- `候補なし`
- `すべて`

### 6. Output Center

Purpose:

```text
作れる資料を選ぶ
```

This is the exit layer.

V1 output category:

- `保証会社申込書`

Future output categories:

- property summary sheets
- quotation sheets
- customer presentation materials
- advertisement drafts
- market comparison reports
- owner reports
- invoice / receipt / estimate outputs
- contract-preparation packets
- service request forms

Template cards should show:

- output type
- company/template name
- readiness state
- missing count
- preview action
- download availability

Actions:

- `不足項目を確認`
- `案件ワークベンチで入力`
- `申込書ドラフトで入力`
- `申込書をプレビュー`
- `確認済みPDFをダウンロード`

### 7. Editable Official PDF Preview

This is the strongest distinctive V1 product moment.

Required feel:

```text
official form fixed, input boxes editable
```

Required elements:

- real official-form-like canvas
- protected form background
- editable input boxes
- confirmed / AI candidate / missing states
- side panel with field list and readiness
- drag / resize / add / delete input boxes
- alignment guide lines
- subtle snapping
- save to current case
- save as template adjustment
- reset position
- readiness-gated download

Labels:

- `申込書の上で直接なおす`
- `この案件に保存`
- `テンプレートに保存`
- `未入力を補ってからダウンロード`
- `確認済みPDFをダウンロード`
- `入力枠を追加`
- `位置をリセット`
- `ガイド線を表示`
- `グリッドに合わせる`

### 8. Cases / Work Queue

Purpose:

```text
案件の進行状況を見る
```

This is not CRM.

Show:

- case name
- source status
- selected output
- missing count
- confirmation count
- output status
- last updated
- owner/assignee if useful

Statuses:

- `資料待ち`
- `確認中`
- `申込書準備中`
- `出力可能`
- `出力済み`

### 9. Data / Insight

Purpose:

```text
業務の詰まりと成果を見る
```

This is a practical operational view, not a vanity analytics dashboard.

Show:

- active cases by status
- outputs created this week
- cases blocked by missing fields
- most common missing fields
- guarantee company template usage
- average time from input to output
- AI candidate acceptance / correction trend

The page should answer:

```text
何が詰まっているか
何が出力できるか
何が改善されているか
```

### 10. Templates / Output Library

Purpose:

```text
出力テンプレートを管理する
```

Show:

- available output templates
- guarantee company templates
- calibration status
- last adjusted date
- output categories
- future document categories

### 11. AI Experience / Settings

This is secondary/admin.

It should not be a daily main screen.

Purpose:

```text
AIの学習候補を確認する
```

Possible actions:

- `承認`
- `却下`
- `この修正を今後の候補に反映`

## Navigation

Recommended primary navigation:

- `ワークベンチ`
- `資料を入れる`
- `案件`
- `出力`
- `テンプレート`

Recommended secondary navigation:

- `データ`
- `AI経験レビュー`
- `監査ログ`
- `設定`

Avoid putting every future business domain into the main navigation.

## Visual Direction

Target feeling:

- precise
- calm
- operational
- trustworthy
- Japanese business-document credible
- fast and guided
- complete product, not plugin

Use:

- light neutral background
- crisp white work surfaces
- restrained navy / ink text
- compact but readable layout
- thin borders
- small radius, mostly 4px to 8px
- green/mint for confirmed/safe
- amber for needs review
- red only for blocking/missing
- subtle blue for AI candidate or selected state

Avoid:

- generic dashboard hero
- decorative gradient blobs
- purple AI SaaS look
- cartoon mascots
- generic CRM module grid
- huge KPI dashboard first screen
- broad sales pipeline metaphors
- abstract AI brain visuals
- fake blurred documents
- raw technical/debug panels

## Japanese UI Copy Bank

Product:

- `ブローカーデスク`
- `不動産業務の資料入力・整理・出力センター`
- `不動産仲介の情報整理・申込書作成ワークベンチ`

Workflow:

- `資料を入れる`
- `情報を整理する`
- `足りない項目だけ確認`
- `資料を出力する`
- `案件ワークベンチ`
- `出力センター`
- `申込書プレビュー`

Field states:

- `確認済み`
- `修正済み`
- `AI候補`
- `確認が必要`
- `未入力`
- `不一致`
- `不採用`
- `不明`

Actions:

- `資料を追加`
- `抽出結果を確認`
- `案件ワークベンチへ進む`
- `候補を使う`
- `修正して使う`
- `不明として残す`
- `候補を使わない`
- `出典を見る`
- `不足項目を確認`
- `案件ワークベンチで入力`
- `申込書をプレビュー`
- `確認済みPDFをダウンロード`
- `この案件に保存`
- `テンプレートに保存`
- `入力枠を追加`
- `位置をリセット`

## Hard Acceptance Criteria

The redesign is acceptable only if:

1. It feels like a complete product, not a PDF plugin.
2. The first screen clearly communicates real estate paperwork and information production.
3. The user can understand `資料を入れる -> 情報を整理する -> 資料を出力する` within ten seconds.
4. `申込書作成` is presented as the first workflow, not the whole product identity.
5. The case workbench is clearly the central operating surface.
6. Input center and output center exist as independent product surfaces.
7. The PDF preview uses a real official-form-like structure, not a blurred fake document.
8. AI is presented as candidate/review/automation intelligence, not chatbot-first UI.
9. Data/insight is practical operational visibility, not generic BI.
10. Technical concepts are hidden by default.
11. Japanese UI copy feels natural for small real estate brokers.
12. The product does not look like Salesforce, a generic CRM, or a broad analytics dashboard.

## Final Redesign Summary

Please redesign Broker Desk as:

```text
A Japanese real estate information and paperwork production workbench
where source materials become confirmed case data,
confirmed case data becomes official documents and business outputs,
automation handles stable rules,
AI handles fuzzy extraction and review support,
and brokers only deal with the exceptions that need human judgement.
```

Current proof workflow:

```text
source files -> case workbench -> guarantee company application PDF
```

Future expansion:

```text
more input sources
more output documents
more operational data visibility
AI-assisted customer communication grounded in confirmed case data
```
