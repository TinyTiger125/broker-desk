# Frontstage Flow Audit - 2026-06-06

## Source Of Truth

- Product blueprint: `docs/product/PRODUCT_TOPOLOGY.md`
- Stitch decision: `docs/archive/stitch/STITCH_V2_IMPLEMENTATION_DECISION.md`
- User-facing flow: `資料を入れる -> 情報を整理する -> 申込書を出す`

## Captured Screens

- `01-home-final2.png` - Workbench entry and next task
- `02-import-final.png` - Input center
- `03-case-workbench-final.png` - Case workbench and missing-item correction
- `04-output-final.png` - Guarantee application output
- `05-templates-final2.png` - Guarantee application template management

## Blueprint Comparison

| Blueprint step | Current screen | Result |
| --- | --- | --- |
| Start from one clear production line | Global shell shows `1 資料を入れる / 2 情報を整理する / 3 申込書を出す` | Pass |
| User first sees next task, not module sprawl | `/` shows current case, missing item count, next action, recent inputs, and output readiness | Pass |
| Input should be simple and not expose mapping by default | `/import-center` shows identity upload, application material upload, next-step link; ledger import details are collapsed | Pass |
| Workbench remains product center | `/cases/[id]` opens on missing/attention queue and company-specific draft before deeper data tables | Pass |
| Output focuses on guarantee applications | `/output-center` shows missing checklist first, then 5 guarantee company templates; old outputs are folded | Pass |
| Template management should match current product boundary | `/templates` is now guarantee application template management, not a generic lease document editor | Pass |

## Checks Performed

- `npm run lint` passed.
- `git diff --check` passed.
- `npm run build` passed.
- Browser screenshots captured for five frontstage pages.
- Browser console error check: 0 errors on captured pages.
- Primary screen text scan found no visible `URGENT ACTION`, `Status:`, `overlay:`, schema, or mapping terms.

## Remaining Intentional Boundary

- Auxiliary pages such as ledger, clients, quotes, contracts, and AI experience review remain under `補助業務`. They are intentionally not promoted into the normal broker workflow.
- PDF preview/calibration remains a specialized official-form editor. It is part of step 3, not a generic template builder.
