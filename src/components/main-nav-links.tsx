"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavLink = {
  href: string;
  label: string;
};

type MainNavLinksProps = {
  links: NavLink[];
  orientation?: "row" | "column";
};

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MainNavLinks({ links, orientation = "row" }: MainNavLinksProps) {
  const pathname = usePathname() ?? "/";
  const isRow = orientation === "row";
  const iconByHref: Record<string, string> = {
    "/": "dashboard",
    "/import-center": "upload_file",
    "/properties": "domain",
    "/parties": "group",
    "/contracts": "description",
    "/service-requests": "support_agent",
    "/output-center": "print",
    "/templates": "fluid_med",
  };

  return (
    <nav className={isRow ? "flex min-w-max items-center gap-1 pb-1" : "flex flex-col gap-1"}>
      {links.map((link) => {
        const active = isActive(pathname, link.href);
        const base = isRow
          ? "ui-nav-stable rounded-lg px-3 py-2 text-sm font-medium transition"
          : "rounded-lg px-3 py-2.5 text-sm font-medium transition";
        const tone = active
          ? "bg-white text-blue-900 shadow-sm"
          : "text-slate-600 hover:bg-slate-200/50 hover:text-slate-900";
        const icon = iconByHref[link.href] ?? "circle";

        return (
          <Link key={link.href} href={link.href} className={`${base} ${tone} ${isRow ? "justify-center" : "flex items-center gap-3"}`}>
            <span className={`material-symbols-outlined ${isRow ? "hidden" : "inline-block text-[20px]"}`}>{icon}</span>
            <span>{link.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
