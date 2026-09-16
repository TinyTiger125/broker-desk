# Inline field editing design QA

## Reference

Reviewed the annotated desktop reference supplied at `/var/folders/hk/679p0p853nj4cvd3q93mj5b40000gn/T/codex-clipboard-c0f931e6-f021-4a3a-b5de-3510662c1cbb.png`.

## Static checks

- PASS: the right-side editor is removed from the quick workbench.
- PASS: each visible row owns a `CaseWorkbenchFieldForm` bound to its own `fieldKey`.
- PASS: current-value controls, row confirmation, secondary decisions, evidence candidates, and contact validation remain in the row.
- PASS: `npm run build`, `npm run typecheck`, `npm run test:inline-field-editing`, and `git diff --check`.

## Exact Preview runtime

- PASS: exact deployment `dpl_7vrgqjkNGJNaTyFVfTPXrDkE6EhS`, SHA `166e204a037c9d76f9b18f90f709b9a226cb7951`, reached READY at `broker-desk-staging-n9kim2an3-neos-projects-d66edfc8.vercel.app`.
- PASS: existing employee session opened `case_ja7yr8dw` in the expected Japanese workbench; no tenant/case mismatch was observed.
- PASS: at the captured desktop viewport, the right-side editor is absent and the central table spans the content area with per-row inputs, secondary decision controls, and matching `確認` buttons.
- PASS: invalid `foo@` email and `abc` phone were blocked in-row; visible messages said the change was not saved.
- FAIL P1: valid synthetic phone `0300000004` showed a successful save toast and progress changed from 2/4 to 3/4, but after reload the same `field:applicant.mobilePhone` input was empty. The row remained confirmed, so the value was not durable despite the success signal.
- PASS: the test field was returned to an empty value; no unrelated fixture was created.

## Keyboard and visual scope

Full keyboard traversal (Tab/Enter/Shift+Tab), 1440 viewport, and source-sized viewport comparison were not completed after the P1 persistence failure; they cannot change the no-go decision.

## Local narrow repair

- Root cause evidence: browser automation filled the visible control, but the row rerender could leave the native control value empty at serialization; the server action then treated the empty `field:<key>` entry as a clear while still marking the row confirmed and emitting a success redirect.
- Repair: each row now mirrors its visible control value into `fieldValueSnapshot`; the server resolves the submitted value from the same field first and the snapshot only when the field entry is empty. An explicit clear updates both to empty and remains a clear.
- Regression: `npm run test:inline-field-payload` covers direct value, remount snapshot, and explicit clear; inline/contact contracts remain green.

## final result: blocked (requires new Preview re-verification)
