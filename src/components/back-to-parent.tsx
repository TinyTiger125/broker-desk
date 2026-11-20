"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { normalizeImportCenterObjectReturnTo } from "@/lib/import-center-return";
import type { Locale } from "@/lib/locale";

type ParentRoute = { href: string; label: Record<Locale, string> };
const labels = { zh: "返回上一级", ja: "上の階層へ戻る", ko: "상위로 돌아가기" } satisfies Record<Locale, string>;
const APP_ORIGIN = "http://broker-desk.local";
const CLIENT_LIST_KEYS = new Set(["q", "stage", "purpose", "temperature", "sort", "page"]);
const PROPERTY_LIST_KEYS = new Set(["q", "lifecycle", "sort", "page"]);
const ORGANIZE_CENTER_KEYS = new Set(["type", "q", "lifecycle", "page"]);
const IMPORT_CENTER_KEYS = new Set(["flow", "targetCaseId", "job", "xlsxJob", "intake", "advanced", "flash", "panel", "targetId"]);

function isSafeLocalPath(value: string): URL | null {
  const path = value.trim();
  if (!path || !path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\") || path.includes("\\")) return null;
  const rawPathname = path.split(/[?#]/, 1)[0];
  let decodedPathname = rawPathname;
  try { decodedPathname = decodeURIComponent(rawPathname); } catch { return null; }
  if (decodedPathname.includes("\\") || decodedPathname.split("/").some((segment) => segment === "." || segment === "..")) return null;
  try {
    const parsed = new URL(path, APP_ORIGIN);
    return parsed.origin === APP_ORIGIN ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeListReturnTo(value: string | null, pathname: string, allowedKeys: Set<string>, acceptedTypes?: Set<string>): string | null {
  const parsed = isSafeLocalPath(value ?? "");
  if (!parsed || parsed.pathname !== pathname) return null;
  const keys = [...new Set([...parsed.searchParams.keys()])];
  if (keys.some((key) => !allowedKeys.has(key))) return null;
  if (acceptedTypes && !acceptedTypes.has(parsed.searchParams.get("type") ?? "")) return null;
  return `${parsed.pathname}${parsed.search}`;
}

function normalizeImportCenterReturnTo(value: string | null, object: "person" | "property"): string | null {
  const parsed = isSafeLocalPath(value ?? "");
  if (!parsed || parsed.pathname !== "/import-center") return null;
  if (parsed.searchParams.has("object")) return normalizeImportCenterObjectReturnTo(value, object, true);
  const keys = [...new Set([...parsed.searchParams.keys()])];
  if (keys.some((key) => !IMPORT_CENTER_KEYS.has(key))) return null;
  const targetId = parsed.searchParams.get("targetId");
  if (targetId && !/^[A-Za-z0-9_-]{1,160}$/.test(targetId)) return null;
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

function normalizeClientEditReturnTo(value: string | null, clientId: string, flash: string | null): string | null {
  return normalizeListReturnTo(value, "/clients", CLIENT_LIST_KEYS)
    ?? normalizeListReturnTo(value, "/organize-center", ORGANIZE_CENTER_KEYS, new Set(["", "all", "client", "party"]))
    ?? normalizeImportCenterReturnTo(value, "person")
    ?? (() => {
      const parsed = isSafeLocalPath(value ?? "");
      return parsed?.pathname === `/clients/${encodeURIComponent(clientId)}` && parsed.searchParams.size === 0
        ? parsed.pathname
        : flash === "client_created" || flash === "entry_reused" ? "/clients" : null;
    })();
}

function resolveNewEntryParent(pathname: string, searchParams: URLSearchParams): ParentRoute | null {
  if (pathname === "/clients/new") {
    const requested = searchParams.get("returnTo");
    const href = normalizeListReturnTo(requested, "/clients", CLIENT_LIST_KEYS)
      ?? normalizeListReturnTo(requested, "/organize-center", ORGANIZE_CENTER_KEYS, new Set(["", "all", "client", "party"]))
      ?? normalizeImportCenterReturnTo(requested, "person")
      ?? "/clients";
    return { href, label: labels };
  }
  if (pathname === "/properties/new") {
    const requested = searchParams.get("returnTo") ?? (searchParams.get("from") === "entry" ? "/import-center" : null);
    const href = normalizeListReturnTo(requested, "/properties", PROPERTY_LIST_KEYS)
      ?? normalizeListReturnTo(requested, "/organize-center", ORGANIZE_CENTER_KEYS, new Set(["", "all", "property"]))
      ?? normalizeImportCenterReturnTo(requested, "property")
      ?? "/properties";
    return { href, label: labels };
  }
  return null;
}
const routeMap: Array<{ matches: (segments: string[]) => boolean; resolve: (segments: string[]) => ParentRoute }> = [
  { matches: (s) => s[0] === "cases" && s.length === 3 && s[2] === "guarantee-application", resolve: (s) => ({ href: `/cases/${encodeURIComponent(s[1])}`, label: labels }) },
  { matches: (s) => s[0] === "cases" && s.length === 2 && s[1] !== "new", resolve: () => ({ href: "/organize-center?type=case", label: labels }) },
  { matches: (s) => s[0] === "cases" && s.length === 2 && s[1] === "new", resolve: () => ({ href: "/organize-center?type=case", label: labels }) },
  { matches: (s) => s[0] === "clients" && s.length === 2, resolve: () => ({ href: "/clients", label: labels }) },
  { matches: (s) => s[0] === "parties" && s.length === 3 && s[2] === "edit", resolve: () => ({ href: "/parties", label: labels }) },
  { matches: (s) => s[0] === "parties" && s.length === 2 && s[1] === "new", resolve: () => ({ href: "/parties", label: labels }) },
  { matches: (s) => s[0] === "properties" && s.length === 3 && s[2] === "edit", resolve: () => ({ href: "/properties", label: labels }) },
  { matches: (s) => s[0] === "properties" && s.length === 2 && s[1] === "new", resolve: () => ({ href: "/properties", label: labels }) },
  { matches: (s) => s[0] === "quotes" && s.length === 2, resolve: () => ({ href: "/quotes", label: labels }) },
  { matches: (s) => s[0] === "guarantee-applications" && s.length === 3, resolve: () => ({ href: "/platform/templates", label: labels }) },
  { matches: (s) => s[0] === "guarantee-forms" && s.length === 3, resolve: () => ({ href: "/guarantee-forms", label: labels }) },
  { matches: (s) => s[0] === "platform" && s[1] === "closed-beta" && s.length === 2, resolve: () => ({ href: "/platform/accounts", label: labels }) },
  { matches: (s) => s[0] === "platform" && s[1] === "templates" && s.length === 3, resolve: () => ({ href: "/platform/templates", label: labels }) },
  { matches: (s) => s[0] === "settings" && s.length === 2, resolve: () => ({ href: "/", label: labels }) },
  { matches: (s) => s[0] === "workspace" && s.length > 1, resolve: () => ({ href: "/workspace", label: labels }) },
  { matches: (s) => s[0] === "cases" && s.length > 1, resolve: () => ({ href: "/organize-center?type=case", label: labels }) },
  { matches: (s) => s[0] === "clients" && s.length > 1, resolve: () => ({ href: "/clients", label: labels }) },
  { matches: (s) => s[0] === "parties" && s.length > 1, resolve: () => ({ href: "/parties", label: labels }) },
  { matches: (s) => s[0] === "properties" && s.length > 1, resolve: () => ({ href: "/properties", label: labels }) },
  { matches: (s) => s[0] === "quotes" && s.length > 1, resolve: () => ({ href: "/quotes", label: labels }) },
  { matches: (s) => s[0] === "guarantee-applications" && s.length > 1, resolve: () => ({ href: "/platform/templates", label: labels }) },
  { matches: (s) => s[0] === "guarantee-forms" && s.length > 1, resolve: () => ({ href: "/guarantee-forms", label: labels }) },
  { matches: (s) => s[0] === "platform" && s.length > 1, resolve: () => ({ href: "/platform/templates", label: labels }) },
  { matches: (s) => s[0] === "settings" && s.length > 1, resolve: () => ({ href: "/", label: labels }) },
];

function resolveParent(pathname: string, searchParams: URLSearchParams): ParentRoute | null {
  // The case draft owns its cancel link so it can confirm before leaving after
  // a quick-created master. Rendering the shell link as well creates two
  // competing return destinations on /cases/new.
  if (pathname === "/cases/new") return null;
  const newEntryParent = resolveNewEntryParent(pathname, searchParams);
  if (newEntryParent) return newEntryParent;
  const segments = pathname.split("/").filter(Boolean).map((segment) => decodeURIComponent(segment));
  if (segments.length === 3 && segments[0] === "clients" && segments[2] === "edit") {
    // A completed /clients/new entry has no detail-page parent. Its direct
    // parent is the client menu; ordinary edits still return to the detail.
    const clientId = segments[1];
    return { href: normalizeClientEditReturnTo(searchParams.get("returnTo"), clientId, searchParams.get("flash")) ?? `/clients/${encodeURIComponent(clientId)}`, label: labels };
  }
  return routeMap.find((entry) => entry.matches(segments))?.resolve(segments) ?? null;
}

export function BackToParent({ locale }: { locale: Locale }) {
  const parent = resolveParent(usePathname(), useSearchParams());
  if (!parent) return null;
  return (
    <nav className="bd-back-to-parent" aria-label={parent.label[locale]}>
      <Link href={parent.href} className="bd-back-to-parent-link">
        <span aria-hidden="true" className="material-symbols-outlined text-[18px]">arrow_back</span>
        <span>{parent.label[locale]}</span>
      </Link>
    </nav>
  );
}
