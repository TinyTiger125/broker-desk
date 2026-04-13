import Link from "next/link";
import { getDefaultUser, listOutputTemplateVersions } from "@/lib/data";
import { listHubGeneratedOutputs } from "@/lib/hub";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";

export const dynamic = "force-dynamic";
type TemplatesPageProps = {
  searchParams?: Promise<{
    template?: string;
    q?: string;
  }>;
};

const templatesCopy = {
  ja: {
    subtitle: "台帳構造とドキュメント自動化を管理します。",
    importSchema: "スキーマ取込",
    createTemplate: "テンプレート作成",
    library: "ライブラリ",
    modified2h: "2時間前に更新",
    modified1d: "1日前に更新",
    modified3d: "3日前に更新",
    versionHistory: "版履歴",
    updatedFieldMapping: "フィールドマッピング更新",
    allChangesSaved: "変更を保存済み",
    fieldMapping: "フィールドマッピング",
    searchFields: "フィールド検索...",
    validationResults: "検証結果",
    dataIntegrityPassed: "データ整合性OK",
    integrityDesc: "14個の変数が有効なデータソースに正常マッピングされました。",
    draftState: "下書き状態",
    draftDesc: "このテンプレートは下書きのため本番出力には使用できません。",
    publishTemplate: "テンプレート公開",
    testPrint: "テスト印刷",
    distribute: "配布",
    diffCompare: "差分比較: 現在版 vs 前版",
    viewFullComparison: "比較をすべて表示",
    removed: "削除",
    added: "追加",
    libLeaseAgreement: "賃貸借契約 v4",
    libPortfolioSummary: "ポートフォリオ概要",
    libBrokerageDisclosure: "媒介重要事項説明",
    editorTemplateName: "賃貸借契約 v4",
    editorDocTitle: "居住用賃貸借契約書",
    editorDocId: "文書ID: TEM-492-AXL",
    editorBody1:
      "本賃貸借契約は、[[contract_date]] をもって、[[landlord_name]] と [[tenant_name]] の間で締結されます。",
    editorSec1: "1. 物件所在地",
    editorSec2: "2. 契約期間",
    editorBody2:
      "本契約の期間は [[lease_duration_months]] か月とし、[[lease_start_date]] より開始します。",
    editorNote: "注記: 青色の項目は台帳データから自動差し込みされます。",
    diffRemovedText: "借主は植栽管理費を全額負担するものとする。",
    diffAddedText: "植栽管理費は貸主・借主で 50% ずつ負担するものとする。",
    sourceContractSignDate: "契約 > 署名日",
    sourcePartyEntity: "関係者 > 主体名",
    sourcePartyTenant: "関係者 > 主借主",
    sourcePropertyAddress: "物件 > 住所1",
    sourceContractDuration: "契約 > 期間",
    noFieldMatched: "該当するフィールドがありません。",
  },
  zh: {
    subtitle: "管理业务台账结构与文档自动化模板。",
    importSchema: "导入结构",
    createTemplate: "创建模板",
    library: "模板库",
    modified2h: "2小时前更新",
    modified1d: "1天前更新",
    modified3d: "3天前更新",
    versionHistory: "版本历史",
    updatedFieldMapping: "已更新字段映射",
    allChangesSaved: "所有更改已保存",
    fieldMapping: "字段映射",
    searchFields: "搜索字段...",
    validationResults: "校验结果",
    dataIntegrityPassed: "数据完整性通过",
    integrityDesc: "14个变量均已成功映射到有效数据源。",
    draftState: "草稿状态",
    draftDesc: "当前模板为草稿状态，暂不可用于正式输出。",
    publishTemplate: "发布模板",
    testPrint: "测试打印",
    distribute: "分发",
    diffCompare: "差异对比：当前版 vs 上一版",
    viewFullComparison: "查看完整对比",
    removed: "删除",
    added: "新增",
    libLeaseAgreement: "租赁合同 v4",
    libPortfolioSummary: "资产组合摘要",
    libBrokerageDisclosure: "中介披露说明",
    editorTemplateName: "租赁合同 v4",
    editorDocTitle: "住宅租赁合同",
    editorDocId: "文档ID: TEM-492-AXL",
    editorBody1: "本租赁合同于 [[contract_date]] 由 [[landlord_name]] 与 [[tenant_name]] 签署。",
    editorSec1: "1. 物件地址",
    editorSec2: "2. 租期",
    editorBody2: "本合同租期为 [[lease_duration_months]] 个月，自 [[lease_start_date]] 起生效。",
    editorNote: "注：蓝色字段将从业务台账自动映射。",
    diffRemovedText: "租客需承担全部绿化维护费用。",
    diffAddedText: "绿化维护费用由房东与租客各承担 50%。",
    sourceContractSignDate: "合同 > 签署日",
    sourcePartyEntity: "主体 > 名称",
    sourcePartyTenant: "主体 > 主承租人",
    sourcePropertyAddress: "物件 > 地址1",
    sourceContractDuration: "合同 > 期限",
    noFieldMatched: "没有匹配的字段。",
  },
  ko: {
    subtitle: "원장 구조와 문서 자동화 템플릿을 관리합니다.",
    importSchema: "스키마 가져오기",
    createTemplate: "템플릿 생성",
    library: "라이브러리",
    modified2h: "2시간 전 수정",
    modified1d: "1일 전 수정",
    modified3d: "3일 전 수정",
    versionHistory: "버전 이력",
    updatedFieldMapping: "필드 매핑 업데이트",
    allChangesSaved: "모든 변경 저장됨",
    fieldMapping: "필드 매핑",
    searchFields: "필드 검색...",
    validationResults: "검증 결과",
    dataIntegrityPassed: "데이터 무결성 통과",
    integrityDesc: "14개 변수가 유효한 데이터 소스에 성공적으로 매핑되었습니다.",
    draftState: "초안 상태",
    draftDesc: "현재 템플릿은 초안 상태로 운영 출력에 사용할 수 없습니다.",
    publishTemplate: "템플릿 게시",
    testPrint: "테스트 인쇄",
    distribute: "배포",
    diffCompare: "비교: 현재 버전 vs 이전 버전",
    viewFullComparison: "전체 비교 보기",
    removed: "삭제",
    added: "추가",
    libLeaseAgreement: "임대차 계약 v4",
    libPortfolioSummary: "포트폴리오 요약",
    libBrokerageDisclosure: "중개 중요사항 설명",
    editorTemplateName: "임대차 계약 v4",
    editorDocTitle: "주거용 임대차 계약서",
    editorDocId: "문서 ID: TEM-492-AXL",
    editorBody1:
      "본 임대차 계약은 [[contract_date]]에 [[landlord_name]]와 [[tenant_name]] 사이에서 체결됩니다.",
    editorSec1: "1. 매물 주소",
    editorSec2: "2. 계약 기간",
    editorBody2: "본 계약 기간은 [[lease_duration_months]]개월이며 [[lease_start_date]]부터 시작됩니다.",
    editorNote: "참고: 파란색 필드는 원장 데이터에서 자동 매핑됩니다.",
    diffRemovedText: "임차인은 조경 유지비를 전액 부담한다.",
    diffAddedText: "조경 유지비는 임대인과 임차인이 50%씩 부담한다.",
    sourceContractSignDate: "계약 > 서명일",
    sourcePartyEntity: "관계자 > 주체명",
    sourcePartyTenant: "관계자 > 주 임차인",
    sourcePropertyAddress: "매물 > 주소1",
    sourceContractDuration: "계약 > 기간",
    noFieldMatched: "일치하는 필드가 없습니다.",
  },
} as const;

export default async function TemplatesPage({ searchParams }: TemplatesPageProps) {
  const locale = await getLocale();
  const copy = templatesCopy[locale];
  const params = searchParams ? await searchParams : undefined;
  const selectedTemplate = params?.template ?? "lease_agreement_v4";
  const query = String(params?.q ?? "").trim().toLowerCase();
  const user = await getDefaultUser();
  const [versions, allOutputs] = await Promise.all([
    user ? listOutputTemplateVersions(user.id, 6) : Promise.resolve([]),
    user ? listHubGeneratedOutputs(locale) : Promise.resolve([]),
  ]);
  const versionOutputCountMap = new Map<string, number>();
  allOutputs.forEach((o) => {
    if (o.templateVersionId) {
      versionOutputCountMap.set(o.templateVersionId, (versionOutputCountMap.get(o.templateVersionId) ?? 0) + 1);
    }
  });
  const diffVersionId = versions[1]?.id ?? versions[0]?.id ?? "";
  const localeTag = locale === "zh" ? "zh-CN" : locale === "ko" ? "ko-KR" : "ja-JP";
  const mappingFields = [
    ["[[contract_date]]", copy.sourceContractSignDate],
    ["[[landlord_name]]", copy.sourcePartyEntity],
    ["[[tenant_name]]", copy.sourcePartyTenant],
    ["[[property_street_address]]", copy.sourcePropertyAddress],
    ["[[lease_duration_months]]", copy.sourceContractDuration],
  ] as const;
  const filteredMappingFields = mappingFields.filter(([field, source]) =>
    query ? field.toLowerCase().includes(query) || source.toLowerCase().includes(query) : true
  );
  const templateToOutputType = {
    lease_agreement_v4: "proposal",
    portfolio_summary: "funding_plan",
    brokerage_disclosure: "assumption_memo",
  } as const;
  const selectedOutputType = templateToOutputType[selectedTemplate as keyof typeof templateToOutputType] ?? "proposal";

  return (
    <div className="space-y-8">
      <header className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="text-4xl font-light tracking-tight text-slate-900">{t(locale, "templates.title")}</h1>
          <p className="mt-1 text-sm font-medium text-slate-600">{copy.subtitle}</p>
        </div>
        <div className="flex gap-3">
          <Link href="/import-center" className="rounded-lg bg-[#e9effc] px-4 py-2 text-sm font-semibold text-slate-800">
            {copy.importSchema}
          </Link>
          <Link href="/settings/output-templates" className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-[#001e40] to-[#003366] px-4 py-2 text-sm font-semibold text-white shadow-sm">
            <span className="material-symbols-outlined text-[16px]">add</span>
            {copy.createTemplate}
          </Link>
        </div>
      </header>

      <section className="grid gap-6 xl:grid-cols-12">
        <div className="space-y-4 xl:col-span-3">
          <article className="rounded-xl bg-[#edf2fd] p-4">
            <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-slate-700">{copy.library}</h2>
            <div className="space-y-2">
              <Link
                href="/templates?template=lease_agreement_v4"
                className={
                  "flex w-full items-center gap-3 rounded-lg p-3 text-left " +
                  (selectedTemplate === "lease_agreement_v4" ? "bg-white shadow-sm" : "transition hover:bg-white/70")
                }
              >
                <span className="flex h-10 w-10 items-center justify-center rounded bg-blue-50 text-blue-600">
                  <span className="material-symbols-outlined">description</span>
                </span>
                <span className="overflow-hidden">
                  <span className="block truncate text-sm font-bold text-[#001e40]">{copy.libLeaseAgreement}</span>
                  <span className="block text-[11px] text-slate-500">{copy.modified2h}</span>
                </span>
              </Link>
              <Link
                href="/templates?template=portfolio_summary"
                className={
                  "flex w-full items-center gap-3 rounded-lg p-3 text-left " +
                  (selectedTemplate === "portfolio_summary" ? "bg-white shadow-sm" : "transition hover:bg-white/70")
                }
              >
                <span className="flex h-10 w-10 items-center justify-center rounded bg-slate-100 text-slate-500">
                  <span className="material-symbols-outlined">analytics</span>
                </span>
                <span className="overflow-hidden">
                  <span className="block truncate text-sm font-medium text-slate-800">{copy.libPortfolioSummary}</span>
                  <span className="block text-[11px] text-slate-500">{copy.modified1d}</span>
                </span>
              </Link>
              <Link
                href="/templates?template=brokerage_disclosure"
                className={
                  "flex w-full items-center gap-3 rounded-lg p-3 text-left " +
                  (selectedTemplate === "brokerage_disclosure" ? "bg-white shadow-sm" : "transition hover:bg-white/70")
                }
              >
                <span className="flex h-10 w-10 items-center justify-center rounded bg-slate-100 text-slate-500">
                  <span className="material-symbols-outlined">contract</span>
                </span>
                <span className="overflow-hidden">
                  <span className="block truncate text-sm font-medium text-slate-800">{copy.libBrokerageDisclosure}</span>
                  <span className="block text-[11px] text-slate-500">{copy.modified3d}</span>
                </span>
              </Link>
            </div>
          </article>

          <article className="rounded-xl bg-[#edf2fd] p-4">
            <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-slate-700">{copy.versionHistory}</h2>
            <div className="space-y-4 border-l-2 border-[#001e40]/10 pl-5">
              {versions.slice(0, 3).map((version, index) => {
                const usedCount = versionOutputCountMap.get(version.id) ?? 0;
                return (
                  <Link key={version.id} href={`/settings/output-templates?diffVersionId=${version.id}`} className="relative block rounded-md px-1 py-0.5 hover:bg-white/60">
                    <span
                      className={
                        "absolute -left-[26px] top-1 h-2.5 w-2.5 rounded-full border-4 border-[#edf2fd] " +
                        (index === 0 ? "bg-[#001e40]" : "bg-slate-300")
                      }
                    />
                    <p className="text-[13px] font-bold text-slate-900">
                      {index === 0 ? copy.updatedFieldMapping : version.versionLabel}
                    </p>
                    <p className="text-[11px] text-slate-500">{version.createdAt.toLocaleString(localeTag)}</p>
                    {usedCount > 0 ? (
                      <p className="mt-0.5 text-[10px] font-medium text-[#001e40]">
                        {locale === "zh" ? `已使用 ${usedCount} 次` : locale === "ko" ? `${usedCount}회 사용됨` : `${usedCount}回使用済`}
                      </p>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </article>
        </div>

        <div className="space-y-6 xl:col-span-6">
          <article className="overflow-hidden rounded-xl border border-slate-200/50 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200/60 bg-[#edf2fd] px-6 py-3">
              <div className="flex items-center gap-4">
                <h2 className="text-sm font-bold text-slate-900">{copy.editorTemplateName}</h2>
                <div className="h-4 w-px bg-slate-300" />
                <div className="flex items-center gap-1 text-slate-500">
                  <Link href={diffVersionId ? `/settings/output-templates?diffVersionId=${diffVersionId}` : "/settings/output-templates"} className="rounded p-1 transition hover:bg-white">
                    <span className="material-symbols-outlined text-[18px]">undo</span>
                  </Link>
                  <Link href="/settings/output-templates" className="rounded p-1 transition hover:bg-white">
                    <span className="material-symbols-outlined text-[18px]">redo</span>
                  </Link>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-600">{copy.allChangesSaved}</span>
                <Link href="/settings/output-templates" className="rounded-lg p-1.5 text-slate-500 hover:bg-white">
                  <span className="material-symbols-outlined text-[18px]">fullscreen</span>
                </Link>
              </div>
            </div>

            <div className="min-h-[620px] bg-slate-50/60 p-10">
              <div className="mx-auto max-w-2xl rounded-sm border border-slate-100 bg-white p-12 shadow-xl shadow-slate-200/50">
                <div className="mb-8 text-center">
                  <h3 className="text-2xl font-bold uppercase tracking-widest text-[#001e40]">{copy.editorDocTitle}</h3>
                  <p className="text-xs text-slate-500">{copy.editorDocId}</p>
                </div>
                <div className="space-y-6 text-sm leading-relaxed text-slate-700">
                  <p>{copy.editorBody1}</p>
                  <div>
                    <h4 className="mb-2 text-xs font-bold uppercase tracking-wider">{copy.editorSec1}</h4>
                    <div className="rounded-lg border border-[#001e40]/5 bg-[#edf2fd] p-4">
                      <p className="tabular-nums">[[property_street_address]]</p>
                      <p className="tabular-nums">[[property_city]], [[property_state]] [[property_zip]]</p>
                    </div>
                  </div>
                  <div>
                    <h4 className="mb-2 text-xs font-bold uppercase tracking-wider">{copy.editorSec2}</h4>
                    <p>{copy.editorBody2}</p>
                  </div>
                  <p className="border-t border-slate-100 pt-6 text-xs italic text-slate-500">* {copy.editorNote}</p>
                </div>
              </div>
            </div>
          </article>

          <article className="rounded-xl bg-[#edf2fd] p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-700">{copy.diffCompare}</h2>
              <Link href={diffVersionId ? `/settings/output-templates?diffVersionId=${diffVersionId}` : "/settings/output-templates"} className="text-[11px] font-bold text-[#001e40] hover:underline">
                {copy.viewFullComparison}
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg border border-red-200/60 bg-red-50 p-3">
                <p className="mb-1 text-[11px] font-bold uppercase text-red-600">{copy.removed}</p>
                <p className="text-xs text-slate-500 line-through">{copy.diffRemovedText}</p>
              </div>
              <div className="rounded-lg border border-emerald-200/60 bg-emerald-50 p-3">
                <p className="mb-1 text-[11px] font-bold uppercase text-emerald-600">{copy.added}</p>
                <p className="text-xs text-slate-700">{copy.diffAddedText}</p>
              </div>
            </div>
          </article>
        </div>

        <div className="space-y-5 xl:col-span-3">
          <article className="rounded-xl bg-[#edf2fd] p-5">
            <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-slate-700">{copy.fieldMapping}</h2>
            <form className="relative mb-4" method="get" action="/templates">
              <input type="hidden" name="template" value={selectedTemplate} />
              <span className="material-symbols-outlined pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[14px] text-slate-400">search</span>
              <input
                name="q"
                defaultValue={params?.q ?? ""}
                className="w-full rounded-lg border-none bg-white py-1.5 pl-8 pr-3 text-xs"
                placeholder={copy.searchFields}
              />
              <button type="submit" className="sr-only">
                search
              </button>
            </form>
            <div className="max-h-[400px] space-y-1 overflow-y-auto pr-1">
              {filteredMappingFields.map(([field, source], index) => (
                <div
                  key={field}
                  className={
                    "rounded-lg border p-2 transition " +
                    (index === 2 ? "border-slate-200 bg-white shadow-sm" : "border-transparent hover:border-slate-200 hover:bg-white")
                  }
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#001e40]">{field}</span>
                    <span className={"material-symbols-outlined text-[14px] " + (index === 2 ? "text-[#001e40]" : "text-slate-300")}>link</span>
                  </div>
                  <p className="text-[10px] text-slate-500">{source}</p>
                </div>
              ))}
              {filteredMappingFields.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 bg-white p-3 text-[11px] text-slate-500">
                  {copy.noFieldMatched}
                </div>
              ) : null}
            </div>
          </article>

          <article className="rounded-xl border-l-4 border-[#001e40] bg-[#e6eeff] p-5">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-[#001e40]">{copy.validationResults}</h2>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-emerald-600">check_circle</span>
                <div>
                  <p className="text-[12px] font-bold text-slate-900">{copy.dataIntegrityPassed}</p>
                  <p className="text-[11px] text-slate-600">{copy.integrityDesc}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-[#d8885c]">info</span>
                <div>
                  <p className="text-[12px] font-bold text-slate-900">{copy.draftState}</p>
                  <p className="text-[11px] text-slate-600">{copy.draftDesc}</p>
                </div>
              </div>
            </div>
            <Link href="/settings/output-templates" className="mt-4 inline-flex w-full items-center justify-center rounded-lg bg-[#001e40] py-2 text-xs font-bold text-white">
              {copy.publishTemplate}
            </Link>
          </article>

          <div className="grid grid-cols-2 gap-3">
            <Link href={`/output-center?type=${selectedOutputType}`} className="flex flex-col items-center justify-center rounded-xl bg-[#edf2fd] p-4 text-slate-600 transition hover:bg-[#e3ecff]">
              <span className="material-symbols-outlined mb-2">print</span>
              <span className="text-[10px] font-bold uppercase">{copy.testPrint}</span>
            </Link>
            <Link href={`/output-center?type=${selectedOutputType}`} className="flex flex-col items-center justify-center rounded-xl bg-[#edf2fd] p-4 text-slate-600 transition hover:bg-[#e3ecff]">
              <span className="material-symbols-outlined mb-2">share</span>
              <span className="text-[10px] font-bold uppercase">{copy.distribute}</span>
            </Link>
          </div>

          <Link href="/settings/output-templates" className="inline-flex w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            {t(locale, "templates.sheet.edit")}
          </Link>
        </div>
      </section>
    </div>
  );
}
