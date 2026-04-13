type PageFlashBannerProps = {
  message?: string;
  tone?: "success" | "info";
};

export function PageFlashBanner({ message, tone = "success" }: PageFlashBannerProps) {
  if (!message) return null;

  const toneClass =
    tone === "info"
      ? "border-blue-200 bg-blue-50 text-blue-800"
      : "border-emerald-200 bg-emerald-50 text-emerald-800";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`rounded-xl border px-4 py-3 text-sm font-medium shadow-sm ${toneClass}`}
    >
      {message}
    </div>
  );
}

