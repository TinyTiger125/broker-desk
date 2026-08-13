# Broker Desk Product Contract

## Product

Broker Desk is a workbench for small Japanese real-estate brokers. It turns
source material into reviewed case information and a traceable
guarantee-company application based on an official form.

## Target user

The primary user is a Japanese real-estate broker or very small agency that
currently relies on spreadsheets, copied PDF forms, manual data entry, and
repeated document preparation.

## Core user result

source material -> extract and review -> confirm case facts
-> organize the case -> choose an official template
-> preview the guarantee-company application -> generate a traceable
guarantee-company application

For V1, the only primary generated product output is the guarantee-company
application (`保証会社申込書`).

## Product boundaries

- Broker Desk is not a generic CRM, OCR wrapper, PDF editor, accounting
  system, listing scraper, or autonomous agent.
- AI may extract, classify, compare, and recommend. It must not silently
  confirm facts, overwrite durable data, publish templates, or make compliance
  decisions.
- Broker-facing UI must hide field keys, mappings, coordinates, model
  reasoning, and internal quality language.
- Official PDFs must preserve the source form. Manual dragging is not the
  normal quality guarantee.
- Official templates follow an explicit platform-owner lifecycle:
  draft -> review -> publish -> immutable release. Tenants use frozen copies.

## Stable product decisions

- The V1 primary workflow is input, organize, confirm, and produce the
  guarantee-company application (`保証会社申込書`).
- The workbench is the product center; output-specific completeness checks stay
  in Output.
- Other document families are future candidates or historical compatibility
  surfaces. They are not parallel V1 output paths, navigation requirements, or
  completion criteria.
- Official-source registries provide reference evidence. Viewing or downloading
  an official source document is not the same as generating a product output.
- Record lifecycle starts with archive and restore. Destructive deletion needs
  explicit permission and audit history.
- No public deployment or real-customer pilot is approved until the release
  gates in docs/operations/PUBLIC_BETA_RELEASE_GATE.md are evidenced.
