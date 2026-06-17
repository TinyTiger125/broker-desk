# Broker Desk Context

This file is the canonical domain glossary for Broker Desk. It should stay free of implementation details.

## Product Boundary

Broker Desk is a fast business workbench for small Japan real estate brokerage teams that currently rely on heavy Excel, Word, and manual PDF workflows.

Broker Desk is not primarily:

- a generic CRM
- a full property management system
- a generic OCR tool
- a generic PDF generator
- an autonomous AI decision-maker

AI may assist extraction, uncertainty marking, and review guidance, but confirmed business facts must remain reviewable, editable, and attributable.

AI improvement must be product-owned. Broker Desk should not depend on a model's private memory. User confirmations, edits, output adjustments, and review decisions should become durable correction evidence, scoped experience updates, and regression samples that can be retrieved for later AI tasks.

Multi-tenant permissions must protect the complete document-work lifecycle, not only official PDF output. Tenant authority should be resolved through membership before a user can read, edit, extract, output, publish templates, call AI, or view audit records.

## Core Workflow

The V1 workflow is:

Source files -> input extraction -> extraction review -> case workbench -> confirmed case data -> guarantee application draft -> official PDF preview -> flattened PDF export or print.

The backstage AI learning workflow is:

AI extraction/output snapshot -> user review/edit/save -> confirmed snapshot -> correction event -> scoped experience update -> retrieval context for the next relevant AI task.

## Glossary

### Tenant

A real-estate company, branch office, or workspace that owns Broker Desk business data.

A tenant owns cases, source files, extraction reviews, confirmed case data, output drafts, generated outputs, tenant templates, correction events, and audit logs.

### User

A login identity. A user may belong to multiple tenants.

User identity alone does not grant business access. Access comes from membership in a tenant.

### Membership

The relationship between a user and a tenant, including role and status.

Membership is the authority boundary for tenant-scoped data and actions.

### Source File

A broker-provided Excel, PDF, scan, residence card, driver license, or other document used as input evidence.

### Input Extraction

The process that turns a source file into structured extraction candidates. Known templates should use deterministic rules first. AI is only a supplement where the deterministic skeleton is insufficient.

### Extraction Candidate

A proposed field value extracted from a source file. It is not final until accepted or edited by the user.

### Extraction Review

The broker-facing review step where extracted values can be accepted, edited, rejected, or marked unknown. The user should not be asked to perform technical field mapping as the primary task.

### Case

The working unit for a brokerage transaction before final document output. A case collects property, applicant, lease, broker, management company, guarantee-plan, and source-evidence data.

### Case Workbench

The central operating layer of the product. It is the structured, editable, reviewable replacement for the broker's Excel workbook.

The case workbench is the product center. Input and output are convenience layers around it.

### Confirmed Case Data

Structured case data that can be used by outputs. Confirmed data may come from accepted extraction, user edits, or direct manual entry.

### Canonical Field Catalog

The product-owned dictionary of standard brokerage facts that Broker Desk knows how to collect, review, reuse, and output.

The canonical field catalog is the logical wide table for the product. Individual inputs and outputs should map to it instead of inventing isolated field names.

### Render Fragment

A formatted or split piece of a canonical field used only for output layout, such as a birth-year cell, phone-number segment, postal-code digit, name family/given part, or address prefecture/rest part.

Render fragments should not become broker-maintained case facts unless the business meaning is independently useful outside that output position.

### Template-Specific Option

A value or choice that belongs to one guarantee company template, such as a company plan checkbox, collection agency option, or special rider. Template-specific options may later become canonical fields only after multiple workflows need the same meaning.

### Trust State

The status of a field in the case workbench. Canonical states are:

- `confirmed`
- `edited`
- `ai_suggested`
- `needs_review`
- `missing`
- `conflict`
- `rejected`
- `unknown`

### Guarantee Company Application

The V1 output document family: `保証会社申込書`.

The first supported companies are:

- 全保連
- 日本セーフティー
- Jリース
- インシュア
- ふれんず保証

### Official Template

A source form provided by a guarantee company. Its original lines, layout, and format must not be changed. Broker Desk may only place values into the available spaces.

### Output Draft

Template-specific values and options prepared before final PDF output. Output drafts should consume confirmed case data and explicitly saved draft values, not raw extraction candidates.

### Output Artifact

A generated business output, such as a guarantee-company application, customer summary, lease package, owner notice, or report.

An output artifact should keep the case id, tenant id, template version, input data snapshot, draft value snapshot, generated-by user, and audit trail needed to explain what was produced.

### Editable PDF Preview

The preview surface where a broker can inspect, edit, add, move, resize, and align output fields before saving/exporting a flattened PDF.

### Flattened PDF

The exported PDF where filled values are printed into the official template and no longer depend on an interactive editing layer.

### Template Calibration

Internal work for aligning field boxes to official template positions. Users may perform light drag-and-drop adjustments, but the shipped template should be accurate enough that only minor corrections are needed.

### Correction Event

A structured record created when user-confirmed data differs from an AI/rule candidate or when the user adjusts an output preview. Correction events distinguish extraction errors, normalization errors, missing-source completions, conflict resolutions, template position errors, template format errors, and user/team preferences.

### Experience Update

A scoped, reviewable lesson generated from one or more correction events. It may guide later AI calls, template rules, or regression tests, but should not silently overwrite confirmed facts or become a global rule without a promotion gate.

### AI Context Assembly

The internal step that gathers current case data, source evidence, relevant correction history, template rules, and user/team preferences before an AI task. This is how Broker Desk gives a stateless model durable product memory.

### Merge Candidate

A system-suggested existing case that may represent the same transaction as a newly reviewed source file. Merging must require sufficient confidence, leave history, notify the user, and support rollback or split.

## Product Language Rules

Use broker-facing terms:

- `自動識別`
- `抽出候補`
- `確認`
- `修正`
- `採用`
- `不明として保留`
- `案件ワークベンチ`
- `保証会社申込書`

Avoid primary user-facing terms:

- mapping
- schema
- coordinate
- raw key
- JSON
- generic OCR
- generic PDF designer

Technical terms may appear in internal docs, debug views, tests, or implementation notes.
