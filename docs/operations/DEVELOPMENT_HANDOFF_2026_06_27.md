# Development Handoff 2026-06-27

This handoff records the current Broker Desk state before moving development to another device.

## Repository

- Local repo: `/Users/laineyzhu/Documents/独立开发项目/房产专家/broker-desk-web`
- Remote: `https://github.com/TinyTiger125/broker-desk.git`
- Branch used for this handoff: `main`
- Environment files: `.env` and `.env.local` are ignored and must be recreated on the next machine.

Do not treat runtime memory-driver data as durable pilot data. The current code and seed data are pushed; local runtime-created records may reset after server restart unless Postgres is enabled.

## Current Product State

The product direction is now:

```text
資料管理中心
  -> 建档导入
  -> 整理信息
  -> 输出文件
```

The core product is a real-estate information center. Guarantee-company application output remains an important selling point, but it is only one output workflow.

Current product rules:

- `建档导入` is an ownership and material-intake workflow, not a raw upload page.
- `整理信息` is an object index and editing entry for cases, subjects, properties, and unassigned intake.
- A user must be able to create a case, subject, or property before uploading documents.
- A created object should open an editable workflow with expected fields present.
- Output checks belong in `输出文件` or a specific output workflow, not in the default information-organizing surface.
- AI is an assistant for extraction, classification, matching, conflict detection, and auditable suggestions. Broker Desk's database is the product memory.

## Implemented In This Version

### Navigation And Product Language

- Main navigation has been simplified around:
  - `资料管理中心`
  - `建档导入`
  - `整理信息`
  - `输出文件`
- Several older module labels and internal-language leaks were replaced with broker-facing language.
- Remaining internal/admin surfaces are still present under settings/template/admin routes and need further gating before release.

### Home / Data Management Center

- `/` has been rebuilt as a data-management overview instead of a generic task dashboard.
- It shows:
  - searchable work objects
  - a relationship-oriented data map for cases, customers/related parties, properties, and imported materials
  - a focused object list
  - a current-object panel
  - recent updates
- The current screen is functional but still not final UX. It is denser than desired and should be refined until it feels like a clean operating console, not a compressed admin table.

### 建档导入

- `/import-center` now frames intake as deciding where material belongs before reading files.
- It supports:
  - creating a new case
  - adding to an existing case
  - holding unclear material for later assignment
  - reading identity documents
  - importing Excel/source files
- Identity document upload now supports multi-file selection with local validation for file count, per-file size, and total size.
- Advanced/legacy import mapping still exists. It should be kept away from ordinary broker flow unless explicitly needed.

### 整理信息

- `/organize-center` is now the object-center entry for:
  - cases
  - subjects / related parties
  - properties
  - unassigned intake
- The list supports type/status/search filters and a current-object detail panel.
- Create actions adapt to the selected type:
  - subject filter prioritizes new subject
  - property filter prioritizes new property
  - case filter prioritizes new case
  - unassigned-intake filter prioritizes material import

### Object Creation

- `/cases/new` creates a blank case and redirects into the case workbench.
- `/parties/new` creates a subject / related-party profile and redirects into the profile editing flow.
- `/properties/new` creates a property with basic location/cost fields and redirects according to the selected save action.
- Draft helpers are wired into the create forms so unfinished input is less likely to be lost.

### Case Workbench

- `/cases/[id]` remains the main detailed information editor.
- Case fields are grouped by the case information tree.
- Field cards now support per-card save behavior via `CaseWorkbenchFieldForm`.
- Edited cards reveal their own save button; the global save pattern is being reduced.
- Saved/confirmed fields are intended to move out of the highest-priority unfinished set after save.
- Output-specific checks have been demoted compared with the earlier guarantee-application-first design.

### Output

- Five guarantee-company PDF template paths are still present and should be preserved:
  - 全保連
  - 日本セーフティー
  - Jリース
  - インシュア
  - ふれんず保証
- The automatic form-filling work is considered provisionally sealed for now. Do not overwrite template coordinates or saved layout JSON casually.
- Template authoring/calibration remains high-risk and should be protected as backstage/admin functionality.

### AI Direction

- AI/RPA boundary is documented:
  - RPA is stable-interface action automation.
  - Broker Desk AI should handle messy source understanding, candidate extraction, ownership classification, conflict detection, and auditable proposals.
- Skill/tool/agent distinction is documented.
- Product memory must be Broker Desk's own database and event history, not the external model's private memory.

## Main Files Changed

Key implementation files:

- `src/app/page.tsx`
- `src/app/import-center/page.tsx`
- `src/app/organize-center/page.tsx`
- `src/app/cases/new/page.tsx`
- `src/app/cases/[id]/page.tsx`
- `src/app/parties/new/page.tsx`
- `src/app/parties/[id]/edit/page.tsx`
- `src/app/properties/new/page.tsx`
- `src/app/actions.ts`
- `src/components/case-workbench-field-form.tsx`
- `src/components/identity-document-upload-form.tsx`
- `src/components/party-profile-form.tsx`
- `src/lib/case-field-catalog.ts`
- `src/lib/data.memory.ts`
- `src/lib/hub.ts`
- `src/lib/identity-document-extractor.ts`
- `src/lib/party-profile.ts`

Key documentation files:

- `CONTEXT.md`
- `docs/PROJECT_MEMORY.md`
- `docs/product/PRODUCT_TOPOLOGY.md`
- `docs/product/V1_INPUT_FILE_MODEL.md`
- `docs/product/V1_CASE_INFORMATION_ARCHITECTURE.md`
- `docs/product/V1_CASE_WORKBENCH.md`
- `docs/product/V1_AI_CORRECTION_LEARNING.md`

## Known Risks

These are not cosmetic issues; they affect whether the product can become a reliable broker tool.

1. Home screen UX is still not 10/10.
   It now has a better product model, but the density, rhythm, and hierarchy still need refinement.

2. `建档导入` still contains legacy mapping/import-management logic.
   It is useful for development, but ordinary brokers should not meet field-mapping or schema-like concepts as the default experience.

3. Subject and property profile flows are minimal.
   They are now real creation routes, but they are not yet as structured as the case workbench.

4. Case workbench per-card save needs more browser QA.
   The previous illegal invocation bug was addressed, but the interaction still needs repeated testing after a fresh install and browser reload.

5. Memory driver can hide persistence risk.
   A fresh device should confirm behavior using the intended database mode before any serious pilot.

6. Clerk/Postgres production path is designed but not fully live-verified.
   Clerk keys, webhook delivery, invitation lifecycle, Postgres schema, and RLS application still need production-environment validation.

7. PDF template coordinates are high-value state.
   Do not run broad cleanup, JSON formatting, or template calibration experiments without backing up `.broker-desk/friends-guarantee-layouts.json`.

8. Admin/template-factory controls are not fully separated from broker flow.
   Before any external user pilot, ordinary user routes must be checked for template coordinate, field binding, AI pre-match, and output-template publishing access.

## Next Development Plan

### Step 1: Fresh Device Bring-Up

1. Clone/pull this repo from GitHub.
2. Recreate `.env.local` from the current machine's local secret values.
3. Run:

```bash
npm install
npm run lint
npx tsc --noEmit --pretty false
npm run test:case-field-catalog
npm run dev -- --port 3000
```

4. Open:

```text
http://localhost:3000/
http://localhost:3000/import-center
http://localhost:3000/organize-center
http://localhost:3000/output-center
```

### Step 2: Finish Input-System UX

Priority order:

1. Refine `资料管理中心` until the first screen clearly answers:
   - what is being managed
   - what needs attention
   - how to start a new case
   - how to continue an existing object
2. Keep only two primary action lanes:
   - input / creation
   - output
3. Make object selection and creation consistent:
   - new subject opens subject profile
   - new property opens property profile
   - new case opens case workbench
   - imported file either attaches to an owner or remains unassigned
4. Remove or gate default exposure of internal import mapping.
5. Add object-type-specific information trees for subject and property when needed.

### Step 3: Harden Case Workbench

1. Verify per-card save in a real browser after a hard reload.
2. Confirm saved fields leave the unfinished priority area.
3. Keep unfilled/unconfirmed fields at the top of each selected node.
4. Keep output readiness out of the default information-editor lower half.
5. Preserve field-level source evidence, but expose it only when it helps the broker decide.

### Step 4: Re-Verify Output Side

1. Keep the five guarantee-company templates sealed unless explicitly testing output.
2. Run PDF/template regression before touching template JSON.
3. Confirm output checks live in `输出文件`, not as the center of `整理信息`.

### Step 5: Production Foundation

1. Reconfirm Clerk configuration on the new device.
2. Confirm `.env.local` values are present but ignored by Git.
3. Run tenant/security tests before any real account/pilot test.
4. Move from memory data to Postgres for any real-world trial.

## Suggested Acceptance Gate For The Next Session

Before continuing feature work, verify:

- GitHub pull works cleanly on the new device.
- `.env.local` is restored and not tracked.
- `npm run lint` passes.
- `npx tsc --noEmit --pretty false` passes.
- `/` loads without server/client exception.
- `/import-center` can accept a test image or Excel without crashing.
- `/organize-center` shows cases, subjects, properties, and intake filters.
- `/cases/new` creates a case and redirects into an editable workbench.
- A case field can be edited, saved from its own card, and remain persisted after reload.
- `/output-center` still sees existing case data and template paths.

If any of these fail, fix the platform issue before continuing product design work.
