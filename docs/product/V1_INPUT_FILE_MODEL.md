# V1 Input File Model

## Purpose

V1 input work should turn real brokerage documents into structured, reviewable case data.

The product should not treat Excel input only as row-based property imports. For Japan brokerage workflows, many Excel files are document templates that contain the authoritative fields needed for legal, contract, disclosure, and output workflows.

Core input principle:

Source file -> template identification -> deterministic extraction where possible -> AI assistance only where needed -> human review and edit -> structured case data.

The initial source files are seed templates from one broker's real operating habits. They are not the only valid industry format. Other small brokerage circles may use similar documents with different wording, cell positions, sheet names, or local edits. Product design must support this variation without abandoning the deterministic skeleton.

## 2026-06-24 Input System Direction

The input system should not be a raw upload page.

The frontstage job is to help the broker decide where material belongs, then read and structure it. Upload is only one method inside this larger input workflow.

Correct mental model:

```text
Create or choose owner
  -> add material
    -> read candidates
      -> review/edit only the uncertain or missing parts
        -> save confirmed facts to the owner
          -> reuse those facts in workbench and outputs
```

Supported owners:

- `Case`: a concrete brokerage workflow such as rental application, rental mandate, sale mandate, quote preparation, contract preparation, renewal, or cancellation.
- `Subject`: a reusable person or company, including applicant, owner, tenant, buyer, seller, guarantor, emergency contact, broker, or management company.
- `Property`: a reusable real-estate object, including building, room, address, rent, fees, management, and ownership facts.
- `Unassigned Intake`: temporary holding for material whose owner is not clear yet.

Product rules:

- A user may create a case, subject, or property before uploading any file.
- New object creation should open the relevant editing workflow with expected fields present, even when every value is empty.
- Uploading files can create a new owner only when the user explicitly chooses that path.
- Uploading files into an existing owner should update candidates for that owner, not create a random case.
- Multi-file upload is allowed when the files belong to the same chosen owner. If multiple customers/properties/cases are mixed, the product must split or ask for assignment before writing confirmed facts.
- Unassigned material may be read and previewed, but cannot silently update case, subject, or property records.
- Input should not be optimized around guarantee-company output readiness. Output-specific checks belong in output workflows.

Today-level optimization target:

1. Make `建档导入` a clear object-routing surface, not an upload-only page.
2. Make `整理信息` the object index and editing entry for case, subject, property, and unassigned material.
3. Make every create action land in an editable object page with auto-save/draft safety.
4. Keep batch file reading available after the owner is chosen, so documents can bulk-fill an existing record.
5. Keep output checks out of the input/editing surface except for explicit output workflows.

## 2026-06-27 Implementation Checkpoint

Implemented in the current codebase:

- `/import-center` now presents intake as material routing: new case, existing case, or unassigned intake.
- `/organize-center` now lists cases, subjects / related parties, properties, and unassigned intake from one object index.
- `/cases/new` creates a blank brokerage case and redirects into the case workbench.
- `/parties/new` creates a subject / related-party profile instead of only inserting a placeholder row.
- `/properties/new` creates a property profile with basic location and cost fields.
- identity-document upload supports multiple files with count and size validation.
- case workbench fields can be saved from individual field cards.

Still not complete:

- The homepage and organize-center layout still need broker-facing simplification and visual rhythm improvements.
- Advanced import mapping remains available and should not become the ordinary broker path.
- Subject and property profiles are much shallower than the case workbench and need richer object-specific information trees.
- The memory driver remains a development convenience, not reliable pilot persistence.

## Source Files Reviewed

Source folder:

`/Users/laineyzhu/Desktop/房产专家资料库`

Files:

| File | Document Type | Product Meaning |
| --- | --- | --- |
| `14_a-03.xlsx` | `重要事項説明書（区分所有建物の売買・交換用）` | Important matters explanation source file for apartment/unit sale or exchange |
| `5_ippan_kubun.xlsx` | `区分所有建物用売買契約書（一般売主）` | Sale contract source file for apartment/unit sale with general seller |
| `5_ippan_kubun(1).xlsx` | Duplicate of `5_ippan_kubun.xlsx` | Ignore as duplicate unless user confirms a version difference |
| `kokuchisyo_kubun.2205.xlsx` | `物件状況確認書（告知書／区分所有建物用）` | Seller disclosure / property condition notice source file |

## Product Interpretation

These files are V1 input-side source documents.

Expected product behavior:

1. User uploads one or more known Excel source files.
2. System identifies the document type and version.
3. System extracts key fields and shows source cell references.
4. User reviews, edits, accepts, rejects, or marks fields as unknown.
5. Confirmed fields are saved into structured case data.
6. Structured data can later fill product outputs. The only current V1 generated output is the guarantee-company application (`保証会社申込書`). Other output families remain future candidates or compatibility examples.

The system must preserve user trust by making every extracted field reviewable and traceable.

User-facing principle:

Do not ask ordinary brokers to "map fields" as the main task. Mapping is an internal system concept. The product should say:

- system has identified likely fields
- please review
- confirm, edit, or mark unknown
- source location is shown for trust

Preferred user-facing language:

- `自動識別`
- `抽出候補`
- `確認`
- `修正`
- `採用`
- `不明として保留`

Avoid user-facing language unless in an advanced/debug context:

- `mapping`
- `field mapping`
- `schema`
- `target field`
- `source column`

## AI Role

AI is a supplement, not the core source of truth.

### Deterministic First

For known files, use rule-based extraction:

- workbook hash or structural fingerprint
- sheet names
- title cells
- fixed cell/range mapping
- data validation lists
- formula relationships

Rule extraction should be treated as high-confidence and auditable.

### AI Assist

AI may help with:

- unknown or modified templates
- OCR text from scanned PDFs
- long remarks and free-text summarization
- matching extracted text to known field definitions
- proposing values for ambiguous fields
- identifying missing or conflicting fields

AI output must be saved as suggestions with confidence and source evidence, not as final confirmed facts.

### AI Correction Learning

User review is also a backstage learning signal.

When the user saves extraction review or proceeds from the case workbench, the system should compare the original AI/rule candidate snapshot with the user-confirmed snapshot and create correction events.

Important distinction:

- If AI proposed a value and the user corrected it, record an extraction or normalization error.
- If the source file did not contain the value and the user manually filled it, record user completion, not AI failure.
- If multiple files disagree and the user chooses one, record conflict resolution.
- If the user changes wording because of team habit, record user/team preference, not a global rule.

These events should feed scoped experience updates and regression samples. They should not automatically mutate global extraction rules.

### Template Variation Handling

The product should distinguish four levels of input confidence:

1. `known_exact`: known file hash / exact structural fingerprint. Use deterministic cell mapping.
2. `known_variant`: same document type and required title signals, but positions or wording differ. Use rule extraction where possible and AI-assisted field matching for changed areas.
3. `similar_unknown`: resembles a known document family but lacks enough required signals. Use AI only to propose document type and field candidates.
4. `unknown`: no reliable match. Treat as generic Excel input or request user mapping.

For `known_variant` and `similar_unknown`, AI may propose:

- likely document type
- likely template family
- field-to-cell candidates
- normalized field values
- missing fields
- conflicts between files

AI must also return source references or textual evidence. Suggestions without evidence should stay unconfirmed.

### Human Review Required

All extracted fields enter a review state:

- extracted
- confirmed
- edited
- rejected
- unknown

No legal, contract, money, party, or property data should be silently finalized without review.

## Core Data Object

V1 input should introduce or emulate a structured `Case Data` concept.

Recommended semantic object:

`BrokerageCase`

Initial case type:

`unit_sale` / `区分所有建物売買`

The case connects:

- property
- seller
- buyer
- brokerage company / agent
- transaction terms
- important matters
- property condition disclosure
- source files
- extraction review state
- guarantee application draft/output state, when the case moves to rental guarantee output

If implementation cannot add a full case model immediately, use import job metadata plus property/party records as a transitional storage layer, but do not lose the product concept.

Output-side note:

The only current V1 output target is `保証会社申込書`, using the five initial guarantee company PDF templates documented in `docs/product/V1_GUARANTEE_APPLICATION_OUTPUT.md`. Input fields should therefore prioritize reusable property, lease, applicant, emergency contact / guarantor, co-occupant, brokerage, and management company facts needed by those templates.

## Review / Save Architecture

PM decision:

Do not keep confirmed business facts only inside `ImportJob` metadata.

Use three layers:

1. `ImportJob`: source file and raw extraction result.
2. `ExtractionReview`: field-level review state, source evidence, and user decision.
3. `BrokerageCase`: confirmed case-level business facts used by later outputs.

### ImportJob Role

Stores upload and extraction evidence:

- source file name
- source file hash
- detected document type
- template version
- raw extraction payload
- extraction status

It should not be treated as the long-term business data container.

### ExtractionReview Role

Stores reviewable field decisions:

- case id
- import job id
- field key
- label
- extracted value
- normalized value
- edited value
- final value
- source file hash
- source sheet
- source cell / source range
- extraction method
- confidence
- review status: suggested / accepted / edited / unknown / rejected
- reviewed by
- reviewed at

This is the trust layer. It answers who confirmed what, from which source, and whether the value was edited.

### BrokerageCase Role

Stores the confirmed case data used by the product:

- case id
- case type
- case title
- primary property id, when available
- status
- confirmed data JSON
- source import job ids
- created at / updated at

For V1, `confirmedDataJson` is acceptable. Do not prematurely create columns for every legal/document field. High-frequency fields can be columnized later after the model stabilizes.

Recommended initial case type:

`unit_sale` / `区分所有建物売買`

### Save Flow

1. User uploads a source file.
2. System extracts candidates and shows review UI.
3. User marks each candidate as accepted, edited, unknown, or rejected.
4. User saves review.
5. System creates or updates a `BrokerageCase`.
6. System stores `ExtractionReview` items.
7. System materializes accepted/edited values into `BrokerageCase.confirmedDataJson`.
8. System keeps source evidence and review status available for later audit and output generation.
9. System writes a correction event when the confirmed value differs from the AI/rule candidate in a meaningful way.
10. System may create an experience update draft or regression sample when the correction pattern is repeated or output-critical.

### V1 Save Non-Goals

- No complex multi-user approval workflow.
- No full legal compliance automation.
- No complete conflict-resolution engine yet.
- No AI-based final saving.
- No direct AI mutation of durable rules from a single user edit.
- No broad field columnization.
- No silent overwrite of existing confirmed fields.

If multiple reviewed files later write the same field, show a conflict state instead of silently replacing the confirmed value.

## Field Modules

### 1. Source File Metadata

Fields:

- source file name
- source file hash
- detected document type
- detected template version
- sheet name
- uploaded by
- uploaded at
- extraction status
- review status

Document types:

- `important_matters_unit_sale`
- `sale_contract_unit_general_seller`
- `property_condition_notice_unit`
- `unknown_excel`

### 2. Property Identity

Fields:

- property name
- building name
- room number
- residential address
- registry location
- building location
- house number
- exclusive unit name
- area
- address notes

Source examples:

- Important matters: `不動産の表示等`, `名称`, `住居表示`, `棟`, `階`, `号室`
- Contract: `売買の目的物の表示`, `名称`, `所在`, `家屋番号`, `建物の名称`
- Notice: `物件名`

### 3. Building Details

Fields:

- building structure
- roof type
- floor count above ground
- floor count below ground
- total floor area
- exclusive unit floor area
- unit floor area basis: wall center / registry
- building type
- new construction date
- attached building details

Source examples:

- Important matters: structure, scale, floor area, new construction date
- Contract: building display section

### 4. Land / Site Right

Fields:

- site right registration status
- site right type
- land location
- land lot number
- land category
- land area
- site right ratio / ownership share
- land area total
- leasehold purpose
- leasehold type
- lease term start
- lease term end
- land owner name/address
- ground rent

Source examples:

- Contract section A: `敷地権`, `土地の表示`, `敷地権の表示`, `借地権の場合`
- Important matters land/site right section

### 5. Parties

Fields:

- seller name
- seller address
- seller count
- buyer name
- buyer address
- registered owner name
- registered owner differs reason
- broker company A/B
- brokerage company office address
- brokerage company phone
- brokerage license authority
- brokerage license number
- representative name
-宅地建物取引士 name
-宅地建物取引士 registration number
- agent office name
- agent office address
- agent office phone

Source examples:

- Important matters: `宅地建物取引業者`, `説明をする宅地建物取引士`, `売主の表示`
- Contract: seller/buyer header

### 6. Transaction Terms

Fields:

- transaction type / brokerage role
- sale price total
- included consumption tax
- deposit / earnest money
- intermediate payment 1 amount/date
- intermediate payment 2 amount/date
- remaining balance amount/date
- handover date
- ownership transfer date
- public dues adjustment start date
- management fee adjustment
- repair reserve adjustment
- penalty amount / percentage
- contract cancellation deadline
- special provisions

Source examples:

- Contract section B: `売買代金総額`, `手付金`, `中間金`, `残代金`
- Contract formulas:
  - remaining balance = sale price - deposit - intermediate payments
  - penalty / compensation formulas where present

### 7. Loan / Financing

Fields:

- loan application required
- loan amount
- loan deadline
- loan approval status
- financing contingency date
- lender / financial institution
- interest assumptions, if available

Source examples:

- Contract `融資` clause / marked section.
- Existing app quote/funding plan fields can partially overlap.

### 8. Important Matters

Fields:

- third-party occupancy
- rights and restrictions
- legal restrictions
- private road burden
- utilities / facilities
- management rules
- exclusive use rights
- expenses and arrears
- management association
- repair reserve
- documents delivered / available
- 35条 explanation date
- explanation person

Source examples:

- Important matters document sections I / II / III and numbered items.

V1 should not attempt full legal automation. It should start by extracting section-level facts and status fields with review.

### 9. Property Condition Notice

Fields from `告知書` should be modeled as questionnaire items with:

- item key
- item label
- status: none / past / current / yes / no / unknown, depending on item
- details
- repair status
- date or approximate date
- supporting document availability
- source cell/range
- review status

Initial questionnaire items:

1. rain leak / `雨漏り`
2. termite damage / `白蟻被害`
3. building defects / `建物の不具合`
4. water supply and drainage defects / `給排水施設の故障・漏水`
5. renovation / repair / remodel / use-change history
6. fire damage
7. asbestos survey record
8. building condition inspection
9. earthquake resistance documents
10. housing performance evaluation
11. new construction documents and developer name
12. soil contamination
13. noise / vibration / odor
14. nearby construction plans
15. radio wave interference
16. flood damage
17. surrounding facilities affecting property
18. past incidents / accidents
19. neighborhood agreements
20. other matters to transfer from seller to buyer

Management-related questionnaire items:

1. planned change to management fee / repair reserve
2. planned large-scale repairs
3. neighborhood association fees
4. management association meeting matters

### 10. Review and Evidence

Every extracted field should carry:

- field key
- display label
- extracted value
- normalized value
- source file id
- source sheet
- source cell or range
- extraction method: rule / ai / manual
- confidence
- review status
- reviewer edited value
- reviewed at

This is critical for trust and QA.

## V1 Input UX Requirements

### Input Center Flow

1. Upload source Excel.
2. System detects document type.
3. System shows detected type and confidence.
4. System extracts key fields into grouped review sections.
5. User reviews fields by group.
6. User confirms or edits extracted values.
7. System saves confirmed data into a case/property record.
8. User proceeds to property ledger or output center.

The UI should frame this as a review workflow, not a mapping workflow:

Upload file -> system auto-identifies fields -> broker checks highlighted candidates -> broker confirms or edits.

### Review Screen Sections

Recommended first implementation sections:

1. File detection
2. Property identity
3. Parties
4. Transaction terms
5. Important matters summary
6. Property condition notice questionnaire
7. Missing fields
8. Conflicts across files

### Missing and Conflict Handling

If multiple files provide the same field:

- show both values
- show sources
- ask user to choose final value

Examples:

- property name differs between contract and notice
- seller name differs between important matters and contract
- sale price exists in contract but not quote

## Implementation Slices

### Slice 1: Known Template Detection

Detect:

- `重要事項説明書（区分所有建物の売買・交換用）`
- `区分所有建物用売買契約書（一般売主）`
- `物件状況確認書（告知書／区分所有建物用）`

Do not use AI yet.

### Slice 2: Rule-Based Extraction Preview

Extract a small but meaningful field set:

- property name
- address / location
- room number
- building structure
- floor area
- seller
- buyer
- sale price
- deposit
- remaining balance
- management fee / repair reserve if present
- selected notice questionnaire statuses

Display source cells.

### Slice 3: Template Variation Support

Before saving extracted data, support controlled variation handling:

- structural fingerprint, not only file hash
- required title/sheet signal scoring
- known variant state
- source hash and template version
- field-level extraction confidence
- clear UI state: exact match / variant match / unknown
- user-facing review labels instead of mapping terminology

AI can be designed here, but should remain disabled or optional until the deterministic review flow works.

### Slice 4: Review and Save

Allow user to confirm/edit extracted values.

Review UI should be built around broker-friendly groups:

- 物件情報
- 売主・買主
- 取引条件
- 告知事項
- 不明・要確認

Each row should read like a business confirmation item:

`売買代金: 88,000,000円 / 出典: 売買契約書 B41 / [採用] [修正] [不明]`

Do not require the user to choose abstract source/target field names unless they open an advanced correction panel.

Minimum Review/Save MVP:

- Save accepted, edited, unknown, and rejected decisions.
- Create or attach to a lightweight case.
- Store review items with source evidence.
- Materialize accepted/edited fields into confirmed case JSON.
- Provide a simple read-only case summary page with confirmed fields, unknown fields, and source files.
- Store enough before/after evidence to classify AI corrections later.

Save into transitional structured data:

- property
- party/client where applicable
- import job / source evidence

If a full case model is not ready, preserve source evidence in import job metadata.

### Slice 5: AI Assist

Only after rule extraction review works:

- unknown template classification
- text extraction from OCR/PDF
- free-text summary
- suggested field matching
- template variant field matching
- wording normalization across broker-specific phrasing

AI suggestions must remain reviewable.

## Product Non-Goals for V1 Input

- No fully autonomous legal document completion.
- No AI-only extraction without source evidence.
- No silent overwrite of confirmed data.
- No full 35条 / 37条 legal compliance automation.
- No broad support for every Japan real estate form before the first three templates work well.
- No drag-and-drop PDF editor as part of input work.

## PM Acceptance Criteria

Input-side work is acceptable only when:

1. The system can identify at least the three known source document types.
2. Extracted fields are grouped in a reviewable interface.
3. Each field shows source evidence.
4. User can edit or reject extracted values before save.
5. Property-related confirmed values can flow into the property ledger.
6. The system does not present AI guesses as confirmed truth.
7. Existing Excel property row import remains compatible; any existing property overview PDF path is compatibility evidence only and is not a current V1 completion criterion.
