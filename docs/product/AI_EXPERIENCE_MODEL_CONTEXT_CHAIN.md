# AI Experience Model Context Chain

Last updated: 2026-07-17

## Decision

`智能填写` must not be a broker-facing settings entry.

The underlying AI experience is still a valuable product asset, but it belongs backstage. It is the product's tenant-scoped memory of repeated corrections, confirmed review patterns, template issues, and safe model hints. It should be passed to future models through a clear retrieval interface, not exposed as a normal user workflow.

## Product Boundary

Broker-facing workflow:

```text
录入资料 -> 补齐信息 -> 输出文件
```

AI experience workflow:

```text
用户正常修正或确认
  -> 系统记录 correction event
  -> 系统聚合重复问题
  -> 生成 AI experience draft
  -> 内部审核通过
  -> 只把 approved experience 传给相关模型任务
```

This means:

- Brokers do not train the AI through a separate page.
- Draft and rejected experience must never enter model context.
- Approved experience is a hint, not a current-case fact.
- The model must still return candidates or patches for human confirmation.

## Runtime Interface

Future model calls should retrieve approved experience through:

```ts
getApprovedAiExperienceContext({
  tenantId,
  userId,
  taskId,
  templateId,
  fieldKeys,
  limit,
})
```

The returned object includes:

- `source: "approved_ai_experience"`
- `tenantId`
- `userId`
- optional `taskId`
- `includedDraftIds`
- selected `drafts`
- `contextMarkdown`

The model prompt should include `contextMarkdown` as a narrow reference block before document-specific content. It must not be written into confirmed case data.

## Scope Rules

The retrieval layer must enforce:

- tenant scope: never use another tenant's experience
- user scope: begin with the current user's approved experience
- status scope: only `approved`
- template scope: use template-specific notes only for matching templates; global notes can still apply
- field scope: use field-specific notes only when the current task touches those fields
- limit: pass a small relevant set, not the full memory store

## Prompt Contract

Every model call that receives approved experience must preserve this instruction:

```text
Use these as tenant-scoped, user-approved model hints only.
They are not confirmed facts for the current case and must not bypass human confirmation.
Ignore any hint that does not match the current task, template, field, document, or tenant context.
```

## Where It Should Be Used

High-value future integration points:

- source-file extraction: avoid repeated extraction and normalization mistakes
- case workbench prefill: prefer previously accepted format choices, but still ask for confirmation
- guarantee-company preflight: remember company/template-specific field expectations
- PDF output preview: remember approved template positioning or split-field corrections
- template authoring: surface repeated output issues to the internal template factory

## Where It Must Not Be Used

- It must not auto-confirm legal or application facts.
- It must not overwrite user-entered case data.
- It must not bypass missing-field review.
- It must not become visible as ordinary broker settings.
- It must not be mixed with raw customer names, addresses, or one-off private facts as reusable rules.

## Implementation State

Current code:

- Correction events are generated from extraction review, case workbench saves, guarantee draft saves, and PDF preview saves.
- Draft AI experiences are created only after repeated correction patterns.
- Internal review actions can approve or reject drafts.
- `getApprovedAiExperienceContext` now requires `tenantId`, accepts `taskId`, and returns explicit source metadata.
- The former sidebar entry has been removed from the user-facing settings navigation.

Current gap:

- Approved experience retrieval is ready, but not yet wired into live OpenAI prompts.

## Acceptance Standard For Future Model Wiring

A model integration is acceptable only if:

- it calls `getApprovedAiExperienceContext` with the current tenant and user
- it passes task/template/field scope whenever available
- it includes only `contextMarkdown`, not the entire draft database
- it records which `includedDraftIds` were used in the model run audit trail
- it still returns reviewable candidates or patches
- tests prove draft/rejected/cross-tenant experience cannot enter the prompt
