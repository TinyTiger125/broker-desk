# Development Handoff 2026-07-01

> Historical handoff only. It is not the current progress source or active
> task authority. Use CURRENT_WORKING_CONTEXT.md and local task cards.

This handoff records the Broker Desk state after the final pre-friend-test audit cycle and before moving work back to the primary development environment.

## Repository

- Local repo: `/Users/neo.yu/Documents/独立开发项目/房产专家/broker-desk-web`
- Remote: `https://github.com/TinyTiger125/broker-desk.git`
- Branch used for this handoff: `main`
- Previous GitHub checkpoint before this work: `2727c38 feat: checkpoint input system handoff`
- Environment files: `.env` and `.env.local` are ignored and must be recreated or preserved locally on each machine.

Do not treat memory-driver runtime data as durable pilot data. The friend-test service currently uses the memory driver and blank business-data mode. Runtime-created records can disappear after server restart.

## Current External Test State

The local service was brought up for friend testing with:

```bash
BROKER_DESK_AUTH_MODE=demo BROKER_DESK_ENABLE_DEMO_AUTH=true BROKER_DESK_SEED_MODE=blank BROKER_DESK_DEFAULT_LOCALE=zh npx next dev --webpack
```

Expected local URLs:

```text
http://localhost:3000
http://192.168.0.111:3000
```

For a remote friend test, expose the local service with:

```bash
ngrok http 3000
```

The service should start with:

- default Chinese UI for new visitors
- demo auth enabled
- no business/test data
- tenant and demo members retained

Latest verified blank-data count before handoff:

```json
{
  "clients": 0,
  "properties": 0,
  "quotations": 0,
  "followUps": 0,
  "tasks": 0,
  "auditLogs": 0,
  "importJobs": 0,
  "brokerageCases": 0,
  "extractionReviewItems": 0,
  "guaranteeApplicationDrafts": 0,
  "correctionEvents": 0,
  "aiExperienceDrafts": 0,
  "attachments": 0,
  "generatedOutputs": 0
}
```

## Product State

The current frontstage product direction remains:

```text
资料管理中心
  -> 建档导入
  -> 整理信息
  -> 输出文件
```

The home page has moved further from a raw statistics dashboard toward a work console:

- first visible logic is "what needs attention next"
- case relationship area explains linked parties, property, source materials, and output readiness
- type buckets remain available, but they are secondary to the current work object
- list/detail behavior is now clearer after earlier feedback about invisible refreshes and meaningless count columns

Object management pages for parties/properties now use a more consistent structure:

- header and filters are object-management first, not export-first
- bulk export is no longer treated as the primary use case
- list/detail density has been reduced compared with the earlier cramped table view

Import and organize pages have been revised to avoid exposing internal IT language to brokers:

- field keys and schema-like labels are not presented as the main explanation
- system recommendations are treated as internal behavior rather than marketing copy
- import items can deep-link more directly to their relevant handling context

## Main Implementation Changes Since 2026-06-27

### Home And Object UX

- Refined `/` around next work, current blocker, case progress, relationship context, type browsing, object index, and current-object panel.
- Preserved original Japanese names, addresses, and source labels instead of force-translating proper nouns in Chinese UI.
- Added demo localization helpers for broker-facing labels without corrupting raw source names.
- Improved navigation and main-nav labels for the simplified four-step product frame.

### Import / Organize / Object Pages

- Reworked `/import-center` and `/organize-center` to reduce internal-language exposure.
- Adjusted parties and properties pages to reduce export-first hierarchy and make management/search/detail logic more predictable.
- Reworked hub/object data helpers used by the home and organize surfaces.

### Output And Case Deep Links

- Fixed output-center missing-field links so they route to actual case workbench nodes or guarantee preview sections.
- Added `#company-draft-fields` anchor in the Friends Guarantee preview.
- Updated guarantee download gate and server actions to point users to real in-product correction locations instead of stale anchors.

### QA Data Lifecycle

- Added a QA seed endpoint for full business-data test fixtures:
  - `POST /api/qa/seed-business-data`
- Added reliable blank reset behavior through the existing reset endpoint:
  - `POST /api/qa/reset-business-data`
- `BROKER_DESK_SEED_MODE=blank` now starts the memory driver with no business data.
- Regression tests now seed full QA data at the beginning and clear business data on exit.
- Tenant scope is backfilled during QA seed so fixture cases work under tenant-scoped pages.

### QA Route Protection

QA APIs are now intended as local test tooling:

- local loopback requests are allowed in development
- production requires `BROKER_DESK_QA_TOKEN`
- requests with a non-loopback `x-forwarded-host` are rejected

This prevents an ngrok visitor from casually calling QA seed/reset endpoints through the public tunnel.

### Default Locale

- `BROKER_DESK_DEFAULT_LOCALE=zh` is supported when there is no locale cookie.
- Existing browser cookies still win. If a local browser was previously Japanese, switch the language selector manually or clear the cookie.

## Validation Completed

The following checks passed before this handoff:

```bash
npx tsc --noEmit --pretty false
npm run lint -- --quiet
npm run build
npm run test:regression
```

The regression script now covers:

- default Chinese homepage smoke
- QA full business-data seed
- guarantee template calibration and print-fit checks
- guarantee autofill policy
- guarantee download gate
- AI routing / correction / experience retrieval checks
- extraction review materialization
- tenant session and tenant data-access boundaries
- production auth and RLS baseline
- homepage, IA routes, output center, case workbench, preview, and quote-print smoke checks
- board stage transition API
- automatic QA business-data cleanup on exit

Manual route smoke also covered:

```text
/
/import-center
/organize-center
/output-center
/cases/case_fixture_friends_guarantee_pdf
/properties
/parties
/contracts
/service-requests
/settings/members
/settings/output-templates
/settings/ai-experience
```

Design audit screenshots and notes are under:

```text
docs/design-audit/final-prelaunch-20260630/
```

## Known Risks

1. Memory driver is still not real pilot persistence.
   Friend testing is suitable for UX feedback, not durable customer records.

2. Next dev cache can become inconsistent after mixing production build and dev server runs.
   If `middleware-manifest.json`, `routes-manifest.json`, or Turbopack SST/cache errors appear, stop the dev server, remove `.next`, and restart with `npx next dev --webpack`.

3. Avoid concurrent first requests immediately after wiping `.next`.
   Let the homepage compile first, then use the app normally.

4. Guarantee preview deep links are functionally correct, but the PDF/context framing should still be watched in real testing.
   When linked directly to company-specific fields, the left-side preview context can feel visually weak.

5. Object management is improved but not proven with real broker behavior.
   Watch whether a first-time user understands:
   - where to start a case
   - where to upload material
   - how to distinguish case, party, property, and unassigned intake
   - when to go to output

6. QA endpoints are protected against public forwarded hosts, but they still exist in the local development app.
   Do not expose a production deployment with QA routes enabled unless token-gated and intentionally retained.

7. The current commit includes broad UX, QA, and test changes.
   If debugging future regressions, separate "product surface changes" from "QA/test harness changes" when bisecting.

## Immediate Next Steps On Primary Environment

1. Pull the latest GitHub `main`.
2. Recreate or verify `.env.local`.
3. Install dependencies if needed:

```bash
npm install
```

4. Run checks:

```bash
npx tsc --noEmit --pretty false
npm run lint -- --quiet
npm run test:regression
```

5. Start friend-test mode when needed:

```bash
BROKER_DESK_AUTH_MODE=demo BROKER_DESK_ENABLE_DEMO_AUTH=true BROKER_DESK_SEED_MODE=blank BROKER_DESK_DEFAULT_LOCALE=zh npx next dev --webpack
```

6. Open a public tunnel only after confirming `http://localhost:3000/` returns 200.

## Friend-Test Observation Checklist

Ask the tester to try the product without explanation first, then observe:

- Can they tell what the first page is for within 10 seconds?
- Do they naturally start from `建档导入` when creating a new case?
- Do they understand the difference between case, related party, property, and imported material?
- When something is pending, do they know what to click next?
- Does `整理信息` feel like a useful work center or still like an internal database table?
- Does `输出文件` feel reachable only after data is ready?
- Are Japanese names, addresses, and document names preserved naturally in Chinese UI?
- Do any pages feel like IT/admin tooling rather than broker tooling?
