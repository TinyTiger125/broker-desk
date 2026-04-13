import Link from "next/link";
import { createClient } from "@/app/actions";
import { ClientForm, type ClientFormDefaults } from "@/components/client-form";
import {
  isClientFormAutofillField,
  getClientFormTemplateLabel,
  getClientFormTemplateDefaults,
  isClientFormTemplateKey,
  type ClientFormAutofillField,
  type ClientFormTemplateKey,
} from "@/lib/client-form-template";
import { parseClientIntakeMemo } from "@/lib/client-intake-parser";
import { getLocale } from "@/lib/locale";

type NewClientPageProps = {
  searchParams?: Promise<{
    template?: string;
    memo?: string;
    apply?: string;
    useField?: string | string[];
    threshold?: string;
  }>;
};

const texts = {
  ja: {
    title: "新規顧客登録",
    desc: "まずはコア情報だけ入力し、30秒で一次登録できます。",
    back: "顧客一覧へ戻る",
    templateTitle: "入力補助テンプレート（自動入力準備）",
    templateDesc: "初回入力を簡略化するため、業務タイプに応じた初期値を自動セットします。",
    recommended: "推奨テンプレート",
    notRecommended: "推奨テンプレートは判定できませんでした。",
    applied: "選択した抽出項目をフォームへ反映済みです。",
    notApplied: "抽出結果はまだフォームに反映されていません。下の確認欄から適用してください。",
    parseTitle: "ヒアリングメモ自動抽出（ルールベース）",
    parseDesc: "メモから用途・予算・エリア・審査状況などを抽出し、確認後にフォームへ反映します。",
    parsePlaceholder: "例: 港区中心の投資案件。予算は8,000万〜1億、月々返済30万円以内。事前審査は申請中。",
    parse: "メモを解析",
    clear: "解析結果をクリア",
    threshold: "自動適用の信頼度しきい値",
    applyThreshold: "しきい値を反映",
    extractedTitle: "抽出結果",
    confidence: "信頼度",
    belowThreshold: "しきい値未満",
    previewTitle: "反映プレビュー",
    previewEmpty: "反映対象がありません。",
    conflictTitle: "テンプレート値との衝突候補",
    applySelected: "選択項目をフォームに反映",
    resetSelected: "選択をリセット",
  },
  zh: {
    title: "新建客户",
    desc: "先输入核心信息，30 秒完成首次录入。",
    back: "返回客户列表",
    templateTitle: "输入辅助模板（自动填充准备）",
    templateDesc: "为简化首次录入，会按业务类型自动填入初始值。",
    recommended: "推荐模板",
    notRecommended: "无法判断推荐模板。",
    applied: "已将所选提取项应用到表单。",
    notApplied: "提取结果尚未应用到表单，请在下方确认后应用。",
    parseTitle: "访谈备注自动提取（规则）",
    parseDesc: "从备注中提取用途、预算、区域、预审状态等，确认后写入表单。",
    parsePlaceholder: "例：以港区为主的投资案。预算 8000万~1亿，月供 30万以内，预审申请中。",
    parse: "解析备注",
    clear: "清除解析结果",
    threshold: "自动应用置信度阈值",
    applyThreshold: "应用阈值",
    extractedTitle: "提取结果",
    confidence: "置信度",
    belowThreshold: "低于阈值",
    previewTitle: "应用预览",
    previewEmpty: "没有可应用项。",
    conflictTitle: "与模板值冲突项",
    applySelected: "将选中项应用到表单",
    resetSelected: "重置选择",
  },
  ko: {
    title: "신규 고객 등록",
    desc: "핵심 정보만 먼저 입력해 30초 내 1차 등록을 완료합니다.",
    back: "고객 목록으로",
    templateTitle: "입력 보조 템플릿(자동 채움 준비)",
    templateDesc: "초기 입력을 단순화하기 위해 업무 유형별 기본값을 자동 설정합니다.",
    recommended: "추천 템플릿",
    notRecommended: "추천 템플릿을 판별하지 못했습니다.",
    applied: "선택한 추출 항목을 폼에 반영했습니다.",
    notApplied: "추출 결과가 아직 폼에 반영되지 않았습니다. 아래에서 확인 후 적용하세요.",
    parseTitle: "상담 메모 자동 추출(룰 기반)",
    parseDesc: "메모에서 용도/예산/지역/심사 상태를 추출해 확인 후 폼에 반영합니다.",
    parsePlaceholder: "예: 미나토구 중심 투자건. 예산 8천만~1억, 월 상환 30만 이내, 사전심사 신청 중.",
    parse: "메모 분석",
    clear: "분석 결과 초기화",
    threshold: "자동 적용 신뢰도 임계값",
    applyThreshold: "임계값 반영",
    extractedTitle: "추출 결과",
    confidence: "신뢰도",
    belowThreshold: "임계값 미만",
    previewTitle: "반영 미리보기",
    previewEmpty: "반영 대상이 없습니다.",
    conflictTitle: "템플릿 값 충돌 후보",
    applySelected: "선택 항목을 폼에 반영",
    resetSelected: "선택 초기화",
  },
} as const;

export default async function NewClientPage({ searchParams }: NewClientPageProps) {
  const locale = await getLocale();
  const text = texts[locale];

  const params = (await searchParams) ?? {};
  const memo = (params.memo ?? "").trim();
  const rawTemplate = params.template ?? "";
  const memoParsed = memo ? parseClientIntakeMemo(memo, locale) : null;
  const templateKey: ClientFormTemplateKey = isClientFormTemplateKey(rawTemplate) ? rawTemplate : "none";
  const templateLabels = getClientFormTemplateLabel(locale);
  const recommendedTemplate = memoParsed?.recommendedTemplate ?? "none";
  const shouldApplyParsed = params.apply === "1";
  const thresholdRaw = Number(params.threshold ?? "0.75");
  const threshold = Number.isFinite(thresholdRaw) ? Math.min(0.99, Math.max(0, thresholdRaw)) : 0.75;
  const selectedRaw = Array.isArray(params.useField)
    ? params.useField
    : params.useField
      ? [params.useField]
      : [];
  const selectedFields = new Set<ClientFormAutofillField>(selectedRaw.filter(isClientFormAutofillField));

  const templateDefaults = getClientFormTemplateDefaults(templateKey, locale);
  const parsedSelectedDefaults: ClientFormDefaults = {};
  const conflicts: Array<{ field: string; templateValue: string; parsedValue: string }> = [];
  const previewApplied: Array<{ field: string; value: string; confidence: number }> = [];
  if (memoParsed && shouldApplyParsed) {
    for (const item of memoParsed.extracted) {
      if (!selectedFields.has(item.field)) continue;
      if (item.confidence < threshold) continue;
      const value = memoParsed.defaults[item.field];
      if (value === undefined) continue;
      (parsedSelectedDefaults as Record<string, unknown>)[item.field] = value;
      previewApplied.push({
        field: item.label,
        value: value instanceof Date ? value.toLocaleDateString(locale === "ja" ? "ja-JP" : locale === "zh" ? "zh-CN" : "ko-KR") : String(value),
        confidence: item.confidence,
      });
      const templateValue = (templateDefaults as Record<string, unknown>)[item.field];
      const toComparable = (input: unknown) => (input instanceof Date ? input.toDateString() : String(input ?? ""));
      if (templateValue !== undefined && toComparable(templateValue) !== toComparable(value)) {
        conflicts.push({
          field: item.label,
          templateValue:
            templateValue instanceof Date
              ? templateValue.toLocaleDateString(locale === "ja" ? "ja-JP" : locale === "zh" ? "zh-CN" : "ko-KR")
              : String(templateValue),
          parsedValue:
            value instanceof Date
              ? value.toLocaleDateString(locale === "ja" ? "ja-JP" : locale === "zh" ? "zh-CN" : "ko-KR")
              : String(value),
        });
      }
    }
  }

  const mergedNotes = [templateDefaults.notes, parsedSelectedDefaults.notes]
    .filter((value): value is string => Boolean(value))
    .join("\n");
  const defaults = {
    ...templateDefaults,
    ...parsedSelectedDefaults,
    notes: mergedNotes || undefined,
  } as ClientFormDefaults;
  const templateItems = (Object.keys(templateLabels) as ClientFormTemplateKey[]).map((key) => ({
    key,
    label: templateLabels[key],
  }));
  const encodedMemo = memo ? encodeURIComponent(memo) : "";

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">{text.title}</h1>
          <p className="mt-1 text-sm text-slate-600">{text.desc}</p>
        </div>
        <Link href="/clients" className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
          {text.back}
        </Link>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">{text.templateTitle}</h2>
        <p className="mt-1 text-xs text-slate-500">{text.templateDesc}</p>
        {memoParsed ? (
          <div className="mt-2 space-y-1 text-xs">
            {recommendedTemplate !== "none" ? (
              <p className="text-blue-700">
                {text.recommended}: 「{templateLabels[recommendedTemplate]}」
              </p>
            ) : (
              <p className="text-slate-500">{text.notRecommended}</p>
            )}
            {shouldApplyParsed ? (
              <p className="text-emerald-700">{text.applied}</p>
            ) : (
              <p className="text-slate-500">{text.notApplied}</p>
            )}
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          {templateItems.map((item) => (
            <Link
              key={item.key}
              href={
                item.key === "none"
                  ? memo
                    ? `/clients/new?memo=${encodedMemo}&threshold=${threshold.toFixed(2)}`
                    : "/clients/new"
                  : memo
                    ? `/clients/new?template=${item.key}&memo=${encodedMemo}&threshold=${threshold.toFixed(2)}`
                    : `/clients/new?template=${item.key}`
              }
              className={`rounded-full border px-3 py-1.5 text-xs ${
                templateKey === item.key
                  ? "border-blue-300 bg-blue-50 text-blue-700"
                  : "border-slate-300 text-slate-700 hover:bg-slate-100"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">{text.parseTitle}</h2>
        <p className="mt-1 text-xs text-slate-500">{text.parseDesc}</p>
        <form method="GET" action="/clients/new" className="mt-3 space-y-2">
          {templateKey !== "none" ? <input type="hidden" name="template" value={templateKey} /> : null}
          <input type="hidden" name="threshold" value={threshold.toFixed(2)} />
          <textarea
            name="memo"
            rows={4}
            defaultValue={memo}
            placeholder={text.parsePlaceholder}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700">
              {text.parse}
            </button>
            <Link href="/clients/new" className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-700 hover:bg-slate-100">
              {text.clear}
            </Link>
          </div>
        </form>
        <form method="GET" action="/clients/new" className="mt-3 flex flex-wrap items-center gap-2">
          {templateKey !== "none" ? <input type="hidden" name="template" value={templateKey} /> : null}
          {memo ? <input type="hidden" name="memo" value={memo} /> : null}
          <label className="text-xs text-slate-600">
            {text.threshold}
            <select
              name="threshold"
              defaultValue={threshold.toFixed(2)}
              className="ml-2 rounded-lg border border-slate-300 px-2 py-1 text-xs"
            >
              <option value="0.60">60%</option>
              <option value="0.70">70%</option>
              <option value="0.75">75%</option>
              <option value="0.80">80%</option>
              <option value="0.90">90%</option>
            </select>
          </label>
          <button type="submit" className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100">
            {text.applyThreshold}
          </button>
        </form>
        {memoParsed && memoParsed.extracted.length > 0 ? (
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-medium text-slate-700">{text.extractedTitle}</p>
            <form method="GET" action="/clients/new" className="mt-2 space-y-2">
              {templateKey !== "none" ? <input type="hidden" name="template" value={templateKey} /> : null}
              <input type="hidden" name="memo" value={memo} />
              <input type="hidden" name="apply" value="1" />
              <input type="hidden" name="threshold" value={threshold.toFixed(2)} />
              <ul className="space-y-2 text-xs text-slate-600">
                {memoParsed.extracted.map((item) => (
                  <li key={`${item.field}-${item.value}`} className="rounded-md border border-slate-200 bg-white p-2">
                    <label className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        name="useField"
                        value={item.field}
                        defaultChecked={shouldApplyParsed ? selectedFields.has(item.field) : item.confidence >= threshold}
                        className="mt-0.5"
                      />
                      <span className="flex-1">
                        <span className="font-medium text-slate-700">{item.label}</span>: {item.value}
                        <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">
                          {text.confidence} {Math.round(item.confidence * 100)}%
                        </span>
                        {item.confidence < threshold ? (
                          <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-700">
                            {text.belowThreshold}
                          </span>
                        ) : null}
                        <span className="mt-0.5 block text-[11px] text-slate-500">{item.reason}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              {shouldApplyParsed ? (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2">
                  <p className="text-xs font-medium text-emerald-700">
                    {text.previewTitle}（{Math.round(threshold * 100)}%）
                  </p>
                  <ul className="mt-1 space-y-1 text-xs text-emerald-700">
                    {previewApplied.length === 0 ? <li>{text.previewEmpty}</li> : null}
                    {previewApplied.map((item) => (
                      <li key={`${item.field}-${item.value}`}>
                        {item.field}: {item.value}（{Math.round(item.confidence * 100)}%）
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {shouldApplyParsed && conflicts.length > 0 ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-2">
                  <p className="text-xs font-medium text-amber-700">{text.conflictTitle}</p>
                  <ul className="mt-1 space-y-1 text-xs text-amber-700">
                    {conflicts.map((item) => (
                      <li key={`${item.field}-${item.templateValue}-${item.parsedValue}`}>
                        {item.field}: {item.templateValue} → {item.parsedValue}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <button type="submit" className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700">
                  {text.applySelected}
                </button>
                <Link
                  href={
                    templateKey !== "none"
                      ? `/clients/new?template=${templateKey}&memo=${encodedMemo}&threshold=${threshold.toFixed(2)}`
                      : `/clients/new?memo=${encodedMemo}&threshold=${threshold.toFixed(2)}`
                  }
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-700 hover:bg-slate-100"
                >
                  {text.resetSelected}
                </Link>
              </div>
            </form>
          </div>
        ) : null}
      </section>

      <ClientForm action={createClient} mode="create" defaults={defaults} locale={locale} />
    </div>
  );
}
