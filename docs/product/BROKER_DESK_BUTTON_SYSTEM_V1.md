# Broker Desk Button System V1

## Scope

This is a visual contract for business actions. It does not replace existing button components, event handlers, form submission, permissions, data access, routing, or pending-state logic.

Specialist canvas controls such as drag handles, resize handles, overlay delete points, PDF calibration tools, and segmented editor controls keep their purpose-built geometry.

## Visual direction

- Style: restrained Swiss enterprise UI.
- Palette: white and cool gray surfaces, one navy primary action, red only for destructive actions, semantic colors only for an active status such as saving or saved.
- Type: the product sans stack; ordinary button labels are 14px, 20px line-height, weight 600.
- Shape: 8px radius and a 1px border for ordinary business actions. Choice chips may remain pill-shaped.
- Icon: 18px, with an 8px label gap.

## Sizes

| Size | Height | Use |
| --- | ---: | --- |
| Compact | 36px | dense toolbars and secondary table actions |
| Regular | 40px | default desktop business action |
| Touch | 44px | primary form actions, dialogs, and narrow-screen actions |

Control height and importance are separate. A secondary action may be 44px on touch screens without becoming visually primary.

## Hierarchy

1. `primary`: solid navy. One main completion action per action group.
2. `secondary`: white surface, strong gray border, navy text.
3. `quiet`: no promotional fill; used for low-emphasis navigation or clearing.
4. `danger`: red only for destructive or access-removal operations.
5. `status`: may temporarily use blue/green/neutral feedback while saving, saved, or unchanged.

Green, purple, orange, and arbitrary blue must not be used to make an ordinary action look important. Object-category colors may appear in icons, badges, or cards without recoloring the action hierarchy.

## Interaction states

- Hover: target lifts 1px and receives a restrained shadow.
- Pressed: target returns to the surface and scales to 0.98.
- Focus: 3px visible blue focus ring with 2px offset.
- Pending: `aria-busy`, wait cursor, stable label area, and explicit progress copy.
- Disabled: no lift, no press animation, and a clearly muted surface.
- Reduced motion: transforms and transitions are disabled.

## Source references

The architecture borrows the source-owned variant and size model from shadcn/ui, the action hierarchy and loading discipline from GitHub Primer, and pending/focus state semantics from React Aria. Broker Desk retains its own component and tokens.

- https://ui.shadcn.com/docs/components/base/button
- https://github.com/shadcn-ui/ui/blob/main/apps/v4/public/r/styles/default/button.json
- https://primer.style/product/components/button/
- https://react-aria.adobe.com/Button

## Enforcement

`src/app/globals.css` supplies the presentation-only compatibility layer for existing business buttons. `src/components/ui-foundation/` remains the preferred source for new buttons. `scripts/check-button-interaction-contract.mjs` prevents the shared type, radius, sizes, state feedback, and editor opt-out rules from disappearing.
