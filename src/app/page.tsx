import Link from "next/link";
import { getDefaultUser, getGuaranteeApplicationDraft, listBrokerageCases } from "@/lib/data";
import { formatDate } from "@/lib/format";
import {
  buildGuaranteeDraftReadiness,
  buildGuaranteeApplicationReadiness,
  guaranteeCompanyTemplates,
} from "@/lib/guarantee-application";
import { listHubImportJobs } from "@/lib/hub";
import { getLocale } from "@/lib/locale";

export const dynamic = "force-dynamic";

function workbenchAnchorForGuaranteeField(fieldKey: string) {
  if (fieldKey.startsWith("company_option.")) return "guarantee-template-drafts";
  if (fieldKey.startsWith("property.") || fieldKey.startsWith("lease.")) return "workbench-property_lease";
  if (
    fieldKey.startsWith("applicant.employer") ||
    fieldKey === "applicant.occupation" ||
    fieldKey === "applicant.employmentType" ||
    fieldKey === "applicant.annualIncome" ||
    fieldKey === "applicant.yearsEmployed"
  ) {
    return "workbench-employment_income";
  }
  if (fieldKey.startsWith("applicant.")) return "workbench-applicant";
  if (fieldKey.startsWith("emergencyContact.")) return "workbench-contact_guarantor";
  if (fieldKey.startsWith("coOccupants.")) return "workbench-co_occupants";
  if (fieldKey.startsWith("broker.") || fieldKey.startsWith("management.")) return "workbench-broker_management";
  if (fieldKey.startsWith("guarantee.")) return "workbench-guarantee_options";
  return "workbench-unresolved";
}

const copyByLocale = {
  ja: {
    noUser: "利用可能なユーザーがありません。",
    eyebrow: "今日の業務",
    title: "今日の申込書業務",
    subtitle: "資料入力、案件データの整理、保証会社申込書の出力までを一つの流れで進めます。",
    step1: "資料を入れる",
    step1Desc: "Excelや申込資料をアップロードして候補を取り込みます。",
    step2: "足りない項目だけ確認",
    step2Desc: "整理画面で未入力・要確認の項目だけ埋めます。",
    step3: "申込書を出す",
    step3Desc: "保証会社の申込書を確認して出力します。",
    stepDone: "完了",
    stepCurrent: "現在",
    stepWaiting: "待機",
    openStep: "開く",
    nextAction: "今やること",
    nextImportTitle: "まず資料を入れる",
    nextImportDesc: "Excel、本人確認資料、申込関連資料を入れて、案件データの候補を作ります。",
    nextReviewTitle: "足りない項目だけ確認する",
    nextReviewDesc: "整理画面で、未入力・要確認の項目だけ補正します。",
    nextOutputTitle: "申込書を出す",
    nextOutputDesc: "保証会社を選び、公式底版の上で最終確認してPDFを出します。",
    currentTask: "続きから作業",
    currentCase: "現在の案件",
    workbench: "情報整理",
    company: "保証会社",
    missing: "残り必須項目",
    draftMissing: "追加項目未入力",
    updated: "更新日",
    continueTask: "保証会社申込書を続ける",
    upload: "資料をアップロード",
    fixMissing: "不足項目を確認",
    download: "申込書を出す",
    noCaseTitle: "まだ申込書の案件がありません",
    noCaseDesc: "まず資料をアップロードして、確認済みデータを案件に保存してください。",
    activeCaseTitle: "次に処理する案件",
    activeCaseDesc: "未入力・要確認があれば情報整理で補正し、問題なければ出力へ進みます。",
    workQueue: "案件キュー",
    workQueueDesc: "最近更新された案件から処理します。",
    urgentAction: "今やること",
    missingFieldsLabel: "不足項目",
    aiConfidence: "AI候補の信頼度",
    nextStep: "次の作業",
    productionDesk: "申込書業務",
    statusLabel: "状態",
    recentInputs: "最近入れた資料",
    recentInputsDesc: "取り込み結果は案件データの候補として使います。",
    outputReadiness: "出力準備",
    outputReadinessDesc: "保証会社ごとの未入力数を確認します。",
    readyTemplates: "出力可能",
    blockedTemplates: "要確認",
    aiSupport: "AI補助",
    aiSupportDesc: "抽出・不足検知・申込書候補は裏側で支援し、ユーザーには確認すべき項目だけ出します。",
    noQueue: "処理中の案件はありません。",
    noRecentInputs: "最近の取り込みはありません。",
    statusReviewed: "確認済み",
    statusDraft: "未完了",
    statusQueued: "待機",
    statusMapped: "確認待ち",
    statusCompleted: "完了",
    supportTitle: "資料庫 / 設定",
    supportDesc: "物件台帳、顧客、提案、テンプレート設定などは通常業務の裏側に置き、必要な時だけ開きます。",
    primaryNext: "次の作業を開く",
    importCenter: "入力資料",
    outputCenter: "申込書出力",
    cases: "案件",
    properties: "物件台帳",
    clients: "顧客",
    quotes: "提案・試算",
    templates: "テンプレート設定",
  },
  zh: {
    noUser: "没有可用用户。",
    eyebrow: "今日业务",
    title: "今日申请书业务",
    subtitle: "把资料录入、案件数据整理、保证会社申请书输出串成一条清晰生产线。",
    step1: "上传资料",
    step1Desc: "上传 Excel 或申请资料，系统整理候选内容。",
    step2: "只确认缺失项",
    step2Desc: "在信息整理页补齐未填写和需确认项目。",
    step3: "输出申请书",
    step3Desc: "确认保证会社申请书并输出。",
    stepDone: "已完成",
    stepCurrent: "当前",
    stepWaiting: "待处理",
    openStep: "打开",
    nextAction: "现在该做什么",
    nextImportTitle: "先上传资料",
    nextImportDesc: "上传 Excel、本人确认资料和申请相关资料，生成案件数据候选。",
    nextReviewTitle: "只确认缺失项",
    nextReviewDesc: "在信息整理页里，只补正未填写和需要确认的项目。",
    nextOutputTitle: "输出申请书",
    nextOutputDesc: "选择保证会社，在官方底版上最终确认并输出 PDF。",
    currentTask: "继续处理",
    currentCase: "当前案件",
    workbench: "信息整理",
    company: "保证会社",
    missing: "剩余必填项",
    draftMissing: "追加项目未填写",
    updated: "更新日",
    continueTask: "继续处理保证会社申请书",
    upload: "上传资料",
    fixMissing: "确认缺失项",
    download: "输出申请书",
    noCaseTitle: "还没有申请书案件",
    noCaseDesc: "请先上传资料，并把确认后的数据保存到案件。",
    activeCaseTitle: "下一件该处理的案件",
    activeCaseDesc: "有未填写或需确认项就先在信息整理页补正，没有问题再进入输出。",
    workQueue: "案件队列",
    workQueueDesc: "优先处理最近更新的案件。",
    urgentAction: "现在该做什么",
    missingFieldsLabel: "缺失项目",
    aiConfidence: "AI候选可信度",
    nextStep: "下一步",
    productionDesk: "申请书业务",
    statusLabel: "状态",
    recentInputs: "最近上传资料",
    recentInputsDesc: "录入结果会作为案件数据候选。",
    outputReadiness: "输出准备度",
    outputReadinessDesc: "按保证会社确认未填写数量。",
    readyTemplates: "可输出",
    blockedTemplates: "需确认",
    aiSupport: "AI 辅助",
    aiSupportDesc: "抽取、缺失检测、申请书候选在后台辅助，前台只暴露需要确认的项目。",
    noQueue: "当前没有处理中的案件。",
    noRecentInputs: "暂无最近导入记录。",
    statusReviewed: "已确认",
    statusDraft: "未完成",
    statusQueued: "待处理",
    statusMapped: "待确认",
    statusCompleted: "完成",
    supportTitle: "资料库 / 设置",
    supportDesc: "物件台账、客户、报价、模板设置等能力放在主流程背后，需要时再打开。",
    primaryNext: "打开下一步",
    importCenter: "输入资料",
    outputCenter: "申请书输出",
    cases: "案件",
    properties: "物件台账",
    clients: "客户",
    quotes: "报价/试算",
    templates: "模板设置",
  },
  ko: {
    noUser: "사용 가능한 사용자가 없습니다.",
    eyebrow: "오늘 업무",
    title: "오늘 신청서 업무",
    subtitle: "자료 입력, 안건 데이터 정리, 보증회사 신청서 출력을 하나의 흐름으로 처리합니다.",
    step1: "자료를 넣기",
    step1Desc: "Excel이나 신청 자료를 업로드해 후보 값을 정리합니다.",
    step2: "부족 항목만 확인",
    step2Desc: "정보 정리 화면에서 미입력/확인 필요 항목만 보완합니다.",
    step3: "신청서 출력",
    step3Desc: "보증회사 신청서를 확인하고 출력합니다.",
    stepDone: "완료",
    stepCurrent: "현재",
    stepWaiting: "대기",
    openStep: "열기",
    nextAction: "지금 할 일",
    nextImportTitle: "먼저 자료를 넣기",
    nextImportDesc: "Excel, 본인 확인 자료, 신청 관련 자료를 넣어 안건 데이터 후보를 만듭니다.",
    nextReviewTitle: "부족 항목만 확인",
    nextReviewDesc: "정보 정리 화면에서 미입력/확인 필요 항목만 보완합니다.",
    nextOutputTitle: "신청서 출력",
    nextOutputDesc: "보증회사를 선택하고 공식 양식 위에서 최종 확인 후 PDF를 출력합니다.",
    currentTask: "이어서 작업",
    currentCase: "현재 안건",
    workbench: "정보 정리",
    company: "보증회사",
    missing: "남은 필수 항목",
    draftMissing: "추가 항목 미입력",
    updated: "갱신일",
    continueTask: "보증회사 신청서 계속하기",
    upload: "자료 업로드",
    fixMissing: "부족 항목 확인",
    download: "신청서 출력",
    noCaseTitle: "아직 신청서 안건이 없습니다",
    noCaseDesc: "먼저 자료를 업로드하고 확인 데이터를 안건에 저장하세요.",
    activeCaseTitle: "다음 처리 안건",
    activeCaseDesc: "미입력/확인 필요 항목은 정보 정리에서 보완하고, 문제가 없으면 출력으로 이동합니다.",
    workQueue: "안건 큐",
    workQueueDesc: "최근 갱신된 안건부터 처리합니다.",
    urgentAction: "지금 할 일",
    missingFieldsLabel: "부족 항목",
    aiConfidence: "AI 후보 신뢰도",
    nextStep: "다음 작업",
    productionDesk: "신청서 업무",
    statusLabel: "상태",
    recentInputs: "최근 입력 자료",
    recentInputsDesc: "가져온 결과는 안건 데이터 후보로 사용합니다.",
    outputReadiness: "출력 준비도",
    outputReadinessDesc: "보증회사별 미입력 수를 확인합니다.",
    readyTemplates: "출력 가능",
    blockedTemplates: "확인 필요",
    aiSupport: "AI 보조",
    aiSupportDesc: "추출, 누락 감지, 신청서 후보는 뒤에서 보조하고 사용자는 확인할 항목만 봅니다.",
    noQueue: "처리 중인 안건이 없습니다.",
    noRecentInputs: "최근 가져오기 기록이 없습니다.",
    statusReviewed: "확인됨",
    statusDraft: "미완료",
    statusQueued: "대기",
    statusMapped: "확인 대기",
    statusCompleted: "완료",
    supportTitle: "자료실 / 설정",
    supportDesc: "매물 대장, 고객, 제안, 템플릿 설정은 주 흐름 뒤에 두고 필요할 때만 엽니다.",
    primaryNext: "다음 작업 열기",
    importCenter: "입력 자료",
    outputCenter: "신청서 출력",
    cases: "안건",
    properties: "매물 대장",
    clients: "고객",
    quotes: "제안/시산",
    templates: "템플릿 설정",
  },
} as const;

export default async function HomePage() {
  const [locale, user] = await Promise.all([getLocale(), getDefaultUser()]);
  const copy = copyByLocale[locale];

  if (!user) return <p className="text-sm text-slate-600">{copy.noUser}</p>;

  const [cases, importJobs] = await Promise.all([listBrokerageCases(user.id, 20), listHubImportJobs()]);
  const currentCase =
    cases.find((item) => item.id === "case_fixture_friends_guarantee_pdf") ??
    cases.find((item) => item.status === "reviewed") ??
    cases[0];
  const activeGuaranteeTemplates = guaranteeCompanyTemplates.filter((template) => template.outputStatus === "active");
  const primaryGuaranteeTemplate =
    activeGuaranteeTemplates.find((template) => template.id === "friends_guarantee_individual_v1") ??
    activeGuaranteeTemplates[0];
  const guaranteeDrafts = currentCase
    ? await Promise.all(
        activeGuaranteeTemplates.map((template) =>
          getGuaranteeApplicationDraft({
            userId: user.id,
            caseId: currentCase.id,
            templateId: template.id,
          }),
        ),
      )
    : [];
  const guaranteeTemplateSummaries = activeGuaranteeTemplates.map((template, index) => {
    const draft = guaranteeDrafts[index] ?? null;
    const readinessGroups = buildGuaranteeApplicationReadiness({ brokerageCase: currentCase, template, draft });
    return {
      template,
      draftReadiness: buildGuaranteeDraftReadiness(draft, template.id),
      unresolvedFields: readinessGroups.find((group) => group.id === "unresolved")?.fields ?? [],
    };
  });
  const primaryGuaranteeSummary =
    guaranteeTemplateSummaries.find((summary) => summary.template.id === primaryGuaranteeTemplate?.id) ??
    guaranteeTemplateSummaries[0];
  const missingFields = primaryGuaranteeSummary?.unresolvedFields ?? [];
  const draftMissingTotal = primaryGuaranteeSummary?.draftReadiness.requiredMissingCount ?? 0;
  const selectedTemplateBlocked = missingFields.length > 0 || draftMissingTotal > 0;
  const blockedTemplateCount = guaranteeTemplateSummaries.filter(
    (summary) => summary.unresolvedFields.length > 0 || summary.draftReadiness.requiredMissingCount > 0,
  ).length;
  const readyTemplateCount = Math.max(activeGuaranteeTemplates.length - blockedTemplateCount, 0);
  const outputHref = currentCase
    ? `/output-center?caseId=${encodeURIComponent(currentCase.id)}&guaranteeTemplate=${encodeURIComponent(primaryGuaranteeTemplate?.id ?? "friends_guarantee_individual_v1")}`
    : "/output-center";
  const workbenchHref = currentCase
    ? `/cases/${currentCase.id}?guaranteeTemplate=${encodeURIComponent(primaryGuaranteeTemplate?.id ?? "friends_guarantee_individual_v1")}#workbench-unresolved`
    : "/import-center";
  const primaryHref = !currentCase
    ? "/import-center"
    : selectedTemplateBlocked
      ? workbenchHref
      : outputHref;
  const primaryLabel = !currentCase
    ? copy.upload
    : selectedTemplateBlocked
      ? copy.fixMissing
      : copy.download;
  const workbenchLinkForField = (fieldKey: string) =>
    currentCase
      ? `/cases/${currentCase.id}?guaranteeTemplate=${encodeURIComponent(primaryGuaranteeTemplate?.id ?? "friends_guarantee_individual_v1")}#${workbenchAnchorForGuaranteeField(fieldKey)}`
      : "/import-center";
  const nextActionTitle = !currentCase
    ? copy.nextImportTitle
    : selectedTemplateBlocked
      ? copy.nextReviewTitle
      : copy.nextOutputTitle;
  const nextActionDesc = !currentCase
    ? copy.nextImportDesc
    : selectedTemplateBlocked
      ? copy.nextReviewDesc
      : copy.nextOutputDesc;
  const workQueue = cases.slice(0, 5);
  const recentInputs = importJobs.slice(0, 4);
  const todayLabel = new Date().toLocaleDateString(locale === "zh" ? "zh-CN" : locale === "ko" ? "ko-KR" : "ja-JP");
  const totalMissing = missingFields.length + draftMissingTotal;
  const confidencePercent = selectedTemplateBlocked ? 85 : 100;
  const caseStatusLabel = (status: string) => (status === "reviewed" ? copy.statusReviewed : copy.statusDraft);
  const importStatusLabel = (status: string) => {
    if (status === "completed") return copy.statusCompleted;
    if (status === "mapped") return copy.statusMapped;
    return copy.statusQueued;
  };
  const flowSteps = [
    {
      id: "input",
      label: copy.step1,
      desc: copy.step1Desc,
      href: "/import-center",
      icon: "upload_file",
      state: currentCase ? copy.stepDone : copy.stepCurrent,
      tone: currentCase ? "border-emerald-200 bg-emerald-50" : "border-[#1960a3] bg-[#eff4ff]",
    },
    {
      id: "organize",
      label: copy.step2,
      desc: copy.step2Desc,
      href: currentCase ? workbenchHref : "/import-center",
      icon: "fact_check",
      state: !currentCase ? copy.stepWaiting : selectedTemplateBlocked ? copy.stepCurrent : copy.stepDone,
      tone: !currentCase
        ? "border-slate-200 bg-white"
        : selectedTemplateBlocked
          ? "border-[#1960a3] bg-[#eff4ff]"
          : "border-emerald-200 bg-emerald-50",
    },
    {
      id: "output",
      label: copy.step3,
      desc: copy.step3Desc,
      href: outputHref,
      icon: "print",
      state: !currentCase || selectedTemplateBlocked ? copy.stepWaiting : copy.stepCurrent,
      tone: !currentCase || selectedTemplateBlocked ? "border-slate-200 bg-white" : "border-[#1960a3] bg-[#eff4ff]",
    },
  ];

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between border-b border-slate-950 pb-1">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.05em] text-slate-500">{copy.productionDesk}</p>
          <h1 className="text-3xl font-black leading-tight text-slate-950">{copy.eyebrow}</h1>
        </div>
        <p className="hidden text-xs font-semibold tracking-wide text-slate-500 sm:block">
          {todayLabel} | {copy.productionDesk}
        </p>
      </header>

      <section className="grid gap-3 md:grid-cols-3">
        {flowSteps.map((step, index) => (
          <Link key={step.id} href={step.href} className={`group rounded border p-4 transition hover:border-[#1960a3] hover:bg-[#eff4ff] ${step.tone}`}>
            <div className="flex items-start justify-between gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded bg-slate-950 text-white">
                <span className="material-symbols-outlined text-[19px]">{step.icon}</span>
              </span>
              <span className="rounded-full bg-white px-2 py-1 text-[11px] font-black text-slate-700 ring-1 ring-slate-200">
                {String(index + 1).padStart(2, "0")} / {step.state}
              </span>
            </div>
            <h2 className="mt-4 text-lg font-black text-slate-950">{step.label}</h2>
            <p className="mt-1 min-h-10 text-sm leading-5 text-slate-600">{step.desc}</p>
          </Link>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <div className="space-y-4">
          {currentCase ? (
            <div className="relative rounded border border-slate-300 bg-white p-4">
              <div className="absolute bottom-0 left-0 top-0 w-1 bg-[#1960a3]" />
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <span className="inline-flex rounded border border-slate-300 bg-slate-100 px-2 py-1 text-[11px] font-black uppercase tracking-[0.05em] text-slate-700">
                    {copy.urgentAction}
                  </span>
                  <h2 className="mt-3 text-xl font-black leading-snug text-slate-950">{currentCase.caseTitle}</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    {copy.statusLabel}: <span className="font-black text-[#1960a3]">{caseStatusLabel(currentCase.status)}</span> | {copy.aiSupport}
                  </p>
                </div>
                <Link href={primaryHref} className="inline-flex min-w-[13rem] items-center justify-center gap-2 rounded bg-slate-950 px-4 py-3 text-sm font-black text-white hover:bg-slate-800">
                  <span className="material-symbols-outlined text-[18px]">assignment_turned_in</span>
                  {primaryLabel}
                </Link>
              </div>
              <div className="mt-4 grid gap-4 border-t border-slate-200 pt-4 md:grid-cols-3">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.05em] text-slate-500">{copy.missingFieldsLabel}</p>
                  <p className={`mt-2 flex items-center gap-1 text-sm font-black ${totalMissing > 0 ? "text-red-700" : "text-emerald-700"}`}>
                    <span className="material-symbols-outlined text-[16px]">{totalMissing > 0 ? "warning" : "check_circle"}</span>
                    {totalMissing} {copy.missing}
                  </p>
                  {missingFields.length > 0 ? (
                    <ul className="mt-2 list-inside list-disc text-sm leading-6 text-slate-700">
                      {missingFields.slice(0, 3).map((field) => (
                        <li key={field.fieldKey}>
                          <Link href={workbenchLinkForField(field.fieldKey)} className="hover:text-[#1960a3] hover:underline">
                            {field.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.05em] text-slate-500">{copy.aiConfidence}</p>
                  <div className="mt-3 flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded bg-[#d4e4fc]">
                      <div className="h-full bg-[#1960a3]" style={{ width: `${confidencePercent}%` }} />
                    </div>
                    <span className="text-xs font-black tabular-nums text-slate-700">{confidencePercent}%</span>
                  </div>
                </div>
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.05em] text-slate-500">{copy.nextStep}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{nextActionTitle}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{nextActionDesc}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded border border-dashed border-slate-300 bg-white p-4">
              <h2 className="text-xl font-black text-slate-950">{copy.noCaseTitle}</h2>
              <p className="mt-2 text-sm text-slate-600">{copy.noCaseDesc}</p>
              <Link href="/import-center" className="mt-4 inline-flex rounded bg-slate-950 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800">
                {copy.upload}
              </Link>
            </div>
          )}

          <div className="rounded border border-slate-300 bg-white">
            <div className="border-b border-slate-300 p-4">
              <h2 className="text-xl font-black text-slate-950">{copy.recentInputs}</h2>
            </div>
            <div className="divide-y divide-slate-200 p-4">
              {recentInputs.length > 0 ? (
                recentInputs.map((item) => (
                  <Link key={item.id} href="/import-center" className="flex items-center justify-between gap-4 py-3 hover:bg-[#eff4ff]">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-950">{item.title}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">{formatDate(item.createdAt, locale)}</p>
                    </div>
                    <span className="shrink-0 rounded border border-slate-300 bg-slate-100 px-2 py-1 text-xs font-black text-slate-600">
                      {importStatusLabel(item.status)}
                    </span>
                  </Link>
                ))
              ) : (
                <p className="py-4 text-sm text-slate-500">{copy.noRecentInputs}</p>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-4">
          <div className="rounded border border-slate-300 bg-white">
            <div className="border-b border-slate-300 p-4">
              <h2 className="text-xl font-black text-slate-950">{copy.workQueue}</h2>
              <p className="mt-1 text-sm text-slate-500">{copy.workQueueDesc}</p>
            </div>
            <div className="space-y-3 p-4">
              {workQueue.length > 0 ? (
                workQueue.slice(0, 3).map((item) => (
                  <Link
                    key={item.id}
                    href={`/cases/${item.id}?guaranteeTemplate=${encodeURIComponent(primaryGuaranteeTemplate?.id ?? "friends_guarantee_individual_v1")}`}
                    className={`flex items-center justify-between gap-3 rounded border p-3 hover:bg-[#eff4ff] ${
                      item.id === currentCase?.id ? "border-[#1960a3] bg-[#eff4ff]" : "border-slate-300 bg-[#f8f9ff]"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-black tabular-nums text-[#001e40]">#{item.id.replace("case_", "").slice(0, 8)}</p>
                      <p className="mt-1 truncate text-sm font-semibold text-slate-950">{item.caseTitle}</p>
                    </div>
                    <span className="shrink-0 rounded border border-slate-300 bg-white px-2 py-1 text-xs font-black text-slate-700">
                      {caseStatusLabel(item.status)}
                    </span>
                  </Link>
                ))
              ) : (
                <p className="text-sm text-slate-500">{copy.noQueue}</p>
              )}
            </div>
          </div>

          <div className="rounded border border-slate-300 bg-white p-4">
            <h2 className="text-xl font-black text-slate-950">{copy.outputReadiness}</h2>
            <Link href={outputHref} className="mt-4 flex items-center justify-between rounded border border-[#7db6ff] bg-[#d4e4fc] p-4 hover:bg-[#cfe0fb]">
              <div>
                <p className="text-3xl font-black tabular-nums text-slate-950">{readyTemplateCount}</p>
                <p className="text-xs font-black text-slate-700">{copy.readyTemplates}</p>
              </div>
              <span className="flex h-10 w-10 items-center justify-center rounded bg-slate-950 text-white">
                <span className="material-symbols-outlined text-[20px]">download</span>
              </span>
            </Link>
          </div>
        </div>
      </section>

      <details className="rounded border border-slate-300 bg-white p-4">
        <summary className="cursor-pointer text-sm font-black text-slate-900">{copy.supportTitle}</summary>
        <p className="mt-2 text-sm text-slate-600">{copy.supportDesc}</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
          {[
            { label: copy.properties, href: "/properties" },
            { label: copy.clients, href: "/clients" },
            { label: copy.quotes, href: "/quotes" },
            { label: copy.templates, href: "/templates" },
          ].map((item) => (
            <Link key={item.href} href={item.href} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
              {item.label}
            </Link>
          ))}
        </div>
      </details>
      <span className="sr-only">資料入力 整理 出力</span>
    </div>
  );
}
