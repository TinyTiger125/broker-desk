import Link from "next/link";
import { ActorSwitcher } from "@/components/actor-switcher";
import { AppRouteTitle } from "@/components/app-route-title";
import { LanguageSwitcher } from "@/components/language-switcher";
import { MainNavLinks } from "@/components/main-nav-links";
import { isActorSwitchingEnabled } from "@/lib/actor";
import { listUsers, getDefaultUser, getUserById } from "@/lib/data";
import { localizeDemoText } from "@/lib/demo-localization";
import { t } from "@/lib/i18n";
import { getLocale, type Locale } from "@/lib/locale";
import {
  isConfiguredPlatformOwnerUser,
  isDevelopmentPlatformOwnerTenantFallbackEnabled,
} from "@/lib/platform-owner";

function getLinks(locale: Locale) {
  const organizeLabel = locale === "zh" ? "整理信息" : locale === "ko" ? "정보 정리" : "情報整理";
  return [
    { href: "/", label: t(locale, "nav.link.dashboard") },
    { href: "/import-center", label: t(locale, "nav.link.importCenter") },
    { href: "/organize-center", label: organizeLabel },
    { href: "/output-center", label: t(locale, "nav.link.outputCenter") },
  ];
}

function getAdminLinks(locale: Locale) {
  return [
    { href: "/settings/members", label: locale === "zh" ? "团队成员" : locale === "ko" ? "팀 멤버" : "ユーザー管理" },
    { href: "/settings/case-workbench-fields", label: locale === "zh" ? "必填项目" : locale === "ko" ? "필수 항목" : "情報分類・項目設定" },
    { href: "/settings/output-templates", label: locale === "zh" ? "文书抬头" : locale === "ko" ? "문서 발행 정보" : "書類の発行元情報" },
  ];
}

async function getNavigationDataUser() {
  const user = await getDefaultUser();
  if (!user) return null;
  if (isDevelopmentPlatformOwnerTenantFallbackEnabled() && isConfiguredPlatformOwnerUser(user)) {
    return (await getUserById("user_demo")) ?? user;
  }
  return user;
}

export async function AppNav() {
  const locale = await getLocale();
  const actorSwitchingEnabled = isActorSwitchingEnabled();
  const [users, currentActor] = await Promise.all([
    actorSwitchingEnabled ? listUsers(20) : Promise.resolve([]),
    getNavigationDataUser(),
  ]);
  const links = getLinks(locale);
  const adminLinks = getAdminLinks(locale);
  const appTitle = t(locale, "app.title");
  const actorLabel = locale === "zh" ? "执行账号" : locale === "ko" ? "작업 계정" : "実行担当";
  const mobileSettingsLabel = locale === "zh" ? "账号/语言" : locale === "ko" ? "계정/언어" : "担当/言語";
  const settingsLabel = locale === "zh" ? "工作区设置" : locale === "ko" ? "워크스페이스 설정" : "設定";
  const settingsHint =
    locale === "zh"
      ? "管理团队、必填项目和文书抬头"
      : locale === "ko"
        ? "팀, 필수 항목, 문서 발행 정보를 관리"
        : "ユーザー、項目、書類情報を管理";
  const actorOptions = users.map((item) => ({ id: item.id, name: localizeDemoText(locale, item.name) ?? item.name }));
  return (
    <>
      <input id="app-nav-collapsed" type="checkbox" className="app-nav-collapse-toggle sr-only" aria-hidden="true" />

      <header className="sticky top-0 z-40 border-b border-slate-300 bg-white/95 backdrop-blur lg:hidden">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <Link href="/" className="text-lg font-bold tracking-tight text-slate-900">
              {appTitle}
            </Link>

            <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-slate-900 px-2 text-xs font-semibold text-white">
              {t(locale, "nav.ownerBadge")}
            </span>
          </div>

          <div className="mt-3 overflow-x-auto border-t border-slate-100 pt-2">
            <MainNavLinks links={links} />
          </div>
          <details className="mt-2 border-t border-slate-200 pt-2">
            <summary className="cursor-pointer px-1 text-xs font-bold text-slate-500">
              {mobileSettingsLabel}
            </summary>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 [&_label]:min-w-0 [&_select]:min-w-0">
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
            </div>
          </details>
          <details className="mt-2 border-t border-slate-200 pt-2">
            <summary className="cursor-pointer px-1 text-xs font-bold text-slate-500">
              {settingsLabel}
            </summary>
            <div className="mt-2 overflow-x-auto">
              <MainNavLinks links={adminLinks} />
            </div>
          </details>
        </div>
      </header>

      <aside className="app-desktop-sidebar fixed inset-y-0 left-0 z-40 hidden border-r border-slate-900 bg-[#050b14] p-4 text-white lg:flex lg:flex-col">
        <div className="flex items-center justify-between gap-2">
          <Link href="/" className="app-nav-brand flex min-w-0 items-center gap-3 rounded px-2 py-1 text-xl font-black tracking-tight text-white">
            <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-slate-700 bg-slate-900">
              <span className="material-symbols-outlined text-[20px]">business_center</span>
            </span>
            <span className="app-nav-expanded-only truncate">{appTitle}</span>
          </Link>
          <label
            htmlFor="app-nav-collapsed"
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded border border-slate-800 bg-slate-900 text-slate-300 transition hover:border-slate-600 hover:text-white"
            title={locale === "zh" ? "收起/展开侧栏" : locale === "ko" ? "사이드바 접기/펼치기" : "サイドバーを開閉"}
          >
            <span aria-hidden="true" className="material-symbols-outlined app-nav-expanded-only text-[18px]">keyboard_double_arrow_left</span>
            <span aria-hidden="true" className="material-symbols-outlined app-nav-collapsed-only text-[18px]">keyboard_double_arrow_right</span>
            <span className="sr-only">{locale === "zh" ? "收起或展开侧栏" : locale === "ko" ? "사이드바 접기 또는 펼치기" : "サイドバーを開閉"}</span>
          </label>
        </div>
        <p className="app-nav-expanded-only whitespace-nowrap px-14 pt-0.5 text-[11px] font-semibold tracking-wide text-slate-400">{t(locale, "nav.tagline")}</p>

        <div className="mt-5 flex-1 overflow-y-auto pr-1">
          <MainNavLinks links={links} orientation="column" />
          <section className="mt-5 border-t border-slate-800 pt-4">
            <div className="app-nav-expanded-only px-3">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">{settingsLabel}</p>
              <p className="mt-1 text-[10px] font-semibold leading-4 text-slate-600">{settingsHint}</p>
            </div>
            <div className="mt-2">
              <MainNavLinks links={adminLinks} orientation="column" />
            </div>
          </section>
        </div>

        <div className="app-nav-expanded-only mt-4 space-y-2 border-t border-slate-800 pt-4 [&_label]:w-full [&_label]:min-w-0 [&_select]:min-w-0">
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

      <header className="app-desktop-header fixed right-0 top-0 z-30 hidden h-16 items-center justify-between border-b border-slate-300 bg-[#f8f9ff]/95 px-8 backdrop-blur lg:flex">
        <div className="flex items-center gap-3 text-sm font-bold text-slate-900">
          <span aria-hidden="true" className="material-symbols-outlined text-[18px] text-[#1960a3]">task_alt</span>
          <AppRouteTitle locale={locale} />
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
