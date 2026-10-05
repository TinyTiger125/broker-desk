"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Locale } from "@/lib/locale";

type ParentRoute = { href: string; label: Record<Locale, string> };
const labels = { zh: "返回上一级", ja: "上の階層へ戻る", ko: "상위로 돌아가기" } satisfies Record<Locale, string>;
const routeMap: Array<{ matches: (segments: string[]) => boolean; resolve: (segments: string[]) => ParentRoute }> = [
  { matches: (s) => s[0] === "cases" && s.length === 3 && s[2] === "guarantee-application", resolve: (s) => ({ href: `/cases/${encodeURIComponent(s[1])}`, label: labels }) },
  { matches: (s) => s[0] === "cases" && s.length === 2 && s[1] !== "new", resolve: () => ({ href: "/organize-center?type=case", label: labels }) },
  { matches: (s) => s[0] === "cases" && s.length === 2 && s[1] === "new", resolve: () => ({ href: "/organize-center?type=case", label: labels }) },
  { matches: (s) => s[0] === "clients" && s.length === 3 && s[2] === "edit", resolve: (s) => ({ href: `/clients/${encodeURIComponent(s[1])}`, label: labels }) },
  { matches: (s) => s[0] === "clients" && s.length === 2, resolve: () => ({ href: "/clients", label: labels }) },
  { matches: (s) => s[0] === "parties" && s.length === 3 && s[2] === "edit", resolve: () => ({ href: "/parties", label: labels }) },
  { matches: (s) => s[0] === "parties" && s.length === 2 && s[1] === "new", resolve: () => ({ href: "/parties", label: labels }) },
  { matches: (s) => s[0] === "properties" && s.length === 3 && s[2] === "edit", resolve: () => ({ href: "/properties", label: labels }) },
  { matches: (s) => s[0] === "properties" && s.length === 2 && s[1] === "new", resolve: () => ({ href: "/properties", label: labels }) },
  { matches: (s) => s[0] === "quotes" && s.length === 2, resolve: () => ({ href: "/quotes", label: labels }) },
  { matches: (s) => s[0] === "guarantee-applications" && s.length === 3, resolve: () => ({ href: "/platform/templates", label: labels }) },
  { matches: (s) => s[0] === "guarantee-forms" && s.length === 3, resolve: () => ({ href: "/guarantee-forms", label: labels }) },
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

function resolveParent(pathname: string): ParentRoute | null {
  const segments = pathname.split("/").filter(Boolean).map((segment) => decodeURIComponent(segment));
  return routeMap.find((entry) => entry.matches(segments))?.resolve(segments) ?? null;
}

export function BackToParent({ locale }: { locale: Locale }) {
  const parent = resolveParent(usePathname());
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
