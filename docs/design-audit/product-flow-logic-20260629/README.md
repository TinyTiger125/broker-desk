# Broker Desk Product Flow Logic Audit

Date: 2026-06-29

Scope: homepage, import center, organize center, case workbench, output center.

## Evidence

- `01-home.png`
- `02-import-job.png`
- `03-organize-center.png`
- `04-case-workbench.png`
- `05-output-center.png`

## Overall Judgment

The core product story is now mostly coherent:

Scattered materials -> assign them to business objects -> confirm trusted case information -> generate output files.

The homepage has moved in the right direction. It now behaves more like an operating desk than a statistics dashboard. However, the end-to-end flow is not yet fully smooth. Some actions still land on a module top or an adjacent scene instead of the exact work context the user expects.

## Page-Level Findings

### Homepage

Status: Mostly correct.

The homepage now communicates the current case, current blocker, linked materials, output status, and next action. It is suitable as the main entry point.

Risk: The "continue organizing" action can still feel ambiguous if it lands at the case top rather than the exact editing or blocker section.

### Import Center

Status: Directionally correct, one serious copy bug.

Deep links from homepage can now focus the exact import job, which fixes the earlier "jumped to import page but not the exact file" problem.

Risk: The current job message exposes raw structured text, such as JSON-like validation details. This breaks the business-language standard and should be replaced with a human-readable explanation.

### Organize Center

Status: Useful as a global index, not a primary workflow.

This page makes sense as search, filter, and batch review space. It should stay secondary to the homepage workbench.

Risk: If framed too similarly to the homepage, users may wonder which page is the real starting point.

### Case Workbench

Status: Partially misaligned.

The case page has the right ingredients: case summary, source intake, editable case data, related materials, and output handoff.

Risk: The first visible section is "add materials". If the user clicked "continue organizing", this landing feels wrong because they expect to check or edit case information, not upload more files.

### Output Center

Status: Strong.

The output page correctly shows the target case, selected guarantee company, missing information, and the route back to fill missing fields.

Risk: Minor wording consistency only. The transition logic is mostly correct.

## Navigation Findings

- Home -> exact import job: correct.
- Home -> linked source material: correct.
- Home -> output center: correct.
- Output center -> missing case fields: mostly correct.
- Home or organize center -> case workbench: only partially correct because the landing section may not match the user's intended task.
- Import center -> next confirmation step: needs clearer task-specific handoff after validation or mapping.

## Highest-Priority Fixes

1. Make every "continue organizing" route land on the exact case work section, preferably `#case-main-editor` or a blocker-specific anchor.
2. Replace raw validation output in the import center with business-language missing-item text.
3. Make the case workbench show the main editing/review area before the source-intake area, or route upload-specific actions directly to source intake.
4. Keep organize center positioned as search and batch review, not as a competing homepage.
5. Apply a strict deep-link rule: every card that points to work should land on the exact file, object, field group, or blocker it describes.

