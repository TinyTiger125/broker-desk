# DESIGN.md

> Historical design-contract candidate imported from the original governance
> snapshot. It is not the product, architecture, task, or progress authority.
> Its unique decisions will be reviewed and split into the appropriate
> documents in a later task. This baseline does not perform that split.
# Broker Desk Design Language

> Status: active
>
> Updated: 2026-08-11
>
> Scope: all Broker Desk frontstage and backstage interfaces.

This document is the implementation contract for visual design and interaction
behavior. It is not a mood board. A screen that conflicts with this document
must be changed, or this document must be deliberately revised with the product
reason recorded in the relevant change.

## 1. Product Position

Broker Desk is an operational workbench for Japanese real-estate brokers. It
turns scattered source material into structured records and then into accurate
business documents.

The interface must help a broker answer three questions immediately:

1. What am I working on?
2. What needs an action now?
3. What happened after my action?

It is not a marketing website, a generic CRM, a task-management product, a PDF
editor for ordinary users, or an AI chat interface. The product should feel
calm, direct, and dependable when the user is processing many cases.

### Non-goals

- Do not add explanatory product copy merely to describe a feature.
- Do not expose implementation details, AI reasoning, internal field keys,
  database states, model confidence mechanics, or technical error text.
- Do not make guarantee-application output visually dominate the product. It is
  one output type in a broader record-management workflow.
- Do not use decorative gradients, floating panels, nested cards, or ambiguous
  colour as a substitute for hierarchy.

## 2. Design Principles

### 2.1 Workflow before navigation

Navigation names stable product areas. A page presents the next meaningful
choice in that area. A user must never have to infer a workflow from unrelated
buttons placed side by side.

### 2.2 State must be visible and singular

Every highlight, badge, button state, and empty state has one defined meaning.
The same colour or treatment must not mean selection in one component and
completion in another.

### 2.3 Confirmed facts are the product boundary

The product may read, suggest, and compare source material. It must distinguish
between a read value, a value waiting for review, and a confirmed record. The
screen explains the action available to the user, not the system's private
reasoning.

### 2.4 Density is adjustable, not indiscriminate

Broker work needs high information density, but not unstructured density.
Lists, tables, and review stations should support scanning. Detail pages should
reveal context only when it is needed for the current action.

### 2.5 Each action has an outcome

Clicking a control must result in one of: a visible state change, a clear next
step, a completed result, or an actionable error. Silent success is a defect.

## 3. Product Information Architecture

### 3.1 Primary navigation

The primary application rail contains only the four workflow areas:

| Area | User purpose | Canonical route |
| --- | --- | --- |
| Workbench | Choose the next business action or locate a record | `/` |
| Input | Create a record or read source material | `/import-center` |
| Organize | Find and maintain cases, parties, properties, and unassigned material | `/organize-center` |
| Output | Select a case, choose a document, preview, and produce a file | `/output-center` |

The primary rail is not a catalogue of every feature. Template library,
workspace settings, team membership, required-field policy, document headers,
and platform account management belong in the utility/settings menu.

### 3.2 Role boundaries

| Role | May use | Must not see as an ordinary workflow action |
| --- | --- | --- |
| Broker / workspace member | Input, organize, output, template library, workspace-local templates | Official template authoring, publication controls, platform account lifecycle |
| Workspace administrator | Member and workspace configuration as permitted | Platform-wide official template publication unless separately authorized |
| Platform owner | Official template authoring, publication, version history, platform lifecycle | None within authorized backstage tools |

Official template authoring is backstage factory work. The template library is
the frontstage discovery and installation surface. They must not be merged into
one ambiguous page.

### 3.3 Back navigation

A detail or review page provides a visible return control only when it returns
to its immediate parent list or selection surface. It must name that surface:

- `返回整理对象`
- `返回案件列表`
- `返回模板库`

`返回工作台` is not acceptable as a generic escape hatch because Workbench is
already reachable from primary navigation.

## 4. Layout System

### 4.1 Application shell

- Desktop shell: persistent dark navigation rail, stable top utility bar, and
  one scrollable content region.
- The shell must not disappear or resize while a route is loading.
- Main navigation labels can collapse to icons only with tooltips and a clear
  selected state. The compact rail is a responsive density mode, not a second
  navigation system.

### 4.2 Content widths

Avoid a narrow desktop column surrounded by unused canvas. Use the page type to
set width rather than applying one max-width to every route.

| Page type | Container rule | Intended use |
| --- | --- | --- |
| Decision / dashboard | `min(100% - 56px, 1600px)` | Workbench and selection screens |
| Dense list / review workspace | `min(100% - 48px, 1840px)` | Organize tables, extraction review, template editor |
| Focused form | `min(100% - 56px, 1280px)` | New record and settings forms |
| Modal / confirmation | fixed readable max width | irreversible or scoped decisions |

Use 24px outer padding on standard desktop screens and 32px on wide screens.
At widths below 1024px, use responsive stacks rather than preserving unreadable
two- or three-column layouts.

### 4.3 Spacing and shape

The spacing scale is 4, 8, 12, 16, 24, 32, and 48px. Components must use those
increments unless a fixed-format artifact requires a precise value.

| Element | Radius | Rule |
| --- | --- | --- |
| Inputs and buttons | 6px | Stable height; no layout shift on state change |
| Panels and cards | 8px | Use only for a distinct repeated item or framed tool |
| Modals | 8px | Never use oversized rounded marketing panels |
| Status tags | pill allowed | Only compact labels, never primary controls |

Sections are normally unframed bands with a heading and separator. Do not put
cards inside cards merely to create visual structure.

## 5. Token Contract

The existing palette should evolve through tokens, not per-page overrides.

| Token purpose | Value / direction | Use |
| --- | --- | --- |
| Canvas | `#F3F4F6` to cool neutral | Application background |
| Surface | `#FFFFFF` | Primary work surface |
| Subtle surface | `#F8FAFC` | Table headers and quiet grouped content |
| Main ink | near `#172033` | Titles and primary text |
| Muted ink | neutral blue-grey | Secondary metadata only |
| Rail | near `#172033` | Persistent navigation |
| Primary | cobalt near `#315CE9` | Current workflow location and primary action |
| Success | restrained green | Confirmed or completed state |
| Warning | restrained amber | Requires attention, not failure |
| Danger | restrained red | Error, destructive action, or unconfirmed required item |
| Divider | low-contrast cool grey | Structural separation |

Typography should prioritize Chinese and Japanese legibility. Use regular
letter spacing. Do not use viewport-scaled font sizes or negative tracking.

## 6. State and Selection Semantics

The product currently risks treating black, pale blue, and badges as generic
emphasis. The following contract removes that ambiguity.

| Treatment | Meaning | Examples |
| --- | --- | --- |
| Solid cobalt in primary rail | Current workflow area | Input, Organize, Output |
| Solid navy in a local directory | Current category or section | Current group in a case directory |
| Pale blue fill plus primary outline/left edge | Selected record or focused row | Selected field group or table row |
| Very light blue hover | Hover only | Clickable record on pointer hover |
| Blue focus ring | Keyboard focus only | Input, button, list row |
| Green tag/check | Confirmed or completed | Confirmed field, added template |
| Amber tag | Needs review or attention | Read value awaiting review |
| Red tag | Required input missing, error, or destructive risk | Missing required field |
| Neutral grey | Inactive, unavailable, or informational | Empty count, disabled action |

Pale blue must never be used as an unexplained background. It means the current
selection or keyboard focus context, and the same selection must be reflected in
the adjacent detail panel.

## 7. Page Contracts

### 7.1 Workbench

Workbench is a decision surface, not a report dump. It contains:

- the two primary action entries: `录入资料` and `输出文件`;
- a short, ranked list of records that require the user's action;
- searchable access to cases, parties, properties, source materials, and output
  files.

It does not include a simulated task/calendar system, oversized application
readiness module, or revenue block unless the underlying workflow has a real
owner and actionable next step.

### 7.2 Input

Input supports three explicit starting points:

1. Create a case, party, or property without source material.
2. Read source material into an existing target.
3. Read unassigned material and deliberately assign it after review.

The source-reading controls are compact. They must not occupy more space than
the review work they unlock. After source selection, the user always sees a
clear `读取并继续` or equivalent action and then a result screen that states
whether reading succeeded, requires review, or could not be completed.

### 7.3 Organize

Organize is the object index. It provides filters, lifecycle state, archive
access, and the ability to open a case, party, property, or unassigned source.
It must work when a broker creates only a contact, only a property, or a
partially formed case.

### 7.4 Record workbench and extraction review

Use a two-pane review model when the user is reading or confirming many values:

- left: compact local directory showing categories, material completion, and
  confirmed values or checks;
- right: the active field or field group, source evidence on demand, and the
  current edit action.

The directory is a visual table of what exists, not only a collection of
counts. A completed field must be legible there by name and value/check state.

Output-specific completeness checks do not belong in general information
organization. They belong in Output, after the user selects a case and a
document type.

### 7.5 Output

Output follows a fixed sequence:

1. Select a case.
2. Select an installed workspace template.
3. Review document-specific missing or conflicting items.
4. Preview the filled document.
5. Generate and record the output.

Only confirmed case data is eligible for automatic output. Document-specific
checks are presented here, not scattered through input and organization pages.

### 7.6 Template library and official authoring

The template library is the sole normal entry point for discovering official
templates, viewing a clear preview, seeing version information, and adding a
template to a workspace.

For platform owners, the selected official template shows a direct
`编辑官方模板` action. Do not retain a second low-fidelity list page merely as
an intermediate route to the same editor.

Every template card or selected-template detail shows:

- official / workspace-local status;
- installed status;
- source official version;
- latest updated timestamp;
- publication status where the viewer is authorized to see it.

Official authoring stores canonical normalized PDF coordinates, field bindings,
segmentation rules, layout overrides, source version, and QA state. Rendering
must use the same canonical PDF geometry across devices. Browser viewport,
display scaling, and local machine differences must never change output
placement.

## 8. Component Rules

### 8.1 Action tiles

Use action tiles only for a small set of mutually distinct starting actions.
Each tile has one verb, one sentence of outcome, and one visual route affordance.
Do not turn ordinary links into large tiles.

### 8.2 Tables and record indexes

For collections, use a data table or dense list with stable columns, filtering,
sorting, selection, and a details panel. A grid of large record cards is allowed
only for a small result set where visual inspection is required.

### 8.3 Review fields

Each field review unit contains:

- human field name;
- compact current state tag;
- input or selectable value;
- optional evidence disclosure;
- the local action that commits the field.

Never display internal data keys, model prompts, hidden policy rules, or a
paragraph explaining the system's judgement.

### 8.4 Confirmation feedback

When a field is confirmed:

1. The field action immediately enters a pending state and blocks duplicate
   submission.
2. On success, the field receives a brief success state.
3. The local directory updates its value/check and progress count.
4. If the active queue is sorted by outstanding work, the confirmed item exits
   that queue using a short, purposeful transition and the next unfinished item
   takes its place.

The motion should be 160-260ms, respect reduced-motion settings, and never hide
an error. The user must not need to search the page for proof that confirmation
worked.

### 8.5 Merge and assignment

Selecting an existing case or party is not the final action. The screen must
show the selected destination and expose an explicit command such as
`确认合并到 YU TIANYU` or `保存为新案件`. After completion, show the destination
record, changed-item count, and a direct `继续整理` action.

### 8.6 Lifecycle actions

Every case, party, property, and source material has lifecycle actions.

- Default action: archive, with a concise reason where appropriate.
- Archive view: filter, restore, and show the archived timestamp.
- Permanent deletion: available only from archive, requires explicit
  confirmation, and is blocked or clearly warned when linked outputs or audit
  records require retention.

Archive/delete controls must be discoverable from record detail and list-row
actions, not hidden only inside an unrelated settings area.

## 9. Loading, Performance, and Route Feedback

The user should perceive navigation as immediate. A blank page, old layout
flash, or generic skeleton that does not resemble the destination is not
acceptable.

### 9.1 Required behavior

- Keep the app shell and existing route geometry stable during navigation.
- Give the clicked navigation item immediate active/pending feedback.
- Do not show loading UI for a route resolved within 250ms.
- For a slower route, show one fixed-width route indicator centered in the
  visible content region. A marker travels from left to right across a fixed
  track; the track itself must not stretch and contract.
- Use skeletons only when their geometry matches the destination page. Never
  reveal a prior page's layout beneath a new route's loading state.
- Loading states must be accessible with a non-visual `正在加载` announcement.

### 9.2 Performance budgets

These are acceptance targets, not assumptions:

| Interaction | Target |
| --- | --- |
| Warm primary-route transition, p75 | <= 350ms |
| Normal authenticated route transition, p75 | <= 700ms |
| Visible loading feedback for slow route | starts after 250ms |
| Field confirmation acknowledgement | <= 300ms before pending feedback |

If a route misses these budgets, measure the server request, session lookup,
database query, and rendering boundary before adding a visual workaround.

### 9.3 Implementation guidance

- Prefetch primary navigation routes where practical.
- Fetch independent route data in parallel.
- Resolve the authenticated tenant session once per request and pass scoped
  context downward.
- Select only fields required by the current surface; defer expensive previews
  and noncritical data.
- Maintain loading components alongside their corresponding final page layouts.

## 10. Product Language

Use action and outcome language that a broker can act on:

| Use | Avoid |
| --- | --- |
| `读取资料` | `执行 OCR 管线` |
| `待确认` | `模型置信度不足` |
| `确认并保存` | `写入结构化数据` |
| `需要补充` | `缺少下游映射字段` |
| `查看来源` | `查看提取证据链` |
| `重新读取` | `重新运行解析器` |

Evidence may be shown only when it supports a user decision. It should identify
the source document and page, then offer a human action. Do not expose private
AI rationale in the frontstage UI.

Errors must be actionable and product-language based. A request ID may be shown
when support needs it; stack traces, raw SQL errors, internal state names, and
model/provider failures must stay out of the user-facing surface.

## 11. Accessibility and Input Quality

- Text and actionable controls meet WCAG AA contrast requirements.
- Keyboard focus is always visible and distinguishable from selection.
- Icon-only controls have tooltips and accessible labels.
- All confirmation, archive, deletion, upload, and template publication actions
  can be completed without a pointer.
- Motion respects `prefers-reduced-motion`.
- Button, field, badge, table row, and navigation dimensions are stable across
  loading, hover, focus, and validation states.

## 12. External Patterns We May Adopt

Use capabilities, not copied visual skins. New dependencies require a concrete
accessibility, maintenance, and bundle-size justification.

| Pattern source | Appropriate capability | Adoption rule |
| --- | --- | --- |
| shadcn/ui and Radix primitives | Accessible dialogs, menus, popovers, tooltips, tabs | Reuse primitives only when existing components cannot meet the interaction contract; keep Broker Desk tokens and language |
| TanStack Table | Large record tables with sorting, filters, selection, and virtualization | Introduce only when current lists are measurably too large or complex for the existing implementation |
| cmdk-style command menu | Cross-record search and keyboard quick navigation | Add only after global search has a real multi-object search contract |
| React Aria patterns | Complex keyboard focus and accessible collection behavior | Prefer standards-compliant behavior; do not add a second component system casually |
| Linear / Stripe-like operations UIs | Clear hierarchy, sparse decoration, reliable action feedback | Borrow interaction discipline, never branding or visual imitation |

The default is to improve current React components and tokens. A library is not
an answer to unclear workflow design.

## 13. Visual QA Checklist

Before accepting a frontstage UI change, verify:

1. The current workflow area, selected object, hover state, and keyboard focus
   are visually distinct.
2. The page shows one primary action hierarchy rather than a row of equal
   controls.
3. No internal language, raw identifiers, unexplained badges, or AI reasoning
   appears on the frontstage.
4. Wide desktop pages use the available workspace without uncontrolled empty
   canvas; narrow screens stack without clipping.
5. A route transition preserves the shell and has no blank/old-layout flash.
6. A successful save, confirmation, merge, archive, or template publication
   produces visible completion feedback.
7. The return control names the immediate parent surface.
8. Official-template updates display version and most recent update time.
9. Desktop and mobile screenshots contain no overlapping text or controls.
10. Existing behavior, tenant isolation, and template coordinate persistence
    still pass their focused regression checks.

## 14. Rollout Order

Visual work should be delivered in this order so design changes do not disguise
workflow defects:

1. Stabilize app shell, content-width rules, state semantics, and route loading.
2. Apply the component and language contract to Input, Organize, and Output.
3. Apply lifecycle, confirmation-feedback, and immediate-parent return rules.
4. Consolidate template library and official authoring boundaries.
5. Run desktop and mobile visual regression checks on all primary routes.

Do not begin a broad visual reskin before step 1 is verified. A polished shell
cannot compensate for an ambiguous workflow or a slow transition.
