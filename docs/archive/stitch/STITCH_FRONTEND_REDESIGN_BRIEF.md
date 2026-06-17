# Stitch Frontend Redesign Brief: Broker Desk

## Objective

Redesign Broker Desk from a feature-plugin feeling into a complete product platform experience.

The current implementation proves important workflow functions, but the frontend still feels like a set of isolated tools. The next design must communicate a real product:

- clear landing page
- clear product category
- clear 1-2-3 operating flow
- credible Japanese real estate business feel
- enough structure to support future modules
- no Salesforce-like complexity in the daily user path
- no generic AI SaaS interface

The design should make Broker Desk feel like the operating center for real estate paperwork and information production, not merely a PDF filling tool.

## Revised Product Positioning

Broker Desk is a real estate information intake, organization, production, and output center for small Japan real estate brokers.

It helps brokers quickly:

1. record information from source materials
2. organize and verify property / customer / contract data
3. produce business documents from confirmed data
4. output official forms, summaries, reports, and future customer-facing responses

The product core is:

```text
structured real estate workbench
+ built-in automation rules
+ AI-assisted extraction, review, and production
+ official document output
+ operational data visibility
```

Current V1 beachhead:

```text
input source files
-> confirm and complete case data
-> output guarantee company application forms
```

This V1 flow is not the whole product. It is the first high-frequency workflow that proves the platform.

## Product Category

Use this category framing:

```text
不動産仲介の情報整理・申込書作成ワークベンチ
```

Alternative shorter category:

```text
不動産業務の資料入力・整理・出力センター
```

English internal framing:

```text
Real estate paperwork and information production desk
```

Avoid framing it as:

- generic CRM
- generic OCR tool
- generic PDF editor
- generic AI agent
- sales dashboard
- enterprise property management system
- Salesforce replacement

It may eventually overlap with parts of CRM, property management, customer support, and analytics, but the wedge is narrower and more practical:

```text
turn messy real estate materials into usable business outputs
```

## Target User

Primary user:

- Japanese real estate broker
- small brokerage office staff
- solo or small-team operator
- uses Excel, PDF downloads, email, LINE, and manual copying
- wants speed and accuracy, not a complex system
- has no interest in field mapping, schemas, raw coordinates, JSON, AI training, or database concepts

User pain:

- the same information is typed repeatedly
- Excel files, PDFs, ID scans, and notes are scattered
- official forms have fixed layouts and are painful to fill
- missing fields are discovered too late
- manual checking is slow and error-prone
- current software is often too big, ugly, rigid, or expensive

User expectation:

```text
I put in the materials I already have.
The system reads what it can.
It shows me only what needs attention.
I correct and complete the workbench.
Then it creates the document or output I need.
```

## Core Product Promise

Primary promise:

```text
不動産業務の資料入力・整理・出力を、ひとつのワークベンチで。
```

More concrete promise:

```text
Excel・PDF・本人確認資料から情報を取り込み、
物件・申込者・契約情報を整理し、
必要な申込書や業務資料をすばやく作成します。
```

V1 output promise:

```text
確実に入れられる項目は自動入力し、
足りない項目だけ確認して、
保証会社申込書をそのままプレビュー・補入力・PDF出力できます。
```

Do not promise:

```text
Every official form field will be perfectly auto-filled.
```

Correct automation promise:

```text
自動化できる部分は先に進め、判断が必要な部分だけ人に戻します。
```

## Product Philosophy

The frontend should express this philosophy:

```text
Frontstage: simple 1-2-3 operation.
Backstage: automation rules, AI extraction, document logic, confidence checks, and learning.
```

The user should not feel the complexity.

The user should feel:

```text
The product already prepared the work.
I only need to confirm the exceptions.
```

The product must not feel like:

```text
I have to operate a database, an AI model, and a PDF editor myself.
```

## Platform Capability Layers

Design the product as a platform with four visible capability layers.

### 1. Input Layer

Purpose:

```text
資料を入れる
```

Supported V1 and near-term materials:

- Excel files
- downloaded guarantee company PDF forms
- customer / applicant information files
- property information sheets
- residence card or driver license scans as person-info entry sources
- future: emails, LINE exports, listing pages, broker notes

UX goal:

- upload should feel effortless
- show what was found
- show what could not be trusted
- do not expose mapping as the default user task

### 2. Workbench Layer

Purpose:

```text
情報を整理する
```

This is the product center.

It is a structured, guided, intelligent replacement for the broker's Excel workflow.

It should hold:

- property information
- room / unit information
- rent and fee information
- applicant information
- co-resident information
- guarantor / emergency contact information
- employer and income information
- brokerage company information
- management company information
- guarantee-company-specific draft fields
- source evidence
- trust state
- edit history

UX goal:

- not a raw database table
- not every field expanded by default
- attention-first: missing, uncertain, conflicting, blocking
- every issue should be directly fixable

### 3. Output Layer

Purpose:

```text
資料を作る / 出力する
```

V1 output:

- guarantee company application forms

Supported V1 templates:

- 全保連
- 日本セーフティー
- Jリース
- インシュア
- ふれんず保証

Future outputs:

- property summary sheets
- quotation sheets
- tenant/customer presentation materials
- advertisement drafts
- market comparison reports
- owner reports
- invoice / receipt / estimate outputs
- contract-preparation packets
- service request forms

UX goal:

- output should feel like production from confirmed workbench data
- official form background must remain protected
- values can be previewed, edited, dragged, resized, added, deleted, and saved
- direct download is gated by readiness

### 4. Data / Insight Layer

Purpose:

```text
案件と業務を見える化する
```

This is not the V1 homepage, but the product should visually leave room for it.

Future value:

- case count
- output volume
- missing-field patterns
- guarantee company usage
- document completion time
- applicant/property information completeness
- recurring correction patterns
- broker team workload
- customer response status

UX goal:

- should not become a KPI-heavy dashboard too early
- should support practical work visibility
- should answer "what is stuck, what is ready, what changed"

## AI Positioning

AI is a built-in assistant layer inside the platform.

AI is not the product's frontstage identity. The product is not a chatbot.

AI should appear as:

- `AI候補`
- `確認が必要`
- `不一致`
- `出典が弱い項目`
- `自動識別`
- `自動補完`
- `前回の修正から学習`

AI helps with:

- extracting fields from messy source files
- normalizing names, addresses, dates, phone numbers, money amounts
- identifying missing fields for a selected output
- detecting conflicts between files
- explaining why a field needs confirmation
- suggesting values from previous broker patterns
- improving from user corrections through product-owned memory
- future: assisting customer replies or AI customer support

AI must not be shown as:

- a magic autopilot
- a central chat panel on every screen
- a hidden decision-maker
- a model-training interface
- a technical LLM tool

Correct user-facing feel:

```text
AI is watching the paperwork and bringing uncertain work back to me.
```

Wrong user-facing feel:

```text
I need to manage an AI system.
```

## Automation Positioning

The platform is powered by automation rules plus AI.

Important distinction:

- rules handle stable business logic
- AI handles fuzzy extraction, normalization, and review assistance
- humans confirm business truth

Examples of automation rules:

- required fields by output template
- output readiness gate
- minimum safe auto-fill fields
- print-fit and field overflow warnings
- company-specific draft field requirements
- trust-state transitions
- correction event logging
- template adjustment saving

This should not be visible as "rules engine" in the UI. It should be visible as a simpler work experience:

```text
次に必要な作業だけ表示される
```

## Current Functional Capabilities To Reflect

The redesign should reflect that these capabilities exist or are the current V1 direction:

- source material upload
- known Excel input file import
- PDF / scan source handling direction
- residence card / driver license support direction for person information intake
- extraction candidates
- source evidence viewing
- structured case workbench
- trust states:
  - `確認済み`
  - `修正済み`
  - `AI候補`
  - `確認が必要`
  - `未入力`
  - `不一致`
  - `不採用`
  - `不明`
- missing-field and blocking-field queues
- selected output target
- guarantee-company-specific draft fields
- editable official PDF preview
- protected official form background
- drag / resize / add / delete input boxes
- alignment guides and light snapping
- save field adjustment for current case
- save field adjustment as template-level calibration
- readiness-gated PDF download
- flattened PDF export / print
- correction events
- AI experience learning from human correction
- future operational data view

## Frontend Product Shape

The customer-facing product must feel like a guided business production line.

Primary daily path:

```text
1 資料を入れる
2 足りない項目だけ確認
3 申込書を出す
```

Platform mental model:

```text
Input center
-> Case workbench
-> Output center
-> Data / insight center
```

The app can contain deeper tools, but daily use should always return to:

```text
What case am I working on?
What is missing?
What can be produced now?
What is the next action?
```

## Information Architecture

Recommended primary navigation:

- `申込書作成`
- `資料を入れる`
- `案件`
- `出力`
- `テンプレート`

Recommended secondary / admin navigation:

- `データ`
- `AI経験レビュー`
- `監査ログ`
- `設定`

Do not put every future business domain into the primary sidebar. That creates Salesforce-like weight too early.

Daily operation should be organized by workflow, not by database entity.

## Required Pages / Screens

### 1. Landing Page

Purpose:

- explain product category
- explain target user
- show the complete input -> organize -> output loop
- show that guarantee company application output is the first concrete workflow
- make the product feel credible as a paid business tool

Hero direction:

- first viewport should say `ブローカーデスク`
- subtitle should clearly say real estate information / paperwork workbench
- use actual product/workflow visuals, not abstract gradients
- visual should show source files, case workbench, missing-field review, and official form output

Suggested hero copy:

```text
ブローカーデスク
不動産仲介の情報整理・申込書作成ワークベンチ

Excel・PDF・本人確認資料から情報を取り込み、
物件・申込者・契約情報を整理し、
必要な業務資料をすばやく作成します。
```

Primary CTA:

```text
申込書を作成する
```

Secondary CTA:

```text
できることを見る
```

Hero workflow strip:

```text
1 資料を入れる
2 情報を整理する
3 資料を出力する
```

Landing sections:

1. Problem: scattered files, repeated typing, Excel work, official PDFs, missing fields.
2. Product loop: input -> workbench -> output.
3. V1 concrete use case: guarantee company application forms.
4. Workbench: structured property / applicant / contract data.
5. Editable official PDF preview.
6. AI-assisted review and correction learning.
7. Future operating visibility: cases, output status, data summaries.
8. CTA.

### 2. App Home / Today Task

This is not a broad analytics dashboard.

Primary purpose:

- show active cases
- show the user's next work
- show output readiness
- keep the 1-2-3 production line visible

Suggested heading:

```text
今日の業務
```

Or:

```text
申込書作成ワークベンチ
```

Main card should show:

- current case
- current output target
- missing / confirmation count
- next action
- latest source import
- output readiness

Avoid:

- giant KPI panels as the first screen
- CRM pipeline charts
- module grids
- duplicate buttons that navigate to the same place

### 3. Source Upload / Input Center

Purpose:

```text
資料を入れる
```

Screen structure:

- large drop zone
- source type selector
- recent imports
- extraction status
- clear next action into review/workbench

Source type labels:

- `Excel`
- `PDF`
- `本人確認資料`
- `物件資料`
- `その他`

Primary actions:

- `資料を追加`
- `抽出結果を確認`
- `案件ワークベンチへ進む`

Do not show technical mapping as the default screen.

If needed, hide it under:

```text
詳細設定
```

### 4. Extraction Review

Purpose:

```text
資料から見つけた情報を確認する
```

Layout:

- left: source preview / evidence
- center: candidate fields
- right: selected case summary and next action

Each candidate should show:

- field label
- extracted value
- source evidence
- trust state
- accept / edit / reject / unknown action

Labels:

- `候補を使う`
- `修正して使う`
- `不明として残す`
- `候補を使わない`
- `出典を見る`

Avoid:

- raw field keys
- schema
- mapping
- confidence math as primary UI

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

Default view:

- attention-first work queue
- selected output target
- required fields
- uncertain fields
- conflict fields
- all fields collapsible by section

Priority queues:

1. `申込書で止まる`
2. `確認が必要`
3. `高信頼候補`
4. `候補なし`
5. `すべて`

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

Field card should include:

- readable Japanese label
- editable value
- trust badge
- source evidence
- AI/candidate note
- save state
- link to output field if relevant

Every missing or uncertain item must be directly editable.

### 6. Output Center

Purpose:

```text
作れる資料を選ぶ
```

V1 primary output:

```text
保証会社申込書
```

Screen structure:

- selected case
- selected output category
- readiness checklist
- template cards
- preview and download actions

Template card should show:

- company name
- output type
- readiness state
- missing count
- preview button
- download availability

Supported V1 templates:

- `全保連`
- `日本セーフティー`
- `Jリース`
- `インシュア`
- `ふれんず保証`

If not ready:

- show exact missing or uncertain items
- link directly to case workbench or output draft
- do not make download the main action

Action labels:

- `不足項目を確認`
- `案件ワークベンチで入力`
- `申込書ドラフトで入力`
- `申込書をプレビュー`
- `確認済みPDFをダウンロード`

### 7. Editable Official PDF Preview

This is the most distinctive current product moment.

It should feel like:

```text
official form fixed, input boxes editable
```

Core layout:

- large official form canvas
- values shown as calm highlighted input boxes
- missing/manual fields shown as empty editable boxes
- candidate fields visually distinct from confirmed fields
- side panel with field list, readiness, missing items
- top bar with case/template/save/download actions

Controls:

- edit value inline
- drag field box
- resize field box
- add input box
- delete input box
- alignment guide lines
- subtle snapping near guide lines
- save for current case
- save as template adjustment
- reset position
- download only when safe gate passes

Important:

- do not present this as a generic PDF designer
- do not expose raw coordinates
- official form lines must look protected
- user adjusts values and input boxes only, never the official form

Suggested labels:

- `申込書の上で直接なおす`
- `この案件に保存`
- `テンプレートに保存`
- `未入力を補ってからダウンロード`
- `確認済みPDFをダウンロード`
- `入力枠を追加`
- `位置をリセット`

### 8. Cases / Work Queue

Purpose:

```text
案件の進行状況を見る
```

This should be a work queue, not CRM.

Show:

- case name
- latest source import
- selected output
- missing count
- confirmation count
- output status
- last updated
- owner / assignee if needed

Status labels:

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

This is future-facing but should be present enough to make the product feel like a platform.

Useful widgets:

- outputs created this week
- cases waiting for missing information
- most common missing fields
- templates used
- average time from input to output
- corrections by field type
- AI candidate acceptance rate

Keep this practical. It should answer operational questions, not look like investor analytics.

### 10. Templates / Output Library

Purpose:

```text
出力テンプレートを管理する
```

Show:

- available guarantee company templates
- template readiness / calibration status
- last adjusted date
- output categories
- future document categories

This page should not be the daily workflow center.

### 11. AI Experience / Settings

Purpose:

```text
AIの学習候補を確認する
```

This is admin/secondary.

Use if needed:

- `AI経験レビュー`
- `承認待ち`
- `この修正を今後の候補に反映`
- `却下`

Do not make ordinary brokers operate this every day.

### 12. Future AI Customer Support Placeholder

Do not build a full AI customer service UI as V1.

But the design may leave a future product area:

```text
顧客対応
```

Future role:

- answer customer questions using confirmed case data
- draft LINE/email replies
- explain missing documents
- remind customers of required information
- support broker-approved responses

Important:

- AI customer support must be grounded in workbench data
- it should not invent facts
- broker approval should remain visible

## Visual Direction

Target feeling:

- precise
- calm
- operational
- trustworthy
- Japanese business-document credible
- fast and guided
- complete product, not plugin

Visual language:

- light neutral background
- crisp white work surfaces
- restrained navy / ink text
- mint / green only for confirmed and safe progress
- amber for needs review
- red only for blocking or missing
- subtle blue for selected / AI candidate
- thin borders
- compact spacing
- 8px or smaller radius for cards and containers
- dense but organized information

Do not use:

- decorative gradient blobs
- purple AI SaaS look
- cartoon mascot
- broad CRM dashboard
- too many charts
- generic module grid
- abstract "AI brain" visuals
- oversized app cards inside other cards
- raw technical panels on primary screens

## Layout Rules

Landing:

- first viewport must clearly say this is for real estate paperwork / information work
- show a real product workflow visual
- do not make the hero vague AI marketing
- show a hint of the next section below the fold

App:

- every page has one primary action
- the current workflow step is always visible
- duplicate buttons with the same destination should be removed or clearly differentiated
- missing items always link to where they can be fixed
- technical details stay collapsed
- daily workflow should be usable without reading documentation

PDF preview:

- official form background is protected
- input boxes are editable
- alignment support is visible
- template-level saving is available
- download is readiness-gated

## Mobile / Responsive

Primary use is desktop/laptop.

Mobile should support:

- checking case status
- reviewing a few missing fields
- reading output readiness
- making small text edits

Mobile is not expected to be the primary surface for precise PDF field dragging.

## Japanese UI Copy Bank

Product:

- `ブローカーデスク`
- `不動産仲介の情報整理・申込書作成ワークベンチ`
- `不動産業務の資料入力・整理・出力センター`
- `不動産業務の資料入力・整理・出力を、ひとつのワークベンチで`

Workflow:

- `資料を入れる`
- `情報を整理する`
- `足りない項目だけ確認`
- `資料を出力する`
- `申込書を出す`
- `案件ワークベンチ`
- `会社別草稿`
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
- `申込書ドラフトで入力`
- `申込書をプレビュー`
- `確認済みPDFをダウンロード`
- `この案件に保存`
- `テンプレートに保存`
- `入力枠を追加`
- `位置をリセット`

Output promise:

- `確実に入れられる項目は自動入力し、残りは申込書上でそのまま補入力できます。`
- `公式フォームの線やレイアウトは変更せず、入力欄だけを調整できます。`
- `自動化できる部分は先に進め、判断が必要な部分だけ人に戻します。`

## Design Deliverables Expected From Stitch

Please generate a coherent frontend design system and page set, not just a single dashboard.

Minimum page set:

1. Landing page
2. App home / today task
3. Source upload / input center
4. Extraction review
5. Case workbench
6. Output center
7. Editable official PDF preview
8. Cases / work queue
9. Data / insight page
10. Templates / output library
11. Settings / AI experience lightweight page

The design should make the product feel complete even if implementation ships in phases.

## Hard Acceptance Criteria

The design is acceptable only if:

1. A broker can understand the input -> organize -> output loop within ten seconds.
2. The product feels like a complete platform, not a PDF plugin.
3. The landing page clearly explains the product category and target user.
4. Guarantee company application output is presented as the first concrete workflow, not the whole product.
5. The app home has one obvious next action.
6. The case workbench is visually and conceptually the product center.
7. The PDF preview feels like a protected official form with editable input boxes.
8. AI appears as review/candidate/automation intelligence, not as chatbot-first UI.
9. Data/insight exists as a practical operational layer, not a vanity dashboard.
10. Technical concepts such as mapping, schema, coordinate, JSON, and raw field keys are not visible by default.
11. The UI does not look like Salesforce or a broad CRM.
12. The design is credible for Japanese real estate paperwork.

## Redesign Summary

Stitch should redesign Broker Desk as:

```text
A Japanese real estate information and paperwork production workbench
where source materials become confirmed case data,
confirmed case data becomes official documents and business outputs,
automation handles stable rules,
AI handles fuzzy extraction and review support,
and brokers only deal with the exceptions that need human judgement.
```

Current first proof workflow:

```text
source files -> case workbench -> guarantee company application PDF
```

Future expansion direction:

```text
more input sources
more output documents
more operational data visibility
AI-assisted customer communication grounded in confirmed case data
```
