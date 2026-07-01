# Homepage Revision Review 2026-06-27

## Evidence

- `01-home-default.png`: desktop full page after the first revision pass.
- `02-home-case-filter.png`: desktop case-filter state after the first revision pass.
- `03-home-mobile-first.png`: mobile first viewport before final mobile order adjustment.
- `04-home-mobile-first-task-first.png`: mobile first viewport after moving the recommended task above search.

## Acceptance Status

### P0

- First-screen clarity: pass. The recommended work item, blocker reason, and primary action are now dominant.
- Relationship map meaning: pass. The map is centered on a case and each node explains status or blocker reason.
- Work queue priority: pass. Pending objects remain first and the recommendation uses the same pending object model.
- Filter feedback: pass. Category filters still land at the object list and show active state.
- Natural localization: pass by smoke check. Chinese workflow terms remain translated while Japanese proper nouns remain source data.

### P1

- Category summaries: improved. They now read more like filters than large dashboard panels.
- Selected item action panel: improved. It now leads with blocker reason and recommended action before secondary details.
- Visual hierarchy and density: improved. The page still has a lot of operational information, but the first decision is clearer.
- Mobile usability: improved. The 390px viewport shows the recommended task and primary action first, with account/language collapsed.
- Accessibility basics: partially improved. Decorative navigation icons were marked hidden; a full keyboard and screen-reader pass is still needed.

## Remaining Notes

- The relationship center card still has some unused vertical space when the right-side node area is taller.
- Recent updates remain useful but secondary; consider hiding or collapsing them on mobile in a later pass.
- Material Symbols may still appear in raw text extraction, but the updated navigation icons are marked `aria-hidden`.

## Checks

- `npm run lint -- --quiet`: passed.
- `npx tsc --noEmit --pretty false`: passed.
- `npm run test:ja-terms`: passed.
- `npm run test:case-field-catalog`: passed.
