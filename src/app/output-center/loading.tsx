import { PageFrame, PageHeader, StateSurface, WorklistShell } from "@/components/layout-system";
import { getLocale } from "@/lib/locale";

const copy = {
  ja: {
    title: "文書出力",
    description: "出力タスクと必要な確認を準備しています。",
    tasks: "出力タスク",
    loadingTitle: "出力タスクを読み込んでいます",
    loadingDescription: "文書の選択肢と次の操作を確認しています。",
  },
  zh: {
    title: "文书输出",
    description: "正在准备输出任务和所需确认。",
    tasks: "输出任务",
    loadingTitle: "正在加载输出任务",
    loadingDescription: "正在确认可选文书和下一步操作。",
  },
  ko: {
    title: "문서 출력",
    description: "출력 작업과 필요한 확인을 준비하고 있습니다.",
    tasks: "출력 작업",
    loadingTitle: "출력 작업을 불러오는 중",
    loadingDescription: "문서 선택 항목과 다음 작업을 확인하고 있습니다.",
  },
} as const;

export default async function OutputCenterLoading() {
  const text = copy[await getLocale()];

  return (
    <PageFrame className="bd-page bd-output-page space-y-6">
      <PageHeader title={text.title} description={text.description} />
      <WorklistShell
        aria-busy="true"
        aria-labelledby="output-loading-heading"
        controls={<h2 id="output-loading-heading" className="text-base font-black text-slate-950">{text.tasks}</h2>}
        items={(
          <div className="grid gap-3 p-5" aria-hidden="true">
            <div className="h-16 rounded-lg bg-slate-100" />
            <div className="h-16 rounded-lg bg-slate-100" />
            <div className="h-16 rounded-lg bg-slate-100" />
          </div>
        )}
        detail={<StateSurface tone="loading" title={text.loadingTitle} description={text.loadingDescription} />}
      />
    </PageFrame>
  );
}
