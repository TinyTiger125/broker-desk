# V1 AI Model Selection

> 2026-07-15 status note: the implementation and most of this document still describe the previous `gpt-5.5` / `gpt-5.4-*` routing baseline. The current target direction is the eval-gated GPT-5.6 Sol/Terra/Luna routing and model-operable product architecture defined in `docs/product/BROKER_DESK_PRODUCT_TECHNICAL_CHARTER_2026_07_15.md`. Do not change production model names without task-level regression evidence.

Date: 2026-06-04

## Decision

Broker Desk V1 will use OpenAI through the API, primarily the Responses API.

User-facing language may say ChatGPT or AI, but the product implementation should not depend on the consumer ChatGPT UI or the drifting `chat-latest` model alias for core business workflows.

Default production model:

- `gpt-5.5`

Default runtime surface:

- Responses API
- structured outputs
- function tools for Broker Desk data operations
- file search / retrieval for product-owned memory when appropriate
- prompt caching for stable domain instructions

## Why Not Only ChatGPT UI

The user may reasonably describe this as "using ChatGPT", but production Broker Desk needs:

- structured output validation
- field-level source evidence
- tool calls into case/workbench/output systems
- model routing by task type
- auditable correction events
- scoped memory retrieval
- repeatable regression evaluation

Those belong in an API-backed product architecture, not manual ChatGPT conversations.

## Model Routing

### 1. High-accuracy production reasoning

Use `gpt-5.5`.

Use for:

- ambiguous source-file understanding
- multi-document conflict explanation
- extraction review guidance
- case workbench missing/uncertain item analysis
- guarantee company required-field reasoning
- experience update drafting from correction events
- final AI preflight before official PDF output

Default settings:

- `reasoning.effort: "medium"`
- `text.verbosity: "low"` for user-facing summaries
- structured outputs for all machine-consumed results

Escalate to `reasoning.effort: "high"` only when:

- multiple source files conflict
- the AI is generating an experience update from several correction events
- output preflight finds high-risk official-form issues
- repeated regression failures indicate insufficient reasoning

Use `xhigh` only for offline evaluation or rare asynchronous diagnosis. Do not use it as the default user-facing path.

### 2. Cost-sensitive high-volume tasks

Use `gpt-5.4-mini` where available.

Use for:

- document type classification
- field candidate grouping
- simple normalization suggestions
- reason-chip suggestions
- low-risk missing-field summaries
- batch preprocessing before a stronger model reviews uncertain cases

Fallback:

- `gpt-5-mini` if `gpt-5.4-mini` is unavailable in the target account.

### 3. Very simple classification

Use `gpt-5.4-nano` where available.

Use only for:

- yes/no routing
- lightweight language detection
- quick template-family guesses
- obvious duplicate/no-duplicate prefilters

Do not use nano-class models to confirm business facts or fill official applications.

### 4. Hard offline review

Use `gpt-5.5-pro` only for offline PM/QA evaluation or difficult asynchronous diagnosis.

Do not use it in the normal V1 runtime because cost and latency are not justified for ordinary broker workflows.

## Retrieval And Memory

Use product-owned memory. Do not rely on model private memory.

Recommended memory stack:

- structured correction events in the application database
- scoped experience updates
- template calibration history
- regression cases
- vector retrieval over approved experience updates

Embedding model:

- `text-embedding-3-large` for higher-quality retrieval over Japanese/Chinese/English mixed documents and experience notes.
- `text-embedding-3-small` only if cost pressure becomes material and retrieval quality remains acceptable in evals.

## Task-To-Model Matrix

| Task | Default Model | Reasoning | Notes |
| --- | --- | --- | --- |
| Known template deterministic extraction | No LLM first | n/a | Rules first; AI only handles gaps |
| Unknown/variant template understanding | `gpt-5.5` | medium | Must return evidence and confidence |
| Simple document type classification | `gpt-5.4-mini` | low | `gpt-5.4-nano` allowed for obvious routing |
| Residence card / driver license field extraction assist | `gpt-5.5` | medium | Use vision only as assistive candidate; confirmed facts remain reviewable |
| Case workbench missing/uncertain summary | `gpt-5.4-mini` or `gpt-5.5` | low/medium | Escalate when conflicts exist |
| Conflict explanation | `gpt-5.5` | medium/high | Must show source evidence |
| Guarantee application preflight | `gpt-5.5` | medium | Blocks fabrication; flags missing and layout risks |
| Correction event experience draft | `gpt-5.5` | medium/high | Never promotes a global rule by itself |
| Long-text / split-field layout risk explanation | `gpt-5.5` | medium | Renderer still deterministic |
| Regression diagnosis | `gpt-5.5` or `gpt-5.5-pro` | high/xhigh | Offline only for pro |

## Guardrails

- Deterministic extraction remains first for known templates.
- AI candidates are not confirmed facts.
- Output consumes confirmed case data and saved draft values only.
- Official PDF templates must not be redrawn by AI.
- AI may recommend corrections, but user confirmation and audit trail remain required.
- Do not fine-tune in V1. First collect correction events and regression samples.
- Use snapshots for eval baselines when exact model behavior stability matters.

## Implementation Implications

V1 implementation should introduce:

1. `aiClient` abstraction around Responses API.
2. Per-task model routing configuration.
3. Structured output schemas for extraction, review guidance, conflict summaries, preflight, and experience drafts.
4. Prompt templates with stable static domain context first and dynamic case context last.
5. Correction-event-to-experience-draft job.
6. Retrieval context assembly before AI calls.
7. Evals comparing `gpt-5.5`, `gpt-5.4-mini`, and deterministic baselines on real source files.

## Non-Goals

- No V1 fine-tuning.
- No product dependence on ChatGPT consumer history.
- No global memory update from one user edit.
- No AI-only final approval of official documents.
- No mandatory AI call for paths deterministic code can handle reliably.
