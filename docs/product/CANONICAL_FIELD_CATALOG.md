# Broker Desk Standard Field Catalog

Last updated: 2026-06-10

## Purpose

Broker Desk needs a product-owned field catalog before it can reliably expand from guarantee company applications into quotes, ads, contracts, reports, and future AI customer-service intake.

The catalog is the logical wide table of the product. It is not necessarily one physical database table today.

Current storage can remain:

- `brokerage_cases.confirmed_data_json`: confirmed case facts.
- `guarantee_application_drafts.field_values_json`: template-specific draft values.
- template layout files / overrides: output coordinates and box behavior.

The product rule is stricter than the storage implementation:

1. Input files map into standard case fields.
2. The case workbench edits and confirms standard case fields.
3. Output templates bind to standard case fields or template-specific options.
4. Output-only fragments are derived at render time and should not become user-maintained data.

## Evidence Sweep

The first catalog pass reviewed the five V1 guarantee company application forms:

| No. | Template | Source | Extraction Result | Field Coverage Use |
| --- | --- | --- | --- | --- |
| 1 | 全保連 | `１全保連.pdf` | No AcroForm fields. Text extraction is mostly garbled, but the form structure is available through visual calibration and current overlay boxes. | Used visual/form layout and overlay bindings. |
| 2 | 日本セーフティー | `日本セーフティー(1).pdf` | No AcroForm fields. Text extraction exposes most headings. | Used extracted headings and current overlay boxes. |
| 3 | Jリース | `３Jリース.pdf` | No AcroForm fields. Page 1 text extraction exposes most headings; page 2 is mostly legal text. | Used extracted headings and current overlay boxes. |
| 4 | インシュア | `４インシュア.pdf` | No AcroForm fields. Text extraction exposes most headings. | Used extracted headings and current overlay boxes. |
| 5 | ふれんず保証 | `５ふれんず保証.pdf` | No AcroForm fields. Text extraction exposes most headings. | Used extracted headings and current overlay boxes. |

Conclusion: these PDFs are not fillable PDF forms. The standard field catalog must be built from official headings plus product semantics, not from PDF form fields.

## Field Classes

### Canonical Case Fact

A durable business fact about the case. Examples:

- `property.name`
- `property.postalCode`
- `applicant.birthDate`
- `applicant.driverLicenseNumber`
- `applicant.employerPhone`
- `emergencyContact.postalCode`

These should be collected, reviewed, saved, and reused across future outputs.

### Template-Specific Option

A company-specific choice used by one output template. Examples:

- `company_option.zenhoren_collection_service`
- `company_option.nihon_safety_product`
- `company_option.j_lease_product_plan`
- `company_option.insure_smart_support`
- `company_option.friends_single_rider`

These stay in output draft space until multiple workflows need the same meaning.

### Render Fragment

A split or formatted piece of another field. Examples:

- applicant birth year / month / day
- phone part 1 / 2 / 3
- postal code digit cells
- name family / given split
- address prefecture / municipality / street / rest

Render fragments are output bindings, not separate case facts, unless they become independently meaningful to brokers.

## Standard Groups

The code-level source is `src/lib/case-field-catalog.ts`.

Current standard groups:

1. `application_process`: output process dates such as application submission date.
2. `property_lease`: property name, room number, postal code, address, usage, contract terms, rent, fees, deposit, key money, payment method.
3. `applicant`: applicant identity, contact, current address, current housing, current rent.
4. `identity_document`: residence card and driver license data.
5. `employment_income`: workplace, occupation, employment type, income, payday, moving reason.
6. `guarantor`: joint guarantor details.
7. `emergency_contact`: emergency contact details.
8. `co_occupants`: up to three co-occupants / residents.
9. `broker_management`: brokerage, agent, management company, landlord.
10. `guarantee_options`: shared guarantee plan fields and company-specific options.

## Fields Added By This Pass

This pass explicitly promoted or reserved these fields because they appeared in one or more of the five application forms or in the current template calibration flow:

| Area | Field | Reason |
| --- | --- | --- |
| Property | `property.furigana` | Appears on multiple forms as 物件フリガナ. |
| Property | `property.postalCode` | Needed for grid postal-code boxes and address normalization. |
| Property | `property.usage` | Appears as 物件用途 / 使用目的. |
| Lease | `lease.contractType` | Appears as 普通借家 / 定期借家. |
| Lease | `lease.contractStartDate`, `lease.contractEndDate` | Appears on インシュア. |
| Lease | `lease.waterTownFee`, `lease.otherMonthlyFee`, `lease.cancellationDeduction`, `lease.initialCostTotal` | Fee rows appear across templates. |
| Lease | `lease.paymentMethod`, `lease.rentPaymentDay` | Appears on 日本セーフティー. |
| Applicant | `applicant.mobilePhone`, `applicant.homePhone` | Several forms distinguish 携帯 and 自宅. |
| Applicant | `applicant.cohabitingFamilyCount` | Appears as 同居家族 count. |
| Identity | `applicant.driverLicenseNumber` | Required by Jリース / 全保連-style boxes. |
| Identity | `applicant.healthInsuranceType` | Appears on インシュア. |
| Employment | `applicant.employerDepartment`, `applicant.employerHomePage`, `applicant.monthlyIncome` | Appears in application headings. |
| Guarantor | `guarantor.postalCode`, `guarantor.mobilePhone`, `guarantor.homePhone`, `guarantor.employerPhone`, `guarantor.yearsEmployed` | Needed for guarantor blocks. |
| Emergency Contact | `emergencyContact.postalCode`, `emergencyContact.mobilePhone`, `emergencyContact.homePhone`, `emergencyContact.employerPhone`, `emergencyContact.yearsEmployed` | Needed for emergency-contact blocks. |
| Co-occupants | `coOccupants.*.gender` | 日本セーフティー / Jリース include gender in resident blocks. |
| Broker | `broker.branchName`, `broker.fax`, `broker.agentCompanyName`, `broker.agentPhone`, `broker.agentFax` | 全保連 separates 協定会社 and 仲介会社. |
| Management/Landlord | `landlord.name`, `landlord.address` | Some output families need lessor-side facts. |

## Non-Fields

Do not add these as separate confirmed case fields:

| Output Fragment | Correct Treatment |
| --- | --- |
| `applicant.name.family`, `applicant.name.given` | Derive from `applicant.name` during output. |
| `applicant.birthDate.year/month/day` | Derive from `applicant.birthDate`. |
| `applicant.phone.part1/part2/part3` | Derive from `applicant.phone` or `applicant.mobilePhone`. |
| `property.address.prefecture`, `property.address.rest` | Derive from `property.address` and `property.postalCode` where possible. |
| Postal-code digit cells | Derive from the postal-code field and template cell count. |
| Amount digit cells | Derive from the amount field and template cell count. |

## Postal Code Master Data

Japanese postal-code lookup is deterministic product master data, not AI behavior.

Runtime rule:

- The source data is Japan Post public postal-code CSV.
- `scripts/sync-japan-postal-codes.mjs` converts the official UTF-8 CSV into `.broker-desk/japan-postal-code-index.json`.
- The service can look up `prefecture`, `municipality`, and `townArea` from a normalized 7-digit postal code.
- If the runtime index is absent, the product keeps a small fallback seed covering the current QA/template fixtures.

Product rule:

- Brokers maintain ordinary case facts such as `property.postalCode`, `property.address`, `applicant.currentPostalCode`, and `applicant.currentAddress`.
- The system may auto-complete the administrative address prefix from postal code.
- Postal-derived address prefixes must not hide missing street/building information. Prefix-only address completion should remain reviewable.
- Output templates should bind to postal-code cells and address render fragments rather than asking users to maintain separate micro-fields.

## Product Expansion Route

### Phase 1: Catalog Stabilization

- Keep `src/lib/case-field-catalog.ts` as the product-owned source of standard fields.
- Use the catalog for aliases, AI extraction targets, binding options, and future workbench grouping.
- Add a catalog consistency check so new template fields cannot silently bypass the catalog.

### Phase 2: Workbench Alignment

- Generate workbench sections from the catalog or a catalog subset.
- Keep broker-facing labels simple; hide raw field keys outside admin/template tools.
- Preserve trust states per field.

### Phase 3: Output Template Factory

- Move template calibration to an admin-only factory.
- Bind each output box to a canonical field, a template-specific option, or a render fragment.
- Keep the binding picker drill-down based: guarantee-company form -> form section -> searchable standard field groups. A flat field dropdown is not acceptable once the catalog exceeds a small handful of fields.
- Store box position, size, alignment, split rule, and print confidence separately from case facts.

### Phase 4: Database Hardening

Only after field usage stabilizes:

- Introduce typed relational tables or typed JSON validation for high-use field groups.
- Keep template-specific options separate.
- Keep render fragments out of storage.
- Add migrations from `confirmed_data_json` into typed storage where the operational value justifies it.

### Phase 5: AI and Intake Expansion

- AI extraction should target canonical fields, not arbitrary template labels.
- AI customer service should ask questions that fill canonical fields.
- User corrections should create correction events scoped to canonical fields or template bindings.

## Current Known Caveats

- 全保連 text extraction is unreliable; visual calibration remains the primary source for its headings.
- Existing UI still contains some field lists outside the catalog. The catalog now exists, but the workbench UI should be aligned in a follow-up pass.
- Preview save has been adjusted to save submitted known fields only. This is required before safely expanding the binding catalog.
- Official template coordinates remain separate from the field catalog and must not be treated as business data.
