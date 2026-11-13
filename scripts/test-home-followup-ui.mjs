import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const modules = new Map();

function loadRouteModule(request) {
  if (request === "next/link") {
    return { default: ({ children, ...props }) => React.createElement("a", props, children), __esModule: true };
  }
  if (request === "next/navigation") return { redirect: () => { throw new Error("unexpected redirect"); } };
  if (request === "@/app/actions") return { changeTaskStatusAction: () => { throw new Error("unexpected action"); } };
  if (request === "@/components/home-module-preferences") {
    return {
      HomeModule: ({ children }) => React.createElement(React.Fragment, null, children),
      HomeModulePreferences: ({ children }) => React.createElement(React.Fragment, null, children),
    };
  }
  if (request === "@/components/ui-icon") return { UiIcon: () => null };
  if (request === "@/components/work-center-task-action") return { WorkCenterTaskSubmitButton: () => null };
  if (request === "@/lib/closed-beta-demo-fixture") {
    return { ClosedBetaDemoSeedError: class ClosedBetaDemoSeedError extends Error {} };
  }
  if (request === "@/lib/data") {
    return {
      getWorkCenterSnapshotForContext: async () => ({}),
      listBrokerageCasesForContext: async () => [],
      seedClosedBetaDemoData: async () => undefined,
    };
  }
  if (request === "@/lib/demo-localization") return { localizeDemoBrokerageCase: (_locale, item) => item };
  if (request === "@/lib/format") return { formatDate: (value, locale) => `${locale}:${value.toISOString().slice(0, 10)}` };
  if (request === "@/lib/home-resumable-work") return { buildHomeResumableWork: () => [] };
  if (request === "@/lib/hub") return { listHubImportJobs: async () => [] };
  if (request === "@/lib/locale") return { getLocale: async () => "ja" };
  if (request === "@/lib/tenant-recovery") return { getHomeTenantSelectionRecoveryPath: () => undefined };
  if (request === "@/lib/tenant-session") {
    return {
      TenantSessionError: class TenantSessionError extends Error {},
      requireTenantSession: async () => ({}),
    };
  }
  if (request === "@/lib/visibility-resolver") return { createRequestContext: () => ({}) };
  if (request === "@/lib/work-center") return { buildWorkCenterModel: () => ({}) };
  if (!request.startsWith("@/")) return require(request);

  const base = path.resolve(root, "src", request.slice(2));
  const filename = [base + ".ts", base + ".tsx"].find((candidate) => fs.existsSync(candidate));
  assert(filename, `unresolved route dependency: ${request}`);
  if (modules.has(filename)) return modules.get(filename).exports;

  const module = { exports: {} };
  modules.set(filename, module);
  let source = fs.readFileSync(filename, "utf8");
  if (request === "@/app/page") {
    source = source.replace("function WaitingRows(", "export function WaitingRows(");
    assert.notEqual(source, fs.readFileSync(filename, "utf8"), "test fixture must expose WaitingRows without exporting it from the Next.js page");
  }
  const compiled = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  new Function("require", "module", "exports", compiled.outputText)(loadRouteModule, module, module.exports);
  return module.exports;
}

const { WaitingRows } = loadRouteModule("@/app/page");
const copy = {
  collapse: "閉じる",
  emptySubtitle: "既存データが追加されると、ここに表示されます。",
  noItems: "該当する項目はありません。",
  noNextAction: "次の対応が未設定",
  nextAction: "次の対応",
  open: "開く",
  readOnly: "閲覧のみ",
  showMore: "もっと見る",
  stale: "しばらく更新されていません",
};
const model = {
  waitingClients: [
    { canWrite: true, client: { id: "client/a", lastContactedAt: new Date("2026-11-13T00:00:00Z"), name: "山田 太郎", nextFollowUpAt: new Date("2026-11-15T00:00:00Z") } },
  ],
  noNextActionClients: [
    { canWrite: false, client: { id: "client/b", lastContactedAt: undefined, name: "佐藤 花子", nextFollowUpAt: undefined } },
  ],
  staleClients: [],
};
const html = renderToStaticMarkup(WaitingRows({ model, copy, locale: "ja" }));
const pageSource = fs.readFileSync(path.resolve(root, "src/app/page.tsx"), "utf8");
const waitingModuleStart = pageSource.indexOf('<HomeModule id="waiting">');
const agendaModuleStart = pageSource.indexOf('<HomeModule id="agenda">', waitingModuleStart);
assert(waitingModuleStart >= 0 && agendaModuleStart > waitingModuleStart, "home route must keep a bounded waiting module");
const waitingModule = pageSource.slice(waitingModuleStart, agendaModuleStart);
assert.doesNotMatch(waitingModule, /href="\/clients"[\s\S]*?\{copy\.open\}/, "waiting module must not render a right-side open link");

assert.match(html, /class="divide-y divide-slate-100"/, "follow-up rows must retain a concise divider");
assert.match(html, /href="\/clients\/client%2Fa#client-follow-ups"/, "waiting row must navigate to the linked client's follow-ups");
assert.match(html, /href="\/clients\/client%2Fb#client-follow-ups"/, "no-next-action row must navigate to the linked client's follow-ups");
assert.doesNotMatch(html, />開く<|>閲覧のみ</, "waiting rows must not render a right-side open/read-only action");
const links = [...html.matchAll(/<a href="([^"]+)" class="([^"]*)">([\s\S]*?)<\/a>/g)];
assert.equal(links.length, 2, "each waiting row must render one linked record target");
for (const [, href, className, body] of links) {
  assert.match(className, /(^| )cursor-pointer( |$)/, `${href}: row target must expose pointer interaction`);
  assert.match(body, /(?:山田 太郎|佐藤 花子)/, `${href}: client name must be inside the clickable row target`);
  assert.match(body, /(?:次の対応|次の対応が未設定)/, `${href}: row body must be inside the clickable row target`);
}
assert.doesNotMatch(html, /bg-(?:red|amber|blue|emerald|slate)-/, "waiting rows must not use category background colors");

console.log("home follow-up UI behavior: PASS");
