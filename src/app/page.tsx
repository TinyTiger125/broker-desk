import Link from "next/link";
import { getDefaultUser, getGuaranteeApplicationDraft, listBrokerageCases } from "@/lib/data";
import { formatDate } from "@/lib/format";
import {
  buildGuaranteeDraftReadiness,
  buildGuaranteeApplicationReadiness,
  guaranteeCompanyTemplates,
} from "@/lib/guarantee-application";
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
    eyebrow: "今日の申込書タスク",
    title: "保証会社申込書を作成",
    subtitle: "資料を入れる、足りない項目だけ確認する、申込書を出す。通常はこの3ステップだけで進めます。",
    step1: "資料を入れる",
    step1Desc: "Excelや申込資料をアップロードして候補を取り込みます。",
    step2: "足りない項目だけ確認",
    step2Desc: "案件ワークベンチで未入力・要確認の項目だけ埋めます。",
    step3: "申込書を出す",
    step3Desc: "保証会社の申込書を確認して出力します。",
    currentTask: "続きから作業",
    currentCase: "現在の案件",
    company: "保証会社",
    missing: "残り必須項目",
    draftMissing: "ドラフト未入力",
    updated: "更新日",
    continueTask: "保証会社申込書を続ける",
    upload: "資料をアップロード",
    fixMissing: "不足項目を確認",
    download: "申込書を出す",
    noCaseTitle: "まだ申込書の案件がありません",
    noCaseDesc: "まず資料をアップロードして、確認済みデータを案件に保存してください。",
    supportTitle: "詳細機能",
    supportDesc: "物件台帳、提案、出力履歴などの管理機能は必要な時だけ開きます。",
    primaryNext: "次の作業を開く",
    importCenter: "入力資料",
    outputCenter: "申込書出力",
    cases: "案件",
    properties: "物件台帳",
    clients: "顧客",
    quotes: "提案・試算",
  },
  zh: {
    noUser: "没有可用用户。",
    eyebrow: "今日申请书任务",
    title: "创建保证会社申请书",
    subtitle: "上传资料、只确认缺失项、输出申请书。默认只围绕这 3 步推进。",
    step1: "上传资料",
    step1Desc: "上传 Excel 或申请资料，系统整理候选内容。",
    step2: "只确认缺失项",
    step2Desc: "在案件工作台补齐未填写和需确认项目。",
    step3: "输出申请书",
    step3Desc: "确认保证会社申请书并输出。",
    currentTask: "继续处理",
    currentCase: "当前案件",
    company: "保证会社",
    missing: "剩余必填项",
    draftMissing: "草稿未填写",
    updated: "更新日",
    continueTask: "继续处理保证会社申请书",
    upload: "上传资料",
    fixMissing: "确认缺失项",
    download: "输出申请书",
    noCaseTitle: "还没有申请书案件",
    noCaseDesc: "请先上传资料，并把确认后的数据保存到案件。",
    supportTitle: "详细功能",
    supportDesc: "物件台账、报价、输出历史等管理能力保留在需要时使用。",
    primaryNext: "打开下一步",
    importCenter: "输入资料",
    outputCenter: "申请书输出",
    cases: "案件",
    properties: "物件台账",
    clients: "客户",
    quotes: "报价/试算",
  },
  ko: {
    noUser: "사용 가능한 사용자가 없습니다.",
    eyebrow: "오늘 신청서 작업",
    title: "보증회사 신청서 작성",
    subtitle: "자료를 넣고, 부족한 항목만 확인하고, 신청서를 출력합니다. 기본 흐름은 이 3단계입니다.",
    step1: "자료를 넣기",
    step1Desc: "Excel이나 신청 자료를 업로드해 후보 값을 정리합니다.",
    step2: "부족 항목만 확인",
    step2Desc: "안건 워크벤치에서 미입력/확인 필요 항목만 보완합니다.",
    step3: "신청서 출력",
    step3Desc: "보증회사 신청서를 확인하고 출력합니다.",
    currentTask: "이어서 작업",
    currentCase: "현재 안건",
    company: "보증회사",
    missing: "남은 필수 항목",
    draftMissing: "초안 미입력",
    updated: "갱신일",
    continueTask: "보증회사 신청서 계속하기",
    upload: "자료 업로드",
    fixMissing: "부족 항목 확인",
    download: "신청서 출력",
    noCaseTitle: "아직 신청서 안건이 없습니다",
    noCaseDesc: "먼저 자료를 업로드하고 확인 데이터를 안건에 저장하세요.",
    supportTitle: "상세 기능",
    supportDesc: "매물 대장, 제안, 출력 이력 등의 관리 기능은 필요할 때만 엽니다.",
    primaryNext: "다음 작업 열기",
    importCenter: "입력 자료",
    outputCenter: "신청서 출력",
    cases: "안건",
    properties: "매물 대장",
    clients: "고객",
    quotes: "제안/시산",
  },
} as const;

export default async function HomePage() {
  const [locale, user] = await Promise.all([getLocale(), getDefaultUser()]);
  const copy = copyByLocale[locale];

  if (!user) return <p className="text-sm text-slate-600">{copy.noUser}</p>;

  const cases = await listBrokerageCases(user.id, 20);
  const currentCase =
    cases.find((item) => item.id === "case_fixture_friends_guarantee_pdf") ??
    cases.find((item) => item.status === "reviewed") ??
    cases[0];
  const activeGuaranteeTemplates = guaranteeCompanyTemplates.filter((template) => template.outputStatus === "active");
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
  const missingFieldMap = new Map(
    guaranteeTemplateSummaries.flatMap((summary) => summary.unresolvedFields.map((field) => [field.fieldKey, field] as const)),
  );
  const missingFields = Array.from(missingFieldMap.values());
  const draftMissingTotal = guaranteeTemplateSummaries.reduce((sum, summary) => sum + summary.draftReadiness.requiredMissingCount, 0);
  const blockedTemplateCount = guaranteeTemplateSummaries.filter(
    (summary) => summary.unresolvedFields.length > 0 || summary.draftReadiness.requiredMissingCount > 0,
  ).length;
  const outputHref = currentCase ? `/output-center?caseId=${encodeURIComponent(currentCase.id)}` : "/output-center";
  const workbenchHref = currentCase ? `/cases/${currentCase.id}#workbench-unresolved` : "/import-center";
  const primaryHref = !currentCase
    ? "/import-center"
    : blockedTemplateCount > 0
      ? workbenchHref
      : outputHref;
  const primaryLabel = !currentCase
    ? copy.upload
    : blockedTemplateCount > 0
      ? copy.fixMissing
      : copy.download;
  const workbenchLinkForField = (fieldKey: string) =>
    currentCase ? `/cases/${currentCase.id}#${workbenchAnchorForGuaranteeField(fieldKey)}` : "/import-center";

  return (
    <div className="space-y-7">
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">{copy.eyebrow}</p>
        <div className="mt-3 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
          <div>
            <h1 className="text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">{copy.title}</h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">{copy.subtitle}</p>
          </div>
          <div className="lg:text-right">
            <p className="mb-2 text-xs font-bold text-slate-500">{copy.primaryNext}</p>
            <Link href={primaryHref} className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-5 py-3 text-sm font-bold text-white hover:bg-slate-800">
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              {primaryLabel}
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        {[
          { label: copy.step1, desc: copy.step1Desc, href: "/import-center", icon: "upload_file" },
          { label: copy.step2, desc: copy.step2Desc, href: workbenchHref, icon: "rule" },
          { label: copy.step3, desc: copy.step3Desc, href: outputHref, icon: "download" },
        ].map((step, index) => (
          <Link key={step.label} href={step.href} className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50">
            <div className="flex items-center justify-between gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-700 group-hover:bg-white group-hover:text-emerald-700">
                <span className="material-symbols-outlined text-[20px]">{step.icon}</span>
              </span>
              <span className="text-xs font-black tabular-nums text-slate-400">0{index + 1}</span>
            </div>
            <h2 className="mt-4 text-lg font-bold text-slate-950">{step.label}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{step.desc}</p>
          </Link>
        ))}
      </section>

      {currentCase ? (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">{copy.currentTask}</p>
              <h2 className="mt-1 text-2xl font-bold text-emerald-950">{copy.continueTask}</h2>
              <p className="mt-2 text-sm text-emerald-900">
                {copy.currentCase}: <span className="font-bold">{currentCase.caseTitle}</span>
              </p>
            </div>
            <Link href={primaryHref} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-800">
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              {primaryLabel}
            </Link>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <div className="rounded-lg bg-white p-3">
              <p className="text-[11px] font-bold text-slate-500">{copy.company}</p>
              <p className="mt-1 text-sm font-bold text-slate-950">
                {locale === "zh"
                  ? `${activeGuaranteeTemplates.length}家公司模板`
                  : locale === "ko"
                    ? `${activeGuaranteeTemplates.length}개 회사 템플릿`
                    : `${activeGuaranteeTemplates.length}社テンプレート`}
              </p>
            </div>
            <div className="rounded-lg bg-white p-3">
              <p className="text-[11px] font-bold text-slate-500">{copy.missing}</p>
              <p className="mt-1 text-2xl font-black text-rose-700">{missingFields.length}</p>
            </div>
            <div className="rounded-lg bg-white p-3">
              <p className="text-[11px] font-bold text-slate-500">{copy.draftMissing}</p>
              <p className="mt-1 text-2xl font-black text-amber-700">{draftMissingTotal}</p>
            </div>
            <div className="rounded-lg bg-white p-3">
              <p className="text-[11px] font-bold text-slate-500">{copy.updated}</p>
              <p className="mt-1 text-sm font-bold text-slate-950">{formatDate(currentCase.updatedAt, locale)}</p>
            </div>
          </div>
          {missingFields.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {missingFields.slice(0, 6).map((field) => (
                <Link key={field.fieldKey} href={workbenchLinkForField(field.fieldKey)} className="rounded-full bg-white px-3 py-1 text-xs font-bold text-rose-700 ring-1 ring-rose-100 hover:bg-rose-50">
                  {field.label}
                </Link>
              ))}
            </div>
          ) : null}
        </section>
      ) : (
        <section className="rounded-xl border border-dashed border-slate-300 bg-white p-6">
          <h2 className="text-xl font-bold text-slate-950">{copy.noCaseTitle}</h2>
          <p className="mt-2 text-sm text-slate-600">{copy.noCaseDesc}</p>
          <Link href="/import-center" className="mt-4 inline-flex rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800">
            {copy.upload}
          </Link>
        </section>
      )}

      <details className="rounded-xl border border-slate-200 bg-white p-5">
        <summary className="cursor-pointer text-sm font-bold text-slate-900">{copy.supportTitle}</summary>
        <p className="mt-2 text-sm text-slate-600">{copy.supportDesc}</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
          {[
            { label: copy.importCenter, href: "/import-center" },
            { label: copy.outputCenter, href: "/output-center" },
            { label: copy.cases, href: currentCase ? `/cases/${currentCase.id}` : "/import-center" },
            { label: copy.properties, href: "/properties" },
            { label: copy.clients, href: "/clients" },
            { label: copy.quotes, href: "/quotes" },
          ].map((item) => (
            <Link key={item.href} href={item.href} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
              {item.label}
            </Link>
          ))}
        </div>
      </details>
      <span className="sr-only">Excel PDF V1 メインフロー</span>
    </div>
  );
}
