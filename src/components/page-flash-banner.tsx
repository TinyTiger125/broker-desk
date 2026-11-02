type PageFlashBannerProps = {
  message?: string;
  tone?: "success" | "info" | "error";
  action?: { href: string; label: string };
};

export function PageFlashBanner({ message, tone = "success", action }: PageFlashBannerProps) {
  if (!message) return null;

  const toneClass = "bd-flash-banner";

  return (
    <div
      role="status"
      aria-live="polite"
      data-tone={tone}
      className={`text-sm font-medium ${toneClass}`}
    >
      <span>{message}</span>
      {action ? (
        <a href={action.href} className="ml-3 inline-flex font-black underline underline-offset-4">
          {action.label}
        </a>
      ) : null}
    </div>
  );
}
