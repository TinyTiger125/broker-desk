import Link from "next/link";
import { GlobalSearchBox } from "@/components/global-search-box";
import { LanguageSwitcher } from "@/components/language-switcher";
import { MainNavLinks } from "@/components/main-nav-links";
import { t } from "@/lib/i18n";
import { getLocale, type Locale } from "@/lib/locale";

function getLinks(locale: Locale) {
  return [
    { href: "/", label: t(locale, "nav.link.dashboard") },
    { href: "/import-center", label: t(locale, "nav.link.importCenter") },
    { href: "/properties", label: t(locale, "nav.link.properties") },
    { href: "/parties", label: t(locale, "nav.link.parties") },
    { href: "/contracts", label: t(locale, "nav.link.contracts") },
    { href: "/service-requests", label: t(locale, "nav.link.serviceRequests") },
    { href: "/output-center", label: t(locale, "nav.link.outputCenter") },
    { href: "/templates", label: t(locale, "nav.link.templates") },
  ];
}

export async function AppNav() {
  const locale = await getLocale();
  const links = getLinks(locale);
  const appTitle = t(locale, "app.title");
  const searchLabels = {
    loading:
      locale === "zh"
        ? "正在搜索..."
        : locale === "ko"
          ? "검색 중..."
          : "検索中...",
    empty:
      locale === "zh"
        ? "未找到匹配结果"
        : locale === "ko"
          ? "검색 결과가 없습니다"
          : "一致する結果がありません",
    entities: {
      property: locale === "zh" ? "物件" : locale === "ko" ? "매물" : "物件",
      party: locale === "zh" ? "主体" : locale === "ko" ? "관계자" : "関係者",
      contract: locale === "zh" ? "合同" : locale === "ko" ? "계약" : "契約",
      service_request: locale === "zh" ? "服务请求" : locale === "ko" ? "서비스 요청" : "対応依頼",
      output: locale === "zh" ? "输出物" : locale === "ko" ? "출력물" : "出力物",
    },
  } as const;

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur lg:hidden">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/" className="text-lg font-bold tracking-tight text-slate-900">
              {appTitle}
            </Link>

            <div className="flex items-center gap-2">
              <LanguageSwitcher
                locale={locale}
                label={t(locale, "locale.label")}
                labels={{
                  ja: t(locale, "locale.ja"),
                  zh: t(locale, "locale.zh"),
                  ko: t(locale, "locale.ko"),
                }}
              />
              <span className="inline-flex h-9 min-w-9 items-center justify-center rounded-full bg-slate-900 px-2 text-xs font-semibold text-white">
                {t(locale, "nav.ownerBadge")}
              </span>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <Link href="/import-center" className="ui-button-stable inline-flex rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
              {t(locale, "nav.importButton")}
            </Link>
            <Link href="/output-center" className="ui-button-stable inline-flex rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700">
              {t(locale, "nav.outputButton")}
            </Link>
          </div>

          <div className="mt-3 overflow-x-auto">
            <MainNavLinks links={links} />
          </div>
        </div>
      </header>

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 bg-slate-100 p-4 lg:flex lg:flex-col">
        <Link href="/" className="rounded-xl px-2 py-1 text-xs font-black uppercase tracking-widest text-slate-900">
          {appTitle}
        </Link>
        <p className="px-2 pt-1 text-[11px] font-medium text-slate-500">{t(locale, "nav.tagline")}</p>

        <div className="mt-5 flex-1 overflow-y-auto pr-1">
          <MainNavLinks links={links} orientation="column" />
        </div>

        <div className="mt-4 space-y-2 border-t border-slate-200/80 pt-4">
          <Link href="/import-center" className="inline-flex w-full items-center justify-center rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200/60">
            {t(locale, "nav.importButton")}
          </Link>
          <Link href="/output-center" className="inline-flex w-full items-center justify-center rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700">
            {t(locale, "nav.outputButton")}
          </Link>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <LanguageSwitcher
            locale={locale}
            label={t(locale, "locale.label")}
            labels={{
              ja: t(locale, "locale.ja"),
              zh: t(locale, "locale.zh"),
              ko: t(locale, "locale.ko"),
            }}
          />
          <span className="inline-flex h-9 min-w-9 items-center justify-center rounded-full bg-slate-900 px-2 text-xs font-semibold text-white">
            {t(locale, "nav.ownerBadge")}
          </span>
        </div>
      </aside>

      <header className="fixed left-64 right-0 top-0 z-30 hidden h-16 items-center justify-between border-b border-slate-200/20 bg-slate-50/90 px-8 shadow-sm backdrop-blur lg:flex">
        <GlobalSearchBox locale={locale} placeholder={t(locale, "nav.searchPlaceholder")} labels={searchLabels} />

        <div className="ml-6 flex items-center gap-3">
          <Link href="/service-requests?status=open" className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700">
            <span className="material-symbols-outlined text-[20px]">notifications</span>
          </Link>
          <Link href="/templates" className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700">
            <span className="material-symbols-outlined text-[20px]">help</span>
          </Link>
          <Link href="/settings/output-templates" className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700">
            <span className="material-symbols-outlined text-[20px]">settings</span>
          </Link>
          <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-slate-900 px-2 text-xs font-semibold text-white">
            {t(locale, "nav.ownerBadge")}
          </span>
        </div>
      </header>
    </>
  );
}
