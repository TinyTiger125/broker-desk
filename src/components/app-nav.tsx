import Link from "next/link";
import { AccountSignOutButton } from "@/components/account-sign-out-button";
import { ActorSwitcher } from "@/components/actor-switcher";
import { AppRouteTitle } from "@/components/app-route-title";
import { ClerkAccountLabel } from "@/components/clerk-account-label";
import { LanguageSwitcher } from "@/components/language-switcher";
import { MainNavLinks } from "@/components/main-nav-links";
import { isActorSwitchingEnabled } from "@/lib/actor";
import {
  listUsers,
} from "@/lib/data";
import { isClerkAuthEnabled } from "@/lib/auth-mode";
import { localizeDemoText } from "@/lib/demo-localization";
import { t } from "@/lib/i18n";
import { getLocale, type Locale } from "@/lib/locale";
import { getPlatformOwnerSession } from "@/lib/platform-session";
import { capabilityHasTenantPermission } from "@/lib/tenant-permissions";
import { getTenantCapability, getTenantSessionForNavigation } from "@/lib/tenant-session";
import { isTenantServiceOperational } from "@/lib/tenant-service";

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
    { href: "/templates", label: locale === "zh" ? "模板库" : locale === "ko" ? "템플릿 라이브러리" : "テンプレートライブラリ" },
    { href: "/settings/members", label: locale === "zh" ? "团队成员" : locale === "ko" ? "팀 멤버" : "ユーザー管理" },
    { href: "/settings/case-workbench-fields", label: locale === "zh" ? "必填项目" : locale === "ko" ? "필수 항목" : "情報分類・項目設定" },
    { href: "/settings/output-templates", label: locale === "zh" ? "文书抬头" : locale === "ko" ? "문서 발행 정보" : "書類の発行元情報" },
  ];
}

function getHeaderMenuCopy(locale: Locale) {
  if (locale === "zh") {
    return {
      workspace: "工作区设置",
      workspaceHint: "模板、成员和工作区规则",
      account: "账号菜单",
      currentAccount: "当前账号",
      signOut: "退出登录",
    };
  }
  if (locale === "ko") {
    return {
      workspace: "워크스페이스 설정",
      workspaceHint: "템플릿, 팀, 워크스페이스 규칙",
      account: "계정 메뉴",
      currentAccount: "현재 계정",
      signOut: "로그아웃",
    };
  }
  return {
    workspace: "ワークスペース設定",
    workspaceHint: "テンプレート、メンバー、ワークスペース規則",
    account: "アカウントメニュー",
    currentAccount: "現在のアカウント",
    signOut: "ログアウト",
  };
}

export async function AppNav() {
  const locale = await getLocale();
  const actorSwitchingEnabled = isActorSwitchingEnabled();
  const clerkEnabled = isClerkAuthEnabled();
  // Actor switching is a demo-only workflow. In Clerk mode the signed-in
  // account is the actor, so loading the entire demo user list on every page
  // only adds a remote database round trip and can leave an empty switcher.
  const actorSwitchingAvailable = actorSwitchingEnabled && !clerkEnabled;
  const [users, tenantSession, platformSession] = await Promise.all([
    actorSwitchingAvailable ? listUsers(20) : Promise.resolve([]),
    // Resolve the current membership so company-management navigation can be
    // hidden for ordinary members and form administrators. Protected pages
    // still perform their own authorization before returning data.
    getTenantSessionForNavigation(),
    getPlatformOwnerSession(),
  ]);
  const serviceOperational = Boolean(tenantSession && isTenantServiceOperational(tenantSession.serviceState));
  const links = serviceOperational
    ? getLinks(locale)
    : [{ href: "/service-status", label: locale === "zh" ? "服务状态" : locale === "ko" ? "서비스 상태" : "サービス状態" }];
  // The page and shell share one request-scoped tenant resolution, avoiding a
  // second remote database round trip on every protected navigation.
  const currentActor = tenantSession?.user ?? null;
  const currentCapability = tenantSession ? getTenantCapability(tenantSession.membership) : null;
  const canManageMembers = Boolean(currentCapability && capabilityHasTenantPermission(currentCapability, "member.invite"));
  const hasPlatformAccess = Boolean(platformSession);
  const adminLinks = [
    ...getAdminLinks(locale).filter((link) => serviceOperational && (link.href !== "/settings/members" || canManageMembers)),
    ...(!serviceOperational && tenantSession && canManageMembers
      ? [{ href: "/settings/members", label: locale === "zh" ? "订阅与成员" : locale === "ko" ? "구독 및 멤버" : "契約・ユーザー" }]
      : []),
    ...(hasPlatformAccess
      ? [{ href: "/platform/accounts", label: locale === "zh" ? "账户管理" : locale === "ko" ? "계정 관리" : "アカウント管理" }]
      : []),
  ];
  const appTitle = t(locale, "app.title");
  const actorLabel = locale === "zh" ? "执行账号" : locale === "ko" ? "작업 계정" : "実行担当";
  const menuCopy = getHeaderMenuCopy(locale);
  const currentAccountLabel = clerkEnabled
    ? <ClerkAccountLabel fallback="-" />
    : currentActor?.name ?? "-";
  const actorOptions = users.map((item) => ({ id: item.id, name: localizeDemoText(locale, item.name) ?? item.name }));
  return (
    <>
      <input id="app-nav-collapsed" type="checkbox" className="app-nav-collapse-toggle sr-only" aria-hidden="true" />

      <header data-app-shell-top-occluder className="app-mobile-header sticky top-0 z-40 border-b border-slate-200 bg-white/98 lg:hidden">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <Link href="/" className="text-lg font-bold tracking-tight text-slate-900">
              {appTitle}
            </Link>

            <details className="app-header-menu relative">
              <summary className="app-header-menu-trigger" title={menuCopy.workspace}>
                <span aria-hidden="true" className="material-symbols-outlined text-[18px]">settings</span>
                <span className="sr-only">{menuCopy.workspace}</span>
              </summary>
              <div className="app-header-menu-panel right-0 mt-2 w-64 p-2">
                <p className="px-2 pb-2 text-xs font-bold text-slate-900">{menuCopy.workspace}</p>
                <MainNavLinks links={adminLinks} orientation="column" />
              </div>
            </details>
            <details className="app-header-menu relative">
              <summary className="app-header-menu-trigger" title={menuCopy.account}>
                <span aria-hidden="true" className="material-symbols-outlined text-[18px]">account_circle</span>
                <span className="sr-only">{menuCopy.account}</span>
              </summary>
              <div className="app-header-menu-panel right-0 mt-2 w-72 p-3">
                <p className="text-[11px] font-bold text-slate-500">{menuCopy.currentAccount}</p>
                <p className="mt-1 truncate text-sm font-bold text-slate-900">{currentAccountLabel}</p>
                <div className="mt-3 grid gap-2 [&_label]:min-w-0 [&_select]:min-w-0">
                  {actorSwitchingAvailable ? (
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
                  {clerkEnabled ? <AccountSignOutButton label={menuCopy.signOut} /> : null}
                </div>
              </div>
            </details>
          </div>

          <div className="mt-3 overflow-x-auto border-t border-slate-100 pt-2">
            <MainNavLinks links={links} />
          </div>
          <details className="mt-2 border-t border-slate-200 pt-2">
            <summary className="cursor-pointer px-1 text-xs font-bold text-slate-500">
              {menuCopy.account}
            </summary>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 [&_label]:min-w-0 [&_select]:min-w-0">
              {actorSwitchingAvailable ? (
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
              {clerkEnabled ? <AccountSignOutButton label={menuCopy.signOut} /> : null}
            </div>
          </details>
          <details className="mt-2 border-t border-slate-200 pt-2">
            <summary className="cursor-pointer px-1 text-xs font-bold text-slate-500">
              {menuCopy.workspace}
            </summary>
            <div className="mt-2 overflow-x-auto">
              <MainNavLinks links={adminLinks} />
            </div>
          </details>
        </div>
      </header>

      <aside className="app-desktop-sidebar fixed inset-y-0 left-0 z-40 hidden border-r bg-[#172033] p-4 text-white lg:flex lg:flex-col">
        <div className="flex items-center justify-between gap-2">
          <Link href="/" className="app-nav-brand flex min-w-0 items-center gap-3 rounded-md px-2 py-1 text-xl font-black tracking-tight text-white">
            <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-700 bg-slate-900">
              <span className="material-symbols-outlined text-[20px]">business_center</span>
            </span>
            <span className="app-nav-expanded-only truncate">{appTitle}</span>
          </Link>
          <label
            htmlFor="app-nav-collapsed"
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md border border-slate-700 bg-slate-900 text-slate-300 transition hover:border-slate-500 hover:text-white"
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
        </div>
      </aside>

      <header data-app-shell-top-occluder className="app-desktop-header fixed right-0 top-0 z-30 hidden h-16 items-center justify-between border-b border-slate-300 bg-[#f3f4f6]/95 px-8 backdrop-blur lg:flex">
        <div className="flex items-center gap-3 text-sm font-bold text-slate-900">
          <span aria-hidden="true" className="material-symbols-outlined text-[18px] text-[#1960a3]">task_alt</span>
          <AppRouteTitle locale={locale} />
        </div>

        <div className="ml-6 flex items-center gap-2">
          <details className="app-header-menu relative">
            <summary className="app-header-menu-trigger" title={menuCopy.workspace}>
              <span aria-hidden="true" className="material-symbols-outlined text-[19px]">settings</span>
              <span className="sr-only">{menuCopy.workspace}</span>
            </summary>
            <div className="app-header-menu-panel right-0 mt-2 w-64 p-2">
              <p className="px-2 pb-2 text-xs font-bold text-slate-900">{menuCopy.workspace}</p>
              <p className="px-2 pb-2 text-xs text-slate-500">{menuCopy.workspaceHint}</p>
              <MainNavLinks links={adminLinks} orientation="column" />
            </div>
          </details>
          <details className="app-header-menu relative">
            <summary className="app-header-menu-trigger" title={menuCopy.account}>
              <span aria-hidden="true" className="material-symbols-outlined text-[20px]">account_circle</span>
              <span className="sr-only">{menuCopy.account}</span>
            </summary>
            <div className="app-header-menu-panel right-0 mt-2 w-72 p-3">
              <p className="text-[11px] font-bold text-slate-500">{menuCopy.currentAccount}</p>
              <p className="mt-1 truncate text-sm font-bold text-slate-900">{currentAccountLabel}</p>
              <div className="mt-3 grid gap-2 [&_label]:min-w-0 [&_select]:min-w-0">
                {actorSwitchingAvailable ? (
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
                {clerkEnabled ? <AccountSignOutButton label={menuCopy.signOut} /> : null}
              </div>
            </div>
          </details>
        </div>
      </header>
    </>
  );
}
