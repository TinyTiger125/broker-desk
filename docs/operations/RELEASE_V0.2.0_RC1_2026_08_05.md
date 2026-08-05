# Broker Desk v0.2.0-rc.1

Release date: 2026-08-05

## Purpose

This release reunifies the previously separate main test and development lines into one public-beta candidate baseline. From this point, `main` is the only maintained application branch until a new branch is explicitly created for isolated work.

## Baseline

- Release version: `v0.2.0-rc.1`
- Release branch: `main`
- Release tag: `v0.2.0-rc.1`
- Development integration source: `dev/friend-test-fixes-20260702`
- Previous main-test-only commits are preserved as a merge parent; their duplicate code is not allowed to overwrite the newer development implementations.

## Included product scope

- Case, party, property and imported-material organization flows.
- Case workbench with field-level save and unresolved-first ordering.
- Required/optional field configuration in the admin surface.
- Friend-test terminology workflow and user-facing terminology assets.
- Guarantee-application output and existing template runtime checks.
- Tenant-aware data access, PostgreSQL migration files, and production-readiness checks.

## Verification required before public beta

1. Install dependencies from the committed lockfile.
2. Run `npm run lint` and `npm run build`.
3. Run `npm run test:regression` against the release server.
4. Confirm the public-beta test checklist on actual browser sessions.
5. Do not call the release production-ready until authentication, database migration, and public test results are explicitly accepted.

## Versioning rule

- `v0.x.y-rc.n`: public-beta candidate that still needs acceptance.
- `v0.x.y`: accepted beta baseline.
- `v1.0.0`: only after the product has met the separately documented production-readiness gate.

