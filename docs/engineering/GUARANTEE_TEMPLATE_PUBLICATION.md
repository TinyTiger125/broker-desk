# Guarantee Template Publication Contract

## Purpose

Official guarantee-application layouts are production assets. A layout calibrated on one machine must render identically on another machine when the same template version and case data are used.

The former local file `.broker-desk/friends-guarantee-layouts.json` is a legacy calibration source and development fallback only. It is not a production source of truth.

## Current Architecture

```text
official image asset + page geometry
        -> SHA-256 asset fingerprint
        -> immutable platform layout publication
        -> optional tenant-installed copy
        -> preview and PDF download resolve the tenant copy first
        -> generated output records the resolved layout id and snapshot
```

`guarantee_template_layout_versions` stores the publication record:

- template identifier and monotonic version number
- baseline field-catalog version
- SHA-256 image fingerprint plus image/page geometry
- normalized layout, deleted-field and custom-field snapshot
- active publication pointer per template
- publication time and human publisher where applicable

The initial migration is intentionally system-published because it imports the existing five calibrated layouts before a platform user exists. Later publications require a platform administrator and create a new immutable version; they never overwrite an earlier one.

## Release Procedure

1. Commit an official image change and its intended calibration together.
2. Generate the initial seed migration only when deliberately changing the legacy bootstrap source:
   `node scripts/build-guarantee-template-layout-migration.mjs`
3. Run `npm run test:guarantee-template-publication`.
4. Run the normal build and PDF visual smoke checks.
5. Apply migrations to the shared production database before deploying the application build.
6. In the template factory, publish a new layout version rather than editing an old one.
7. Generate the same known case from two machines against the shared database and compare the rendered PDF visually. This is the final cross-device acceptance check.

If the active publication fingerprint does not match the deployed official image, preview and PDF generation must fail closed. A shifted layout is worse than an unavailable output.

## Tenant-installed Template Copies

`tenant_guarantee_template_installs` stores a tenant-scoped installed copy. It is linked to the exact official publication from which it originated, but it persists its own frozen layout snapshot.

```text
platform version -> tenant install -> tenant private revision -> output snapshot
```

Current behavior:

- Every customer account can browse `/templates` and add an official template to its current workspace through `template.copy_official`. Adding means installing a frozen workspace copy, not downloading an unmanaged file.
- `/templates` is the broker-facing **Template Library**. It lists official templates and the current workspace's installed templates separately; it does not expose calibration, quality telemetry, field coordinates, or platform publication controls.
- Official template authoring, calibration, and publication remain restricted to the configured platform owner through `/platform/templates`. Tenant owners and tenant administrators do not receive this authority merely because they can install an official template.
- A newly created workspace has zero installed templates by default. It can organize people, properties, cases, and source material before choosing any output template.
- The output center only lists templates installed in the current workspace. Preview and download routes reject an uninstalled template, including direct URLs.
- The tenant copy is resolved before the official publication for preview and PDF generation.
- A later official publication does not modify an installed tenant copy.
- A tenant install must match the deployed official image fingerprint; mismatches fail closed.
- The installed copy may be archived, but it is never silently deleted by an upgrade.
- The current UI provides installation and use of a frozen tenant copy. Tenant-side coordinate editing and an explicit upgrade-comparison flow are the next delivery slice; they must never reuse the platform factory or mutate the official publication.
- JSON export/import remains backup and controlled migration tooling, not the normal installation workflow.
- Output records the exact resolved layout snapshot, so future revisions cannot alter historical PDFs.

### Upgrade Rule

Official upgrades are opt-in. The product must show the tenant a candidate version and preserve the installed copy until a human explicitly installs or replaces it. No migration, deployment, or background job may rewrite tenant layout snapshots.

Existing workspaces need an explicit release migration or administrator decision before being preloaded with templates. Do not silently install the full official catalog for every tenant merely to preserve a legacy UI state.
