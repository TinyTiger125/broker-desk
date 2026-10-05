import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");
const back = read("src/components/back-to-parent.tsx");
const layout = read("src/app/layout.tsx");
const nav = read("src/components/app-nav.tsx");
const routeTitle = read("src/components/app-route-title.tsx");
const styles = read("src/app/globals.css");
const fixture = read("scripts/local-navigation-fixture-server.mjs");
const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

expect(layout.includes("<BackToParent locale={locale} />"), "Root layout must mount one shared BackToParent control.");
expect(back.includes("usePathname"), "BackToParent must resolve the current route centrally.");
expect(back.includes('href: "/organize-center?type=case"'), "Case routes must return to the organize case selector.");
expect(back.includes('s[0] === "cases" && s.length > 1'), "Every nested case route must expose the shared control.");
expect(back.includes('s[0] === "clients" && s.length > 1'), "Every nested client route must expose the shared control.");
expect(back.includes('s[0] === "parties" && s.length > 1'), "Every nested party route must expose the shared control.");
expect(back.includes('s[0] === "properties" && s.length > 1'), "Every nested property route must expose the shared control.");
expect(back.includes('s[0] === "quotes" && s.length > 1'), "Every nested quote route must expose the shared control.");
expect(back.includes('s[0] === "guarantee-applications" && s.length > 1'), "Every nested guarantee application route must expose the shared control.");
expect(back.includes('s[0] === "guarantee-forms" && s.length > 1'), "Every nested guarantee form route must expose the shared control.");
expect(back.includes('s[0] === "platform" && s.length > 1'), "Every nested platform route must expose the shared control.");
expect(back.includes('s[0] === "settings" && s.length > 1'), "Every nested settings route must expose the shared control.");
expect(back.includes('s[0] === "workspace" && s.length > 1'), "Every nested workspace route must expose the shared control.");
expect(back.includes('href: "/platform/templates"'), "Template detail routes must return to the template list.");
expect(back.includes('href: "/workspace"'), "Nested workspace routes must return to workspace.");
expect(styles.includes(".bd-back-to-parent-link") && styles.includes("min-height: var(--bd-control-height-touch)"), "BackToParent must preserve a touch-sized keyboard target.");
expect(!nav.includes("business_center"), "The brand block must not use the decorative briefcase icon.");
expect(nav.includes("app-nav-mark") && nav.includes("BD"), "The collapsed sidebar must retain a compact product mark.");
expect(routeTitle.includes('party: "関係者資料"') && !routeTitle.includes('party: "主体資料"'), "party breadcrumbs must use the same business term as the relationship pages.");
expect(fixture.includes('server.listen(port, "127.0.0.1"'), "Browser fixture must bind to localhost only.");
expect(fixture.includes("fixture only; no app or data service loaded"), "Browser fixture must be explicitly isolated from app and data services.");

if (failures.length > 0) {
  console.error("Navigation consistency contract failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Navigation consistency contract passed.");
