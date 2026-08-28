"use client";

import Link, { useLinkStatus } from "next/link";
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
  const hrefPath = href.split(/[?#]/)[0] || "/";
  if (hrefPath === "/") return pathname === "/";
  return pathname === hrefPath || pathname.startsWith(`${hrefPath}/`);
}

function MainNavLinkContent({ icon, label, isRow }: { icon: string; label: string; isRow: boolean }) {
  const { pending } = useLinkStatus();

  return (
    <>
      <span
        aria-hidden="true"
        className={`material-symbols-outlined app-nav-link-icon ${pending ? "inline-block animate-spin text-[20px] motion-reduce:animate-none" : isRow ? "hidden" : "inline-block text-[20px]"}`}
      >
        {pending ? "progress_activity" : icon}
      </span>
      <span className={isRow ? "" : "app-nav-link-label"}>{label}</span>
    </>
  );
}

export function MainNavLinks({ links, orientation = "row" }: MainNavLinksProps) {
  const pathname = usePathname() ?? "/";
  const isRow = orientation === "row";
  const iconByHref: Record<string, string> = {
    "/": "space_dashboard",
    "/clients": "person_search",
    "/import-center": "upload_file",
    "/organize-center": "fact_check",
    "/properties": "domain",
    "/parties": "group",
    "/quotes": "request_quote",
    "/contracts": "description",
    "/service-requests": "support_agent",
    "/output-center": "print",
    "/templates": "library_books",
    "/settings/members": "manage_accounts",
    "/settings/case-workbench-fields": "rule",
    "/settings/output-templates": "edit_document",
    "/platform/accounts": "admin_panel_settings",
  };

  return (
    <nav className={isRow ? "flex min-w-max items-center gap-1 pb-1" : "flex flex-col gap-1"}>
      {links.map((link) => {
        const active = isActive(pathname, link.href);
        const base = isRow
          ? "ui-nav-stable rounded-md px-3 py-2 text-sm font-semibold transition"
          : "app-nav-link rounded-md px-3 py-2.5 text-sm font-semibold transition";
        const tone = active
          ? isRow
            ? "bg-[#e7edff] text-[#173b9f]"
            : "bg-[#3158d8] text-white"
          : isRow
            ? "text-slate-600 hover:bg-slate-200/60 hover:text-slate-950"
            : "text-slate-300 hover:bg-[#263149] hover:text-white";
        const hrefPath = link.href.split(/[?#]/)[0] || "/";
        const icon = iconByHref[hrefPath] ?? (hrefPath.startsWith("/cases/") ? "fact_check" : "circle");

        return (
          <Link
            key={`${link.label}:${link.href}`}
            href={link.href}
            className={`${base} ${tone} ${isRow ? "justify-center" : "flex items-center gap-3"}`}
          >
            <MainNavLinkContent icon={icon} label={link.label} isRow={isRow} />
          </Link>
        );
      })}
    </nav>
  );
}
