import Link from "next/link";
import { generateOutputDocumentAction } from "@/app/actions";
import { FormDraftAssist } from "@/components/form-draft-assist";
import { PageFlashBanner } from "@/components/page-flash-banner";
import { listQuoteFormData, listQuotations } from "@/lib/data";
import { formatCurrency, formatDate } from "@/lib/format";
import { listHubGeneratedOutputs, listHubParties } from "@/lib/hub";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import { getOutputDocDescription, getOutputDocLabel, isOutputDocType, type OutputDocType } from "@/lib/output-doc";

export const dynamic = "force-dynamic";

const outputTypes: OutputDocType[] = ["proposal", "estimate_sheet", "funding_plan", "assumption_memo"];
const iconByType: Record<OutputDocType, string> = {
  proposal: "description",
  estimate_sheet: "receipt_long",
  funding_plan: "payments",
  assumption_memo: "fact_check",
};

const iconColorByType: Record<OutputDocType, string> = {
  proposal: "bg-blue-50 text-blue-600",
  estimate_sheet: "bg-emerald-50 text-emerald-600",
  funding_plan: "bg-amber-50 text-amber-600",
  assumption_memo: "bg-[#003366] text-white",
};

const outputCenterCopy = {
  ja: {
    subtitle: "帳票種別を選択し、対外向け資料を標準フォーマットで出力します。",
    recentActivity: "最近の更新",
    newBatchOutput: "一括出力を作成",
    selected: "選択中",
    selectTemplate: "テンプレート選択",
    generationSettings: "出力設定",
    targetQuote: "対象提案",
    targetProperty: "対象物件",
    targetParty: "対象関係者",
    outputFormat: "出力形式",
    language: "言語",
    generateDocument: "帳票を生成",
    recentOutputs: "出力履歴",
    viewAll: "すべて表示",
    allType: "すべての種別",
    allLang: "すべての言語",
    allFormat: "すべての形式",
    filterApply: "適用",
    filterReset: "リセット",
    emptyFilteredOutputs: "現在のフィルタ条件に一致する出力履歴がありません。",
    previewMode: "プレビュー",
    download: "ダウンロード",
    preparedFor: "提出先",
    dateIssued: "発行日",
    pageLabel: "ページ",
    propertyOption1: "スカイラインレジデンス - 1402号室",
    propertyOption2: "リバーサイドガーデンズ - ペントハウスB",
    partyOption1: "佐藤 健一（購入検討）",
    partyOption2: "ロドリゲス エレナ（投資家）",
    formatPdf: "PDF",
    formatDocx: "DOCX",
    langJa: "日本語 (JP)",
    langZh: "中国語 (CN)",
    langKo: "韓国語 (KR)",
    previewSubtitle: "前提条件および取引条件の説明",
    preparedForValue: "佐藤 健一 様",
    issuedDateValue: "2026年3月29日",
    section1Title: "1. 物件概要",
    fieldAddress: "所在地",
    fieldArea: "専有面積",
    fieldLayout: "間取り",
    valueAddress: "東京都港区赤坂9-7-1",
    valueArea: "85.42 m²",
    valueLayout: "2LDK",
    section2Title: "2. 取引条件",
    section2Desc: "本説明書は売買契約締結時に、対象物件の権利関係・法的規制・契約条件を説明するものです。",
    bullet1: "現況有姿での引渡しを原則とします。",
    bullet2: "売買代金の10%を手付金としてお支払いいただきます。",
    bullet3: "ローン特約期限は契約締結日から21日以内です。",
    section3Title: "3. 署名欄",
    sellerSign: "売主 署名",
    buyerSign: "買主 署名",
    docIdLabel: "文書ID",
  },
  zh: {
    subtitle: "选择文书类型，按标准格式生成对外业务资料。",
    recentActivity: "最近动态",
    newBatchOutput: "新建批量输出",
    selected: "已选择",
    selectTemplate: "选择模板",
    generationSettings: "生成设置",
    targetQuote: "目标提案",
    targetProperty: "目标物件",
    targetParty: "目标主体",
    outputFormat: "输出格式",
    language: "语言",
    generateDocument: "生成文书",
    recentOutputs: "输出历史",
    viewAll: "查看全部",
    allType: "全部类型",
    allLang: "全部语言",
    allFormat: "全部格式",
    filterApply: "应用",
    filterReset: "重置",
    emptyFilteredOutputs: "当前筛选条件下暂无输出记录。",
    previewMode: "预览模式",
    download: "下载",
    preparedFor: "面向对象",
    dateIssued: "签发日期",
    pageLabel: "页",
    propertyOption1: "天际公寓 - 1402室",
    propertyOption2: "河畔花园 - 顶层B",
    partyOption1: "佐藤健一（意向客户）",
    partyOption2: "Elena Rodriguez（投资方）",
    formatPdf: "PDF",
    formatDocx: "DOCX",
    langJa: "日语 (JP)",
    langZh: "中文 (CN)",
    langKo: "韩语 (KR)",
    previewSubtitle: "前提条件与交易条款说明",
    preparedForValue: "佐藤健一 先生",
    issuedDateValue: "2026-03-29",
    section1Title: "1. 物件概要",
    fieldAddress: "地址",
    fieldArea: "专有面积",
    fieldLayout: "户型",
    valueAddress: "东京都港区赤坂9-7-1",
    valueArea: "85.42 m²",
    valueLayout: "2室1厅",
    section2Title: "2. 交易条件",
    section2Desc: "本说明用于在签约前说明目标物件的权利关系、法律限制及主要交易条件。",
    bullet1: "原则上按现状交付。",
    bullet2: "需支付成交价 10% 作为定金。",
    bullet3: "贷款特约期限为签约日起 21 日内。",
    section3Title: "3. 签署栏",
    sellerSign: "卖方签署",
    buyerSign: "买方签署",
    docIdLabel: "文档ID",
  },
  ko: {
    subtitle: "문서 유형을 선택해 표준 형식의 대외 문서를 생성합니다.",
    recentActivity: "최근 활동",
    newBatchOutput: "일괄 출력 생성",
    selected: "선택됨",
    selectTemplate: "템플릿 선택",
    generationSettings: "생성 설정",
    targetQuote: "대상 제안",
    targetProperty: "대상 매물",
    targetParty: "대상 관계자",
    outputFormat: "출력 형식",
    language: "언어",
    generateDocument: "문서 생성",
    recentOutputs: "출력 이력",
    viewAll: "전체 보기",
    allType: "전체 유형",
    allLang: "전체 언어",
    allFormat: "전체 형식",
    filterApply: "적용",
    filterReset: "초기화",
    emptyFilteredOutputs: "현재 필터 조건에 맞는 출력 이력이 없습니다.",
    previewMode: "미리보기",
    download: "다운로드",
    preparedFor: "제출 대상",
    dateIssued: "발행일",
    pageLabel: "페이지",
    propertyOption1: "스카이라인 레지던스 - 1402호",
    propertyOption2: "리버사이드 가든스 - 펜트하우스 B",
    partyOption1: "사토 켄이치(구매 검토)",
    partyOption2: "엘레나 로드리게스(투자자)",
    formatPdf: "PDF",
    formatDocx: "DOCX",
    langJa: "일본어 (JP)",
    langZh: "중국어 (CN)",
    langKo: "한국어 (KR)",
    previewSubtitle: "전제 조건 및 거래 조건 설명",
    preparedForValue: "사토 켄이치 님",
    issuedDateValue: "2026-03-29",
    section1Title: "1. 매물 개요",
    fieldAddress: "주소",
    fieldArea: "전용 면적",
    fieldLayout: "구조",
    valueAddress: "도쿄도 미나토구 아카사카 9-7-1",
    valueArea: "85.42 m²",
    valueLayout: "2LDK",
    section2Title: "2. 거래 조건",
    section2Desc: "본 설명서는 계약 체결 전 대상 매물의 권리관계, 법적 규제, 계약 조건을 안내합니다.",
    bullet1: "현 상태 기준 인도를 원칙으로 합니다.",
    bullet2: "매매대금의 10%를 계약금으로 납부합니다.",
    bullet3: "대출 특약 기한은 계약 체결일로부터 21일 이내입니다.",
    section3Title: "3. 서명란",
    sellerSign: "매도인 서명",
    buyerSign: "매수인 서명",
    docIdLabel: "문서ID",
  },
} as const;

type OutputCenterPageProps = {
  searchParams?: Promise<{
    type?: string;
    format?: string;
    lang?: string;
    zoom?: string;
    quoteId?: string;
    historyType?: string;
    historyLang?: string;
    historyFormat?: string;
    flash?: string;
    issues?: string;
    generatedOutputId?: string;
  }>;
};

export default async function OutputCenterPage({ searchParams }: OutputCenterPageProps) {
  const locale = await getLocale();
  const params = searchParams ? await searchParams : undefined;
  const copy = outputCenterCopy[locale];
  const [{ properties }, quotes, parties] = await Promise.all([
    listQuoteFormData(),
    listQuotations(100),
    listHubParties(locale),
  ]);
  const outputs = await listHubGeneratedOutputs(locale);
  const historyType =
    params?.historyType && isOutputDocType(params.historyType) ? params.historyType : "all";
  const historyLang =
    params?.historyLang === "ja" || params?.historyLang === "zh" || params?.historyLang === "ko"
      ? params.historyLang
      : "all";
  const historyFormat = params?.historyFormat === "docx" || params?.historyFormat === "pdf" ? params.historyFormat : "all";
  const filteredOutputs = outputs.filter(
    (item) =>
      (historyType === "all" ? true : item.outputType === historyType) &&
      (historyLang === "all" ? true : item.language === historyLang) &&
      (historyFormat === "all" ? true : item.outputFormat === historyFormat)
  );
  const latestOutputs = filteredOutputs.slice(0, 3);
  const requestedType = String(params?.type ?? "").trim();
  const selectedType: OutputDocType = isOutputDocType(requestedType) ? requestedType : "assumption_memo";
  const selectedFormat = params?.format === "docx" ? "docx" : "pdf";
  const selectedLanguage = params?.lang === "zh" || params?.lang === "ko" || params?.lang === "ja" ? params.lang : locale;
  const selectedZoom = params?.zoom === "75" || params?.zoom === "85" || params?.zoom === "100" ? params.zoom : "85";
  const requestedQuoteId = String(params?.quoteId ?? "").trim();
  const defaultQuoteId = requestedQuoteId || latestOutputs[0]?.sourceQuoteId || quotes[0]?.id || "";
  const selectedQuote = quotes.find((quote) => quote.id === defaultQuoteId) ?? quotes[0];
  const previewQuoteId = selectedQuote?.id;
  const selectedPropertyId = selectedQuote?.propertyId ?? properties[0]?.id ?? "";
  const selectedProperty = properties.find((property) => property.id === selectedPropertyId) ?? properties[0];
  const selectedPartyId = selectedQuote?.clientId ?? parties[0]?.id ?? "";
  const selectedParty = parties.find((party) => party.id === selectedPartyId) ?? parties[0];
  const selectedGeneratedOutput = outputs.find(
    (item) =>
      item.sourceQuoteId === previewQuoteId &&
      item.outputType === selectedType &&
      item.outputFormat === selectedFormat &&
      item.language === selectedLanguage
  );
  const selectedDownloadHref = selectedGeneratedOutput
    ? `/api/outputs/${selectedGeneratedOutput.id}/download?locale=${locale}`
    : previewQuoteId
      ? `/quotes/${previewQuoteId}/print?type=${selectedType}`
      : "/quotes";
  const issuedDateValue = new Date().toLocaleDateString(
    locale === "zh" ? "zh-CN" : locale === "ko" ? "ko-KR" : "ja-JP"
  );
  const previewDocId = `BD-${selectedType.toUpperCase()}-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;
  const returnToCurrent = `/output-center?type=${selectedType}&format=${selectedFormat}&lang=${selectedLanguage}&quoteId=${selectedQuote?.id ?? ""}&historyType=${historyType}&historyLang=${historyLang}&historyFormat=${historyFormat}`;
  const highlightOutputId = String(params?.generatedOutputId ?? "").trim();
  const highlightedOutput = highlightOutputId ? outputs.find((o) => o.id === highlightOutputId) : undefined;
  const isHighlightFiltered = highlightedOutput ? !filteredOutputs.some((o) => o.id === highlightOutputId) : false;
  const issueCodes = String(params?.issues ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const issueMessageMap: Record<string, { ja: string; zh: string; ko: string }> = {
    missing_listing_price: {
      ja: "提案の物件価格が未設定です。",
      zh: "提案中的物件价格未填写。",
      ko: "제안의 매물 가격이 비어 있습니다.",
    },
    missing_summary: {
      ja: "提案サマリーが未入力です。",
      zh: "提案摘要未填写。",
      ko: "제안 요약이 비어 있습니다.",
    },
    missing_target_property: {
      ja: "対象物件を選択してください。",
      zh: "请选择目标物件。",
      ko: "대상 매물을 선택해 주세요.",
    },
    missing_target_party: {
      ja: "対象関係者を選択してください。",
      zh: "请选择目标主体。",
      ko: "대상 관계자를 선택해 주세요.",
    },
    missing_estimate_breakdown: {
      ja: "費用見積明細書に必要な費用内訳が不足しています。",
      zh: "费用明细书所需费用项不足。",
      ko: "비용 명세서에 필요한 비용 항목이 부족합니다.",
    },
    missing_down_payment: {
      ja: "資金計画書の頭金が未設定です。",
      zh: "资金计划书所需首付款未填写。",
      ko: "자금 계획서의 계약금이 비어 있습니다.",
    },
    missing_loan_amount: {
      ja: "資金計画書の借入額が未設定です。",
      zh: "资金计划书所需贷款额未填写。",
      ko: "자금 계획서의 대출 금액이 비어 있습니다.",
    },
    missing_monthly_payment: {
      ja: "資金計画書の月々返済額が未設定です。",
      zh: "资金计划书所需月供未填写。",
      ko: "자금 계획서의 월 상환액이 비어 있습니다.",
    },
    missing_interest_rate: {
      ja: "資金計画書の金利が未設定です。",
      zh: "资金计划书所需利率未填写。",
      ko: "자금 계획서의 금리가 비어 있습니다.",
    },
    missing_loan_years: {
      ja: "資金計画書の返済年数が未設定です。",
      zh: "资金计划书所需贷款年限未填写。",
      ko: "자금 계획서의 상환 연수가 비어 있습니다.",
    },
  };
  const issueMessages = issueCodes.map((code) => issueMessageMap[code]?.[locale]).filter(Boolean) as string[];
  const flashMap = {
    output_generated: {
      ja: "帳票を生成しました。",
      zh: "文书已生成。",
      ko: "문서를 생성했습니다.",
    },
    output_validation_failed: {
      ja: "出力前チェックで不足項目が見つかりました。",
      zh: "输出前校验发现缺失项。",
      ko: "출력 전 점검에서 누락 항목이 발견되었습니다.",
    },
  } as const;
  const flashKey = String(params?.flash ?? "").trim() as keyof typeof flashMap;
  const flashMessage = flashMap[flashKey]?.[locale];

  return (
    <div className="space-y-8">
      <header className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-slate-900">{t(locale, "output.title")}</h1>
          <p className="mt-1 text-sm font-medium text-slate-600">{copy.subtitle}</p>
        </div>
        <div className="flex gap-3">
          <Link
            href={`/api/hub/export?scope=outputs&locale=${locale}${historyType !== "all" ? `&type=${historyType}` : ""}${historyLang !== "all" ? `&lang=${historyLang}` : ""}${historyFormat !== "all" ? `&format=${historyFormat}` : ""}`}
            className="inline-flex items-center gap-2 rounded-lg bg-[#e9effc] px-4 py-2 text-sm font-semibold text-slate-800"
          >
            <span className="material-symbols-outlined text-[18px]">history</span>
            {copy.recentActivity}
          </Link>
          <Link href="/quotes/new" className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-[#001e40] to-[#003366] px-5 py-2 text-sm font-semibold text-white shadow-[0_8px_20px_-10px_rgba(0,30,64,0.8)]">
            <span className="material-symbols-outlined text-[18px]">add</span>
            {copy.newBatchOutput}
          </Link>
        </div>
      </header>
      <PageFlashBanner message={flashMessage} />
      {issueMessages.length > 0 ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-semibold">
            {locale === "zh"
              ? "请先补齐以下项目："
              : locale === "ko"
                ? "아래 항목을 먼저 보완해 주세요:"
                : "以下の項目を先に補完してください:"}
          </p>
          <ul className="mt-1 list-disc pl-5">
            {issueMessages.map((msg) => (
              <li key={msg}>{msg}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-12">
        {outputTypes.map((type) => {
          const selected = type === selectedType;
          return (
            <article
              key={type}
              className={
                "group relative overflow-hidden rounded-xl bg-white p-6 shadow-sm ring-1 transition xl:col-span-3 " +
                (selected ? "ring-[#001e40]/20" : "ring-slate-200/30 hover:shadow-md")
              }
            >
              <div className="absolute right-4 top-4 opacity-5">
                <span className="material-symbols-outlined text-6xl">{iconByType[type]}</span>
              </div>
              <div className={`mb-6 flex h-12 w-12 items-center justify-center rounded-lg ${iconColorByType[type]}`}>
                <span className="material-symbols-outlined">{iconByType[type]}</span>
              </div>
              <h2 className="text-xl font-bold tracking-tight text-slate-900">{getOutputDocLabel(locale, type)}</h2>
              <p className="mt-1 min-h-12 text-xs leading-relaxed text-slate-500">{getOutputDocDescription(locale, type)}</p>
              {selected ? (
                <div className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#001e40] py-2 text-xs font-bold text-white">
                  <span className="material-symbols-outlined text-[16px]">check_circle</span>
                  {copy.selected}
                </div>
              ) : (
                <Link href={`/output-center?type=${type}&format=${selectedFormat}&lang=${selectedLanguage}&quoteId=${selectedQuote?.id ?? ""}&historyType=${historyType}&historyLang=${historyLang}&historyFormat=${historyFormat}`} className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-[#edf2fd] py-2 text-xs font-bold text-slate-700 transition hover:bg-[#e1eafc]">
                  {copy.selectTemplate}
                </Link>
              )}
            </article>
          );
        })}
      </section>

      <section className="grid gap-8 xl:grid-cols-12">
        <div className="space-y-7 xl:col-span-5">
          <article className="rounded-xl bg-[#edf2fd] p-7">
            <h2 className="mb-6 text-xs font-black uppercase tracking-widest text-slate-700">{copy.generationSettings}</h2>
            <form id="output-generate-form" action={generateOutputDocumentAction} className="space-y-5">
              <input type="hidden" name="type" value={selectedType} />
              <input type="hidden" name="returnTo" value={returnToCurrent} />
              <label className="block space-y-2">
                <span className="text-xs font-bold text-slate-500">{copy.targetQuote}</span>
                <div className="relative">
                  <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-slate-400">description</span>
                  <select
                    className="w-full rounded-lg border-none bg-white py-3 pl-10 pr-3 text-sm font-medium"
                    name="quoteId"
                    defaultValue={selectedQuote?.id ?? ""}
                  >
                    {quotes.map((quote) => (
                      <option key={quote.id} value={quote.id}>
                        {quote.quoteTitle} - {quote.client.name}
                      </option>
                    ))}
                  </select>
                </div>
              </label>
              <label className="block space-y-2">
                <span className="text-xs font-bold text-slate-500">{copy.targetProperty}</span>
                <div className="relative">
                  <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-slate-400">home</span>
                  <select
                    className="w-full rounded-lg border-none bg-white py-3 pl-10 pr-3 text-sm font-medium"
                    name="targetProperty"
                    defaultValue={selectedPropertyId}
                  >
                    {properties.map((property) => (
                      <option key={property.id} value={property.id}>
                        {property.name}
                      </option>
                    ))}
                  </select>
                </div>
              </label>

              <label className="block space-y-2">
                <span className="text-xs font-bold text-slate-500">{copy.targetParty}</span>
                <div className="relative">
                  <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-slate-400">person</span>
                  <select
                    className="w-full rounded-lg border-none bg-white py-3 pl-10 pr-3 text-sm font-medium"
                    name="targetParty"
                    defaultValue={selectedPartyId}
                  >
                    {parties.map((party) => (
                      <option key={party.id} value={party.id}>
                        {party.name}
                      </option>
                    ))}
                  </select>
                </div>
              </label>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-500">{copy.outputFormat}</span>
                  <div className="grid grid-cols-2 rounded-lg bg-white p-1">
                    <label
                      className={
                        "cursor-pointer rounded-md py-2 text-center text-xs font-bold " +
                        (selectedFormat === "pdf" ? "bg-white text-slate-900 shadow-sm" : "text-slate-400")
                      }
                    >
                      <input type="radio" name="outputFormat" value="pdf" defaultChecked={selectedFormat === "pdf"} className="sr-only" />
                      {copy.formatPdf}
                    </label>
                    <label
                      className={
                        "cursor-pointer rounded-md py-2 text-center text-xs font-bold " +
                        (selectedFormat === "docx" ? "bg-white text-slate-900 shadow-sm" : "text-slate-400")
                      }
                    >
                      <input type="radio" name="outputFormat" value="docx" defaultChecked={selectedFormat === "docx"} className="sr-only" />
                      {copy.formatDocx}
                    </label>
                  </div>
                </div>
                <label className="space-y-2">
                  <span className="text-xs font-bold text-slate-500">{copy.language}</span>
                  <select className="w-full rounded-lg border-none bg-white px-3 py-3 text-xs font-bold" name="language" defaultValue={selectedLanguage}>
                    <option value="ja">{copy.langJa}</option>
                    <option value="zh">{copy.langZh}</option>
                    <option value="ko">{copy.langKo}</option>
                  </select>
                </label>
              </div>

              {previewQuoteId ? (
                <button
                  type="submit"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#001e40] py-4 text-sm font-black uppercase tracking-widest text-white shadow-[0_14px_24px_-14px_rgba(0,30,64,0.95)]"
                >
                  <span className="material-symbols-outlined text-[18px]">description</span>
                  {copy.generateDocument}
                </button>
              ) : (
                <button
                  disabled
                  className="inline-flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-lg bg-slate-400 py-4 text-sm font-black uppercase tracking-widest text-white"
                >
                  <span className="material-symbols-outlined text-[18px]">description</span>
                  {copy.generateDocument}
                </button>
              )}
            </form>
            <FormDraftAssist
              formId="output-generate-form"
              storageKey="draft:output-center:generate"
              fieldNames={["quoteId", "targetProperty", "targetParty", "outputFormat", "language"]}
              reuseKey="output-center:generate"
              locale={locale}
              className="mt-3"
            />
          </article>

          <article className="rounded-xl bg-white p-7 shadow-sm ring-1 ring-slate-200/35">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-700">{copy.recentOutputs}</h2>
              <Link
                href={`/api/hub/export?scope=outputs&locale=${locale}${historyType !== "all" ? `&type=${historyType}` : ""}${historyLang !== "all" ? `&lang=${historyLang}` : ""}${historyFormat !== "all" ? `&format=${historyFormat}` : ""}`}
                className="text-[11px] font-bold text-[#001e40] hover:underline"
              >
                {copy.viewAll}
              </Link>
            </div>
            <form action="/output-center" method="get" className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-5">
              <input type="hidden" name="type" value={selectedType} />
              <input type="hidden" name="format" value={selectedFormat} />
              <input type="hidden" name="lang" value={selectedLanguage} />
              <input type="hidden" name="quoteId" value={selectedQuote?.id ?? ""} />
              <select
                name="historyType"
                defaultValue={historyType}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-700"
              >
                <option value="all">{copy.allType}</option>
                {outputTypes.map((type) => (
                  <option key={type} value={type}>
                    {getOutputDocLabel(locale, type)}
                  </option>
                ))}
              </select>
              <select
                name="historyLang"
                defaultValue={historyLang}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-700"
              >
                <option value="all">{copy.allLang}</option>
                <option value="ja">JA</option>
                <option value="zh">ZH</option>
                <option value="ko">KO</option>
              </select>
              <select
                name="historyFormat"
                defaultValue={historyFormat}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-700"
              >
                <option value="all">{copy.allFormat}</option>
                <option value="pdf">PDF</option>
                <option value="docx">DOCX</option>
              </select>
              <button type="submit" className="rounded-lg border border-[#001e40] px-2 py-1.5 text-[11px] font-bold text-[#001e40] hover:bg-[#edf2fd]">
                {copy.filterApply}
              </button>
              <Link
                href={`/output-center?type=${selectedType}&format=${selectedFormat}&lang=${selectedLanguage}&quoteId=${selectedQuote?.id ?? ""}`}
                className="inline-flex items-center justify-center rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50"
              >
                {copy.filterReset}
              </Link>
            </form>
            <div className="space-y-3">
              {isHighlightFiltered && highlightedOutput ? (
                <div>
                  <p className="mb-1 px-1 text-[10px] font-semibold text-[#001e40]">
                    {locale === "zh" ? "这是刚刚生成的文书" : locale === "ko" ? "방금 생성된 문서입니다" : "今生成した帳票です"}
                  </p>
                  <div className="group flex items-center gap-3 rounded-lg bg-[#edf2fd] p-3 ring-2 ring-[#001e40]">
                    <div className="flex h-10 w-10 items-center justify-center rounded bg-red-100 text-red-500">
                      <span className="material-symbols-outlined">picture_as_pdf</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-bold text-slate-900">{highlightedOutput.title}</p>
                      <p className="text-[11px] tabular-nums text-slate-400">
                        {formatDate(highlightedOutput.generatedAt, locale)} • {highlightedOutput.outputFormat.toUpperCase()} • {highlightedOutput.language.toUpperCase()}
                      </p>
                      <p className="truncate text-[10px] text-slate-500">
                        {highlightedOutput.relatedProperty ?? "-"} / {highlightedOutput.relatedParty ?? "-"}
                      </p>
                    </div>
                    <Link href={`/api/outputs/${highlightedOutput.id}/download?locale=${locale}`} className="text-slate-300 transition group-hover:text-[#001e40]">
                      <span className="material-symbols-outlined text-[18px]">download</span>
                    </Link>
                  </div>
                </div>
              ) : null}
              {latestOutputs.map((output) => (
                <div key={output.id} className={`group flex items-center gap-3 rounded-lg p-3 transition hover:bg-[#edf2fd] ${highlightOutputId && output.id === highlightOutputId ? "ring-2 ring-[#001e40] bg-[#edf2fd]" : ""}`}>
                  <div className="flex h-10 w-10 items-center justify-center rounded bg-red-100 text-red-500">
                    <span className="material-symbols-outlined">picture_as_pdf</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-bold text-slate-900">{output.title}</p>
                    <p className="text-[11px] tabular-nums text-slate-400">
                      {formatDate(output.generatedAt, locale)} • {output.outputFormat.toUpperCase()} • {output.language.toUpperCase()}
                    </p>
                    {output.templateVersionLabel ? (
                      <span className="inline-flex items-center gap-0.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                        <span className="material-symbols-outlined text-[11px]">layers</span>
                        {output.templateVersionLabel}
                      </span>
                    ) : null}
                    <p className="truncate text-[10px] text-slate-500">
                      {output.relatedProperty ?? "-"} / {output.relatedParty ?? "-"}
                    </p>
                  </div>
                  <Link href={`/api/outputs/${output.id}/download?locale=${locale}`} className="text-slate-300 transition group-hover:text-[#001e40]">
                    <span className="material-symbols-outlined text-[18px]">download</span>
                  </Link>
                </div>
              ))}
              {latestOutputs.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-xs font-medium text-slate-500">
                  {copy.emptyFilteredOutputs}
                </div>
              ) : null}
            </div>
          </article>
        </div>

        <div className="xl:col-span-7">
          <article className="flex min-h-[850px] flex-col rounded-xl bg-[#dce9ff] p-4">
            <div className="flex flex-1 flex-col overflow-hidden rounded-lg bg-white shadow-inner">
              <div className="flex items-center justify-between border-b border-slate-100 px-6 py-3">
                <div className="flex items-center gap-4">
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-400">{copy.previewMode}</span>
                  <div className="h-4 w-px bg-slate-200" />
                  <div className="flex items-center gap-2">
                    <Link href={`/output-center?type=${selectedType}&format=${selectedFormat}&lang=${selectedLanguage}&quoteId=${selectedQuote?.id ?? ""}&historyType=${historyType}&historyLang=${historyLang}&historyFormat=${historyFormat}&zoom=75`} className="rounded p-1 text-slate-500 hover:bg-slate-100">
                      <span className="material-symbols-outlined text-[18px]">zoom_out</span>
                    </Link>
                    <span className="text-[11px] font-bold tabular-nums">{selectedZoom}%</span>
                    <Link href={`/output-center?type=${selectedType}&format=${selectedFormat}&lang=${selectedLanguage}&quoteId=${selectedQuote?.id ?? ""}&historyType=${historyType}&historyLang=${historyLang}&historyFormat=${historyFormat}&zoom=100`} className="rounded p-1 text-slate-500 hover:bg-slate-100">
                      <span className="material-symbols-outlined text-[18px]">zoom_in</span>
                    </Link>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Link href={previewQuoteId ? `/quotes/${previewQuoteId}/print?type=${selectedType}` : "/quotes"} className="rounded-full p-2 text-slate-500 hover:bg-slate-100">
                    <span className="material-symbols-outlined text-[18px]">print</span>
                  </Link>
                  <Link href={previewQuoteId ? `/quotes/${previewQuoteId}` : "/quotes"} className="rounded-full p-2 text-slate-500 hover:bg-slate-100">
                    <span className="material-symbols-outlined text-[18px]">share</span>
                  </Link>
                  {previewQuoteId ? (
                    <Link href={selectedDownloadHref} className="ml-1 rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-bold text-white">
                      {copy.download}
                    </Link>
                  ) : (
                    <button disabled className="ml-1 cursor-not-allowed rounded-lg bg-slate-400 px-4 py-1.5 text-xs font-bold text-white">
                      {copy.download}
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-1 justify-center overflow-y-auto bg-slate-100 p-10">
                <div className="relative flex h-[842px] w-[595px] flex-col overflow-hidden bg-white p-10 shadow-2xl">
                  <div className="absolute right-8 top-8 text-xl font-black uppercase tracking-tighter text-[#001e40]/20">BROKERDESK</div>
                  <div className="mb-10 border-b-4 border-[#001e40] pb-4">
                    <h3 className="text-4xl font-bold text-slate-900">{getOutputDocLabel(locale, selectedType)}</h3>
                    <p className="mt-1 text-[10px] uppercase tracking-widest text-slate-500">{copy.previewSubtitle}</p>
                  </div>
                  <div className="mb-10 grid grid-cols-2 gap-8">
                    <div>
                      <p className="text-[9px] font-bold uppercase text-slate-400">{copy.preparedFor}</p>
                      <p className="text-sm font-bold text-slate-900">{selectedParty?.name ?? copy.preparedForValue}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] font-bold uppercase text-slate-400">{copy.dateIssued}</p>
                      <p className="text-sm font-bold tabular-nums text-slate-900">{issuedDateValue}</p>
                    </div>
                  </div>
                  <div className="space-y-7 text-[11px] text-slate-700">
                    <section>
                      <h4 className="mb-3 border-l-2 border-[#001e40] bg-slate-50 px-3 py-1 text-xs font-black">{copy.section1Title}</h4>
                      <div className="grid grid-cols-3 gap-y-2 tabular-nums">
                        <div className="text-slate-400">{copy.fieldAddress}</div>
                        <div className="col-span-2">{selectedProperty?.name ?? copy.valueAddress}</div>
                        <div className="text-slate-400">{copy.fieldArea}</div>
                        <div className="col-span-2">
                          {selectedProperty?.listingPrice ? formatCurrency(selectedProperty.listingPrice, locale) : copy.valueArea}
                        </div>
                        <div className="text-slate-400">{copy.fieldLayout}</div>
                        <div className="col-span-2">{selectedProperty?.name ?? copy.valueLayout}</div>
                      </div>
                    </section>
                    <section>
                      <h4 className="mb-3 border-l-2 border-[#001e40] bg-slate-50 px-3 py-1 text-xs font-black">{copy.section2Title}</h4>
                      <div className="space-y-3">
                        <div className="rounded bg-[#edf2fd] p-3 text-[10px] leading-relaxed text-slate-700">
                          {copy.section2Desc}
                        </div>
                        <ul className="list-disc space-y-1 pl-4 text-[10px] text-slate-600">
                          <li>{copy.bullet1}</li>
                          <li>{copy.bullet2}</li>
                          <li>{copy.bullet3}</li>
                        </ul>
                      </div>
                    </section>
                    <section>
                      <h4 className="mb-3 border-l-2 border-[#001e40] bg-slate-50 px-3 py-1 text-xs font-black">{copy.section3Title}</h4>
                      <div className="mt-10 grid grid-cols-2 gap-8">
                        <div className="border-b border-dotted border-slate-300 pb-1 pt-12 text-[10px] text-slate-400">{copy.sellerSign}</div>
                        <div className="border-b border-dotted border-slate-300 pb-1 pt-12 text-[10px] text-slate-400">{copy.buyerSign}</div>
                      </div>
                    </section>
                  </div>
                  <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-6">
                    <p className="text-[9px] tabular-nums text-slate-300">
                      {copy.docIdLabel}: {previewDocId}
                    </p>
                    <p className="text-[9px] text-slate-300">
                      {copy.pageLabel} 1 / 4
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </article>
        </div>
      </section>
    </div>
  );
}
