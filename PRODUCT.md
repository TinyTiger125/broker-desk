# Broker Desk Product Contract

## Product

Broker Desk is a workbench for small Japanese real-estate brokers. It turns
source material into reviewed case information and traceable official
business documents.

## Target user

The primary user is a Japanese real-estate broker or very small agency that
currently relies on spreadsheets, copied PDF forms, manual data entry, and
repeated document preparation.

## Core user result

source material -> extract and review -> confirm case facts
-> organize the case -> choose an official template
-> preview -> generate a traceable document

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

- The primary workflow is input, organize, and output.
- The workbench is the product center; output-specific completeness checks stay
  in Output.
- Record lifecycle starts with archive and restore. Destructive deletion needs
  explicit permission and audit history.
- No public deployment or real-customer pilot is approved until the release
  gates in docs/operations/PUBLIC_BETA_RELEASE_GATE.md are evidenced.
