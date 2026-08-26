import { ActionBar, FormSection, PageFrame, PageHeader, ResponsiveFormShell, StateSurface } from "@/components/layout-system";
import { getLocale } from "@/lib/locale";

const copy = {
  ja: {
    title: "案件を新規作成",
    description: "案件情報と現在の案件草稿を準備しています。",
    caseInfo: "案件情報",
    workflow: "案件種別",
    caseTitle: "案件名",
    draft: "案件草稿",
    loadingTitle: "案件草稿を読み込んでいます",
    loadingDescription: "案件の入力欄と関連資料の候補を準備しています。",
    create: "案件を作成",
  },
  zh: {
    title: "新建案件",
    description: "正在准备案件信息和当前案件草稿。",
    caseInfo: "案件信息",
    workflow: "案件类型",
    caseTitle: "案件名",
    draft: "案件草稿",
    loadingTitle: "正在加载案件草稿",
    loadingDescription: "正在准备案件字段和关联资料候选。",
    create: "创建案件",
  },
  ko: {
    title: "안건 새로 만들기",
    description: "안건 정보와 현재 안건 초안을 준비하고 있습니다.",
    caseInfo: "안건 정보",
    workflow: "안건 유형",
    caseTitle: "안건명",
    draft: "안건 초안",
    loadingTitle: "안건 초안을 불러오는 중",
    loadingDescription: "안건 입력 항목과 연결할 자료 후보를 준비하고 있습니다.",
    create: "안건 만들기",
  },
} as const;

export default async function NewCaseLoading() {
  const text = copy[await getLocale()];

  return (
    <PageFrame className="space-y-5">
      <PageHeader title={text.title} description={text.description} />
      <ResponsiveFormShell aria-busy="true">
        <FormSection className="space-y-3" aria-labelledby="case-loading-info-heading">
          <h2 id="case-loading-info-heading" className="text-base font-black text-slate-950">{text.caseInfo}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1"><span className="text-sm font-semibold text-slate-700">{text.workflow}</span><div aria-hidden="true" className="h-11 rounded-lg bg-slate-100" /></div>
            <div className="space-y-1"><span className="text-sm font-semibold text-slate-700">{text.caseTitle}</span><div aria-hidden="true" className="h-11 rounded-lg bg-slate-100" /></div>
          </div>
        </FormSection>
        <FormSection className="space-y-3" aria-labelledby="case-loading-draft-heading">
          <h2 id="case-loading-draft-heading" className="text-base font-black text-slate-950">{text.draft}</h2>
          <StateSurface tone="loading" title={text.loadingTitle} description={text.loadingDescription} />
          <div className="grid gap-3 md:grid-cols-2" aria-hidden="true">
            <div className="h-24 rounded-lg bg-slate-100" />
            <div className="h-24 rounded-lg bg-slate-100" />
          </div>
        </FormSection>
        <ActionBar mobileFixed>
          <button type="button" disabled className="min-h-11 rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white opacity-60">{text.create}</button>
        </ActionBar>
      </ResponsiveFormShell>
    </PageFrame>
  );
}
