# UI Terminology Review Workflow

## Purpose

This workflow lets a business reviewer clean up product terminology without editing source code directly.

The process is intentionally limited:

- Reviewers edit CSV rows.
- Engineers import only i18n-backed rows automatically.
- Hardcoded UI text remains visible in the CSV, but must be migrated to i18n before automated replacement.

## Export Review Files

Run:

```bash
npm run terms:export
```

Generated files:

```text
docs/operations/ui-terminology-starter-review.csv
docs/operations/ui-terminology-ja-starter-review.csv
docs/operations/ui-terminology-ja-business-review.csv
docs/operations/ui-terminology-zh-business-review.csv
docs/operations/ui-terminology-core-review.csv
docs/operations/ui-terminology-review.csv
```

Use `ui-terminology-starter-review.csv` for the first business review. It is capped to high-impact frontstage text from the main entry, import, organize, case, output, and extraction-review flows. The file starts with importable i18n rows, then includes a smaller set of hardcoded migration targets.

Use `ui-terminology-ja-starter-review.csv` for a smaller practical Japanese review when the reviewer should not see Chinese or Korean rows.

Use `ui-terminology-ja-business-review.csv` as the default friend-review package for the practical Japanese product language. It contains Japanese i18n rows plus likely Japanese frontstage hardcoded rows that still need engineering migration.

Use `ui-terminology-zh-business-review.csv` when a Chinese reviewer wants a localization-style review pack. It contains Chinese i18n rows plus frontstage hardcoded rows that still need engineering migration.

Use `ui-terminology-core-review.csv` for a broader business review. It contains all frontstage product text.

Use `ui-terminology-review.csv` for engineering cleanup. It includes system, library, and secondary screens.

For the 2026-07-14 friend-feedback review package, use:

- `docs/operations/UI_TERMINOLOGY_REVIEW_HANDOFF_2026_07_14.md`
- `docs/operations/PRODUCT_TERMINOLOGY_DICTIONARY_JA_2026_07_14.md`
- `docs/operations/PRODUCT_TERMINOLOGY_DICTIONARY_2026_07_14.md`
- `docs/operations/ui-terminology-starter-review.csv`
- `docs/operations/ui-terminology-ja-starter-review.csv`
- `docs/operations/ui-terminology-ja-business-review.csv`
- `docs/operations/ui-terminology-zh-business-review.csv`

## CSV Columns

- `id`: stable row id.
- `surface`: where the text appears: `frontstage`, `system`, `library`, or `secondary`.
- `source`: `i18n` or `hardcoded`.
- `file`: source file.
- `line`: source line at export time.
- `occurrences`: repeated occurrences of the same text.
- `locale`: `ja`, `zh`, `ko`, or `unknown`.
- `key`: i18n key when available.
- `current_text`: current product text.
- `suggested_text`: reviewer replacement.
- `notes`: migration/import guidance.

## Reviewer Rules

Only edit `suggested_text`.

Do not edit `id`, `source`, `file`, `locale`, `key`, or `current_text`.

Do not translate raw business data such as person names, addresses, building names, company names, source filenames, or official-form labels. These are source facts, not UI terminology.

Rows with `source=i18n` can be imported automatically.

Rows with `source=hardcoded` cannot be imported automatically. They are cleanup targets for later i18n migration.

## Dry Run Import

Run:

```bash
npm run terms:import
```

This reports what would change but does not write files.

## Apply Import

Run:

```bash
npm run terms:import -- --write
```

The importer updates only:

```text
src/lib/i18n.ts
```

To import from the starter file:

```bash
npm run terms:import -- --csv docs/operations/ui-terminology-starter-review.csv
npm run terms:import -- --csv docs/operations/ui-terminology-starter-review.csv --write
```

Safety behavior:

- Skips rows where `suggested_text` is empty.
- Skips hardcoded rows.
- Skips stale rows when `current_text` no longer matches the source file.
- Skips duplicate locale/key rows.

After import, run:

```bash
npm run terms:export
npm run lint
npm run build
```

## Current Boundary

This is not a full localization platform yet. It is a controlled terminology correction lane for the current MVP.

The next maturity step is moving repeated hardcoded frontstage text into `src/lib/i18n.ts`, then letting the same CSV workflow cover more screens.
