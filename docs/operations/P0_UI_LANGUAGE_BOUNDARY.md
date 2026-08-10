# P0 Frontend Language Boundary

## Purpose

Broker Desk is a working tool for brokers. Product screens must describe the next action and its result. They must not expose implementation vocabulary, model reasoning, data keys, or internal review mechanics.

## Product Language Rules

- Use action and outcome language: `读取资料`, `确认`, `保存`, `重新读取`, `需要补充`.
- Explain a limitation only when it changes the next user action.
- Use an opaque request number for support; never expose stack traces, database fields, model prompts, or internal error codes.
- Keep platform-only template calibration and implementation controls inside platform-owner routes. They are not part of ordinary broker-facing UI.

## Automated Guard

Run:

```bash
npm run test:product-language
```

The check scans ordinary product routes and components for known implementation-language regressions. It deliberately excludes API routes and platform-owner template tooling because those surfaces have different authorization and terminology requirements.

## Manual Review Before Public Beta

1. Export the terminology review pack with `npm run terms:export`.
2. Review Chinese, Japanese, and Korean strings in context using `docs/UI_TERMINOLOGY_WORKFLOW.md`.
3. Confirm that the visible copy tells a broker what to do next, without explaining system internals.
4. Record wording changes through the terminology import process rather than editing translation files ad hoc.
