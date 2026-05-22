import Link from "next/link";
import { ActorSwitcher } from "@/components/actor-switcher";
import { LanguageSwitcher } from "@/components/language-switcher";
import { MainNavLinks } from "@/components/main-nav-links";
import { listUsers, getDefaultUser } from "@/lib/data";
import { t } from "@/lib/i18n";
import { getLocale, type Locale } from "@/lib/locale";

function getLinks(locale: Locale) {
  return [
    { href: "/", label: t(locale, "nav.link.dashboard") },
    { href: "/import-center", label: t(locale, "nav.link.importCenter") },
    { href: "/output-center", label: t(locale, "nav.link.outputCenter") },
  ];
}

function getSupportLinks(locale: Locale) {
  return [
    { href: "/properties", label: t(locale, "nav.link.properties") },
    { href: "/parties", label: t(locale, "nav.link.parties") },
    { href: "/clients", label: t(locale, "nav.link.clients") },
    { href: "/quotes", label: t(locale, "nav.link.quotes") },
    { href: "/contracts", label: t(locale, "nav.link.contracts") },
    { href: "/service-requests", label: t(locale, "nav.link.serviceRequests") },
    { href: "/templates", label: t(locale, "nav.link.templates") },
  ];
}

export async function AppNav() {
  const locale = await getLocale();
  const [users, currentActor] = await Promise.all([listUsers(20), getDefaultUser()]);
  const links = getLinks(locale);
  const supportLinks = getSupportLinks(locale);
  const appTitle = t(locale, "app.title");
  const actorLabel = locale === "zh" ? "执行账号" : locale === "ko" ? "작업 계정" : "実行担当";
  const actorOptions = users.map((item) => ({ id: item.id, name: item.name }));
  const flowLabel =
    locale === "zh"
      ? "1 上传资料 / 2 补齐缺失 / 3 输出申请书"
      : locale === "ko"
        ? "1 자료 입력 / 2 부족 항목 확인 / 3 신청서 출력"
        : "1 資料を入れる / 2 足りない項目だけ確認 / 3 申込書を出す";

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur lg:hidden">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/" className="text-lg font-bold tracking-tight text-slate-900">
              {appTitle}
            </Link>

            <div className="flex items-center gap-2">
              <ActorSwitcher currentActorId={currentActor?.id} options={actorOptions} label={actorLabel} />
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
          <details className="mt-2 border-t border-slate-200 pt-2">
            <summary className="cursor-pointer px-1 text-xs font-bold text-slate-500">
              {locale === "zh" ? "其他功能" : locale === "ko" ? "기타 기능" : "その他の機能"}
            </summary>
            <div className="mt-2 overflow-x-auto">
              <MainNavLinks links={supportLinks} />
            </div>
          </details>
        </div>
      </header>

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 bg-slate-100 p-4 lg:flex lg:flex-col">
        <Link href="/" className="rounded-xl px-2 py-1 text-xs font-black uppercase tracking-widest text-slate-900">
          {appTitle}
        </Link>
        <p className="px-2 pt-1 text-[11px] font-medium text-slate-500">{t(locale, "nav.tagline")}</p>

        <div className="mt-5 flex-1 overflow-y-auto pr-1">
          <MainNavLinks links={links} orientation="column" />
          <details className="mt-4 border-t border-slate-200 pt-4">
            <summary className="cursor-pointer px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {locale === "zh" ? "辅助业务" : locale === "ko" ? "보조 업무" : "補助業務"}
            </summary>
            <div className="mt-2">
              <MainNavLinks links={supportLinks} orientation="column" />
            </div>
          </details>
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
          <ActorSwitcher currentActorId={currentActor?.id} options={actorOptions} label={actorLabel} />
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
        <div className="flex items-center gap-3 text-sm font-semibold text-slate-700">
          <span className="material-symbols-outlined text-[18px] text-emerald-700">task_alt</span>
          <span>{flowLabel}</span>
        </div>

        <div className="ml-6 flex items-center gap-3">
          <Link href="/import-center" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
            {t(locale, "nav.importButton")}
          </Link>
          <Link href="/output-center" className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800">
            {t(locale, "nav.outputButton")}
          </Link>
          <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-slate-900 px-2 text-xs font-semibold text-white">
            {t(locale, "nav.ownerBadge")}
          </span>
        </div>
      </header>
    </>
  );
}
