import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../src/lib/auth-mode.ts", import.meta.url), "utf8");
const transformed = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { resolveBrokerDeskAuthMode } = await import(`data:text/javascript,${encodeURIComponent(transformed)}`);

const cases = [
  [{}, "disabled"],
  [{ clerkConfigured: true }, "clerk"],
  [{ configuredProvider: "clerk" }, "clerk"],
  [{ configuredProvider: "supabase" }, "supabase"],
  [{ configuredMode: "supabase" }, "supabase"],
  [{ configuredMode: "demo", configuredProvider: undefined }, "demo"],
  [{ configuredMode: "trusted_header", configuredProvider: undefined }, "trusted_header"],
];

for (const [input, expected] of cases) {
  const actual = resolveBrokerDeskAuthMode(input);
  if (actual !== expected) throw new Error(`auth mode mismatch: ${JSON.stringify(input)} -> ${actual}; expected ${expected}`);
}

for (const input of [
  { configuredProvider: "unknown" },
  { configuredMode: "typo", configuredProvider: "supabase" },
  { configuredMode: "clerk", configuredProvider: "supabase" },
  { configuredMode: "supabase", configuredProvider: "clerk" },
]) {
  let failedClosed = false;
  try {
    resolveBrokerDeskAuthMode(input);
  } catch (error) {
    failedClosed = error instanceof Error && ["unsupported_auth_provider", "unsupported_auth_mode", "auth_mode_provider_mismatch"].includes(error.message);
  }
  if (!failedClosed) throw new Error(`invalid auth configuration did not fail closed: ${JSON.stringify(input)}`);
}

console.log(`auth provider behavior passed (${cases.length} valid + 4 fail-closed cases)`);
