# V1 AI Correction Learning PRD

Date: 2026-06-04

## Problem Statement

Broker Desk depends on AI-assisted extraction and review guidance, but the product cannot rely on the model's own memory. External AI calls may be stateless, model behavior may change, and one incorrect extraction can repeat across similar files unless the product captures user corrections as durable workflow knowledge.

The broker should not be asked to train AI as a separate task. The useful signal already exists in normal work:

1. AI extracts candidates.
2. The broker reviews, edits, fills, or confirms fields.
3. The broker saves and proceeds to the next step.
4. The final confirmed state is more trustworthy than the original AI suggestion.

The product needs to convert those normal review/save actions into structured correction evidence, experience updates, and regression cases that can improve later AI calls without adding frontstage burden.

## Solution

Introduce an implicit AI correction learning loop behind the normal V1 workflow.

The frontstage workflow remains:

```text
1. 資料を入れる
2. 足りない項目だけ確認する
3. 保証会社申込書を出す
```

The backstage learning workflow is:

```text
AI extraction snapshot
  -> broker review/edit/confirm
  -> confirmed snapshot at save/proceed
  -> deterministic diff
  -> correction event classification
  -> AI experience draft
  -> reviewed durable memory / template rule / regression case
  -> retrieved as context for the next relevant AI task
```

The product-owned memory, not the base model, is the durable learning system.

Model/runtime baseline:

- Use OpenAI through the Responses API.
- Default high-accuracy model: `gpt-5.5`.
- Use smaller models only for bounded low-risk classification or preprocessing tasks.
- See `docs/product/V1_AI_MODEL_SELECTION.md` for the model routing decision.

## Agent, Skill, Tool, And Memory Boundary

Broker Desk AI must not be implemented or marketed as a generic chatbot or a screen-clicking RPA layer.

Useful AI work is semantic and reviewable:

- read source material and propose structured candidates
- classify ownership: case, subject, property, or unassigned intake
- detect conflicts across documents
- normalize names, addresses, postal codes, dates, phone numbers, money, and split-field formats
- explain uncertainty through source evidence
- prepare output-specific drafts from confirmed data
- suggest template field bindings for internal/admin template authoring

Implementation vocabulary:

- `Skill`: a narrow model-backed or deterministic capability, such as OCR cleanup, field extraction, conflict detection, candidate normalization, output preflight, or template field pre-match.
- `Tool`: a product API/action that reads or writes Broker Desk state, such as listing case data, creating extraction candidates, saving a review decision, or generating a PDF draft.
- `Agent`: an orchestrated workflow that receives a user goal, assembles context from Broker Desk state, invokes skills/tools, returns a proposed change set, and waits for human approval before durable writes.

Product rule:

```text
No durable business fact is finalized only because AI generated it.
AI can propose. The product records what the user confirmed.
```

Memory rule:

```text
Model memory is not product memory.
Broker Desk database state is product memory.
```

The product memory sources are:

- confirmed case data
- source file text/OCR/extraction evidence
- extraction review decisions
- correction events
- approved AI experience notes
- rejected or overridden suggestions
- template bindings and output snapshots
- tenant-scoped preferences and permission rules

Before each AI task, Broker Desk should assemble only the relevant context and pass it to the model. After each reviewed action, Broker Desk should write structured evidence back into its own state. This keeps the AI portable across model vendors and prevents product behavior from depending on a provider's private model memory.

## Current Implementation Status

Phase A foundation is implemented:

- `correction_events` storage exists for memory and Postgres repositories.
- Case workbench saves create correction events from meaningful before/after field differences.
- Extraction review saves create correction events for edited, rejected, or unknown AI/rule candidates without learning from ordinary accept-all flows.
- Guarantee company draft saves create correction events for company-specific plan/option/consent changes, scoped to the output template instead of polluting general case facts.
- Editable PDF preview saves create correction events for output value edits, layout drag/resize adjustments, and custom/split overlay fields.
- Correction events preserve field key, candidate value, confirmed value, source location, method, confidence, scope candidate, and source evidence.
- `AiExperienceDraft` storage and a backend draft job exist for repeated correction groups. Drafts remain gated and are not promoted automatically.
- PM/QA review surface exists at `/settings/ai-experience`; only approved drafts are eligible for later AI context.
- Approved-only retrieval helper exists for template/field-scoped AI context assembly.
- The case workbench exposes a lightweight correction history for trust/debug without adding a training workflow.
- Regression scripts verify correction-event classification, experience-draft generation gates, approved-only retrieval, and review page reachability.

Not implemented yet:

- OpenAI-assisted natural-language drafting from correction-event batches.
- Wiring approved experience retrieval into each high-risk AI prompt.

Next product step:

1. Wire approved scoped experience notes into high-risk extraction and preflight prompts.
2. Add OpenAI-assisted summarization after the deterministic grouping gate.
3. Add review analytics for repeated rejected drafts before expanding automatic drafting.

## User Stories

1. As a broker, I want to correct extracted fields during my normal review flow, so that I do not need a separate AI training workflow.
2. As a broker, I want the system to remember repeated corrections, so that the same mistake becomes less likely in future cases.
3. As a broker, I want AI-filled fields to remain reviewable before output, so that official application facts are never silently finalized.
4. As a broker, I want missing fields to be separated from AI mistakes, so that the system does not treat my manual additions as failed extraction.
5. As a broker, I want template drag adjustments to be remembered at the template level, so that I do not need to adjust the same PDF position repeatedly.
6. As a broker, I want long text and special format failures to improve over time, so that application forms do not require repeated manual layout repairs.
7. As a broker, I want the system to keep source evidence for corrected values, so that I can trust why a field changed.
8. As a broker, I want AI uncertainty to be visible, so that I review problem fields first instead of rechecking every field.
9. As a broker, I want the system to distinguish AI was wrong from source file did not contain this value, so that future automation does not learn false rules.
10. As a broker, I want corrections to be reversible or auditable, so that a bad correction does not permanently pollute future work.
11. As a PM, I want correction events to be structured, so that repeated field-level failures can be prioritized.
12. As a PM, I want high-impact output mistakes to become regression cases, so that PDF quality can be guarded before release.
13. As a PM, I want experience updates to have scope, so that a personal broker habit does not become a global rule.
14. As a development agent, I want a stable correction event interface, so that extraction, workbench, and output modules can all feed one learning pipeline.
15. As a QA agent, I want before/after snapshots, so that AI improvement claims can be checked against real corrections.
16. As a future AI agent, I want relevant prior corrections retrieved before execution, so that I do not repeat known field, format, or template mistakes.
17. As a future AI agent, I want correction examples to include source evidence and failure type, so that I can apply them narrowly instead of overgeneralizing.
18. As a system operator, I want PII controls around correction memory, so that private customer data is not copied into broad global memory.

## Implementation Decisions

### 1. Learning Trigger Points

V1 learning should start from four high-signal nodes:

1. Extraction review save: after the user accepts, edits, rejects, or marks extracted candidates.
2. Case workbench save/proceed: after the user saves confirmed case data and moves toward output.
3. Guarantee company draft save: after the user confirms output-specific plan, consent, and company options.
4. Editable PDF preview save/export: after the user edits field values or template positions before PDF generation.

Do not learn from every keystroke. Use save/proceed/export moments because they indicate user intent more reliably.

### 2. Snapshot Model

Each learning trigger should capture a before/after pair:

- `aiSnapshot`: AI or rule-produced candidate state before user confirmation.
- `confirmedSnapshot`: user-confirmed state at the save/proceed/export boundary.
- `contextSnapshot`: selected source file, template, case id, field group, confidence, and source evidence.

Snapshots should be immutable audit evidence. Later experience updates can reference them, but should not rewrite them.

### 3. Correction Event Classification

The system should produce a structured correction event before asking AI to summarize anything.

Canonical event types:

- `ai_extraction_error`: AI produced a value and the user corrected it.
- `normalization_error`: AI found the right value but formatted it incorrectly.
- `source_absent_user_completed`: source did not contain the value and the user manually filled it.
- `missing_detected_by_user`: source contained the value but the system failed to extract it.
- `conflict_resolved_by_user`: multiple source values existed and the user chose the final one.
- `template_output_position_error`: PDF preview position was moved or resized.
- `template_output_format_error`: value overflow, split fields, date boxes, postal code boxes, money boxes, or long text needed format repair.
- `user_or_team_preference`: user changed a value or format due to local habit, not general correctness.
- `one_off_case_override`: correction is specific to the current case and should not become a reusable rule.

This classification protects the product from turning every edit into a global AI rule.

### 4. Correction Event Shape

Recommended internal shape:

```json
{
  "eventId": "correction_xxx",
  "caseId": "case_xxx",
  "trigger": "case_workbench_save",
  "fieldKey": "applicant.birthDate",
  "fieldLabel": "生年月日",
  "aiValue": "1990年1月11日",
  "confirmedValue": "1990年1月1日",
  "changeType": "ai_extraction_error",
  "sourceFileId": "source_xxx",
  "sourceLocation": "Sheet1!B12",
  "extractionMethod": "ai",
  "confidenceBefore": 0.62,
  "templateId": "zenhoren_individual_v1",
  "scopeCandidate": "template_rule",
  "confirmedByUser": true,
  "createdAt": "2026-06-04T00:00:00.000Z"
}
```

### 5. Experience Draft

AI may summarize correction events into an experience draft, but it must not directly mutate durable rules without a gate.

Recommended experience draft format:

```md
## Finding
Applicant birth dates can be misread when the source text contains a single-day value such as `1日`.

## Applies To
Excel input / applicant.birthDate / Japanese date fields

## Suggested Rule
Prefer structured cell date values or date-format parsing over raw text guesses. Do not infer an extra digit unless the source evidence explicitly contains it.

## Regression Sample
case_xxx / source_xxx / Sheet1!B12

## Scope
Template-level candidate. Do not apply to ordinary numeric fields.

## Risk
Overgeneralizing this rule may hide real two-digit day values.
```

### 6. Memory Scopes

Correction-derived knowledge must be scoped before reuse:

- `case_only`: audit trail only; do not reuse.
- `user_or_team`: preference for one broker/team.
- `source_template`: applies to a known input source template or variant.
- `output_template`: applies to one guarantee company PDF template.
- `field_dictionary`: applies to a canonical field across templates.
- `global_rule_candidate`: requires stronger evidence before broad use.
- `regression_case`: should be added to automated or visual QA.

### 7. Promotion Rules

Do not promote all corrections automatically.

Suggested gates:

- One-off correction: store event only.
- Repeated same field/same source pattern: create experience draft.
- Repeated across multiple cases or users: candidate rule.
- Affects official output PDF: add regression sample before release.
- Contains private user/customer data: anonymize before broad memory.
- Conflicts with existing rule: require human or PM review before promotion.

### 8. AI Context Assembly

Before each AI task, the system should retrieve only relevant memory:

- current document type and template version
- current field group
- similar prior correction events
- promoted source-template rules
- promoted output-template rules
- user/team preferences
- known failure cases for long text, dates, postal codes, money boxes, and split fields

The prompt should clearly distinguish:

- confirmed facts
- AI candidates
- source evidence
- user/team preferences
- rules that are only candidates
- values that must remain blank unless confirmed

### 9. Frontstage UX

The user should not see a training interface by default.

Allowed frontstage affordances:

- normal field edit and save
- `確認済み`, `修正済み`, `要確認`, `未入力` states
- optional secondary `AI改善履歴` or `修正履歴` view for trust/debug
- optional reason chips when needed, such as `AIの読取違い`, `資料に未記載`, `表記を整えた`

Avoid asking ordinary brokers to classify technical errors as a required step.

### 10. Privacy And Data Control

Correction events may contain personal data. Broad memory and regression samples should store anonymized values where possible:

- replace names with role labels
- preserve format shape rather than exact identity
- keep exact PII only in case audit records
- do not send unnecessary private fields into generic experience summaries

## Testing Decisions

Tests should verify behavior at the workflow boundary, not model internals.

Required test areas:

1. Snapshot creation after extraction review save.
2. Snapshot creation after case workbench save/proceed.
3. Snapshot creation after guarantee company draft save.
4. Snapshot creation after PDF preview save/export.
5. Diff correctly distinguishes AI correction from user completion of absent data.
6. Field correction generates a structured correction event.
7. PDF drag/resize generates a template output correction event, not an extraction error.
8. Repeated correction pattern creates an experience draft candidate.
9. Single correction does not automatically become a global rule.
10. Anonymized regression sample can be generated from a correction event.
11. Next AI context assembly retrieves only relevant scoped memories.

Output-specific regression should include:

- long property names
- very short names
- Japanese dates
- postal-code split boxes
- money split boxes
- phone number split boxes
- company names and phone positions
- multi-page official forms

## Out Of Scope

- Fine-tuning a proprietary model in V1.
- Letting AI silently update confirmed facts.
- Letting AI directly rewrite global rules without review gates.
- User-facing technical training console.
- Full multi-tenant approval workflow.
- Automatic submission to guarantee companies.
- Replacing official template review with AI confidence alone.

## Further Notes

This PRD changes the product's AI positioning from "AI as an extraction helper" to "AI as an operator inside a product-owned workflow memory system."

The important distinction:

- The model may be stateless.
- Broker Desk must be stateful.
- Learning comes from durable correction events, scoped experience updates, and regression cases.

This makes AI improvement portable across model vendors and protects the product from depending on an external model's private memory.
