import { getLocale } from "@/lib/locale";
import { getSystemStateCopy } from "@/lib/system-state-copy";

export default async function AppLoading() {
  const locale = await getLocale();
  const text = getSystemStateCopy(locale);

  return (
    <div lang={locale} data-locale={locale} aria-busy="true" aria-live="polite" className="bd-route-loading">
      <span className="sr-only">{text.loading}</span>
      <div className="bd-route-loading-track" aria-hidden="true">
        <div className="bd-route-loading-bar" />
      </div>
    </div>
  );
}
