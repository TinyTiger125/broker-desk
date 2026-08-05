import { updateCaseWorkbenchFieldRulesAction } from "@/app/actions";
import { CaseWorkbenchFieldRulesSettings } from "@/components/case-workbench-field-rules-settings";
import { listCaseWorkbenchFieldRules } from "@/lib/data";
import { listCaseWorkbenchRuleCatalog } from "@/lib/case-workbench-field-rules";
import { getLocale, type Locale } from "@/lib/locale";
import { requireTenantSession } from "@/lib/tenant-session";

export const dynamic = "force-dynamic";

type CaseWorkbenchFieldSettingsPageProps = {
  searchParams?: Promise<{
    flash?: string;
  }>;
};

function tr(locale: Locale, messages: Record<Locale, string>) {
  return messages[locale];
}

export default async function CaseWorkbenchFieldSettingsPage({ searchParams }: CaseWorkbenchFieldSettingsPageProps) {
  const [locale, session, params] = await Promise.all([
    getLocale(),
    requireTenantSession({ permission: "tenant.update_settings" }),
    searchParams ?? Promise.resolve({} as { flash?: string }),
  ]);
  const rules = await listCaseWorkbenchFieldRules(session.user.id, session.tenant.id);
  const catalog = listCaseWorkbenchRuleCatalog(rules);

  return (
    <div className="space-y-6">
      <header>
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-indigo-700">
            {tr(locale, { ja: "設定", zh: "工作区设置", ko: "워크스페이스 설정" })}
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">
            {tr(locale, { ja: "情報分類・項目設定", zh: "必填项目设置", ko: "필수 항목 설정" })}
          </h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
            {tr(locale, {
              ja: "必須項目を選べます。未入力の必須項目は情報整理で先に表示されます。",
              zh: "选择办理案件时必须确认的项目。未填写的必填项目会优先显示，选填项目排在后面。",
              ko: "안건마다 반드시 확인할 항목을 선택합니다. 미입력 필수 항목은 정리 화면 위에 표시됩니다.",
            })}
          </p>
        </div>
      </header>
      <CaseWorkbenchFieldRulesSettings
        action={updateCaseWorkbenchFieldRulesAction}
        locale={locale}
        tenantName={session.tenant.name}
        userName={session.user.name}
        rules={catalog}
        saved={params.flash === "rules_saved"}
      />
    </div>
  );
}
