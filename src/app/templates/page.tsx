import Image from "next/image";
import Link from "next/link";
import { listBrokerageCases, listOutputTemplateVersions } from "@/lib/data";
import { formatDate } from "@/lib/format";
import {
  guaranteeCompanyTemplates,
  type GuaranteeCompanyTemplate,
  type GuaranteeFieldCompletionMode,
  type GuaranteeTemplateQualityStatus,
} from "@/lib/guarantee-application";
import { getLocale, type Locale } from "@/lib/locale";
import { requireTenantSession } from "@/lib/tenant-session";

export const dynamic = "force-dynamic";

type TemplatesPageProps = {
  searchParams?: Promise<{
    template?: string;
  }>;
};

type TemplateVisual = {
  src: string;
  width: number;
  height: number;
};

const templateVisuals: Record<string, TemplateVisual> = {
  zenhoren_individual_v1: { src: "/guarantee-templates/zenhoren-v1-hd.png", width: 2400, height: 1697 },
  nihon_safety_individual_v1: { src: "/guarantee-templates/nihon-safety-v1-hd.png", width: 2400, height: 1696 },
  j_lease_individual_v1: { src: "/guarantee-templates/j-lease-v1-hd.png", width: 1697, height: 2400 },
  insure_individual_v1: { src: "/guarantee-templates/insure-v1-hd.png", width: 2400, height: 1658 },
  friends_guarantee_individual_v1: { src: "/guarantee-templates/friends-guarantee-v1.png", width: 1600, height: 1131 },
};

const copyByLocale = {
  ja: {
    title: "申込書テンプレート管理",
    subtitle:
      "保証会社の公式申込書を、底版・入力位置・品質状態ごとに管理します。通常作業では触らず、位置調整や版更新の時だけ開きます。",
    eyebrow: "補助業務",
    primaryFlow: "通常の流れ",
    flow1: "資料を入れる",
    flow2: "案件ワークベンチで足りない項目だけ確認",
    flow3: "会社別申込書を確認して出す",
    openOutput: "申込書を出す",
    openPreview: "この申込書を確認",
    openSettings: "入力位置を調整",
    officialBase: "公式底版",
    sourcePdf: "元PDF",
    pageCount: "ページ数",
    quality: "品質状態",
    inputPosition: "入力位置",
    saved: "保存済み",
    needsCheck: "要確認",
    activeTemplates: "利用中テンプレート",
    activeTemplatesDesc: "MVPで選択できる保証会社申込書です。",
    selectedTemplate: "選択中の申込書",
    outputPolicy: "出力方針",
    outputPolicyDesc: "公式PDFの線や枠は変更せず、入力欄の上に値だけ印字します。",
    safeAuto: "安全自動入力",
    assisted: "候補入力",
    manual: "電子手入力",
    required: "必須項目",
    optional: "任意項目",
    companyOnly: "会社別項目",
    versionHistory: "版履歴",
    noVersions: "版履歴はまだありません。",
    qualityNotes: "品質メモ",
    noQualityNotes: "品質メモはありません。",
    advancedTitle: "詳細なテンプレート管理",
    advancedDesc: "通常の申込書作成では開く必要はありません。版更新、出力設定、入力位置の見直しに使います。",
    statusActive: "利用中",
    statusDraft: "下書き",
    statusDeprecated: "停止",
    verified: "検証済み",
    needsCalibration: "位置確認中",
    sourceBlocked: "元資料要改善",
    directDownload: "直接PDF可",
    previewRequired: "プレビュー確認",
    noCase: "案件がないため、先に資料を入れてください。",
  },
  zh: {
    title: "申请书模板管理",
    subtitle: "管理保证会社官方申请书的底版、填写位置和质量状态。日常作业不需要打开，只在位置调整或版本更新时使用。",
    eyebrow: "辅助业务",
    primaryFlow: "普通使用流程",
    flow1: "上传资料",
    flow2: "在案件工作台只确认缺失项",
    flow3: "确认公司别申请书并输出",
    openOutput: "输出申请书",
    openPreview: "确认这份申请书",
    openSettings: "调整填写位置",
    officialBase: "官方底版",
    sourcePdf: "源 PDF",
    pageCount: "页数",
    quality: "质量状态",
    inputPosition: "填写位置",
    saved: "已保存",
    needsCheck: "需确认",
    activeTemplates: "可用模板",
    activeTemplatesDesc: "MVP 当前可选择的保证会社申请书。",
    selectedTemplate: "当前申请书",
    outputPolicy: "输出原则",
    outputPolicyDesc: "不修改官方 PDF 的任何线条和框体，只在输入栏上方印字。",
    safeAuto: "安全自动填入",
    assisted: "候选填入",
    manual: "电子手填",
    required: "必填项",
    optional: "可选项",
    companyOnly: "公司别项目",
    versionHistory: "版本历史",
    noVersions: "暂无版本历史。",
    qualityNotes: "质量记录",
    noQualityNotes: "暂无质量记录。",
    advancedTitle: "详细模板管理",
    advancedDesc: "普通申请书制作不需要打开。仅用于版本更新、输出设置和填写位置复核。",
    statusActive: "使用中",
    statusDraft: "草稿",
    statusDeprecated: "停用",
    verified: "已校验",
    needsCalibration: "位置确认中",
    sourceBlocked: "源文件需改善",
    directDownload: "可直接 PDF",
    previewRequired: "需要预览确认",
    noCase: "还没有案件，请先上传资料。",
  },
  ko: {
    title: "신청서 템플릿 관리",
    subtitle:
      "보증회사 공식 신청서의 원본 양식, 입력 위치, 품질 상태를 관리합니다. 일반 작업에서는 건드리지 않고 위치 조정이나 버전 갱신 때만 엽니다.",
    eyebrow: "보조 업무",
    primaryFlow: "일반 작업 흐름",
    flow1: "자료 입력",
    flow2: "안건 워크벤치에서 부족 항목만 확인",
    flow3: "회사별 신청서를 확인하고 출력",
    openOutput: "신청서 출력",
    openPreview: "이 신청서 확인",
    openSettings: "입력 위치 조정",
    officialBase: "공식 원본",
    sourcePdf: "원본 PDF",
    pageCount: "페이지 수",
    quality: "품질 상태",
    inputPosition: "입력 위치",
    saved: "저장됨",
    needsCheck: "확인 필요",
    activeTemplates: "사용 템플릿",
    activeTemplatesDesc: "MVP에서 선택 가능한 보증회사 신청서입니다.",
    selectedTemplate: "선택한 신청서",
    outputPolicy: "출력 원칙",
    outputPolicyDesc: "공식 PDF의 선과 표는 바꾸지 않고 입력란 위에 값만 인쇄합니다.",
    safeAuto: "안전 자동 입력",
    assisted: "후보 입력",
    manual: "전자 수동 입력",
    required: "필수 항목",
    optional: "선택 항목",
    companyOnly: "회사별 항목",
    versionHistory: "버전 이력",
    noVersions: "버전 이력이 아직 없습니다.",
    qualityNotes: "품질 메모",
    noQualityNotes: "품질 메모가 없습니다.",
    advancedTitle: "상세 템플릿 관리",
    advancedDesc: "일반 신청서 작성에는 열 필요가 없습니다. 버전 갱신, 출력 설정, 입력 위치 검토에 사용합니다.",
    statusActive: "사용 중",
    statusDraft: "초안",
    statusDeprecated: "중지",
    verified: "검증됨",
    needsCalibration: "위치 확인 중",
    sourceBlocked: "원본 개선 필요",
    directDownload: "직접 PDF 가능",
    previewRequired: "미리보기 확인",
    noCase: "안건이 없으므로 먼저 자료를 넣어주세요.",
  },
} as const;

function statusLabel(locale: Locale, status: GuaranteeCompanyTemplate["outputStatus"]) {
  const copy = copyByLocale[locale];
  if (status === "active") return copy.statusActive;
  if (status === "deprecated") return copy.statusDeprecated;
  return copy.statusDraft;
}

function qualityLabel(locale: Locale, quality: GuaranteeTemplateQualityStatus) {
  const copy = copyByLocale[locale];
  if (quality === "verified") return copy.verified;
  if (quality === "source_quality_blocked") return copy.sourceBlocked;
  return copy.needsCalibration;
}

function qualityClass(quality: GuaranteeTemplateQualityStatus) {
  if (quality === "verified") return "bg-emerald-100 text-emerald-800";
  if (quality === "source_quality_blocked") return "bg-rose-100 text-rose-800";
  return "bg-amber-100 text-amber-800";
}

function countCompletionModes(template: GuaranteeCompanyTemplate) {
  return Object.values(template.fieldCompletionModes).reduce<Record<GuaranteeFieldCompletionMode, number>>(
    (acc, mode) => {
      acc[mode] += 1;
      return acc;
    },
    { certified_auto: 0, assisted_candidate: 0, manual_electronic: 0 },
  );
}

export default async function TemplatesPage({ searchParams }: TemplatesPageProps) {
  const [locale, session] = await Promise.all([
    getLocale(),
    requireTenantSession({ permission: "template.view" }),
  ]);
  const copy = copyByLocale[locale];
  const params = searchParams ? await searchParams : undefined;
  const selectedTemplateId = params?.template ?? "friends_guarantee_individual_v1";
  const templates = guaranteeCompanyTemplates.filter((template) => template.outputStatus === "active");
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) ?? templates[0];
  const selectedVisual = templateVisuals[selectedTemplate.id] ?? templateVisuals.friends_guarantee_individual_v1;
  const user = session.user;
  const tenantId = session.tenant.id;
  const [versions, cases] = await Promise.all([
    listOutputTemplateVersions(user.id, 6, tenantId),
    listBrokerageCases(user.id, 20, tenantId),
  ]);
  const currentCase =
    cases.find((item) => item.id === "case_fixture_friends_guarantee_pdf") ??
    cases.find((item) => item.status === "reviewed") ??
    cases[0];
  const modeCounts = countCompletionModes(selectedTemplate);
  const previewHref = currentCase
    ? `/guarantee-applications/${encodeURIComponent(selectedTemplate.id)}/preview?caseId=${encodeURIComponent(currentCase.id)}`
    : "/import-center";
  const outputHref = currentCase
    ? `/output-center?caseId=${encodeURIComponent(currentCase.id)}&guaranteeTemplate=${encodeURIComponent(selectedTemplate.id)}`
    : "/import-center";

  return (
    <div className="space-y-5">
      <header className="flex flex-col justify-between gap-4 border-b border-slate-950 pb-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.05em] text-slate-500">{copy.eyebrow}</p>
          <h1 className="mt-1 text-3xl font-black leading-tight text-slate-950">{copy.title}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{copy.subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={outputHref} className="inline-flex items-center gap-2 rounded bg-slate-950 px-4 py-2 text-sm font-black text-white hover:bg-slate-800">
            <span className="material-symbols-outlined text-[18px]">draft</span>
            {copy.openOutput}
          </Link>
          <Link href="/settings/output-templates" className="inline-flex items-center gap-2 rounded border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
            <span className="material-symbols-outlined text-[18px]">tune</span>
            {copy.openSettings}
          </Link>
        </div>
      </header>

      <section className="rounded-xl border border-blue-100 bg-[#edf2fd] p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-black text-[#1960a3]">{copy.primaryFlow}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm font-bold text-slate-900">
              <span>{copy.flow1}</span>
              <span className="material-symbols-outlined text-[16px] text-slate-400">arrow_forward</span>
              <span>{copy.flow2}</span>
              <span className="material-symbols-outlined text-[16px] text-slate-400">arrow_forward</span>
              <span>{copy.flow3}</span>
            </div>
          </div>
          {!currentCase ? <p className="text-xs font-bold text-amber-800">{copy.noCase}</p> : null}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="self-start rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4">
            <h2 className="text-sm font-black text-slate-950">{copy.activeTemplates}</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">{copy.activeTemplatesDesc}</p>
          </div>
          <div className="space-y-2">
            {templates.map((template) => {
              const active = template.id === selectedTemplate.id;
              return (
                <Link
                  key={template.id}
                  href={`/templates?template=${encodeURIComponent(template.id)}`}
                  className={`block rounded-lg border p-3 transition ${
                    active ? "border-[#1960a3] bg-[#eff4ff]" : "border-slate-200 bg-slate-50 hover:bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-950">{template.companyDisplayName}</p>
                      <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">{template.templateDisplayName}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${qualityClass(template.qualityStatus)}`}>
                      {qualityLabel(locale, template.qualityStatus)}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-[11px] font-bold text-slate-500">
                    <span>{statusLabel(locale, template.outputStatus)}</span>
                    <span>/</span>
                    <span>{template.allowDirectDownload ? copy.directDownload : copy.previewRequired}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </aside>

        <div className="space-y-4">
          <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col justify-between gap-3 border-b border-slate-200 bg-[#edf2fd] px-5 py-4 lg:flex-row lg:items-center">
              <div>
                <p className="text-xs font-black text-[#1960a3]">{copy.selectedTemplate}</p>
                <h2 className="mt-1 text-xl font-black text-slate-950">{selectedTemplate.companyDisplayName}</h2>
                <p className="text-sm font-semibold text-slate-600">{selectedTemplate.templateDisplayName}</p>
              </div>
              <Link href={previewHref} className="inline-flex items-center justify-center gap-2 rounded bg-slate-950 px-4 py-2 text-sm font-black text-white hover:bg-slate-800">
                <span className="material-symbols-outlined text-[18px]">edit_note</span>
                {copy.openPreview}
              </Link>
            </div>

            <div className="bg-slate-100 p-5">
              <div className="mx-auto max-h-[720px] max-w-5xl overflow-auto rounded border border-slate-300 bg-white shadow-sm">
                <Image
                  src={selectedVisual.src}
                  alt={`${selectedTemplate.companyDisplayName} ${selectedTemplate.templateDisplayName}`}
                  width={selectedVisual.width}
                  height={selectedVisual.height}
                  className="h-auto w-full object-contain"
                  priority
                />
              </div>
            </div>
          </article>

          <div className="grid gap-4 lg:grid-cols-3">
            <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-black text-slate-950">{copy.outputPolicy}</h2>
              <p className="mt-2 text-xs leading-5 text-slate-600">{copy.outputPolicyDesc}</p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-[#edf2fd] p-3">
                  <p className="text-[10px] font-bold text-slate-500">{copy.officialBase}</p>
                  <p className="mt-1 whitespace-nowrap text-xs font-black text-slate-950">{copy.saved}</p>
                </div>
                <div className="rounded-lg bg-[#edf2fd] p-3">
                  <p className="text-[10px] font-bold text-slate-500">{copy.inputPosition}</p>
                  <p className="mt-1 whitespace-nowrap text-xs font-black text-slate-950">
                    {selectedTemplate.qualityStatus === "verified" ? copy.saved : copy.needsCheck}
                  </p>
                </div>
                <div className="rounded-lg bg-[#edf2fd] p-3">
                  <p className="text-[10px] font-bold text-slate-500">{copy.pageCount}</p>
                  <p className="mt-1 whitespace-nowrap text-xs font-black text-slate-950">{selectedTemplate.pageCount}</p>
                </div>
                <div className="rounded-lg bg-[#edf2fd] p-3">
                  <p className="text-[10px] font-bold text-slate-500">{copy.quality}</p>
                  <p className="mt-1 whitespace-nowrap text-xs font-black text-slate-950">{qualityLabel(locale, selectedTemplate.qualityStatus)}</p>
                </div>
              </div>
            </article>

            <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-black text-slate-950">{copy.sourcePdf}</h2>
              <p className="mt-2 break-words text-sm font-semibold text-slate-700">{selectedTemplate.sourcePdfFileName}</p>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                  <p className="text-lg font-black text-slate-950">{selectedTemplate.requiredFieldKeys.length}</p>
                  <p className="text-[10px] font-bold text-slate-500">{copy.required}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                  <p className="text-lg font-black text-slate-950">{selectedTemplate.optionalFieldKeys.length}</p>
                  <p className="text-[10px] font-bold text-slate-500">{copy.optional}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                  <p className="text-lg font-black text-slate-950">{selectedTemplate.companySpecificOptionKeys.length}</p>
                  <p className="text-[10px] font-bold text-slate-500">{copy.companyOnly}</p>
                </div>
              </div>
            </article>

            <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-black text-slate-950">{copy.quality}</h2>
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">
                  <span>{copy.safeAuto}</span>
                  <span>{modeCounts.certified_auto}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
                  <span>{copy.assisted}</span>
                  <span>{modeCounts.assisted_candidate}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700">
                  <span>{copy.manual}</span>
                  <span>{modeCounts.manual_electronic}</span>
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>

      <details className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <summary className="cursor-pointer text-sm font-black text-slate-950">{copy.advancedTitle}</summary>
        <p className="mt-2 text-sm leading-6 text-slate-600">{copy.advancedDesc}</p>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <article className="rounded-lg bg-[#edf2fd] p-4">
            <h2 className="text-sm font-black text-slate-950">{copy.versionHistory}</h2>
            <div className="mt-3 space-y-2">
              {versions.length === 0 ? <p className="text-sm text-slate-500">{copy.noVersions}</p> : null}
              {versions.slice(0, 5).map((version) => (
                <Link
                  key={version.id}
                  href={`/settings/output-templates?diffVersionId=${version.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-sm hover:bg-slate-50"
                >
                  <span className="font-bold text-slate-900">{version.versionLabel}</span>
                  <span className="text-xs font-semibold text-slate-500">{formatDate(version.createdAt, locale)}</span>
                </Link>
              ))}
            </div>
          </article>

          <article className="rounded-lg bg-[#edf2fd] p-4">
            <h2 className="text-sm font-black text-slate-950">{copy.qualityNotes}</h2>
            <div className="mt-3 space-y-2">
              {selectedTemplate.qualityNotes.length === 0 ? <p className="text-sm text-slate-500">{copy.noQualityNotes}</p> : null}
              {selectedTemplate.qualityNotes.map((note) => (
                <p key={note} className="rounded-lg bg-white p-3 text-xs leading-5 text-slate-600">
                  {note}
                </p>
              ))}
            </div>
          </article>
        </div>
      </details>
    </div>
  );
}
