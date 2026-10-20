# BD-CUSTOMER-IDENTITY-20261019-01 implementation card

## Scope and baseline

- Candidate: `bd-release-selected-20261013`
- Branch: `task/bd-model-intake-20261018-01`
- Base commit: `0c26ceeda3804e1cfa3b64272820a7bd2e9dabcd`
- This iteration keeps the existing Client profile catalog as the business-field source of truth: `name`, `furigana`, `birthDate`, `gender`, `currentPostalCode`, `currentAddress`, `phone`, `lineId`, and `email`.
- Document-only facts such as nationality, document number, issuer, residence status, expiry, driver conditions, and insurance-holder details remain source evidence and do not become input fields.
- No production connection, deployment, push, supplied PDF, API key, or raw model response is stored in Git.

## Reader boundary

- Standalone customer targets pass an explicit `scope: "customer"` to the OpenAI Responses reader.
- The customer JSON schema is derived from the existing nine-field catalog. Existing case-bound identity paths retain their broader case field schema through `scope: "case"`.
- A PDF is page-count checked before the provider call against the existing 20-page contract; model pages and candidate page numbers must also be within the actual PDF count (images are one page).
- The customer reader sends a bounded `maxOutputTokens` cap and records a customer-specific reader version in request metadata.
- Model-only extraction remains model-only; it does not fall back to Swift OCR or regex. Model template provenance is `vision_ai_v1` even when `DOCUMENT_READING_PROVIDER` is not set.
- Customer normalization accepts the existing canonical values plus explicit document formats (`M/F`, western dates including `12 APR 1990`, and Japanese era dates such as `平成2年4月12日`), while source excerpts remain unchanged for review.

## Restricted PostgreSQL evidence

The real repository function `reviewObjectImportCandidate` was exercised under the isolated local database and restricted runtime role. The generated individual and corporate records/import rows were deleted in the test `finally` block.

- Evidence: `/private/tmp/brokerdesk-customer-identity-pg-evidence-20261019.json`
- Script: `scripts/test-customer-identity-postgres-confirmation.mjs`
- Private-runner command shape:

  ```sh
  BROKER_DESK_AUTH_TRUSTED_HEADER_SECRET="$LOCAL_TRUSTED_HEADER_SECRET" \
  DATABASE_DEVELOPMENT_URL="$LOCAL_OWNER_DATABASE_URL" \
  BROKER_DESK_CUSTOMER_PG_EVIDENCE=/private/tmp/brokerdesk-customer-identity-pg-evidence-20261019.json \
  node scripts/test-customer-identity-postgres-confirmation.mjs
  ```

- The evidence records `current_user=brokerdesk_runtime`, `session_user=qa_initializer`, `rolsuper=false`, and `rolbypassrls=false`.
- A complete synthetic individual target confirmed and reopened all nine fields through the repository. A separate synthetic individual target left phone/LINE/email as `not_found`; the original phone/email remained unchanged and the target reached `completed`.
- The same run rejected an unknown field, stale version, duplicate confirmation, forged other-tenant/user contexts, and a corporate customer target. It reports cleanup completion.
- No model provider was called by this regression.

## Focused verification

- `node scripts/test-openai-identity-reader-contract.mjs` — PASS; scope-derived schema, preflight page cap before provider call, actual page bounds for PDF/image, structured evidence, and customer/case reader separation.
- `node scripts/test-customer-identity-intake.mjs` — PASS; four document classifications, existing-field filtering, model-only attribution, date/gender normalization, not_found contacts, and review/save/reopen behavior.
- `npm run typecheck` — PASS.

Parent-owned browser/provider acceptance remains separate evidence. This card does not claim a live model run.
