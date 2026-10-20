import type { SVGProps } from "react";

type UiIconProps = SVGProps<SVGSVGElement> & {
  name: string;
};

function IconPath({ name }: { name: string }) {
  switch (name) {
    case "account_circle":
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="9" r="2.5" />
          <path d="M7.5 18c.8-2.1 2.4-3.2 4.5-3.2s3.7 1.1 4.5 3.2" />
        </>
      );
    case "chevron_right":
      return <path d="m9 5 7 7-7 7" />;
    case "expand_more":
      return <path d="m5 9 7 7 7-7" />;
    case "person_search":
      return (
        <>
          <circle cx="9" cy="8" r="3" />
          <path d="M4.5 18c.8-2.6 2.3-4 4.5-4 1.2 0 2.2.3 3 .9" />
          <circle cx="17" cy="16" r="3" />
          <path d="m19.2 18.2 2.3 2.3" />
        </>
      );
    case "domain":
      return (
        <>
          <path d="M4 20V5l8-2 8 2v15M8 8h1m6 0h1M8 12h1m6 0h1M8 16h1m6 0h1M10 20v-4h4v4" />
        </>
      );
    case "group":
      return (
        <>
          <circle cx="9" cy="8.5" r="3" />
          <circle cx="17" cy="9.5" r="2.4" />
          <path d="M4.5 19c.7-3 2.3-4.5 4.5-4.5s3.8 1.5 4.5 4.5M14 15c1.8-.2 3.2 1.1 4 4" />
        </>
      );
    case "request_quote":
      return (
        <>
          <path d="M6 3h9l3 3v15H6zM15 3v4h4" />
          <path d="M12 10v7m2-5.5c-.5-.5-1-.7-1.8-.7-1.1 0-1.8.6-1.8 1.4 0 2 3.6 1 3.6 3 0 .8-.7 1.4-1.8 1.4-.8 0-1.4-.2-1.9-.8" />
        </>
      );
    case "description":
      return (
        <>
          <path d="M6 3h9l3 3v15H6zM15 3v4h4" />
          <path d="M9 11h6m-6 4h6m-6 4h4" />
        </>
      );
    case "support_agent":
      return (
        <>
          <path d="M4 13v-1a8 8 0 0 1 16 0v1M4 13a2 2 0 0 0 2 2h1v-5H6a2 2 0 0 0-2 2Zm16 0a2 2 0 0 1-2 2h-1v-5h1a2 2 0 0 1 2 2Z" />
          <path d="M17 18c-.7 1.3-1.8 2-3.5 2H12" />
          <circle cx="11" cy="20" r="1" />
        </>
      );
    case "library_books":
      return (
        <>
          <path d="M5 5h11v14H5zM8 3h11v14M8 8h5m-5 4h5m-5 4h5" />
        </>
      );
    case "manage_accounts":
      return (
        <>
          <circle cx="9" cy="8" r="3" />
          <path d="M4.5 18c.8-2.6 2.3-4 4.5-4 1.2 0 2.2.3 3 .9" />
          <circle cx="17" cy="17" r="3" />
          <path d="M17 15.5v3m-1.5-1.5h3" />
        </>
      );
    case "rule":
      return (
        <>
          <path d="M6 3h9l3 3v15H6zM15 3v4h4" />
          <path d="m8.5 11 1.2 1.2 2-2m-3.2 5h6m-6 3h4" />
        </>
      );
    case "edit_document":
      return (
        <>
          <path d="M6 3h9l3 3v10M15 3v4h4M6 21h7" />
          <path d="m14 17 4.5-4.5 2 2L16 19l-3 .5Z" />
        </>
      );
    case "admin_panel_settings":
      return (
        <>
          <path d="m12 3 7 3v5c0 4.4-2.7 7.7-7 10-4.3-2.3-7-5.6-7-10V6z" />
          <path d="m9 11 2 2 4-4" />
        </>
      );
    case "dashboard_customize":
      return (
        <>
          <rect x="4" y="4" width="7" height="7" rx="1" />
          <rect x="13" y="4" width="7" height="7" rx="1" />
          <rect x="4" y="13" width="7" height="7" rx="1" />
          <path d="M16.5 14v6m-3-3h6" />
        </>
      );
    case "health_and_safety":
      return (
        <>
          <path d="m12 3 7 3v5c0 4.4-2.7 7.7-7 10-4.3-2.3-7-5.6-7-10V6z" />
          <path d="M12 8v6m-3-3h6" />
        </>
      );
    case "fact_check":
      return (
        <>
          <path d="M5 4h14v16H5z" />
          <path d="m8 9 1.5 1.5L12 8m-4 6h8m-8 3h5" />
        </>
      );
    case "keyboard_double_arrow_left":
      return <path d="m16 6-6 6 6 6M10 6 4 12l6 6" />;
    case "keyboard_double_arrow_right":
      return <path d="m8 6 6 6-6 6m6-12 6 6-6 6" />;
    case "print":
      return (
        <>
          <path d="M7 9V4h10v5M7 17H5a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2" />
          <path d="M7 14h10v6H7zM17 12h.01" />
        </>
      );
    case "settings":
      return (
        <>
          <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" />
          <path d="m19.4 15 .1.1a1.8 1.8 0 0 1-2.5 2.5l-.1-.1a1.8 1.8 0 0 0-3 .9v.2a1.8 1.8 0 0 1-3.6 0v-.2a1.8 1.8 0 0 0-3-.9l-.1.1a1.8 1.8 0 0 1-2.5-2.5l.1-.1a1.8 1.8 0 0 0-.9-3H3.7a1.8 1.8 0 0 1 0-3h.2a1.8 1.8 0 0 0 .9-3l-.1-.1a1.8 1.8 0 0 1 2.5-2.5l.1.1a1.8 1.8 0 0 0 3-.9v-.2a1.8 1.8 0 0 1 3.6 0v.2a1.8 1.8 0 0 0 3 .9l.1-.1a1.8 1.8 0 0 1 2.5 2.5l-.1.1a1.8 1.8 0 0 0 .9 3h.2a1.8 1.8 0 0 1 0 3h-.2a1.8 1.8 0 0 0-.9 3Z" />
        </>
      );
    case "space_dashboard":
      return (
        <>
          <rect x="4" y="4" width="7" height="7" rx="1" />
          <rect x="13" y="4" width="7" height="4" rx="1" />
          <rect x="13" y="10" width="7" height="10" rx="1" />
          <rect x="4" y="13" width="7" height="7" rx="1" />
        </>
      );
    case "task_alt":
      return <path d="m9 16.2-3.7-3.7-1.4 1.4L9 19 21 7l-1.4-1.4z" fill="currentColor" stroke="none" />;
    case "tune":
      return (
        <>
          <path d="M4 7h16M4 17h16" />
          <circle cx="9" cy="7" r="2" />
          <circle cx="15" cy="17" r="2" />
        </>
      );
    case "upload_file":
      return (
        <>
          <path d="M6 3h8l4 4v14H6z" />
          <path d="M14 3v5h5M12 17V10m0 0-3 3m3-3 3 3" />
        </>
      );
    case "progress_activity":
      return <path d="M12 3a9 9 0 1 1-6.36 2.64" />;
    default:
      return <circle cx="12" cy="12" r="8" />;
  }
}

export function UiIcon({ name, className, ...props }: UiIconProps) {
  return (
    <svg
      {...props}
      aria-hidden={props["aria-label"] ? undefined : true}
      className={`ui-icon shrink-0 ${className ?? ""}`.trim()}
      data-icon={name}
      fill="none"
      focusable="false"
      height="1em"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      width="1em"
    >
      <IconPath name={name} />
    </svg>
  );
}
