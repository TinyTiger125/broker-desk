# QA-038 MVP Acceptance Report

Date: 2026-06-06
Agent: MVP Acceptance Agent
Verdict: **BLOCKED**

## Acceptance Scope

This QA pass evaluated the closed-pilot gate for Broker Desk against the required standards:

- **Usable:** a real business chain can go from input to PDF without developer explanation.
- **Easy:** an ordinary Japanese real-estate broker can understand what to do, what is missing, and where the next step is within 10 seconds.
- **Highly reusable:** confirmed data, company-specific drafts, PDF position adjustments, and AI correction evidence reduce repeated work across cases and templates.

Primary flow checked:

`資料を入れる -> 足りない項目だけ確認する -> 会社別草稿 -> 申込書プレビュー -> PDF`

Required product documents were read before testing:

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
- `docs/agents/qa-038-mvp-acceptance-task.md`

## Executive Summary

The MVP is materially closer than before: import recognition, merge/duplicate handling, missing-field gates, draft creation, preview editing, and five-template PDF download endpoints all exist and mostly execute. The product is no longer just a static concept.

However, it is **not acceptable for closed pilot release** under the three hard standards. The main blocking issue is PDF trust: after a case is completed, all five guarantee-company PDFs can be downloaded, but at least several default outputs still show visible layout risk, line overlap, sparse/non-human-ready coverage, or field-fit issues. “The user can drag it manually” is useful as a correction layer, but it cannot replace an acceptable factory default.

The second blocker is reuse evidence: automated tests for correction-event helpers pass, but the live product flow used in QA did not leave visible AI correction-learning evidence. The AI experience screen showed zero correction events after the stress E2E path, which means the claimed “learning from user correction” loop is not yet proven as a frontstage/backstage product capability.

The third serious issue is product-flow clarity/regression. The redesigned home flow is directionally clearer, but the regression suite currently fails on the homepage task title, and the home screen showed an output-readiness card with `0 出力可能` while the current case still had a required missing item. That ambiguity violates the 10-second clarity bar.

## Blocking Findings

### P0: PDF Output Is Still Not Trustworthy Enough By Default

**Evidence**

- After QA completion, all five templates returned downloadable PDFs:
  - `zenhoren_individual_v1`
  - `nihon_safety_individual_v1`
  - `j_lease_individual_v1`
  - `insure_individual_v1`
  - `friends_guarantee_individual_v1`
- PDF header/page-size smoke checks passed for all five.
- Visual smoke checks also passed at a technical level: nonblank output and fill deltas were detected.
- Human visual review still found problems severe enough for a business PDF workflow:
  - `insure_individual_v1`: applicant/employer-related text visibly overlaps or sits too close to table lines.
  - `friends_guarantee_individual_v1`: high-value fields such as money/split-style fields remain visually fragile; some amounts are cramped or segmented in ways that are easy to distrust.
  - `j_lease_individual_v1`: the output is very sparse under the conservative strategy and does not yet feel like a high-confidence completed application form.
- Print-fit stress still reported **24 warnings** across templates.
- Even the complete fixture produced one fit warning:
  - `friends_guarantee_individual_v1` / `broker.companyName` / `仲介会社店舗`: `Cherry Investment株式会社` shrinks because estimated width exceeds printable width.
- Stress examples included:
  - phone segment overflow for long phone values,
  - property-name/address overflow,
  - employer-name/address overflow,
  - multiple shrink-only recoveries.

**Impact**

The product’s value promise is “official form, lines unchanged, fill only into spaces.” A broker must trust the PDF before sending, printing, or faxing. If the default PDF looks misaligned, the product creates more anxiety than Excel/manual entry.

**Gate decision**

This alone blocks closed-pilot acceptance.

**Required before retest**

- Add a per-template PDF acceptance checklist with human-visible crops for all high-risk regions.
- Make `insure_individual_v1` and `friends_guarantee_individual_v1` pass a visual crop review without manual dragging.
- Treat split fields, money boxes, phone boxes, dates, postal codes, and long Japanese text as separate layout classes with template-level regression fixtures.
- Downloads should remain blocked or warning-gated when a template has known visual risk above threshold.

### P1: AI Correction Learning Is Not Proven In The Live Workflow

**Evidence**

- `npm run test:correction-events` passed.
- `npm run test:ai-experience-drafts` passed.
- `npm run test:ai-experience-retrieval` passed.
- But after the stress E2E flow, `/settings/ai-experience` showed:
  - `修正イベント 0`
  - `承認待ち 0`
  - `承認済み 0`
  - `却下 0`
  - no visible drafts.
- The QA accept route used by the stress flow materializes accepted extraction values, but it does not simulate user-edited corrections, rejections, or override evidence.

**Impact**

The product direction explicitly depends on AI becoming better through user correction. At acceptance level, helper tests are not enough. The product needs a visible, durable evidence trail from actual user correction moments into reusable AI experience.

**Gate decision**

This blocks the “highly reusable” standard until the live frontstage workflow proves the loop.

**Required before retest**

- Create an E2E path where a user changes at least one extracted field, saves it, and produces a correction event.
- Show that the correction event appears in AI experience review.
- Show approve/reject status changes.
- Show that approved correction evidence is retrievable for a subsequent extraction/template run.

### P1: Product Flow Clarity Still Has Regression And Ambiguity

**Evidence**

- `BASE_URL=http://127.0.0.1:3002 npm run test:regression` failed:
  - `[FAIL] home page missing guarantee application task title`
- The current home screen is visually simpler and closer to the intended production-line flow, but the “continue work” section showed `0 出力可能` while the case still had a missing required field in output flow.
- Header/side navigation and homepage cards still expose more than one way to reach similar surfaces. This is improved from the earlier duplicated-button issue but not yet fully locked into a single production-line mental model.

**Impact**

The product must make the next action obvious. A Japanese broker should not need to infer whether the current case is output-ready, draft-ready, or missing information.

**Gate decision**

This is not the strongest standalone blocker, but it supports the overall `BLOCKED` result because the product still misses the 10-second clarity standard.

**Required before retest**

- Align regression tests with the approved Stitch V2/product-flow wording, or restore the expected task title if that is the intended contract.
- Replace ambiguous readiness copy with a single state:
  - `未入力あり`
  - `確認待ち`
  - `出力可能`
- Ensure the primary CTA always points to the next unresolved step, not simply to a generic output page.

## Positive Evidence

### Main Chain Execution

The main chain exists and can execute through API and UI routes:

- Import center loads.
- Case workbench loads with editable missing fields.
- Missing required fields block download and deep-link back to workbench.
- QA completion can generate ready drafts for all five templates.
- Preview editor exists and supports editing/moving values over the official PDF background.
- PDF endpoints return real PDF files after completion.

### Input And Merge Stress

Stress E2E generated 32 synthetic groups from two spreadsheet families:

- 64 files generated.
- 32 groups passed.
- 0 groups failed.
- 60 files recognized.
- 4 files unknown.
- 24 pairs merged.
- 6 pair merges rejected.
- 4 duplicate-candidate groups detected.

This is strong evidence that the input side is moving toward production usefulness. It also supports the product idea that automation can reduce repetitive Excel/file handling.

### Download Gates

Before completion, direct downloads correctly returned HTTP `422` for missing required fields:

- `zenhoren_individual_v1`: blocked on `applicant.birthDate`
- `nihon_safety_individual_v1`: blocked on `applicant.birthDate`
- `j_lease_individual_v1`: blocked on `applicant.birthDate`, `applicant.annualIncome`
- `insure_individual_v1`: blocked on `applicant.birthDate`
- `friends_guarantee_individual_v1`: blocked on `applicant.birthDate`

The response included a workbench destination/action URL, which is the right product behavior.

## Reuse Assessment

### Confirmed Data Reuse

**Status: partially passes**

The completed fixture generated all five company drafts from one case, which shows that case-level confirmed data can feed multiple templates.

Remaining concern: the UI must make it clearer that the user is editing the canonical case data first, and only then doing company-specific form correction.

### Company-Specific Draft Reuse

**Status: partially passes**

The QA completion endpoint returned:

- `draftStatus: ready`
- `draftReadyCount: 5`
- `draftMissingCount: 0`
- `savedDraftCount: 5`

This confirms draft persistence exists at least for the fixture path.

Remaining concern: the acceptance run did not prove normal-user draft editing, save history, rollback, or reuse across a new case.

### PDF Position Adjustment Reuse

**Status: not fully accepted**

The preview editor supports moving/editing overlay fields, and there are controls for saving current positions as case/template scope.

Remaining concern: QA did not prove that a template-level adjustment persists and applies cleanly to a later case. This is important because manual dragging must be a rare calibration event, not repeated per application.

### AI Correction Evidence Reuse

**Status: blocked**

Helper tests pass, but live product evidence was absent after the E2E path. This is not enough for the declared AI-learning product direction.

## PDF Findings By Template

### `zenhoren_individual_v1`

Status: **conditional**

The output is closer to an acceptable minimum-output strategy. Core values are visible and the page structure is preserved. Still needs crop-level visual signoff for high-frequency fields because this is the most important guarantee company template.

### `nihon_safety_individual_v1`

Status: **conditional**

The output is readable and benefits from conservative minimum filling. Many fields remain blank, which is acceptable only if the product clearly tells the broker which fields are intentionally left for electronic/manual form editing.

### `j_lease_individual_v1`

Status: **not accepted yet**

The form is technically downloadable, but output is sparse and several important areas require better default placement confidence. It should not be described as finished; it is closer to a minimum template skeleton.

### `insure_individual_v1`

Status: **blocked**

Visible text placement risk remains around applicant/employer sections. The default result is not clean enough to hand to a broker as a trusted official-form output.

### `friends_guarantee_individual_v1`

Status: **blocked despite being the strongest template**

This remains the most advanced preview/editing experience, but the printable PDF still has fit warnings and fragile high-value fields. It is not acceptable for the benchmark template to require user trust in manual drag correction for ordinary cases.

## Usability Assessment

The current redesign is directionally correct:

- The homepage now communicates a three-step production line.
- The workbench is centered around missing items instead of raw field mapping.
- The preview page explains that editing happens directly on the application form.
- The download button blocks when required fields are missing.

But it still misses the closed-pilot ease bar:

- One readiness state can conflict with another.
- The regression suite does not agree with the current homepage copy/structure.
- Template output status does not clearly separate:
  - safe auto-filled,
  - candidate-filled needing confirmation,
  - electronic manual field,
  - intentionally blank.

## Evidence Artifacts

Screenshots:

- `docs/acceptance/qa-038-screenshots/01-home.png`
- `docs/acceptance/qa-038-screenshots/02-import-center.png`
- `docs/acceptance/qa-038-screenshots/03-case-workbench.png`
- `docs/acceptance/qa-038-screenshots/04-output-center.png`
- `docs/acceptance/qa-038-screenshots/05-templates.png`
- `docs/acceptance/qa-038-screenshots/06-preview-friends.png`

Stress artifacts:

- `tmp/qa_stress_samples/manifest.json`
- `tmp/qa_stress_samples/upload-smoke-results.json`
- `tmp/qa_stress_samples/e2e-results.json`
- `tmp/qa_stress_artifacts/friends-guarantee-case_pvj55g5a.pdf`

Generated PDF artifacts:

- `/tmp/broker-desk-qa038-pdfs/zenhoren_individual_v1.pdf`
- `/tmp/broker-desk-qa038-pdfs/nihon_safety_individual_v1.pdf`
- `/tmp/broker-desk-qa038-pdfs/j_lease_individual_v1.pdf`
- `/tmp/broker-desk-qa038-pdfs/insure_individual_v1.pdf`
- `/tmp/broker-desk-qa038-pdfs/friends_guarantee_individual_v1.pdf`

Visual smoke output:

- `/tmp/broker-desk-qa038-visual/zenhoren_individual_v1/`
- `/tmp/broker-desk-qa038-visual/nihon_safety_individual_v1/`
- `/tmp/broker-desk-qa038-visual/j_lease_individual_v1/`
- `/tmp/broker-desk-qa038-visual/insure_individual_v1/`
- `/tmp/broker-desk-qa038-visual/friends_guarantee_individual_v1/`

## Commands Run

Environment and service:

```bash
pwd
git status --short
lsof -nP -iTCP:3002 -sTCP:LISTEN
curl -I http://localhost:3002/
```

Browser/screenshot route fallback:

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --headless --disable-gpu --no-sandbox --window-size=1600,1000 --screenshot=docs/acceptance/qa-038-screenshots/01-home.png http://127.0.0.1:3002/
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --headless --disable-gpu --no-sandbox --window-size=1600,1000 --screenshot=docs/acceptance/qa-038-screenshots/02-import-center.png http://127.0.0.1:3002/import-center
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --headless --disable-gpu --no-sandbox --window-size=1600,1000 --screenshot=docs/acceptance/qa-038-screenshots/03-case-workbench.png 'http://127.0.0.1:3002/cases/case_fixture_friends_guarantee_pdf?guaranteeTemplate=friends_guarantee_individual_v1&filter=all#workbench-applicant'
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --headless --disable-gpu --no-sandbox --window-size=1600,1000 --screenshot=docs/acceptance/qa-038-screenshots/04-output-center.png 'http://127.0.0.1:3002/output-center?caseId=case_fixture_friends_guarantee_pdf&guaranteeTemplate=friends_guarantee_individual_v1'
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --headless --disable-gpu --no-sandbox --window-size=1600,1000 --screenshot=docs/acceptance/qa-038-screenshots/05-templates.png http://127.0.0.1:3002/templates
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --headless --disable-gpu --no-sandbox --window-size=1600,1000 --screenshot=docs/acceptance/qa-038-screenshots/06-preview-friends.png 'http://127.0.0.1:3002/guarantee-applications/friends_guarantee_individual_v1/preview?caseId=case_fixture_friends_guarantee_pdf'
```

Quality and regression:

```bash
npm run lint
npm run test:guarantee-autofill-policy
npm run test:guarantee-download-gate
npm run test:guarantee-calibration
npm run test:guarantee-print-fit
npm run test:correction-events
npm run test:ai-experience-drafts
npm run test:ai-experience-retrieval
BASE_URL=http://127.0.0.1:3002 npm run test:regression
git diff --check
npm run build
```

Stress and E2E:

```bash
node scripts/qa-generate-stress-samples.mjs
BASE_URL=http://127.0.0.1:3002 node scripts/qa-stress-upload-smoke.mjs
BASE_URL=http://127.0.0.1:3002 node scripts/qa-stress-e2e.mjs
```

PDF output:

```bash
BASE_URL=http://127.0.0.1:3002 TEMPLATE_ID=zenhoren_individual_v1 OUTPUT_PDF=/tmp/broker-desk-qa038-pdfs/zenhoren_individual_v1.pdf node scripts/friends-guarantee-pdf-fidelity.mjs
BASE_URL=http://127.0.0.1:3002 TEMPLATE_ID=nihon_safety_individual_v1 OUTPUT_PDF=/tmp/broker-desk-qa038-pdfs/nihon_safety_individual_v1.pdf node scripts/friends-guarantee-pdf-fidelity.mjs
BASE_URL=http://127.0.0.1:3002 TEMPLATE_ID=j_lease_individual_v1 OUTPUT_PDF=/tmp/broker-desk-qa038-pdfs/j_lease_individual_v1.pdf node scripts/friends-guarantee-pdf-fidelity.mjs
BASE_URL=http://127.0.0.1:3002 TEMPLATE_ID=insure_individual_v1 OUTPUT_PDF=/tmp/broker-desk-qa038-pdfs/insure_individual_v1.pdf node scripts/friends-guarantee-pdf-fidelity.mjs
BASE_URL=http://127.0.0.1:3002 TEMPLATE_ID=friends_guarantee_individual_v1 OUTPUT_PDF=/tmp/broker-desk-qa038-pdfs/friends_guarantee_individual_v1.pdf node scripts/friends-guarantee-pdf-fidelity.mjs
```

Visual smoke:

```bash
BASE_URL=http://127.0.0.1:3002 TEMPLATE_ID=zenhoren_individual_v1 OUTPUT_DIR=/tmp/broker-desk-qa038-visual/zenhoren_individual_v1 node scripts/guarantee-pdf-visual-smoke.mjs
BASE_URL=http://127.0.0.1:3002 TEMPLATE_ID=nihon_safety_individual_v1 OUTPUT_DIR=/tmp/broker-desk-qa038-visual/nihon_safety_individual_v1 node scripts/guarantee-pdf-visual-smoke.mjs
BASE_URL=http://127.0.0.1:3002 TEMPLATE_ID=j_lease_individual_v1 OUTPUT_DIR=/tmp/broker-desk-qa038-visual/j_lease_individual_v1 node scripts/guarantee-pdf-visual-smoke.mjs
BASE_URL=http://127.0.0.1:3002 TEMPLATE_ID=insure_individual_v1 OUTPUT_DIR=/tmp/broker-desk-qa038-visual/insure_individual_v1 node scripts/guarantee-pdf-visual-smoke.mjs
BASE_URL=http://127.0.0.1:3002 TEMPLATE_ID=friends_guarantee_individual_v1 OUTPUT_DIR=/tmp/broker-desk-qa038-visual/friends_guarantee_individual_v1 node scripts/guarantee-pdf-visual-smoke.mjs
```

AI experience check:

```bash
curl -s http://127.0.0.1:3002/settings/ai-experience
```

## Browser Routes Checked

The in-app browser MCP was attempted but unavailable in this session (`Browser is not available: iab`), so screenshots were captured with headless Google Chrome.

Routes checked:

- `http://127.0.0.1:3002/`
- `http://127.0.0.1:3002/import-center`
- `http://127.0.0.1:3002/cases/case_fixture_friends_guarantee_pdf?guaranteeTemplate=friends_guarantee_individual_v1&filter=all#workbench-applicant`
- `http://127.0.0.1:3002/output-center?caseId=case_fixture_friends_guarantee_pdf&guaranteeTemplate=friends_guarantee_individual_v1`
- `http://127.0.0.1:3002/templates`
- `http://127.0.0.1:3002/guarantee-applications/friends_guarantee_individual_v1/preview?caseId=case_fixture_friends_guarantee_pdf`
- `http://127.0.0.1:3002/settings/ai-experience`

## Retest Requirements

The next acceptance run should not be started until these are true:

1. Five templates have crop-level visual baselines for high-risk fields.
2. `insure_individual_v1` and `friends_guarantee_individual_v1` pass human visual review without manual dragging for complete fixture data.
3. Long-text and split-field print-fit warnings are either fixed or surfaced as blocking preview warnings.
4. A live user-correction flow creates durable AI correction evidence visible in AI experience review.
5. Template-level PDF position save is proven to apply to a later case.
6. Regression suite passes or is explicitly updated to match the approved product-flow copy.

Until then, the correct product status is:

**Main chain implemented, but closed-pilot release blocked by PDF trust and reuse-learning evidence.**
