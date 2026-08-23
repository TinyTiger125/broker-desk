# TASK-038 runtime RLS evidence — 2026-08-23

This is a sanitized evidence record. It intentionally excludes connection
strings, passwords, tokens, raw Clerk subjects, user emails, and internal file
identifiers.

## Target identity

- Neon project: `broker-desk-staging-nonprod` / `restless-sun-37465131`
- Branch: `br-sparkling-sunset-az98ha2x`
- Database: `neondb`
- Database role: `brokerdesk_runtime`
- Migration ledger: latest applied migration is `20260821_013_fix_removed_invitation_return.sql`
- Execution: one transaction; no writes; transaction rolled back

## Role boundary

The live connection reported:

- `SUPERUSER = false`
- `BYPASSRLS = false`
- business-table ownership = false

## Read results

The valid A identity, in the populated non-production tenant, read non-zero
rows from cases, generated outputs, attachments/private blobs, company blank
forms, and company masks. This is the positive control.

The following negative controls returned zero rows for all eight checked
tenant-scoped tables (`clients`, `properties`, `brokerage_cases`,
`generated_outputs`, `attachments`, `private_attachment_blobs`,
`guarantee_blank_forms`, `guarantee_company_masks`):

- missing external-auth subject and tenant context;
- invalid external-auth subject with tenant A context;
- valid A subject with a forged tenant-C context;
- a real identity that is not an active member of the populated tenant.

The non-member negative control is the decisive cross-tenant proof because the
populated target tenant had non-zero positive-control data. The C test tenant
currently contains no rows in the checked tables, so the A→C zero result is
recorded as `inconclusive-empty` rather than as standalone proof.

## Interpretation

The evidence closes the TASK-038 tenant-level runtime RLS gate for the current
contract: identity binding, missing/invalid context denial, non-member denial,
private-file tenant filtering, and role safety are all demonstrated. Same-
tenant case/person/property visibility remains application authorization and
the later TASK-039 object-visibility phase unless a future database contract
explicitly changes that boundary.
