import { updateCaseWorkbenchFieldRulesAction } from "@/app/actions";
import { listCaseWorkbenchFieldRules } from "@/lib/data";
import { listCaseWorkbenchRuleCatalog, type EffectiveCaseWorkbenchFieldRule } from "@/lib/case-workbench-field-rules";
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

function groupRules(rules: EffectiveCaseWorkbenchFieldRule[]) {
  return rules.reduce<Array<{ id: string; label: string; rules: EffectiveCaseWorkbenchFieldRule[] }>>((groups, rule) => {
    const id = rule.groupId;
    const existing = groups.find((group) => group.id === id);
    if (existing) {
      existing.rules.push(rule);
    } else {
      groups.push({ id, label: rule.groupLabel, rules: [rule] });
    }
    return groups;
  }, []);
}

function requirementLabel(locale: Locale, requirement: "required" | "optional") {
  if (requirement === "required") return tr(locale, { ja: "必須", zh: "必填", ko: "필수" });
  return tr(locale, { ja: "任意", zh: "选填", ko: "선택" });
}

function appliesWhenLabel(locale: Locale, appliesWhen: EffectiveCaseWorkbenchFieldRule["appliesWhen"]) {
  const labels: Record<EffectiveCaseWorkbenchFieldRule["appliesWhen"], Record<Locale, string>> = {
    always: { ja: "常時", zh: "固定", ko: "항상" },
    lease_case: { ja: "賃貸", zh: "租赁", ko: "임대" },
    identity_document_available: { ja: "本人資料", zh: "本人资料", ko: "본인 자료" },
    employment_required: { ja: "勤務確認", zh: "工作确认", ko: "근무 확인" },
    guarantor_required: { ja: "保証人", zh: "保证人", ko: "보증인" },
    emergency_contact_required: { ja: "緊急連絡先", zh: "紧急联系人", ko: "긴급연락처" },
    co_occupant_exists: { ja: "同居人", zh: "同住人", ko: "동거인" },
    brokerage_or_management_known: { ja: "関係会社", zh: "关系公司", ko: "관계 회사" },
    output_template_selected: { ja: "出力時", zh: "输出时", ko: "출력 시" },
  };
  return labels[appliesWhen][locale];
}

export default async function CaseWorkbenchFieldSettingsPage({ searchParams }: CaseWorkbenchFieldSettingsPageProps) {
  const [locale, session, params] = await Promise.all([
    getLocale(),
    requireTenantSession({ permission: "tenant.update_settings" }),
    searchParams ?? Promise.resolve({} as { flash?: string }),
  ]);
  const rules = await listCaseWorkbenchFieldRules(session.user.id, session.tenant.id);
  const catalog = listCaseWorkbenchRuleCatalog(rules);
  const groupedRules = groupRules(catalog);
  const requiredCount = catalog.filter((rule) => rule.requirement === "required").length;
  const optionalCount = catalog.length - requiredCount;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-indigo-700">
            {tr(locale, { ja: "管理設定", zh: "后台管理", ko: "관리 설정" })}
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">
            {tr(locale, { ja: "情報整理の項目設定", zh: "整理信息项目设置", ko: "정보 정리 항목 설정" })}
          </h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
            {tr(locale, {
              ja: "案件整理画面に出す項目の優先度を管理します。未入力の必須項目が上に、任意項目がその下に表示されます。",
              zh: "管理案件整理页面的项目优先级。未填写的必填项会排在最上，选填项排在其后。",
              ko: "안건 정리 화면의 항목 우선순위를 관리합니다. 미입력 필수 항목이 위에, 선택 항목이 그 아래에 표시됩니다.",
            })}
          </p>
        </div>
        <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
          <div className="border-r border-slate-200 px-4 py-3">
            <p className="text-xs font-bold text-slate-500">{requirementLabel(locale, "required")}</p>
            <p className="mt-1 text-2xl font-black tabular-nums text-slate-950">{requiredCount}</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-xs font-bold text-slate-500">{requirementLabel(locale, "optional")}</p>
            <p className="mt-1 text-2xl font-black tabular-nums text-slate-950">{optionalCount}</p>
          </div>
        </div>
      </header>

      {params.flash === "rules_saved" ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
          {tr(locale, { ja: "設定を保存しました。", zh: "设置已保存。", ko: "설정을 저장했습니다." })}
        </div>
      ) : null}

      <form action={updateCaseWorkbenchFieldRulesAction} className="space-y-4">
        <input type="hidden" name="fieldKeysJson" value={JSON.stringify(catalog.map((rule) => rule.fieldKey))} />
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {groupedRules.map((group) => (
            <section key={group.id} className="border-b border-slate-200 last:border-b-0">
              <div className="flex items-center justify-between gap-3 bg-slate-50 px-4 py-3">
                <h2 className="text-sm font-black text-slate-950">{group.label}</h2>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold tabular-nums text-slate-600">
                  {group.rules.filter((rule) => rule.requirement === "required").length}/{group.rules.length}
                </span>
              </div>
              <div className="divide-y divide-slate-100">
                {group.rules.map((rule) => (
                  <div key={rule.fieldKey} className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_160px] md:items-center">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-950">{rule.label}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {rule.treePath.join(" / ")} · {appliesWhenLabel(locale, rule.appliesWhen)}
                      </p>
                    </div>
                    <select
                      name={`requirement:${rule.fieldKey}`}
                      defaultValue={rule.requirement}
                      className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900"
                    >
                      <option value="required">{requirementLabel(locale, "required")}</option>
                      <option value="optional">{requirementLabel(locale, "optional")}</option>
                    </select>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
        <div className="sticky bottom-0 flex justify-end border-t border-slate-200 bg-[#f8f9ff]/95 py-3 backdrop-blur">
          <button className="rounded-lg bg-slate-950 px-5 py-3 text-sm font-black text-white hover:bg-slate-800">
            {tr(locale, { ja: "設定を保存", zh: "保存设置", ko: "설정 저장" })}
          </button>
        </div>
      </form>
    </div>
  );
}
