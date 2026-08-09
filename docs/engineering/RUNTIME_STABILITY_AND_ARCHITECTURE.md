# Runtime Stability And Architecture

Date: 2026-06-11

This document records runtime stability lessons for Broker Desk, especially the official PDF template factory.

## Incident Summary

On 2026-06-11, the PDF calibration toolbar was visible but non-interactive.

The immediate symptom was:

- toolbar buttons rendered
- button hit targets existed
- clicking did not change state
- no template box could be added from the toolbar

The confirmed technical failure was not a toolbar logic bug. The page had not hydrated because the Next.js client runtime was missing.

Observed evidence:

- `/_next/static/chunks/main-app.js` returned 404
- `/_next/static/chunks/app-pages-internals.js` returned 404
- browser DOM had no React event props on toolbar buttons
- `吸着弱` did not change to `吸着OFF`
- `入力欄を追加` did not increase custom overlay field count
- dev runtime later reported missing `.next/dev/server/middleware-manifest.json`

Production build and start recovered the page:

```bash
npm run build
./node_modules/.bin/next start -p 3002
```

Real browser verification then passed:

- `吸着弱` changed to `吸着OFF`
- custom overlay count increased after `入力欄を追加`
- no 404 client chunks
- no page errors

## Severity

This is a high-severity product-building incident because template calibration is product-owned production work.

The failure mode is dangerous because the UI looked normal while being non-interactive. If this happens during template work, a PM/admin can waste time, misdiagnose product logic, or risk touching template assets during an unstable runtime.

## Non-Negotiable Runtime Rules

- Never continue template calibration when toolbar controls do not respond.
- Never assume a visible Next page is hydrated.
- Never debug template coordinates until runtime health is confirmed.
- Do not calibrate against a local runtime file in production. Official layouts must be published to the shared template-version store; see `GUARANTEE_TEMPLATE_PUBLICATION.md`.
- Prefer production-mode verification for acceptance of official PDF output.

## Required Health Check

Before any PM/admin template calibration session, run a browser-level health check:

1. Load the target template preview URL.
2. Assert HTTP 200.
3. Assert no 404 for Next client chunks.
4. Click `吸着弱` and assert the label becomes `吸着OFF`.
5. Click `入力欄を追加` in a disposable test session and assert the overlay count increases.
6. Do not save template changes during the health check unless intentionally testing save.

The first automated guard is:

```bash
npm run smoke:template-runtime
```

This script verifies that the preview route renders the calibration surface and that all referenced Next.js client scripts are reachable. It catches the exact missing-client-runtime failure from the 2026-06-11 incident.

The next guard should be a browser-action smoke test that clicks the toolbar and asserts state mutation. Asset reachability is necessary, but not sufficient, for full hydration confidence.

## Architecture Assessment

The current runtime has a weak seam between:

- application feature work
- template factory work
- local development server state
- official PDF output acceptance

The template factory is too important to depend on a fragile dev server session. It needs a deeper runtime module with a small interface:

```text
start stable authoring runtime -> verify hydration -> verify toolbar actions -> allow calibration
```

The implementation behind that interface may use dev server, production build, or a dedicated authoring server. The PM/admin should not care which one is used as long as the health contract passes.

## Recommended Architecture Direction

### 1. Stable Template Authoring Runtime

Create a dedicated command for template calibration, separate from normal feature development.

Candidate behavior:

```bash
npm run authoring
```

The command should:

- stop any existing process on the configured port
- back up template layout JSON
- clean runtime cache only when safe
- start the app in the most stable mode
- run the hydration/toolbar smoke check
- print a clear pass/fail result before humans begin calibration

This is the highest-priority improvement.

### 2. Browser Smoke Test As A Gate

Codify the manual check used in the incident.

The test should fail if:

- page returns non-200
- `main-app` or client chunks are missing
- toolbar buttons do not mutate state
- React hydration is absent
- console/page errors appear

This protects against silent static HTML.

### 3. Template Asset Protection

Template coordinates are production assets. The runtime must resolve a published, asset-fingerprinted layout version from the shared database.

Minimum protection:

- immutable publication instead of in-place coordinate mutation
- tenant-installed copies resolve before official publications and are never overwritten by later releases
- SHA-256 asset fingerprint and page-geometry verification before render
- no automatic coordinate writes during runtime debugging
- regression check that preview and download both use the published version

### 4. Acceptance Runtime Should Match Release Runtime

Official PDF output acceptance should prefer production build/start or a release-like runtime.

Normal `next dev` is acceptable for feature iteration, but final judgment on:

- toolbar interactivity
- preview/save behavior
- PDF download behavior
- template output fidelity

should be done in a release-like runtime.

## Open Architecture Question

The product should decide whether template authoring remains inside the main app runtime or becomes a separate admin tool.

Current recommendation:

- short term: dedicated `authoring` command in the same app
- mid term: role-gated admin route with health checks and template versioning
- long term: separate template-factory module if the number of official forms grows beyond guarantee-company applications

## What Future Agents Must Do

When a UI control appears broken in Broker Desk:

1. First prove whether React hydration exists.
2. Check client chunk network status.
3. Reproduce with a real browser action, not screenshots only.
4. Only then inspect component click handlers.
5. Record the confirmed root cause in `docs/PROJECT_MEMORY.md` if it changes product risk or process.

Do not spend time tuning PDF coordinates while runtime hydration is unproven.
