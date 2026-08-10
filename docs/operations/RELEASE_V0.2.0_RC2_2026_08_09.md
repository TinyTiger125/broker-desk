# Broker Desk v0.2.0-rc.2

Release date: 2026-08-09
P0 verification update: 2026-08-10

## Scope

This candidate is a closed-beta polish and resilience release. It does not expand business scope.

## Included changes

- Expanded the desktop content boundary from 1600px to 1920px so wide screens preserve working space without the previous excessive outer gutters.
- Changed page loading feedback to a centered, fixed-width sweep that does not stretch with the page layout.
- Explicitly enabled prefetching for primary navigation targets.
- Strengthened extraction-review confirmation feedback: a field first becomes "confirmed, pending save", receives a visible completion state, then folds out of the remaining-work queue. The final submission button has a distinct saving state so local review is not misrepresented as already persisted case data.
- Added route and global error boundaries. User-facing failures now expose recovery actions and an opaque request identifier instead of framework error details.
- Corrected two official template publication records through additive v2 migrations: Nihon Safety and Friends now use the same runtime asset fingerprint and page geometry as their published layout snapshots. Existing tenant-local overlays remain untouched.
- Added reproducibility and live publication-state checks for all five official guarantee templates.
- Added a live tenant-auth lifecycle boundary check for runtime, migration and webhook-admin database roles.
- Added import failure-recovery and user-facing language-boundary checks to the candidate verification command.

## Verification

- `npm run verify:public-beta` passed on 2026-08-10 with a connected development PostgreSQL database.
- Production dependency audit against the npm registry reported zero vulnerabilities.
- `npm run build` passed after the UI and error-boundary changes.
- Five-template reproducibility, publication-state, calibration and print-fit gates passed. The print-fit gate retains 41 stress-case shrink/segment warnings and one non-blocking complete-fixture shrink warning on the Insure template; these are visual-review items, not evidence of perfect typography.
- Runtime-role RLS denial and tenant-auth lifecycle boundaries passed against the connected development database.

## Not deployment evidence

This release is not yet a deployed public beta. The following require a separate Tokyo-hosted staging/production exercise:

- Separate Clerk production instance, database, object storage and secrets.
- Runtime database role verification, worker scheduler and remote document reader configuration.
- Private attachment backup/restore, monitoring/alerting and rollback rehearsal.
- Real-browser end-to-end regression across invited accounts and two devices.

## Manual P0 evidence still required

- Five official templates must be generated from the same fixed data on two real devices and visually compared using `GUARANTEE_TEMPLATE_CROSS_DEVICE_ACCEPTANCE.md`.
- Platform administrator, tenant administrator and broker identities must complete the real Clerk workflow and the negative authorization checks in `ROLE_AUTH_E2E_ACCEPTANCE.md`.
- The retained print-fit warnings must be reviewed at actual print scale before any template is represented as universally print-ready.

## Version rule

- `v0.2.0-rc.2` remains a candidate until the public-beta release gate is fully evidenced.
- A deployed closed beta will be cut as `v0.3.0-closed-beta` only after the external gate items are completed.
