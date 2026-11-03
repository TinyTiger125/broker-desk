const LOCAL_APP_ORIGIN = "http://broker-desk.local";
const IMPORT_CENTER_RETURN_PATH = "/import-center";
const IMPORT_CENTER_ALLOWED_KEYS = new Set(["advanced", "object", "targetId"]);
const TARGET_ID_PATTERN = /^[A-Za-z0-9_-]{1,160}$/;

export type ImportCenterObject = "person" | "property";

/**
 * Keep the object target when a new-record form is entered from import center.
 * The result is a same-origin, route-scoped path suitable for a hidden returnTo
 * field. A bare import-center path is retained only for legacy entry links.
 * Object-scoped links are canonicalized to the advanced target-selection view
 * so the import-center legacy redirect cannot send the user back to the form.
 */
export function normalizeImportCenterObjectReturnTo(
  value: string | null | undefined,
  object: ImportCenterObject,
  allowBare = false,
): string | null {
  const path = String(value ?? "").trim();
  if (!path || !path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\") || path.includes("\\")) return null;

  const rawPathname = path.split(/[?#]/, 1)[0];
  let decodedPathname = rawPathname;
  try {
    decodedPathname = decodeURIComponent(rawPathname);
  } catch {
    return null;
  }
  if (decodedPathname.includes("\\") || decodedPathname.split("/").some((segment) => segment === "." || segment === "..")) return null;

  let parsed: URL;
  try {
    parsed = new URL(path, LOCAL_APP_ORIGIN);
  } catch {
    return null;
  }
  if (parsed.origin !== LOCAL_APP_ORIGIN || parsed.pathname !== IMPORT_CENTER_RETURN_PATH) return null;

  const keys = [...new Set([...parsed.searchParams.keys()])];
  if (allowBare && keys.length === 0 && !parsed.hash) return parsed.pathname;
  if (keys.some((key) => !IMPORT_CENTER_ALLOWED_KEYS.has(key)) || parsed.searchParams.get("object") !== object) return null;
  const advanced = parsed.searchParams.get("advanced");
  if (advanced && advanced !== "1") return null;
  const targetId = parsed.searchParams.get("targetId");
  if (targetId && !TARGET_ID_PATTERN.test(targetId)) return null;
  if (parsed.hash && parsed.hash !== "#target-selection") return null;
  const canonical = new URLSearchParams();
  canonical.set("advanced", "1");
  canonical.set("object", object);
  if (targetId) canonical.set("targetId", targetId);
  return `${parsed.pathname}?${canonical}${parsed.hash}`;
}
