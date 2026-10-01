import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");
const component = read("src/components/header-popover.tsx");
const navigation = read("src/components/app-nav.tsx");
const styles = read("src/app/globals.css");
const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

expect(component.includes('"use client"'), "Header popover behavior must be isolated in a client component.");
expect(component.includes("const CLOSE_DELAY_MS = 200"), "Pointer leave must use the documented 200ms close delay.");
expect(component.includes("const pointerInsideRef = useRef(false)"), "Pointer presence must be tracked explicitly instead of relying on stale CSS hover state.");
expect(component.includes('menuRef.current?.matches(":hover")'), "Close scheduling must retain the browser hover guard while pointer events settle.");
expect(component.includes("pointerInsideRef.current = true"), "Pointer entry must mark the shared trigger/panel region as active.");
expect(component.includes("pointerInsideRef.current = false"), "Pointer leave must mark the shared trigger/panel region as inactive.");
expect(component.includes('document.addEventListener("pointermove"'), "Pointer movement outside the shared region must be observed even when a browser misses a descendant leave event.");
expect(component.includes("onPointerEnter={enterRegion}") && component.includes("clearCloseTimer();"), "Pointer entry must cancel a pending close.");
expect(component.includes("onPointerLeave={leaveRegion}") && component.includes("scheduleClose();"), "Pointer leave must schedule an automatic close.");
expect(component.includes("onMouseEnter={enterRegion}") && component.includes("onMouseLeave={leaveRegion}"), "Trigger and panel must share explicit mouse hover boundaries.");
expect(component.includes("const panelRef = useRef<HTMLDivElement>(null)"), "Panel focus must be tracked separately from trigger focus.");
expect(component.includes("panelRef.current?.contains(document.activeElement)"), "Only focus inside the panel may prevent pointer leave close.");
expect(component.includes('document.addEventListener("pointerdown"'), "Outside pointer interaction must close the menu.");
expect(component.includes('event.key === "Escape"'), "Escape must close the menu.");
expect(component.includes("summaryRef.current?.focus()"), "Escape close must return focus to the trigger.");
expect(component.includes("onFocusCapture={clearCloseTimer}"), "Focus entering the menu must cancel a pending close.");
expect(component.includes("event.relatedTarget"), "Focus leaving the menu must be checked before scheduling close.");
expect((navigation.match(/<HeaderPopover/g) ?? []).length === 4, "Mobile and desktop settings/account menus must use the shared component.");
expect(!navigation.includes('app-header-menu-panel right-0 mt-2'), "Header panels must not retain the old pointer gap utility.");
expect(styles.includes(".app-header-menu-panel") && styles.includes("margin-top: 0.25rem"), "Header panel spacing must remain within the shared hover grace area.");

if (failures.length > 0) {
  console.error("Header popover contract failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Header popover contract passed.");
