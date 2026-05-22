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

## Core Workflow

The V1 workflow is:

Source files -> input extraction -> extraction review -> case workbench -> confirmed case data -> guarantee application draft -> official PDF preview -> flattened PDF export or print.

## Glossary

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

### Editable PDF Preview

The preview surface where a broker can inspect, edit, add, move, resize, and align output fields before saving/exporting a flattened PDF.

### Flattened PDF

The exported PDF where filled values are printed into the official template and no longer depend on an interactive editing layer.

### Template Calibration

Internal work for aligning field boxes to official template positions. Users may perform light drag-and-drop adjustments, but the shipped template should be accurate enough that only minor corrections are needed.

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
