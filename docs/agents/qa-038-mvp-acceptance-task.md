# QA-038 Task Brief: Closed-Pilot MVP Acceptance

## Role

Use the fixed `MVP Acceptance Agent` defined in `docs/agents/mvp-acceptance-agent.md`.

## Objective

Decide whether Broker Desk is ready for a closed pilot with a real small Japan real estate broker.

The product must be judged against:

- **Usable**: the real business workflow completes without developer help.
- **Easy to use**: the broker can understand the path and next action without documentation.
- **Highly reusable**: confirmed data, company drafts, template adjustments, and AI correction evidence reduce repeated work.

## Required Reading

Read:

- `CONTEXT.md`
- `docs/product/PRODUCT_TOPOLOGY.md`
- `docs/product/V1_INPUT_FILE_MODEL.md`
- `docs/product/V1_CASE_WORKBENCH.md`
- `docs/product/V1_GUARANTEE_APPLICATION_OUTPUT.md`
- `docs/product/V1_AI_CORRECTION_LEARNING.md`
- `docs/archive/stitch/STITCH_V2_IMPLEMENTATION_DECISION.md`
- `docs/design-audit/frontstage-flow-20260606/README.md`
- `docs/operations/PM_CONTROL.md`
- `docs/agents/mvp-acceptance-agent.md`

## Scope

Test the main production line:

```text
資料を入れる
  -> 足りない項目だけ確認する
    -> 会社別草稿
      -> 申込書プレビュー
        -> PDF
```

Also test reuse:

- one confirmed case across multiple guarantee company templates
- saved PDF layout adjustments
- company-specific draft isolation
- correction events from user saves

## Forbidden Scope

Do not:

- redesign product direction
- add new features
- accept technical success as product success
- treat manual PDF dragging as a substitute for acceptable default output quality
- evaluate secondary CRM/quote/contract modules as the main product

## Test Inputs

Use, in priority order:

1. Real user-provided broker Excel / PDF / identity documents when available.
2. Existing project fixtures only when real samples are unavailable.
3. Synthetic data only to test edge cases such as long text, short text, split cells, missing fields, and repeated corrections.

Explicitly mark which category each test used.

## Acceptance Procedure

1. Start local app and record URL.
2. Capture screenshots for:
   - `/`
   - `/import-center`
   - `/cases/[id]`
   - `/output-center`
   - `/templates`
   - one selected preview page
3. Run one end-to-end workflow from input to PDF.
4. Run one reuse workflow using the same case across at least three guarantee company templates.
5. Run one PDF quality check for all five active templates.
6. Run one AI correction learning check from normal save actions.
7. Produce the acceptance report using the format in `docs/agents/mvp-acceptance-agent.md`.

## Hard Gates

Return `BLOCKED` if any of these happen:

- The main input -> workbench -> draft -> preview -> PDF chain cannot be completed.
- The user can download a visibly broken or untrustworthy PDF without a blocking warning.
- Missing fields do not link to the exact editable surface.
- Technical concepts such as mapping, schema, raw JSON, or coordinate versions dominate the normal workflow.
- Confirmed data has to be retyped for each guarantee company.
- Company-specific draft fields pollute reusable case data.
- Saved layout or correction evidence cannot be reused.

## Expected Output

Create an acceptance report at:

`docs/acceptance/qa-038-mvp-acceptance-report.md`

The report must include:

- verdict: `PASS`, `CONDITIONAL PASS`, or `BLOCKED`
- evidence screenshots
- tested routes
- commands run
- generated PDF paths or download URLs
- blocking findings with required fixes
- retest checklist

## PM Decision Rule

The PM Agent may only declare closed-pilot readiness if QA-038 returns `PASS` or a narrow `CONDITIONAL PASS` with no main-chain, PDF-trust, or reuse blockers.
