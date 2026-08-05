"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import type { EffectiveCaseWorkbenchFieldRule, CaseFieldRequirement } from "@/lib/case-workbench-field-rules";
import type { Locale } from "@/lib/locale";

type RuleSettingsProps = {
  action: (formData: FormData) => void | Promise<void>;
  locale: Locale;
  tenantName: string;
  userName: string;
  rules: EffectiveCaseWorkbenchFieldRule[];
  saved: boolean;
};

type StatusFilter = "all" | "required" | "optional" | "changed";

type RuleGroup = {
  id: string;
  label: string;
  rules: EffectiveCaseWorkbenchFieldRule[];
};

type Branch = {
  id: string;
  label: string;
  rules: EffectiveCaseWorkbenchFieldRule[];
};

function tr(locale: Locale, messages: Record<Locale, string>) {
  return messages[locale];
}

function requirementLabel(locale: Locale, requirement: CaseFieldRequirement) {
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

function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}

function groupRules(rules: EffectiveCaseWorkbenchFieldRule[]) {
  return rules.reduce<RuleGroup[]>((groups, rule) => {
    const existing = groups.find((group) => group.id === rule.groupId);
    if (existing) {
      existing.rules.push(rule);
    } else {
      groups.push({ id: rule.groupId, label: rule.groupLabel, rules: [rule] });
    }
    return groups;
  }, []);
}

function branchLabel(rule: EffectiveCaseWorkbenchFieldRule) {
  const path = rule.treePath.length > 1 ? rule.treePath.slice(1) : rule.treePath;
  return path.join(" / ") || rule.groupLabel;
}

function groupBranches(rules: EffectiveCaseWorkbenchFieldRule[]) {
  return rules.reduce<Branch[]>((branches, rule) => {
    const label = branchLabel(rule);
    const id = `${rule.groupId}:${label}`;
    const existing = branches.find((branch) => branch.id === id);
    if (existing) {
      existing.rules.push(rule);
    } else {
      branches.push({ id, label, rules: [rule] });
    }
    return branches;
  }, []);
}

function SaveButton({ label, savingLabel }: { label: string; savingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-slate-950 px-5 py-3 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? savingLabel : label}
    </button>
  );
}

export function CaseWorkbenchFieldRulesSettings({
  action,
  locale,
  tenantName,
  userName,
  rules,
  saved,
}: RuleSettingsProps) {
  const groupedRules = useMemo(() => groupRules(rules), [rules]);
  const initialGroupId = groupedRules[0]?.id ?? "all";
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [activeGroupId, setActiveGroupId] = useState(initialGroupId);
  const [requirements, setRequirements] = useState<Record<string, CaseFieldRequirement>>(() =>
    Object.fromEntries(rules.map((rule) => [rule.fieldKey, rule.requirement])),
  );

  const normalizedQuery = normalizeSearch(query);
  const stats = useMemo(() => {
    const required = rules.filter((rule) => requirements[rule.fieldKey] === "required").length;
    const optional = rules.length - required;
    const changed = rules.filter((rule) => requirements[rule.fieldKey] !== rule.defaultRequirement).length;
    return { required, optional, changed };
  }, [requirements, rules]);

  const matchesRule = (rule: EffectiveCaseWorkbenchFieldRule) => {
    const currentRequirement = requirements[rule.fieldKey] ?? rule.requirement;
    const matchesGroup = activeGroupId === "all" || rule.groupId === activeGroupId;
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "changed"
        ? currentRequirement !== rule.defaultRequirement
        : currentRequirement === statusFilter);
    const searchable = [
      rule.label,
      rule.fieldKey,
      rule.groupLabel,
      branchLabel(rule),
      rule.treePath.join(" "),
      appliesWhenLabel(locale, rule.appliesWhen),
    ]
      .join(" ")
      .toLowerCase();
    const matchesSearch = !normalizedQuery || searchable.includes(normalizedQuery);
    return matchesGroup && matchesStatus && matchesSearch;
  };

  const visibleRules = rules.filter(matchesRule);
  const visibleFieldKeySet = new Set(visibleRules.map((rule) => rule.fieldKey));
  const visibleGroups = groupedRules
    .map((group) => ({
      ...group,
      rules: group.rules.filter((rule) => visibleFieldKeySet.has(rule.fieldKey)),
    }))
    .filter((group) => group.rules.length > 0);

  const toggleRequirement = (fieldKey: string) => {
    setRequirements((current) => ({
      ...current,
      [fieldKey]: current[fieldKey] === "required" ? "optional" : "required",
    }));
  };

  const setVisibleRequirements = (requirement: CaseFieldRequirement | "default") => {
    setRequirements((current) => {
      const next = { ...current };
      for (const rule of rules) {
        if (!visibleFieldKeySet.has(rule.fieldKey)) continue;
        next[rule.fieldKey] = requirement === "default" ? rule.defaultRequirement : requirement;
      }
      return next;
    });
  };

  const resetFilters = () => {
    setQuery("");
    setStatusFilter("all");
    setActiveGroupId(initialGroupId);
  };

  const statusFilters: Array<{ id: StatusFilter; label: string }> = [
    { id: "all", label: tr(locale, { ja: "すべて", zh: "全部", ko: "전체" }) },
    { id: "required", label: requirementLabel(locale, "required") },
    { id: "optional", label: requirementLabel(locale, "optional") },
    { id: "changed", label: tr(locale, { ja: "変更済み", zh: "已调整", ko: "변경됨" }) },
  ];

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="fieldKeysJson" value={JSON.stringify(rules.map((rule) => rule.fieldKey))} />
      {rules.map((rule) => (
        <input
          key={rule.fieldKey}
          type="hidden"
          name={`requirement:${rule.fieldKey}`}
          value={requirements[rule.fieldKey] ?? rule.requirement}
        />
      ))}

      <section className="grid min-w-0 gap-3 2xl:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]">
        <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm md:grid-cols-3">
          <div>
            <p className="text-xs font-bold text-slate-500">{tr(locale, { ja: "ワークスペース", zh: "工作区", ko: "워크스페이스" })}</p>
            <p className="mt-1 font-black text-slate-950">{tenantName}</p>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500">{tr(locale, { ja: "使用者", zh: "使用人", ko: "사용자" })}</p>
            <p className="mt-1 font-black text-slate-950">{userName}</p>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500">{tr(locale, { ja: "反映先", zh: "生效位置", ko: "적용 위치" })}</p>
            <p className="mt-1 font-semibold text-slate-700">
              {tr(locale, {
                ja: "情報整理画面の完成度と未入力順",
                zh: "整理信息页的完成度和待补顺序",
                ko: "정보 정리 화면의 완성도와 미입력 순서",
              })}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 overflow-hidden rounded-xl border border-slate-200 bg-white text-sm">
          <div className="border-r border-slate-200 px-4 py-4">
            <p className="text-xs font-bold text-slate-500">{requirementLabel(locale, "required")}</p>
            <p className="mt-1 text-2xl font-black tabular-nums text-slate-950">{stats.required}</p>
          </div>
          <div className="px-4 py-4">
            <p className="text-xs font-bold text-slate-500">{requirementLabel(locale, "optional")}</p>
            <p className="mt-1 text-2xl font-black tabular-nums text-slate-950">{stats.optional}</p>
          </div>
          <div className="border-l border-slate-200 px-4 py-4">
            <p className="text-xs font-bold text-slate-500">{tr(locale, { ja: "変更", zh: "已调整", ko: "변경" })}</p>
            <p className="mt-1 text-2xl font-black tabular-nums text-slate-950">{stats.changed}</p>
          </div>
        </div>
      </section>

      {saved ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
          {tr(locale, { ja: "設定を保存しました。", zh: "设置已保存。", ko: "설정을 저장했습니다." })}
        </div>
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-4">
          <div className="grid gap-3 2xl:grid-cols-[minmax(0,1fr)_auto] 2xl:items-center">
            <label className="relative block">
              <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-slate-400">
                search
              </span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={tr(locale, {
                  ja: "検索",
                  zh: "搜索字段、分枝或条件，例如 电话、保证人、勤務",
                  ko: "항목명, 분기, 조건 검색",
                })}
                className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3 text-sm font-semibold text-slate-900 outline-none focus:border-[#002FA7] focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              {statusFilters.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => setStatusFilter(filter.id)}
                  className={`h-10 rounded-lg px-4 text-sm font-black transition ${
                    statusFilter === filter.id
                      ? "bg-slate-950 text-white"
                      : "border border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-white"
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid min-h-[620px] min-w-0 2xl:grid-cols-[minmax(17rem,19rem)_minmax(0,1fr)]">
          <aside className="border-b border-slate-200 p-4 2xl:border-b-0 2xl:border-r">
            <p className="text-xs font-black text-[#002FA7]">
              {tr(locale, { ja: "主分類", zh: "主分类", ko: "대분류" })}
            </p>
            <div className="mt-3 grid gap-2">
              {groupedRules.map((group) => {
                const requiredInGroup = group.rules.filter((rule) => requirements[rule.fieldKey] === "required").length;
                const active = activeGroupId === group.id;
                return (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => setActiveGroupId(group.id)}
                    className={`rounded-xl border px-3 py-3 text-left transition ${
                      active
                        ? "border-slate-950 bg-slate-950 text-white"
                        : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-white"
                    }`}
                  >
                    <span className="block truncate text-sm font-black">{group.label}</span>
                    <span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-xs font-black tabular-nums ${
                      active ? "bg-white/15 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"
                    }`}>
                      {requiredInGroup}/{group.rules.length} {requirementLabel(locale, "required")}
                    </span>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setActiveGroupId("all")}
                className={`rounded-xl border px-3 py-3 text-left transition ${
                  activeGroupId === "all"
                    ? "border-slate-950 bg-slate-950 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                }`}
              >
                <span className="block text-sm font-black">{tr(locale, { ja: "全体を表示", zh: "显示全部", ko: "전체 보기" })}</span>
                <span className="mt-2 inline-flex rounded-full bg-white/15 px-2 py-0.5 text-xs font-black tabular-nums">
                  {rules.length}
                </span>
              </button>
            </div>
          </aside>

          <section className="min-w-0">
            <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50/70 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-black text-[#002FA7]">
                  {tr(locale, { ja: "項目設定", zh: "字段地图", ko: "필드 지도" })}
                </p>
                <h2 className="mt-1 text-lg font-black text-slate-950">
                  {visibleRules.length} / {rules.length}
                </h2>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  {tr(locale, {
                    ja: "項目をクリックして必須と任意を切り替えます。",
                    zh: "点击字段点即可在必填和选填之间切换；分枝会保留业务上下文。",
                    ko: "분기 안 항목을 클릭하면 필수와 선택이 전환됩니다.",
                  })}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setVisibleRequirements("required")} disabled={visibleRules.length === 0} className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-black text-slate-800 hover:bg-slate-50 disabled:opacity-50">
                  {tr(locale, { ja: "必須にする", zh: "当前分枝设为必填", ko: "현재 분기 필수" })}
                </button>
                <button type="button" onClick={() => setVisibleRequirements("optional")} disabled={visibleRules.length === 0} className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-black text-slate-800 hover:bg-slate-50 disabled:opacity-50">
                  {tr(locale, { ja: "任意にする", zh: "当前分枝设为选填", ko: "현재 분기 선택" })}
                </button>
                <button type="button" onClick={() => setVisibleRequirements("default")} disabled={visibleRules.length === 0} className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-black text-slate-800 hover:bg-slate-50 disabled:opacity-50">
                  {tr(locale, { ja: "標準に戻す", zh: "恢复默认", ko: "기본값 복원" })}
                </button>
                <button type="button" onClick={resetFilters} className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-black text-slate-800 hover:bg-slate-50">
                  {tr(locale, { ja: "リセット", zh: "重置", ko: "초기화" })}
                </button>
              </div>
            </div>

            <div className="space-y-5 p-4">
              {visibleGroups.map((group) => {
                const branches = groupBranches(group.rules);
                return (
                  <section key={group.id} className="rounded-2xl border border-slate-200 bg-white">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                      <div>
                        <p className="text-xs font-black text-slate-500">{tr(locale, { ja: "主分類", zh: "主分类", ko: "대분류" })}</p>
                        <h3 className="mt-1 text-base font-black text-slate-950">{group.label}</h3>
                      </div>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black tabular-nums text-slate-600">
                        {group.rules.length}
                      </span>
                    </div>
                    <div className="space-y-3 p-4">
                      {branches.map((branch) => {
                        const requiredInBranch = branch.rules.filter((rule) => requirements[rule.fieldKey] === "required").length;
                        return (
                          <div key={branch.id} className="grid min-w-0 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 2xl:grid-cols-[minmax(13rem,15rem)_minmax(0,1fr)]">
                            <div className="rounded-lg bg-white p-3 ring-1 ring-slate-100">
                              <p className="text-xs font-black text-[#002FA7]">{tr(locale, { ja: "分岐", zh: "分枝", ko: "분기" })}</p>
                              <h4 className="mt-1 text-sm font-black leading-5 text-slate-950">{branch.label}</h4>
                              <p className="mt-2 text-xs font-bold tabular-nums text-slate-500">
                                {requiredInBranch}/{branch.rules.length} {requirementLabel(locale, "required")}
                              </p>
                            </div>
                            <div className="flex min-w-0 flex-wrap content-start gap-2">
                              {branch.rules.map((rule) => {
                                const currentRequirement = requirements[rule.fieldKey] ?? rule.requirement;
                                const customized = currentRequirement !== rule.defaultRequirement;
                                return (
                                  <button
                                    key={rule.fieldKey}
                                    type="button"
                                    aria-pressed={currentRequirement === "required"}
                                    onClick={() => toggleRequirement(rule.fieldKey)}
                                    className={`group inline-flex min-h-10 max-w-full items-center gap-2 rounded-full border px-3 py-2 text-left text-xs font-black transition ${
                                      currentRequirement === "required"
                                        ? "border-rose-200 bg-rose-50 text-rose-800 hover:border-rose-300"
                                        : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50"
                                    }`}
                                  >
                                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                                      currentRequirement === "required" ? "bg-rose-500" : "bg-slate-300"
                                    }`} />
                                    <span className="truncate">{rule.label}</span>
                                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${
                                      currentRequirement === "required" ? "bg-white text-rose-700" : "bg-slate-100 text-slate-500"
                                    }`}>
                                      {requirementLabel(locale, currentRequirement)}
                                    </span>
                                    {customized ? (
                                      <span className="shrink-0 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700">
                                        {tr(locale, { ja: "変更", zh: "改", ko: "변경" })}
                                      </span>
                                    ) : null}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })}

              {visibleRules.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-16 text-center">
                  <p className="text-base font-black text-slate-950">
                    {tr(locale, { ja: "該当する項目がありません。", zh: "没有找到符合条件的字段。", ko: "조건에 맞는 항목이 없습니다." })}
                  </p>
                  <button type="button" onClick={resetFilters} className="mt-4 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50">
                    {tr(locale, { ja: "リセット", zh: "重置筛选", ko: "초기화" })}
                  </button>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </section>

      <div className="sticky bottom-0 flex justify-end border-t border-slate-200 bg-[#f8f9ff]/95 py-3 backdrop-blur">
        <SaveButton
          label={tr(locale, { ja: "設定を保存", zh: "保存设置", ko: "설정 저장" })}
          savingLabel={tr(locale, { ja: "保存中", zh: "保存中", ko: "저장 중" })}
        />
      </div>
    </form>
  );
}
