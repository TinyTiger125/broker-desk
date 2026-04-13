# Broker Desk Handoff (Cursor-ready)

## Product Definition
A lightweight web workspace for real estate agents focused on:
1. client follow-up management
2. quotation generation and tracking

## Implemented Information Architecture
- `Dashboard`: `src/app/page.tsx`
- `Clients list`: `src/app/clients/page.tsx`
- `Client create`: `src/app/clients/new/page.tsx`
- `Client detail`: `src/app/clients/[id]/page.tsx`
- `Client edit`: `src/app/clients/[id]/edit/page.tsx`
- `Quotes list`: `src/app/quotes/page.tsx`
- `Quote create`: `src/app/quotes/new/page.tsx`
- `Quote detail`: `src/app/quotes/[id]/page.tsx`
- `Quote print`: `src/app/quotes/[id]/print/page.tsx`
- `Pipeline board`: `src/app/board/page.tsx`

## Navigation and Page Transitions
- Global nav: `src/components/app-nav.tsx`
- Header quick actions: `+ 新建客户`, `+ 新建报价`, global client search
- Dashboard -> Client detail via follow-up list
- Dashboard -> Quote detail via recent quote list
- Clients list -> Client detail / quick follow-up / new quote
- Client detail -> Edit client / New quote / Quote detail
- Client create -> Save -> Client detail
- Client create -> Save and create quote -> Quote create with `clientId`
- Quote create -> Save -> Quote detail
- Quote detail -> Duplicate -> New duplicated quote detail (versioned `v2/v3/...`)
- Quote detail -> Print page
- Board -> drag card across columns -> stage update API + automatic follow-up note

## Core Components
- KPI card: `src/components/kpi-card.tsx`
- Section container: `src/components/section-card.tsx`
- Client form (create/edit): `src/components/client-form.tsx`
- Quote calculator form: `src/components/quote-form.tsx`
- Board DnD: `src/components/board-kanban.tsx`
- Copy action: `src/components/copy-text-button.tsx`
- Print toolbar: `src/components/print-toolbar.tsx`

## Product Hooks Implemented
- Client-readable quotation summaries (short/formal): `src/components/quote-form.tsx`, `src/lib/quote.ts`
- Quotation warnings on calculator: `src/components/quote-form.tsx`, `src/lib/quote.ts`
- Follow-up priority engine for dashboard: `src/lib/followup-priority.ts`, `src/app/page.tsx`
- Quote comparison mode in detail page: `src/app/quotes/[id]/page.tsx`
- Timeline auto-events on quote create/revise: `src/lib/data.memory.ts`, `src/lib/data.postgres.ts`
- Stage suggestion card in client detail: `src/app/clients/[id]/page.tsx`

## Data Layer (Phase 1)
- Data adapter (driver switch): `src/lib/data.ts`
- In-memory repository: `src/lib/data.memory.ts`
- PostgreSQL/Supabase repository: `src/lib/data.postgres.ts`
- Data driver health API: `src/app/api/health/data/route.ts`
- Domain enums/guards: `src/lib/domain.ts`
- Label dictionaries/options: `src/lib/options.ts`
- Quote compute engine: `src/lib/quote.ts`
- Server actions: `src/app/actions.ts`
- Board stage API: `src/app/api/clients/[id]/stage/route.ts`

## Notes
- Current mode can switch by env: `DATA_DRIVER=memory|postgres`.
- Use `/api/health/data` to verify active driver and connection status.
- In memory mode, runtime writes reset after server restart.

## Cursor Prompt
```markdown
Build and refine a responsive web app for real estate agents to manage clients and quotations.

Use the existing Next.js App Router codebase. Keep current IA and routes:
- Dashboard
- Clients list
- Client create/edit/detail
- Quotes list/create/detail/print
- Pipeline board

Priorities:
1. Keep data-entry flow fast (especially client create and follow-up append).
2. Keep quotation calculator instant (left inputs, right real-time result).
3. Keep status tracking explicit (client stage + quote status).

Rules:
- Preserve route structure and current page transitions.
- Keep UI clean, business-focused, desktop-first and mobile-friendly.
- Avoid adding team permissions, accounting integrations, contract systems.
- Prefer incremental refactors with reusable components.

Phase 2 task target:
Use `DATA_DRIVER=postgres` with `DATABASE_URL` to run on PostgreSQL/Supabase while preserving current function signatures used by server actions and pages.
```
