# Homepage Review 2026-06-27

## Audit Scope

Broker Desk home page in Chinese, desktop default state, desktop case-filter state, and mobile first viewport.

Evidence:
- `01-home-default.png`
- `02-home-case-filter.png`
- `04-home-mobile-viewport.png`

## Step List

1. Default desktop home: generally healthy, but still information-heavy.
2. Case filter desktop state: improved and usable; filter feedback is now visible.
3. Mobile first viewport: usable, but not yet optimized; navigation and primary actions consume too much attention.

## Strengths

- The page now has a clear work-center structure: current work item, search, relationship area, object index, selected item, recent updates.
- Proper nouns stay in Japanese while business actions are localized into Chinese, which feels more natural for this product.
- The relationship area now reads as a case-centered map instead of four disconnected count cards.
- Clicking a category now lands near the list and shows a selected state, so the interaction no longer feels like a silent refresh.
- The main action path is present: continue organizing, add material, open selected item.

## UX Risks

- The first screen still asks the user to parse too many zones at once: current task, search, data relationship, pending count, category cards, list, selected item, and recent updates.
- The relationship map has structure, but it still lacks a strong next-step hierarchy. It shows what is connected, but not clearly which connected item blocks progress.
- The four summary cards are useful as filters, but visually compete with the relationship map and the list. They may be better as a compact filter bar.
- The right-side selected item is valuable, but it duplicates some row data and can feel secondary rather than acting like a true action panel.
- Mobile first viewport is functional but dense. Navigation, account controls, language controls, and role badge appear before the user's real work.

## Accessibility Risks

- The screenshots suggest many links are visually card-like; keyboard focus and screen-reader labels should be verified before launch.
- Several icon-plus-text controls depend on Material Symbols text in the DOM. Screen-reader output may include icon names unless hidden or labelled.
- Status badges use color plus text, which is good, but small text inside dense cards may be hard at zoomed sizes.
- Full accessibility compliance was not verified from screenshots alone.

## Recommendation

Current state is acceptable for an internal beta or guided launch, but not yet at "extreme optimization." The highest-value revision is to turn the homepage from a dashboard of everything into a sharper work queue:

1. Make "next item to handle" the dominant object.
2. Make the relationship map explain the blocking reason.
3. Compress the four category cards into a lighter filter row.
4. Turn the right panel into an action panel with fewer repeated facts.
5. Add a mobile-specific top layout that hides secondary navigation behind a menu.
