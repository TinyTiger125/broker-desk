import Link from "next/link";
import { AccountSignOutButton } from "@/components/account-sign-out-button";
import { ActorSwitcher } from "@/components/actor-switcher";
import { AppRouteTitle } from "@/components/app-route-title";
import { ClerkAccountLabel } from "@/components/clerk-account-label";
import { HeaderPopover } from "@/components/header-popover";
import { LanguageSwitcher } from "@/components/language-switcher";
import { MainNavLinks } from "@/components/main-nav-links";
import { UiIcon } from "@/components/ui-icon";
import { isActorSwitchingEnabled } from "@/lib/actor";
import {
  listUsers,
} from "@/lib/data";
import { getConfiguredAuthProviderId, isExternalAuthEnabled, isClerkAuthEnabled } from "@/lib/auth-mode";
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
    { href: "/templates", label: locale === "zh" ? "输出文书管理" : locale === "ko" ? "출력 문서 관리" : "出力文書管理" },
    { href: "/settings/members", label: locale === "zh" ? "用户管理" : locale === "ko" ? "사용자 관리" : "ユーザー管理" },
    { href: "/settings/case-workbench-fields", label: locale === "zh" ? "输入信息/项目设置" : locale === "ko" ? "입력 정보/항목 설정" : "入力情報・項目設定" },
    { href: "/settings/output-templates", label: locale === "zh" ? "公司信息设置" : locale === "ko" ? "회사 정보 설정" : "自社情報設定" },
  ];
}

function getPlatformLinks(locale: Locale) {
  return [
    { href: "/platform/accounts", label: locale === "zh" ? "账户管理" : locale === "ko" ? "계정 관리" : "アカウント管理" },
    { href: "/platform/templates", label: locale === "zh" ? "官方文书模板" : locale === "ko" ? "공식 문서 템플릿" : "公式帳票テンプレート" },
  ];
}

function getHeaderMenuCopy(locale: Locale) {
  if (locale === "zh") {
    return {
      accountWorkspace: "账号与工作区设置",
      workspace: "工作区设置",
      workspaceHint: "模板、成员和工作区规则",
      platform: "平台管理",
      currentAccount: "当前账号",
      signOut: "退出登录",
    };
  }
  if (locale === "ko") {
    return {
      accountWorkspace: "계정 및 워크스페이스 설정",
      workspace: "워크스페이스 설정",
      workspaceHint: "템플릿, 팀, 워크스페이스 규칙",
      platform: "플랫폼 관리",
      currentAccount: "현재 계정",
      signOut: "로그아웃",
    };
  }
  return {
    accountWorkspace: "アカウントとワークスペース設定",
    workspace: "ワークスペース設定",
    workspaceHint: "テンプレート、メンバー、ワークスペース規則",
    platform: "プラットフォーム管理",
    currentAccount: "現在のアカウント",
    signOut: "ログアウト",
  };
}

export async function AppNav() {
  const locale = await getLocale();
  const actorSwitchingEnabled = isActorSwitchingEnabled();
  const clerkEnabled = isClerkAuthEnabled();
  const externalAuthEnabled = isExternalAuthEnabled();
  const authProvider = getConfiguredAuthProviderId() ?? "clerk";
  // Actor switching is a demo-only workflow. In Clerk mode the signed-in
  // account is the actor, so loading the entire demo user list on every page
  // only adds a remote database round trip and can leave an empty switcher.
  const actorSwitchingAvailable = actorSwitchingEnabled && !externalAuthEnabled;
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
  const canManageOutputTemplates = Boolean(
    currentCapability &&
      capabilityHasTenantPermission(currentCapability, "template.edit_draft") &&
      capabilityHasTenantPermission(currentCapability, "template.publish"),
  );
  const hasPlatformAccess = Boolean(platformSession);
  const adminLinks = [
    ...getAdminLinks(locale).filter(
      (link) =>
        serviceOperational &&
        (link.href !== "/settings/members" || canManageMembers) &&
        (link.href !== "/settings/output-templates" || canManageOutputTemplates),
    ),
    ...(!serviceOperational && tenantSession && canManageMembers
      ? [{ href: "/settings/members", label: locale === "zh" ? "订阅与成员" : locale === "ko" ? "구독 및 멤버" : "契約・ユーザー" }]
      : []),
  ];
  const platformLinks = hasPlatformAccess ? getPlatformLinks(locale) : [];
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

            <HeaderPopover
              title={menuCopy.accountWorkspace}
              panelClassName="app-header-menu-panel right-0 w-[min(24rem,calc(100vw-1rem))] p-3"
              trigger={
                <>
                <UiIcon name="settings" className="text-[18px]" />
                <span className="sr-only">{menuCopy.accountWorkspace}</span>
                </>
              }
            >
                <p className="px-2 pb-2 text-xs font-bold text-slate-900">{menuCopy.accountWorkspace}</p>
                <p className="px-2 text-[11px] font-bold text-slate-500">{menuCopy.currentAccount}</p>
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
                  {externalAuthEnabled ? <AccountSignOutButton provider={authProvider} label={menuCopy.signOut} /> : null}
                </div>
                <div className="mt-3 border-t border-slate-200 pt-3">
                  <p className="px-2 pb-1 text-xs font-bold text-slate-900">{menuCopy.workspace}</p>
                  <MainNavLinks links={adminLinks} orientation="column" />
                  {platformLinks.length > 0 ? (
                    <div data-platform-admin-group className="mt-2 border-t border-slate-200 pt-2">
                      <p className="px-2 pb-1 text-xs font-bold text-slate-900">{menuCopy.platform}</p>
                      <MainNavLinks links={platformLinks} orientation="column" />
                    </div>
                  ) : null}
                </div>
            </HeaderPopover>
          </div>

          <div className="app-mobile-primary-nav mt-3 border-t border-slate-100 pt-2">
            <MainNavLinks links={links} />
          </div>
        </div>
      </header>

      <aside className="app-desktop-sidebar fixed inset-y-0 left-0 z-40 hidden border-r bg-[#172033] p-4 text-white lg:flex lg:flex-col">
        <div className="flex items-center justify-between gap-2">
          <Link href="/" className="app-nav-brand flex min-w-0 items-center gap-3 rounded-md px-2 py-1 text-xl font-black tracking-tight text-white">
            <span aria-hidden="true" className="app-nav-mark flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-700 bg-slate-900 text-[13px] font-black tracking-tight">
              BD
            </span>
            <span className="app-nav-expanded-only truncate">{appTitle}</span>
          </Link>
          <label
            htmlFor="app-nav-collapsed"
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md border border-slate-700 bg-slate-900 text-slate-300 transition hover:border-slate-500 hover:text-white"
            title={locale === "zh" ? "收起/展开侧栏" : locale === "ko" ? "사이드바 접기/펼치기" : "サイドバーを開閉"}
          >
            <UiIcon name="keyboard_double_arrow_left" className="app-nav-expanded-only text-[18px]" />
            <UiIcon name="keyboard_double_arrow_right" className="app-nav-collapsed-only text-[18px]" />
            <span className="sr-only">{locale === "zh" ? "收起或展开侧栏" : locale === "ko" ? "사이드바 접기 또는 펼치기" : "サイドバーを開閉"}</span>
          </label>
        </div>
        <p className="app-nav-expanded-only whitespace-nowrap px-14 pt-0.5 text-[11px] font-semibold tracking-wide text-slate-400">{t(locale, "nav.tagline")}</p>

        <div className="mt-5 flex-1 overflow-y-auto pr-1">
          <MainNavLinks links={links} orientation="column" />
          {platformLinks.length > 0 ? (
            <div data-platform-admin-group className="mt-5 border-t border-slate-700 pt-4">
              <p className="app-nav-expanded-only px-3 pb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">{menuCopy.platform}</p>
              <MainNavLinks links={platformLinks} orientation="column" />
            </div>
          ) : null}
        </div>
      </aside>

      <header data-app-shell-top-occluder className="app-desktop-header fixed right-0 top-0 z-40 hidden h-16 items-center justify-between border-b border-slate-300 bg-[#f3f4f6]/95 px-8 backdrop-blur lg:flex">
        <div className="flex items-center gap-3 text-sm font-bold text-slate-900">
          <UiIcon name="task_alt" className="text-[18px] text-[#1960a3]" />
          <AppRouteTitle locale={locale} />
        </div>

        <div className="ml-6 flex items-center gap-2">
          <HeaderPopover
            title={menuCopy.accountWorkspace}
            panelClassName="app-header-menu-panel right-0 w-[min(24rem,calc(100vw-1rem))] p-3"
            trigger={
              <>
              <UiIcon name="settings" className="text-[20px]" />
              <span className="sr-only">{menuCopy.accountWorkspace}</span>
              </>
            }
          >
              <p className="px-2 pb-2 text-xs font-bold text-slate-900">{menuCopy.accountWorkspace}</p>
              <p className="px-2 text-[11px] font-bold text-slate-500">{menuCopy.currentAccount}</p>
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
                {externalAuthEnabled ? <AccountSignOutButton provider={authProvider} label={menuCopy.signOut} /> : null}
              </div>
              <div className="mt-3 border-t border-slate-200 pt-3">
                <p className="px-2 pb-1 text-xs font-bold text-slate-900">{menuCopy.workspace}</p>
                <p className="px-2 pb-2 text-xs text-slate-500">{menuCopy.workspaceHint}</p>
                <MainNavLinks links={adminLinks} orientation="column" />
                {platformLinks.length > 0 ? (
                  <div data-platform-admin-group className="mt-2 border-t border-slate-200 pt-2">
                    <p className="px-2 pb-1 text-xs font-bold text-slate-900">{menuCopy.platform}</p>
                    <MainNavLinks links={platformLinks} orientation="column" />
                  </div>
                ) : null}
              </div>
          </HeaderPopover>
        </div>
      </header>
    </>
  );
}
