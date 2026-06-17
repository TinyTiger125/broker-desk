import Link from "next/link";
import { draftAiExperiencesAction, reviewAiExperienceDraftAction } from "@/app/actions";
import { getDefaultUser, listAiExperienceDrafts, listCorrectionEvents, type AiExperienceDraftStatus } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { getLocale, type Locale } from "@/lib/locale";

export const dynamic = "force-dynamic";

type AiExperiencePageProps = {
  searchParams?: Promise<{
    status?: string;
    flash?: string;
    created?: string;
  }>;
};

const statusTabs: Array<{ value: "all" | AiExperienceDraftStatus; label: Record<Locale, string> }> = [
  { value: "all", label: { ja: "すべて", zh: "全部", ko: "전체" } },
  { value: "draft", label: { ja: "承認待ち", zh: "待审核", ko: "승인 대기" } },
  { value: "approved", label: { ja: "承認済み", zh: "已批准", ko: "승인됨" } },
  { value: "rejected", label: { ja: "却下", zh: "已拒绝", ko: "거절됨" } },
];

function tr(locale: Locale, values: Record<Locale, string>) {
  return values[locale];
}

function isDraftStatus(value?: string): value is AiExperienceDraftStatus {
  return value === "draft" || value === "approved" || value === "rejected";
}

function statusLabel(locale: Locale, status: AiExperienceDraftStatus) {
  const labels: Record<AiExperienceDraftStatus, Record<Locale, string>> = {
    draft: { ja: "承認待ち", zh: "待审核", ko: "승인 대기" },
    approved: { ja: "承認済み", zh: "已批准", ko: "승인됨" },
    rejected: { ja: "却下", zh: "已拒绝", ko: "거절됨" },
  };
  return labels[status][locale];
}

function statusClass(status: AiExperienceDraftStatus) {
  if (status === "approved") return "bg-emerald-100 text-emerald-800";
  if (status === "rejected") return "bg-slate-200 text-slate-700";
  return "bg-amber-100 text-amber-800";
}

function scopeLabel(scope: string) {
  const labels: Record<string, string> = {
    case_only: "case",
    user_or_team: "team",
    source_template: "source",
    output_template: "output",
    field_dictionary: "field",
    global_rule_candidate: "global",
    regression_case: "regression",
  };
  return labels[scope] ?? scope;
}

export default async function AiExperiencePage({ searchParams }: AiExperiencePageProps) {
  const [params, locale, user] = await Promise.all([searchParams, getLocale(), getDefaultUser()]);
  if (!user) return <p className="text-sm text-slate-600">{tr(locale, { ja: "利用可能なユーザーがありません。", zh: "没有可用用户。", ko: "사용 가능한 사용자가 없습니다." })}</p>;

  const selectedStatus = isDraftStatus(params?.status) ? params.status : undefined;
  const [visibleDrafts, allDrafts, correctionEvents] = await Promise.all([
    listAiExperienceDrafts({ userId: user.id, status: selectedStatus, limit: 80 }),
    listAiExperienceDrafts({ userId: user.id, limit: 300 }),
    listCorrectionEvents({ userId: user.id, limit: 120 }),
  ]);
  const counts = {
    all: allDrafts.length,
    draft: allDrafts.filter((item) => item.status === "draft").length,
    approved: allDrafts.filter((item) => item.status === "approved").length,
    rejected: allDrafts.filter((item) => item.status === "rejected").length,
  };
  const createdCount = Number(params?.created ?? 0);

  return (
    <main className="space-y-5">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-wider text-[#002FA7]">AI Review</p>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
              {tr(locale, { ja: "AI経験レビュー", zh: "AI 经验审核", ko: "AI 경험 리뷰" })}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              {tr(locale, {
                ja: "承認済みだけが後続のAI文脈候補になります。却下や承認待ちは業務判断に使いません。",
                zh: "只有已批准经验会进入后续 AI 上下文候选；待审核和已拒绝不会用于业务判断。",
                ko: "승인된 경험만 이후 AI 문맥 후보가 됩니다. 대기/거절 항목은 업무 판단에 쓰지 않습니다.",
              })}
            </p>
          </div>
          <form action={draftAiExperiencesAction}>
            <button className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-black text-white hover:bg-slate-800">
              <span className="material-symbols-outlined text-[18px]">sync</span>
              {tr(locale, { ja: "草稿を生成", zh: "生成草稿", ko: "초안 생성" })}
            </button>
          </form>
        </div>
        {params?.flash ? (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">
            {params.flash === "experience_drafted"
              ? tr(locale, { ja: `生成: ${createdCount}件`, zh: `已生成：${createdCount} 条`, ko: `생성: ${createdCount}건` })
              : tr(locale, { ja: "審査を保存しました。", zh: "审核已保存。", ko: "리뷰를 저장했습니다." })}
          </div>
        ) : null}
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-bold text-slate-500">{tr(locale, { ja: "修正イベント", zh: "修正事件", ko: "수정 이벤트" })}</p>
          <p className="mt-1 text-3xl font-black text-slate-950">{correctionEvents.length}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-bold text-slate-500">{statusLabel(locale, "draft")}</p>
          <p className="mt-1 text-3xl font-black text-amber-800">{counts.draft}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-bold text-slate-500">{statusLabel(locale, "approved")}</p>
          <p className="mt-1 text-3xl font-black text-emerald-800">{counts.approved}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-bold text-slate-500">{statusLabel(locale, "rejected")}</p>
          <p className="mt-1 text-3xl font-black text-slate-700">{counts.rejected}</p>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {statusTabs.map((tab) => {
            const active = tab.value === (selectedStatus ?? "all");
            const href = tab.value === "all" ? "/settings/ai-experience" : `/settings/ai-experience?status=${tab.value}`;
            const count = counts[tab.value];
            return (
              <Link
                key={tab.value}
                href={href}
                className={`rounded-full px-3 py-1 text-xs font-black ${active ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
              >
                {tab.label[locale]} {count}
              </Link>
            );
          })}
        </div>

        <div className="mt-4 space-y-3">
          {visibleDrafts.length > 0 ? (
            visibleDrafts.map((draft) => (
              <article key={draft.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${statusClass(draft.status)}`}>
                        {statusLabel(locale, draft.status)}
                      </span>
                      <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-slate-600">{scopeLabel(draft.scopeCandidate)}</span>
                      {draft.templateId ? <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-slate-600">{draft.templateId}</span> : null}
                    </div>
                    <h2 className="mt-2 text-base font-black text-slate-950">{draft.title}</h2>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      {draft.fieldKey ?? "-"} / {draft.changeType} / {formatDate(draft.createdAt, locale)}
                    </p>
                  </div>
                  {draft.status === "draft" ? (
                    <div className="flex gap-2">
                      <form action={reviewAiExperienceDraftAction}>
                        <input type="hidden" name="draftId" value={draft.id} />
                        <input type="hidden" name="status" value="approved" />
                        <button className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-black text-white hover:bg-emerald-800">
                          {tr(locale, { ja: "承認", zh: "批准", ko: "승인" })}
                        </button>
                      </form>
                      <form action={reviewAiExperienceDraftAction}>
                        <input type="hidden" name="draftId" value={draft.id} />
                        <input type="hidden" name="status" value="rejected" />
                        <button className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-100">
                          {tr(locale, { ja: "却下", zh: "拒绝", ko: "거절" })}
                        </button>
                      </form>
                    </div>
                  ) : null}
                </div>
                <pre className="mt-3 max-h-[360px] overflow-auto whitespace-pre-wrap rounded-lg bg-white p-3 text-xs leading-5 text-slate-700">
                  {draft.bodyMarkdown}
                </pre>
                <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold text-slate-500">
                  <span>{tr(locale, { ja: "根拠", zh: "依据", ko: "근거" })}: {draft.eventIds.length}</span>
                  {draft.eventIds.slice(0, 4).map((eventId) => (
                    <span key={eventId} className="rounded bg-white px-2 py-0.5 font-mono">{eventId}</span>
                  ))}
                </div>
              </article>
            ))
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm font-bold text-slate-500">
              {tr(locale, { ja: "表示できる草稿はありません。", zh: "没有可显示的草稿。", ko: "표시할 초안이 없습니다." })}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
