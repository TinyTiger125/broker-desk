type PageFlashBannerProps = {
  message?: string;
  tone?: "success" | "info" | "error";
};

export function PageFlashBanner({ message, tone = "success" }: PageFlashBannerProps) {
  if (!message) return null;

  const toneClass = "bd-flash-banner";

  return (
    <div
      role="status"
      aria-live="polite"
      data-tone={tone}
      className={`text-sm font-medium ${toneClass}`}
    >
      {message}
    </div>
  );
}
