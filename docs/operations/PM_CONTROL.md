# PM Control Center

This document is the operating source of truth for multi-agent product work on Broker Desk.

## Operating Mode

Current thread owner: PM Agent.

The PM Agent controls product direction, task decomposition, task dispatch, acceptance, and next-step decisions. Other agents execute bounded work and return structured results to the PM Agent.

The PM Agent does not directly implement application code. PM-owned artifacts may include product briefs, role prompts, task prompts, acceptance criteria, decision logs, and review summaries.

## Product Baseline

Working product hypothesis:

Broker Desk is a fast business workbench for small Japan real estate brokerage teams that currently rely on heavy Excel workflows. It helps agents import or enter existing business data, work on it in a structured editable case workbench, and generate professional official/standard documents from confirmed data.

AI improvement is part of the product-owned workflow state. User confirmations, edits, and output preview adjustments should create correction evidence, scoped experience updates, and regression samples that later AI calls can retrieve.

AI model selection baseline: use OpenAI via the Responses API. Default high-accuracy model is `gpt-5.5`; use smaller models only for bounded, low-risk, high-volume tasks. See `docs/product/V1_AI_MODEL_SELECTION.md`.

Default V1 core chain:

Excel/input file import or quick entry -> automatic extraction candidates -> AI-assisted uncertainty marking -> broker review and confirmation -> editable case workbench -> structured confirmed case / property / party data -> guarantee company draft completion -> official PDF preview and generation -> print/export history.

Default boundaries:

- Focus on replacing repetitive Excel / Word / manual document workflows.
- Prioritize low-friction input, broker-friendly field review, editable case workbench, structured data reuse, guarantee application output, and template-based PDF generation.
- Keep client follow-up, quotation explanation, and compliance reminders as supporting capabilities, not the V1 main story.
- Do not prioritize full accounting, listing scraping, automatic mass messaging, complex team permissions, full property management, rental lifecycle management, rent payment reconciliation, owner remittance, or fully autonomous AI decision-making.
- Do not let AI silently promote one-off user edits into global rules or confirmed facts.

## Roles

### PM Agent

Owns:

- Product positioning
- Target users and core scenarios
- Product boundaries
- Roadmap and priority
- Task dispatch prompts
- Acceptance criteria
- Final product-direction judgment after UX, development, and QA outputs

Does not own:

- Direct code implementation
- Unscoped technical refactors
- Product-direction changes without user confirmation

### UX Agent

Owns:

- Information architecture review
- Navigation and page hierarchy
- Dashboard priority
- Key flow clarity
- Form and empty-state experience
- UX task recommendations for development

Does not own:

- Product strategy changes
- Code implementation
- New feature expansion

### Development Agent

Owns:

- Reading the assigned PM prompt
- Implementing scoped changes
- Preserving existing architecture unless instructed
- Running feasible verification
- Reporting changed files, validation results, risks, and questions

Does not own:

- Redefining product positioning
- Adding out-of-scope features
- Removing existing functionality without explicit instruction

### QA / Review Agent

Owns:

- Checking the development result against PM acceptance criteria
- Identifying blockers, high-risk issues, regressions, and missing verification
- Confirming whether the work strengthens the intended product direction

Does not own:

- Rewriting product direction
- Implementing fixes
- Expanding review scope beyond the assigned task

### MVP Acceptance Agent

Owns:

- Closed-pilot readiness judgment for the whole product
- End-to-end acceptance across input, workbench, company-specific draft, official-form preview, and PDF output
- Usability judgment against the `1-2-3` broker workflow
- Reuse judgment across confirmed case data, template-scoped drafts, saved PDF layout, and AI correction learning
- Returning `PASS`, `CONDITIONAL PASS`, or `BLOCKED` with evidence

Does not own:

- Product strategy changes
- Feature expansion beyond the acceptance target
- Code implementation
- Accepting "technically works" when broker usability or reuse is weak

Reference prompt: `docs/agents/mvp-acceptance-agent.md`.

Current fixed agent:

- Nickname: Arendt
- Agent id: `019e9bca-3e77-79c1-9322-7ee86b7d6f08`
- Active task: QA-038 closed-pilot MVP acceptance

## Workflow

1. User discusses product goal with PM Agent.
2. PM Agent defines or updates product direction, boundaries, and acceptance criteria.
3. PM Agent creates bounded task prompts for UX, Development, and QA agents.
4. UX Agent may run first for information architecture or page-flow tasks.
5. Development Agent implements in a separate branch or worktree.
6. QA / Review Agent reviews the result against PM acceptance criteria.
7. PM Agent accepts, rejects, or requests another iteration.
8. PM Agent updates the task state and prepares the next assignment.

## Task Status Board

| ID | Owner | Status | Task | Output Expected |
| --- | --- | --- | --- | --- |
| PM-001 | PM | Done | Establish multi-agent operating model | `docs/operations/PM_CONTROL.md` |
| PM-002 | PM | Done | Define V1 product positioning and product boundary | Excel-in / PDF-out product baseline |
| PM-003 | PM | Done | Prepare first implementation prompt for V1 flow alignment | Development Agent prompt |
| UX-001 | UX | Deferred | Review current information architecture against product positioning | Deferred because Stitch UI is the design baseline |
| DEV-001 | Development | Rejected | Align current app to V1 Excel-in / PDF-out workflow | QA found V1 output loop blocker |
| QA-001 | QA / Review | Done | Review DEV-001 against acceptance criteria | Failed: output remains quote-dependent |
| DEV-002 | Development | Done | Add quote-free property overview PDF output loop | QA conditional pass: V1 blocker fixed |
| QA-002 | QA / Review | Done | Review DEV-002 against V1 output loop acceptance criteria | Conditional pass |
| DEV-003 | Development | Done | Tighten property overview target binding and update V1 regression checks | QA conditional pass |
| QA-003 | QA / Review | Done | Review DEV-003 targeted follow-up | Conditional pass |
| DEV-004 | Development | Done | Restore quote fallback and add invalid property overview regression | lint/build/ja-terms/regression passed |
| PM-004 | PM | Done | Define V1 input file model from broker source templates | `docs/product/V1_INPUT_FILE_MODEL.md` |
| DEV-005 | Development | Done | Implement known-template detection and extraction preview for input files | QA conditional pass: deterministic extraction skeleton works |
| QA-005 | QA / Review | Done | Review DEV-005 against V1 input acceptance criteria | Conditional pass |
| DEV-006 | Development | Done | Harden input extraction fingerprints and disclosure questionnaire structure | QA passed |
| QA-006 | QA / Review | Done | Review DEV-006 against input hardening criteria | Passed |
| PM-005 | PM | Done | Capture template variation strategy and AI supplement boundary | `docs/product/V1_INPUT_FILE_MODEL.md` |
| PM-006 | PM | Done | Replace user-facing mapping concept with broker-friendly review workflow | `docs/product/V1_INPUT_FILE_MODEL.md` |
| DEV-007 | Development | Done | Build broker-friendly extraction review workflow without mapping terminology | QA conditional pass |
| QA-007 | QA / Review | Done | Review DEV-007 usability and review/save safety | Conditional pass |
| DEV-008 | Development | Done | Replace disclosure questionnaire technical suffix labels with broker-friendly labels | lint/build/ja-terms/regression passed |
| PM-007 | PM | Done | Decide Review/Save architecture with BrokerageCase and ExtractionReview | `docs/product/V1_INPUT_FILE_MODEL.md` |
| DEV-009 | Development | Done | Implement Extraction Review Save MVP with lightweight BrokerageCase | QA conditional pass |
| QA-009 | QA / Review | Done | Review DEV-009 case save and evidence preservation | Conditional pass: edited-empty fallback must be fixed before output consumption |
| PM-008 | PM | Done | Re-scope V1 output to guarantee company application forms | `docs/product/V1_GUARANTEE_APPLICATION_OUTPUT.md` |
| DEV-010 | Development | Done | Add guarantee application template registry and readiness UI | QA conditional pass |
| QA-010 | QA / Review | Done | Review guarantee application output direction and readiness flow | Conditional pass: disabled export copy and option labels need polish |
| DEV-011 | Development | Done | Fix edited-empty fallback before guarantee output consumes confirmed data | QA conditional pass: fix valid, full regression depended on DEV-012 |
| QA-011 | QA / Review | Done | Review DEV-011 and re-check confirmedDataJson safety | Conditional pass for unrelated regression dependency |
| DEV-012 | Development | Done | Polish guarantee readiness UI before first PDF overlay | QA passed |
| QA-012 | QA / Review | Done | Review DEV-012 guarantee readiness polish | Passed |
| PM-009 | PM | Done | Define first guarantee PDF overlay MVP boundary | `５ふれんず保証.pdf` first-template slice |
| DEV-013 | Development | Done | Implement first guarantee PDF overlay MVP for ふれんず保証 | QA conditional pass |
| QA-013 | QA / Review | Done | Review first ふれんず保証 PDF overlay MVP | Conditional pass: no-case export must be blocked |
| DEV-014 | Development | Done | Require selected case before ふれんず保証 PDF export | QA passed |
| QA-014 | QA / Review | Done | Review no-case export guard for ふれんず保証 PDF | Passed |
| DEV-015 | Development | Done | Add stable confirmed-case fixture for ふれんず保証 PDF happy path | QA passed |
| QA-015 | QA / Review | Done | Review confirmed-case PDF happy-path regression | Passed |
| DEV-016 | Development | Rejected | Verify official-template fidelity and refine ふれんず保証 fill overlay | QA failed: overlay fields visibly misaligned |
| QA-016 | QA / Review | Done | Review ふれんず保証 official-template fidelity and fill alignment | Failed: template preserved but fill coordinates unusable |
| DEV-017 | Development | Done | Correct ふれんず保証 overlay coordinates against official blank fields | QA conditional pass: coordinates accepted, font issue remains |
| QA-017 | QA / Review | Done | Review corrected ふれんず保証 overlay coordinate alignment | Conditional pass: Japanese glyph boxes block broker-ready output |
| DEV-018 | Development | Done | Fix Japanese font rendering for ふれんず保証 PDF overlay | QA passed |
| QA-018 | QA / Review | Done | Review Japanese glyph readability for ふれんず保証 PDF overlay | Passed; production font strategy later |
| PM-010 | PM | Done | Define editable case workbench as missing middle layer | `docs/product/V1_CASE_WORKBENCH.md` |
| PM-011 | PM | Done | Define product topology and priority rule | `docs/product/PRODUCT_TOPOLOGY.md` |
| DEV-019 | Development | Rejected | Add case workbench MVP for editable confirmed data and review states | QA failed: real extractor keys invisible in workbench |
| QA-019 | QA / Review | Done | Review case workbench MVP against input-to-output chain | Failed: input -> workbench continuity broken |
| DEV-020 | Development | Done | Normalize extracted confirmed fields into case workbench canonical fields | QA conditional pass |
| QA-020 | QA / Review | Done | Review real input-to-workbench field continuity | Conditional pass: clearing raw-backed fields must neutralize aliases |
| DEV-021 | Development | Done | Fix clearing raw-backed workbench fields so alias values do not reappear | QA passed |
| QA-021 | QA / Review | Done | Review raw-backed field clearing behavior | Passed |
| DEV-022 | Development | Done | Add ふれんず保証 application draft layer between workbench and PDF | QA passed |
| QA-022 | QA / Review | Done | Review ふれんず保証 draft layer and output readiness | Passed |
| PM-012 | PM | Done | Final MVP handoff verification for input -> workbench -> draft -> output | lint/terms/build/regression/PDF smoke passed |
| PM-013 | PM | Done | Define missing-field navigation from output readiness to editable workbench/draft | `docs/product/V1_CASE_WORKBENCH.md` |
| DEV-023 | PM / Development | Done | Add actionable missing-field links from output center to editable sections | Implemented directly after agent threads became unavailable |
| QA-023 | PM / Review | Done | Review missing-field navigation and editable destination flow | lint/terms/build/regression passed |
| PM-014 | PM | Done | Define anti-Salesforce frontstage simplification rule | `docs/product/PRODUCT_TOPOLOGY.md` |
| DEV-024 | Development | Review | Replace module-heavy frontstage with 1-2-3 application task flow | Development report received |
| QA-024 | QA / Review | Pending | Review simplified task flow against high-usability MVP criteria | Acceptance report |
| PM-015 | PM | Done | Convert high-usability objection into hard frontstage acceptance criteria | `docs/product/PRODUCT_TOPOLOGY.md` |
| DEV-025 | Development | Done | Collapse visible product into one 1-2-3 application flow and hide technical surfaces by default | DEV-025B accepted after import console was hidden |
| QA-025 | QA / Review | Conditional Pass | Review whether the visible product still feels Salesforce-like | Initial fail resolved by DEV-025B and local route/regression checks |
| PM-016 | PM | Done | Product-manager usability refinement pass for current MVP | Removed enterprise chrome, demo wording, default backend console rendering, and inconsistent output copy |
| QA-026 | PM / Review | Done | Verify refined MVP against 1-2-3 usability standard | lint/ja-terms/build/regression and live route checks passed |
| PM-017 | PM | Done | Define AI correction learning loop from user-confirmed saves | `docs/product/V1_AI_CORRECTION_LEARNING.md` |
| PM-018 | PM | Done | Define V1 OpenAI model routing and API surface | `docs/product/V1_AI_MODEL_SELECTION.md` |
| DEV-027 | PM / Development | Done | Implement AI runtime routing skeleton and correction-event capture from case workbench saves | `src/lib/ai/*`, `src/lib/correction-event-builder.ts`, `correction_events` storage |
| QA-027 | PM / Review | Done | Verify AI runtime skeleton and correction-event builder regression | lint/build/`test:ai-runtime`/`test:correction-events` passed |
| DEV-028 | PM / Development | Done | Extend correction-event capture to extraction review saves and editable PDF preview saves | Input review edits/rejections and PDF value/layout/custom-field corrections now enter the same event pipeline |
| QA-028 | PM / Review | Done | Verify multi-trigger correction-event classification | `test:correction-events` covers workbench, extraction review, PDF preview, layout, and custom overlay events |
| DEV-029 | PM / Development | Done | Add gated AI experience draft storage and backend draft job | Repeated correction groups can become draft experience notes without auto-promotion |
| QA-029 | PM / Review | Done | Verify experience draft generation gates | `test:ai-experience-drafts` covers min-count, case-only exclusion, scope retention, and risk text |
| DEV-030 | PM / Development | Done | Add PM/QA AI experience review surface and approved-only retrieval helper | `/settings/ai-experience`, review actions, scoped retrieval context |
| QA-030 | PM / Review | Done | Verify AI experience review surface and approved-only retrieval | lint/build/regression plus `test:ai-experience-retrieval` |
| PM-019 | PM | Done | Re-scope guarantee application output to certified minimum auto-fill plus editable completion | `docs/product/V1_GUARANTEE_APPLICATION_OUTPUT.md`, `docs/product/PRODUCT_TOPOLOGY.md` |
| DEV-031 | PM / Development | Done | Add guarantee field completion modes and stop unverified fields from default final auto-print | `certified_auto` / `assisted_candidate` / `manual_electronic` policy |
| QA-031 | PM / Review | Done | Verify guarantee auto-fill policy guardrail | `test:guarantee-autofill-policy` |
| PM-020 | PM | Done | Resume Phase A and define workbench as attention-first operating page | `docs/product/PRODUCT_TOPOLOGY.md`, `docs/product/V1_CASE_WORKBENCH.md` |
| DEV-032 | PM / Development | Done | Make case workbench default to actionable fields with source evidence and explicit field decisions | Attention filter, output-required filter, field evidence, unknown/rejected save behavior |
| QA-032 | PM / Review | Done | Verify Phase A workbench guardrails | `tsc`, lint/build/regression, case workbench HTML checks |
| DEV-033 | PM / Development | Done | Make Phase A workbench target the selected guarantee company template | Template-scoped required fields, target switcher, output-center deep-link preservation |
| QA-033 | PM / Review | Done | Verify template-scoped workbench flow | `tsc`, lint/build/regression, template deep-link checks |
| PM-021 | PM | Done | Start Phase B and define guarantee draft as a template-scoped workbench layer | `docs/product/V1_CASE_WORKBENCH.md`, `docs/product/PRODUCT_TOPOLOGY.md` |
| DEV-034 | PM / Development | Done | Add case-workbench company-specific draft editor before PDF preview | `GuaranteeApplicationDraft` save action, selected-template draft form |
| QA-034 | PM / Review | Done | Verify Phase B draft boundary and no common-data pollution | `tsc`, lint/build/regression, browser workbench/output check |
| DEV-035 | PM / Development | Done | Make company-specific draft status consistent across workbench, output center, and preview | Draft saved-at state, preview missing-field deep links |
| QA-035 | PM / Review | Done | Verify Phase B draft status consistency and routing | `tsc`, lint/build/regression, browser check |
| DEV-036 | PM / Development | Done | Close Phase B/C/D gates before full regression | Draft-save correction events, shared direct-download gate, friends-first defaults, friends print-fit/calibration/visual checks |
| QA-036 | PM / Review | Done | Full Phase B/C/D verification and blueprint retrospective | Full test suite plus browser route checks passed |
| DEV-037 | PM / Development | Done | Expand remaining guarantee templates to certified minimum output baseline | 1/2/3/4 template modes, page-size-safe layout sanitization, five-template regression loop |
| QA-037 | PM / Review | Done | Verify five-template output quality gate | Five-template policy/gate/fit/calibration checks plus service PDF fidelity and visual smoke |
| PM-022 | PM | Done | Define fixed MVP Acceptance Agent for closed-pilot readiness | `docs/agents/mvp-acceptance-agent.md` |
| QA-038 | MVP Acceptance Agent | Pending | Run closed-pilot acceptance against usable / easy / highly reusable standard | MVP acceptance report with screenshots, commands, PDFs, blocking findings |

Status values:

- Pending: defined but not started
- In Progress: assigned and currently executing
- Blocked: waiting on user, PM, or another agent
- Review: execution complete and waiting for PM or QA judgment
- Done: accepted by PM
- Rejected: does not meet scope or acceptance criteria

## Dispatch Prompt Format

Every PM-dispatched task should include:

- Role
- Product context
- Task objective
- Required reading
- Allowed scope
- Forbidden scope
- Acceptance criteria
- Final output format

## Return Format

Agents should return:

- Goal understanding
- Work performed
- Files or areas reviewed or changed
- Key decisions
- Verification performed
- Risks or open questions
- Recommended next step

Development Agent should additionally return:

- Changed file list
- Validation commands and results
- Known technical debt or limitations

QA / Review Agent should additionally return:

- Overall result: Pass, Conditional Pass, or Fail
- Blocker issues
- High issues
- Medium issues
- Low issues or suggestions
- Verified items
- Unverified items

## Active Development Prompt

### DEV-010: Guarantee Application Template Registry and Readiness UI

Role:

Development Agent.

Product context:

Broker Desk V1 is now anchored on a concrete import-to-output loop for small Japan real estate brokers. Input files produce reviewed structured case data. The first output family is `保証会社申込書`, not generic PDFs. The user has provided five common guarantee company PDF templates: 全保連, 日本セーフティー, Jリース, インシュア, and ふれんず保証.

Required reading:

- `docs/operations/PM_CONTROL.md`
- `docs/product/V1_INPUT_FILE_MODEL.md`
- `docs/product/V1_GUARANTEE_APPLICATION_OUTPUT.md`
- current output center, case summary, data layer, and i18n/navigation files

Task objective:

Add the first product-facing skeleton for guarantee company application output. This slice should make the direction visible and usable before full PDF overlay is implemented.

Allowed scope:

- Add a guarantee company template registry in code.
- Add `保証会社申込書` as the primary output path in the output center.
- Show the five initial company templates as selectable cards/options.
- Read confirmed case data where available.
- Show grouped field readiness for guarantee application data:
  - 物件・契約条件
  - 申込者・賃借人
  - 勤務先・収入
  - 緊急連絡先・連帯保証人
  - 同居人
  - 取扱店・管理会社
  - 保証プラン・会社別項目
  - 未入力・要確認
- Mark fields as available, missing, or needing confirmation.
- Keep existing generic output behavior available only if it does not confuse the new primary path.
- Add or update focused regression coverage where practical.

Forbidden scope:

- Do not implement full drag-and-drop PDF editing.
- Do not expose PDF coordinate mapping to ordinary users.
- Do not pretend the PDFs have AcroForm fields.
- Do not use AI to auto-finalize application values.
- Do not silently fill missing or unreviewed facts.
- Do not redesign the Stitch UI foundation.
- Do not remove existing import/review/save flows.

Acceptance criteria:

1. `保証会社申込書` is visible as the primary V1 output path.
2. The five company templates are selectable: 全保連, 日本セーフティー, Jリース, インシュア, ふれんず保証.
3. The readiness screen uses confirmed case data as its first source.
4. Missing required fields are clearly separated from ready fields.
5. User-facing language avoids mapping/schema/coordinate terminology.
6. The UI clearly communicates that export/print depends on completing required data.
7. Existing import center, extraction review save, case summary, and current output center behavior do not regress.
8. Verification includes at least lint, Japanese terminology check, build, and the existing regression script if runnable.

Final output format:

- Goal understanding
- Changed files
- Key implementation decisions
- Validation commands and results
- Known limitations
- Suggested next slice

### DEV-013: First Guarantee PDF Overlay MVP for ふれんず保証

Role:

Development Agent.

Product context:

The readiness UI for `保証会社申込書` is accepted. The next step is to prove the first real output loop with one template only: `５ふれんず保証.pdf`. This is a deterministic template overlay MVP, not a general PDF editor and not support for all five companies.

Required reading:

- `docs/operations/PM_CONTROL.md`
- `docs/product/V1_GUARANTEE_APPLICATION_OUTPUT.md`
- `src/lib/guarantee-application.ts`
- `src/app/output-center/page.tsx`
- output download route and current PDF generation utilities
- package dependencies available for PDF rendering/generation

Task objective:

Implement a first exportable flattened PDF for the `ふれんず保証` guarantee application template using confirmed/readiness data. The goal is to prove that selected case data can be rendered onto the original PDF template and downloaded/printed as a broker-ready file.

Allowed scope:

- Add a server-side PDF overlay/export path for `friends_guarantee` only.
- Use `/Users/laineyzhu/Desktop/房产专家资料库/５ふれんず保証.pdf` as the source template if local file access is practical; otherwise add a clear development placeholder strategy without committing private source PDFs unless explicitly required.
- Render a small but meaningful field subset first:
  - property name
  - room number
  - property address
  - move-in desired date
  - rent
  - management/common fee
  - parking fee
  - rent total
  - applicant name
  - applicant furigana
  - applicant phone/mobile
  - applicant current address
  - employer name
  - emergency contact / guarantor name
  - emergency contact / guarantor phone
  - brokerage/company contact if available
- Add a download action or route from the output center for `ふれんず保証` only.
- If data is missing, render only available confirmed values and keep the readiness warnings visible before export.
- Keep coordinate maps internal.
- Add focused regression or unit checks where feasible.

Forbidden scope:

- Do not implement all five guarantee companies.
- Do not build a drag-and-drop PDF editor.
- Do not expose coordinate, mapping, or schema terminology to ordinary users.
- Do not use AI for PDF filling.
- Do not silently invent missing facts.
- Do not remove the existing readiness UI or generic output fallback.
- Do not commit large private PDFs unless PM/user explicitly approves. Prefer runtime local template path or documented placeholder.

Acceptance criteria:

1. User can initiate PDF export for `ふれんず保証` from the guarantee application output path.
2. Export produces a flattened PDF based on the `５ふれんず保証.pdf` template or a clearly documented local-template runtime path.
3. At least the scoped field subset renders into stable positions on the first page.
4. Missing fields are not fabricated.
5. Other guarantee templates remain in readiness-only state.
6. User-facing UI still does not expose mapping/schema/coordinate terminology.
7. Existing import center, case summary, output center readiness, homepage route, and regression checks do not regress.
8. Verification includes lint, Japanese terminology check, build, and a practical PDF export smoke check if feasible.

Final output format:

- Goal understanding
- Changed files
- Key implementation decisions
- Validation commands and results
- PDF export smoke-check result
- Known limitations
- Suggested next slice

## Current Product Questions

Answered direction for the first major development task:

1. First target user segment: independent Japan real estate brokers and very small real estate companies that currently rely on Excel / Word / PDFs and find large legacy systems too expensive or difficult.
2. Primary V1 value proposition: replace repetitive Excel work by importing existing Excel data and generating polished PDF business documents.
3. Primary workflow: input extraction -> broker review -> structured case/property/party data -> guarantee company application template -> missing field completion -> PDF preview and generation.
4. UI baseline: existing Stitch design direction is the basis. The first branch should focus on product flow alignment, not visual exploration.
5. Deferred automation: AD / needs matching, sales alerts, market data automation, and research automation are later-stage capabilities.

## PM Decision Rules

- Keep the product anchored to the topology: input convenience -> editable case workbench -> output convenience.
- Treat the case workbench as the product center and Excel replacement surface.
- Input and output are valuable because they make the workbench faster, not because they are standalone modules.
- Prioritize features that reduce manual re-entry, manual checking, uncertainty, missing fields, and output preparation.
- Keep the product narrower than the codebase until the first input -> workbench -> output loop is convincing.
- Prefer a complete, coherent import-to-output workflow over more modules.
- Treat templates, PDF output quality, and field reuse as product trust assets, not decorative features.
- Do not let CRM, kanban, audit, service-request, or broad contract-management modules become the V1 main story.
- Every development branch must have acceptance criteria before implementation starts.

See `docs/product/PRODUCT_TOPOLOGY.md`.

## V1 Output Priority

V1 output is now scoped to one document family first:

`保証会社申込書`

Initial supported guarantee company templates:

1. 全保連
2. 日本セーフティー
3. Jリース
4. インシュア
5. ふれんず保証

Product behavior:

Confirmed case data -> choose guarantee company -> auto-fill application draft -> review missing required fields -> preview/export/print flattened PDF.

The reviewed PDFs do not contain AcroForm fields, so implementation should assume deterministic template overlay rather than ordinary PDF form-field filling.

Generic property overview, quotation, advertising, market report, and broad contract outputs are deferred unless needed to support the guarantee application path.

See `docs/product/V1_GUARANTEE_APPLICATION_OUTPUT.md`.

## V1 Adjustment Boundary

V1 should support configuration-based pre-output adjustment:

- guarantee company template selection
- required field review
- manual completion of missing values
- company-specific option selection
- PDF preview before generation

Free-form drag-and-drop PDF editing is a V1.5 / V2 candidate and should not block the first workflow.

## V1 Input Priority

Input work should now prioritize source-document extraction, not only row-based Excel import.

Reviewed source documents:

1. `重要事項説明書（区分所有建物の売買・交換用）`
2. `区分所有建物用売買契約書（一般売主）`
3. `物件状況確認書（告知書／区分所有建物用）`

Input-side principle:

Known source file -> deterministic template detection -> rule-based field extraction -> broker-friendly review table with source evidence -> user confirmation/edit -> structured case/property data.

AI is allowed only as a supplement after the deterministic skeleton is reliable. AI suggestions must not be silently saved as confirmed legal or transaction facts.

Template variation rule:

The first source files are seed templates from one broker's operating circle, not universal industry formats. The product must support exact matches, known variants, similar unknown files, and unknown files. AI may assist with variant mapping and ambiguous field suggestions only after deterministic detection and review states are in place.

User-facing terminology rule:

Do not make ordinary brokers perform or understand "field mapping" as the primary workflow. The UI should present automatic extraction candidates and ask the user to review, edit, accept, or mark unknown. Mapping/schema/source-column language belongs in internal code or advanced/debug views only.

Review/save architecture rule:

Confirmed business facts should not live only inside `ImportJob` metadata. V1 should introduce a lightweight `BrokerageCase` plus `ExtractionReview` layer. `ImportJob` stores source/extraction evidence; `ExtractionReview` stores field-level decisions and source traceability; `BrokerageCase.confirmedDataJson` stores accepted/edited facts for downstream output. Keep this JSON-based first and avoid premature columnization.

See `docs/product/V1_INPUT_FILE_MODEL.md`.

## PM-017 Layout Logic Refinement

Decision:

The default UI must route the user by current task state, not by module taxonomy.

Rules:

- If no case exists, the primary action is `資料を入れる`.
- If a case exists but output-blocking fields remain, every primary CTA must route to the editable missing-field review surface.
- If output-blocking fields are cleared, the primary CTA may route to guarantee application output.
- Recent import cards should not reopen hidden mapping screens by default; they should advance the user to missing-field review.
- Direct PDF download links must not be exposed in the visible missing-state path, even if the backend can technically generate a PDF with blanks.
- Advanced mapping, validation logs, attachments, and legacy outputs remain accessible only behind detail/advanced disclosure.

Acceptance checks:

- Home, import, output, and case pages all show the same next-step logic.
- `不足項目を確認` is clickable and lands near the editable workbench section.
- Output page keeps the guarantee application as the main story and moves other output families behind `補助機能`.
- Regression tests assert the missing-state rule instead of the previous always-download rule.

## PM-018 Phase A-3 Workbench Usability Refinement

Decision:

The case workbench must not feel like a raw database editor. It should behave like a structured broker worksheet with field controls that match the business meaning of each field.

Implemented baseline:

- Phone fields render as telephone inputs.
- Email fields render as email inputs.
- Date-like fields show Japanese business date placeholders.
- Money and numeric fields show units such as `円`, `万円`, `年`, and `日`.
- Address and long-note fields use multiline controls.
- Common categorical fields use broker-readable select options.
- Visible AI candidates with values can be confirmed in one save action.
- Selecting `入力値を使う` writes confirmed trust state even when the value did not change.
- Workbench filters and save redirects preserve the selected guarantee company template.

Acceptance checks:

- Regression asserts typed controls and template-preserving workbench links.
- TypeScript, lint, regression, and production build must pass before handoff.

## PM-019 Phase A-4 Evidence-To-Action Workbench

Decision:

Source evidence is not enough if the broker still has to open every detail row and reason manually. Field cards should show a short judgement that tells the broker what the system found, how confident it is, where it came from, and what action is available.

Implemented baseline:

- Fields with extraction evidence show `候補判断`.
- The summary exposes candidate value, source sheet/cell or range, extraction method, and confidence.
- The summary includes a broker-facing hint: adopt, correct, manually fill, or check low-confidence source.
- A field with a candidate can be confirmed or adopted directly from the summary button.
- Detailed evidence remains available behind `出典を見る`.

Acceptance checks:

- Regression asserts candidate judgement summaries and one-field candidate confirmation actions.
- This evidence surface must remain subordinate to the workbench editing flow; it is not an advanced debug panel.

## PM-020 Phase A-5 Workbench Priority Queues

Decision:

For the current V1 guarantee application path, the workbench should not ask the broker to read every field in document order. It should queue the work by immediate output impact and review effort.

Implemented baseline:

- `申込書で止まる`: fields that block the selected guarantee company application.
- `高信頼候補`: source-backed high-confidence candidates suitable for fast confirmation.
- `低信頼`: candidates that should be checked against the source before use.
- `候補なし`: required fields where the current input files did not produce a candidate.
- The default attention list is sorted by the same priority order.
- Batch confirmation can use visible source candidates, including candidates not yet copied into the editable input.

Scope rule:

This priority model is limited to the V1 guarantee application workflow. Future sales, contract, advertisement, or report workflows may define their own queue ranking.

Acceptance checks:

- Regression asserts queue labels, queue routes, and visible candidate batch confirmation.
