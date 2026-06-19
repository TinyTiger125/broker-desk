import Link from "next/link";
import { ActorSwitcher } from "@/components/actor-switcher";
import { LanguageSwitcher } from "@/components/language-switcher";
import { MainNavLinks } from "@/components/main-nav-links";
import { isActorSwitchingEnabled } from "@/lib/actor";
import { listBrokerageCases, listUsers, getDefaultUser, getUserById, type User } from "@/lib/data";
import { t } from "@/lib/i18n";
import { getLocale, type Locale } from "@/lib/locale";
import {
  isConfiguredPlatformOwnerUser,
  isDevelopmentPlatformOwnerTenantFallbackEnabled,
} from "@/lib/platform-owner";

function getLinks(locale: Locale, currentCaseId?: string) {
  const workbenchHref = currentCaseId ? `/cases/${currentCaseId}` : "/import-center";
  const outputHref = currentCaseId ? `/output-center?caseId=${encodeURIComponent(currentCaseId)}` : "/output-center";
  const organizeLabel = locale === "zh" ? "整理信息" : locale === "ko" ? "정보 정리" : "情報を整理";
  return [
    { href: "/", label: t(locale, "nav.link.dashboard") },
    { href: "/import-center", label: t(locale, "nav.link.importCenter") },
    { href: workbenchHref, label: organizeLabel },
    { href: outputHref, label: t(locale, "nav.link.outputCenter") },
  ];
}

function getSupportLinks(locale: Locale) {
  return [
    { href: "/templates", label: t(locale, "nav.link.templates") },
    { href: "/properties", label: t(locale, "nav.link.properties") },
    { href: "/parties", label: t(locale, "nav.link.parties") },
    { href: "/clients", label: t(locale, "nav.link.clients") },
    { href: "/quotes", label: t(locale, "nav.link.quotes") },
    { href: "/contracts", label: t(locale, "nav.link.contracts") },
    { href: "/service-requests", label: t(locale, "nav.link.serviceRequests") },
    { href: "/settings/members", label: locale === "zh" ? "成员/权限" : locale === "ko" ? "멤버/권한" : "メンバー/権限" },
    { href: "/settings/output-templates", label: locale === "zh" ? "输出模板" : locale === "ko" ? "출력 템플릿" : "出力テンプレート" },
    { href: "/settings/ai-experience", label: locale === "zh" ? "AI经验审核" : locale === "ko" ? "AI 경험 리뷰" : "AI経験レビュー" },
  ];
}

async function getNavigationDataUser(currentActor: User | null) {
  if (
    currentActor &&
    isDevelopmentPlatformOwnerTenantFallbackEnabled() &&
    isConfiguredPlatformOwnerUser(currentActor)
  ) {
    return (await getUserById("user_demo")) ?? currentActor;
  }
  return currentActor;
}

export async function AppNav() {
  const locale = await getLocale();
  const actorSwitchingEnabled = isActorSwitchingEnabled();
  const [users, currentActor] = await Promise.all([
    actorSwitchingEnabled ? listUsers(20) : Promise.resolve([]),
    getDefaultUser(),
  ]);
  const navigationDataUser = await getNavigationDataUser(currentActor);
  const currentCases = navigationDataUser ? await listBrokerageCases(navigationDataUser.id, 20) : [];
  const currentCase =
    currentCases.find((item) => item.id === "case_fixture_friends_guarantee_pdf") ??
    currentCases.find((item) => item.status === "reviewed") ??
    currentCases[0];
  const links = getLinks(locale, currentCase?.id);
  const supportLinks = getSupportLinks(locale);
  const appTitle = t(locale, "app.title");
  const actorLabel = locale === "zh" ? "执行账号" : locale === "ko" ? "작업 계정" : "実行担当";
  const actorOptions = users.map((item) => ({ id: item.id, name: item.name }));
  const flowLabel =
    locale === "zh"
      ? "1 上传资料 / 2 整理信息 / 3 输出申请书"
      : locale === "ko"
        ? "1 자료 입력 / 2 정보 정리 / 3 신청서 출력"
        : "1 資料を入れる / 2 情報を整理する / 3 申込書を出す";

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-slate-300 bg-white/95 backdrop-blur lg:hidden">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/" className="text-lg font-bold tracking-tight text-slate-900">
              {appTitle}
            </Link>

            <div className="flex items-center gap-2">
              {actorSwitchingEnabled ? (
                <ActorSwitcher currentActorId={currentActor?.id} options={actorOptions} label={actorLabel} />
              ) : null}
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

          <div className="mt-3 overflow-x-auto">
            <MainNavLinks links={links} />
          </div>
          <details className="mt-2 border-t border-slate-200 pt-2">
            <summary className="cursor-pointer px-1 text-xs font-bold text-slate-500">
              {locale === "zh" ? "资料库 / 设置" : locale === "ko" ? "자료실 / 설정" : "資料庫 / 設定"}
            </summary>
            <div className="mt-2 overflow-x-auto">
              <MainNavLinks links={supportLinks} />
            </div>
          </details>
        </div>
      </header>

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-slate-900 bg-[#050b14] p-4 text-white lg:flex lg:flex-col">
        <Link href="/" className="flex items-center gap-3 rounded px-2 py-1 text-xl font-black tracking-tight text-white">
          <span className="flex h-9 w-9 items-center justify-center rounded border border-slate-700 bg-slate-900">
            <span className="material-symbols-outlined text-[20px]">business_center</span>
          </span>
          <span>{appTitle}</span>
        </Link>
        <p className="whitespace-nowrap px-14 pt-0.5 text-[11px] font-semibold tracking-wide text-slate-400">{t(locale, "nav.tagline")}</p>

        <div className="mt-5 flex-1 overflow-y-auto pr-1">
          <MainNavLinks links={links} orientation="column" />
          <details className="mt-4 border-t border-slate-800 pt-4">
            <summary className="cursor-pointer px-3 text-[10px] font-black uppercase tracking-wider text-slate-500">
              {locale === "zh" ? "资料库 / 设置" : locale === "ko" ? "자료실 / 설정" : "資料庫 / 設定"}
            </summary>
            <div className="mt-2">
              <MainNavLinks links={supportLinks} orientation="column" />
            </div>
          </details>
        </div>

        <div className="mt-4 space-y-2 border-t border-slate-800 pt-4 [&_label]:w-full [&_label]:min-w-0 [&_select]:min-w-0">
          {actorSwitchingEnabled ? (
            <ActorSwitcher currentActorId={currentActor?.id} options={actorOptions} label={actorLabel} />
          ) : null}
          <LanguageSwitcher
            locale={locale}
            label={t(locale, "locale.label")}
            labels={{
              ja: t(locale, "locale.ja"),
              zh: t(locale, "locale.zh"),
              ko: t(locale, "locale.ko"),
            }}
          />
          <span className="inline-flex h-8 w-full items-center justify-center rounded-lg border border-slate-800 bg-slate-900 px-2 text-xs font-semibold text-white">
            {t(locale, "nav.ownerBadge")}
          </span>
        </div>
      </aside>

      <header className="fixed left-64 right-0 top-0 z-30 hidden h-16 items-center justify-between border-b border-slate-300 bg-[#f8f9ff]/95 px-8 backdrop-blur lg:flex">
        <div className="flex items-center gap-3 text-sm font-bold text-slate-900">
          <span className="material-symbols-outlined text-[18px] text-[#1960a3]">task_alt</span>
          <span>{flowLabel}</span>
        </div>

        <div className="ml-6 flex items-center gap-3">
          <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-slate-900 px-2 text-xs font-semibold text-white">
            {t(locale, "nav.ownerBadge")}
          </span>
        </div>
      </header>
    </>
  );
}
