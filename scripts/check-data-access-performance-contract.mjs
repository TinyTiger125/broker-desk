import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(`data-access performance contract failed: ${message}`);
};

const hub = read("src/lib/hub.ts");
const data = read("src/lib/data.ts");
const memory = read("src/lib/data.memory.ts");
const postgres = read("src/lib/data.postgres.ts");
const searchRoute = read("src/app/api/hub/search/route.ts");
const organizePage = read("src/app/organize-center/page.tsx");
const searchBody = hub.slice(hub.indexOf("export async function searchHubItems"));
const postgresSearchBody = postgres.slice(postgres.indexOf("export async function searchVisibleRecordsForContext"));

assert(searchBody.includes("searchVisibleRecordsForContext"), "global search uses the bounded tenant read model");
assert(!searchBody.includes("listBrokerageCasesForContext"), "global search does not load the full visible case list");
assert(!searchBody.includes("listHubProperties"), "global search does not load the full visible property list");
assert(!searchBody.includes("listHubParties"), "global search does not load the full visible party list");
assert(data.includes("export const searchVisibleRecordsForContext"), "repository facade exports the bounded search read model");
assert(memory.includes("export async function searchVisibleRecordsForContext"), "memory repository implements the bounded search read model");
assert(postgres.includes("export async function searchVisibleRecordsForContext"), "Postgres repository implements the bounded search read model");
assert(postgres.includes("WITH case_hits AS") && postgres.includes("property_hits AS") && postgres.includes("party_hits AS"), "Postgres search uses one bounded union read");
assert((postgresSearchBody.match(/LIMIT \$4/g) ?? []).length >= 3, "each entity branch has its own result limit");
assert((postgresSearchBody.match(/AND \(current_owner_user_id = \$2 OR visibility_scope = 'company_read'\)/g) ?? []).length === 3, "each entity branch filters visibility before its result limit");
assert(postgres.includes("current_owner_user_id = $2") && postgres.includes("visibility_scope = 'company_read'"), "case search protects owner-only titles while retaining company-read labels");
assert(!postgresSearchBody.split("\n}", 1)[0].includes("SELECT *"), "search read model uses a projection instead of SELECT star");
assert(!searchBody.includes("localizeDemoText(locale, item.title)"), "search does not translate a title after matching a different stored value");
assert(searchRoute.includes('response.headers.set("Server-Timing"'), "search exposes parameter-free server timing for Staging measurement");
assert(searchRoute.includes("search;dur=") && searchRoute.includes("total;dur="), "server timing separates search work from total request time");
assert(data.includes("export const countVisibleRecordsForContext"), "repository facade exports bounded organize-center counts");
assert(memory.includes("export async function countVisibleRecordsForContext"), "memory repository implements organize-center counts");
assert(postgres.includes("export async function countVisibleRecordsForContext"), "Postgres repository implements organize-center counts");
assert(organizePage.includes('selectedType === "all"') && organizePage.includes("countVisibleRecordsForContext"), "organize-center selector uses counts instead of complete record lists");
assert(!organizePage.includes("[cases, parties, properties] = await Promise.all"), "organize-center does not load all three complete lists together");

console.log("data-access performance contract: PASS");
