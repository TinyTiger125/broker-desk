# Homepage Second Pass Review 2026-06-27

## Evidence

- `01-home-default.png`: desktop full-page state.
- `02-home-case-filter.png`: desktop case-filter state.
- `03-home-mobile-first.png`: mobile first viewport at 390px width.

## Changes Reviewed

- Moved unassigned material queue out of the relationship-node column into its own full-width row.
- Kept the selected item action panel available on mobile, but hid recent updates below the desktop breakpoint.
- Marked additional app-shell icons as decorative for assistive technology.

## Acceptance Notes

- Relationship map density improved. The center case card no longer stretches into a large empty block because unassigned materials no longer inflate only the right column.
- Mobile first viewport remains task-first: the recommended case, blocker, and primary action are visible before search and secondary content.
- Recent updates remain available on desktop but no longer lengthen the mobile flow.
- Category filters remain compact and readable.

## Remaining Risks

- Full screen-reader behavior still needs a real assistive-technology pass.
- Keyboard focus order should be manually tab-tested before final launch sign-off.
- The app shell is better on mobile, but a future dedicated mobile navigation pattern would still help.

## Checks

- `npm run lint -- --quiet`: passed.
- `npx tsc --noEmit --pretty false`: passed.
- `npm run test:ja-terms`: passed.
- `npm run test:case-field-catalog`: passed.
