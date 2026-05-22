# V1 Guarantee Application Output

## Purpose

V1 output should first focus on one high-value document family:

`保証会社申込書`

The first product goal is not broad PDF generation. The goal is to let a small Japan real estate brokerage team select a guarantee company template, reuse confirmed case data, auto-fill the application, review missing items, and export or print a broker-ready application form.

This is the clearest V1 loop:

Input files -> extraction review -> structured case data -> guarantee company template selection -> auto-filled application preview -> PDF export / print.

## Source Templates Reviewed

Source folder:

`/Users/laineyzhu/Desktop/房产专家资料库`

Initial output templates:

| File | Company / Template | Pages | PDF Form Fields | Product Meaning |
| --- | --- | ---: | ---: | --- |
| `１全保連.pdf` | 全保連 | 2 | 0 | Common guarantee application template; text extraction is partly garbled, so visual/coordinate filling is required. |
| `２日本セーフティ.pdf` | 日本セーフティー | 1 | 0 | Common guarantee application template; text extraction is empty, so image/coordinate filling is required. |
| `３Jリース.pdf` | Jリース | 2 | 0 | `入居申込書兼保証委託申込書`; text extraction is partly readable. |
| `４インシュア.pdf` | インシュア | 1 | 0 | `スマートサポート申込書【個人用】`; text extraction is readable. |
| `５ふれんず保証.pdf` | ふれんず保証 | 1 | 0 | `入居申込書 兼 保証委託申込書（個人用）`; text extraction is readable. |

Important technical product finding:

These PDFs do not expose AcroForm fields. V1 cannot rely on ordinary PDF form-field filling. It needs a template-specific rendering / overlay approach where the system writes values at known positions on top of the original template and then exports a flattened PDF.

## Product Interpretation

These five files are V1 output-side templates.

Expected product behavior:

1. User has confirmed case data from uploaded input files and manual edits.
2. User opens the output center.
3. User chooses `保証会社申込書`.
4. User chooses one of the supported guarantee companies.
5. System shows an auto-filled preview using confirmed case data.
6. User reviews required fields, missing fields, and company-specific options.
7. User edits or fills missing items before export.
8. System exports or prints a flattened application PDF matching the original company template.

The product should frame this as:

- choose guarantee company
- auto-fill from existing case data
- check missing fields
- export / print

Do not frame this as:

- design a PDF
- map PDF coordinates
- configure a schema
- edit a document from scratch

Template coordinates and field mappings are internal implementation details.

## V1 Scope Decision

V1 output priority is now:

1. Guarantee company application forms.
2. Case data review and missing field completion for guarantee applications.
3. PDF preview / export / print of supported templates.

Defer:

- generic property overview output
- quotation PDF expansion
- market report output
- advertising flyer output
- drag-and-drop freeform PDF design
- broad contract package generation

Existing generic PDF output can remain if already implemented, but it is no longer the product's primary V1 output story.

## Common Data Model

The five guarantee templates share a large overlap. V1 should introduce a guarantee application field dictionary and then map each company template to that dictionary.

### Property / Lease

Fields:

- property name
- room number
- property address
- move-in planned date
- usage purpose: residential / business / warehouse / parking / other
- contract type: ordinary lease / fixed-term lease / other
- contract period start
- contract period end
- rent
- common fee / management fee
- parking fee
- water fee / town fee / other monthly charges
- monthly rent total
- deposit
- key money
- guarantee deposit
- insurance fee
- key exchange fee
- other initial fees
- initial cost total

### Applicant / Tenant

Fields:

- applicant name
- applicant furigana
- birth date
- gender
- mobile phone
- home phone
- email
- current postal code
- current address
- current residence type
- current rent
- years at current residence
- cohabiting family count
- occupation
- employer name
- employer furigana
- employer address
- employer phone
- industry
- employment type
- annual income
- years employed
- payday / income date
- moving reason

### Emergency Contact / Guarantor

Fields:

- contact role: emergency contact / joint guarantor / planned guarantor
- name
- furigana
- relationship
- birth date
- gender
- phone
- postal code
- address
- residence type
- employer name
- employer phone
- annual income
- years employed
- spouse status, where required

### Co-occupants

Fields:

- occupant name
- furigana
- relationship
- birth date
- gender
- phone
- employer / school

V1 can support a limited number of co-occupants per template, based on template capacity.

### Brokerage / Management Company

Fields:

- handling store / brokerage company name
- branch name
- staff name
- phone
- fax
- address
- management company name
- management company phone
- landlord / lessor / lessor agent information where required

### Guarantee Company Options

These are company-specific and should not be over-normalized too early.

Examples:

- guarantee plan
- initial guarantee fee
- monthly guarantee fee
- annual renewal fee
- collection agency option
- single-person special rider
- parking / storage / business plan selection
- consent checkbox state

Store these as template-specific options first, while exposing broker-friendly labels in the UI.

## Template Registry

V1 should introduce a template registry concept.

Recommended object:

`GuaranteeCompanyTemplate`

Fields:

- template id
- company code
- company display name
- template version
- source PDF file name
- page count
- supported applicant type: individual / corporate / both
- required field keys
- optional field keys
- company-specific option keys
- coordinate mapping version
- output status: draft / active / deprecated

Initial company codes:

- `zenhoren`
- `nihon_safety`
- `j_lease`
- `insure`
- `friends_guarantee`

## Output Rendering Principle

Because the PDFs do not contain fillable form fields, V1 should use deterministic template overlay:

1. Keep the original PDF as the background.
2. Maintain company-specific coordinate maps.
3. Render normalized field values into fixed positions.
4. Render checkmarks for selected options.
5. Flatten the result into a final PDF.
6. Preserve a preview before export.

V1 should not expose coordinate editing to ordinary users.

If coordinates are imperfect, this is a PM/operations template maintenance task, not a broker-facing workflow.

Official template fidelity rule:

The guarantee company PDFs are downloaded from the guarantee companies and should be treated as fixed official application forms. The product may only fill values into the intended blank areas. It must not move, redraw, restyle, resize, crop, or otherwise alter the original lines, boxes, labels, notices, or page layout. Overlay validation should compare the generated output against the original template background and treat template-background drift as a release blocker.

## Data Readiness UX

The output screen should clearly show:

- ready fields
- missing required fields
- low-confidence or unreviewed fields
- company-specific fields not present in source input
- manual fields needed before export

Recommended grouping:

1. 物件・契約条件
2. 申込者・賃借人
3. 勤務先・収入
4. 緊急連絡先・連帯保証人
5. 同居人
6. 取扱店・管理会社
7. 保証プラン・会社別項目
8. 未入力・要確認

The user-facing task is `不足項目を確認して出力する`, not `mapping`.

## AI Role

AI is not required for the first five fixed output templates.

For V1 output, AI should be deferred or limited to:

- suggesting likely values for missing fields from existing case notes
- normalizing free-text addresses or names
- helping onboard a new guarantee company template after PM/admin review

AI must not decide required legal/application facts without user confirmation.

The deterministic skeleton is:

template registry -> common field dictionary -> company-specific coordinates -> review missing items -> export.

## Implementation Slices

### Slice 1: Template Registry and Output Entry

Add `保証会社申込書` as the primary output type.

Support the five initial templates as selectable options:

- 全保連
- 日本セーフティー
- Jリース
- インシュア
- ふれんず保証

Do not implement full PDF overlay yet if that makes the slice too large. The first slice may show template selection, required data groups, and missing field readiness.

### Slice 2: Guarantee Application Field Dictionary

Introduce the common field keys needed by the five templates.

Use the existing `BrokerageCase.confirmedDataJson` as the source of truth where possible.

Do not prematurely columnize all guarantee application fields.

### Slice 3: Review / Completion Screen

Create a broker-facing screen where the user can:

- choose a case
- choose a guarantee company template
- see auto-filled values
- fill missing required fields
- see which fields came from confirmed data
- save company-specific application draft data

### Slice 4: PDF Overlay MVP

Implement deterministic overlay for one template first.

Recommended first template choice:

`５ふれんず保証.pdf`

Reason:

- one page
- readable extracted text
- compact field set
- good representative overlap with other templates

After one template exports correctly, expand to the other four.

### Slice 5: Additional Templates

For future guarantee companies:

1. PM/admin adds source PDF.
2. System stores template metadata.
3. Internal template maintainer defines coordinate map.
4. QA verifies printable output.
5. Template becomes active.

AI may help suggest coordinates or field candidates, but final activation requires human QA.

## PM Acceptance Criteria

Guarantee application output work is acceptable only when:

1. `保証会社申込書` is visibly the primary V1 output path.
2. User can select at least the five initial guarantee company templates.
3. The UI shows required field readiness before export.
4. The app uses confirmed case data as the primary source.
5. Missing or unconfirmed values are not silently filled.
6. No user-facing primary workflow uses mapping/schema/coordinate terminology.
7. PDF export is implemented with deterministic template overlay, not assumed AcroForm fields.
8. The first overlay template can be previewed and exported as a flattened PDF before expanding to all five.
9. The original official template background is preserved exactly; only filled text/checkmarks may be added.
