import Link from "next/link";
import { draftAiExperiencesAction, reviewAiExperienceDraftAction } from "@/app/actions";
import { listAiExperienceDrafts, listCorrectionEvents, type AiExperienceDraftStatus } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { getLocale, type Locale } from "@/lib/locale";
import { requireTenantSession } from "@/lib/tenant-session";

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
  { value: "draft", label: { ja: "確認待ち", zh: "待确认", ko: "확인 대기" } },
  { value: "approved", label: { ja: "有効", zh: "已启用", ko: "사용 중" } },
  { value: "rejected", label: { ja: "使わない", zh: "不使用", ko: "사용 안 함" } },
];

function tr(locale: Locale, values: Record<Locale, string>) {
  return values[locale];
}

function isDraftStatus(value?: string): value is AiExperienceDraftStatus {
  return value === "draft" || value === "approved" || value === "rejected";
}

function statusLabel(locale: Locale, status: AiExperienceDraftStatus) {
  const labels: Record<AiExperienceDraftStatus, Record<Locale, string>> = {
    draft: { ja: "確認待ち", zh: "待确认", ko: "확인 대기" },
    approved: { ja: "有効", zh: "已启用", ko: "사용 중" },
    rejected: { ja: "使わない", zh: "不使用", ko: "사용 안 함" },
  };
  return labels[status][locale];
}

function statusClass(status: AiExperienceDraftStatus) {
  if (status === "approved") return "bg-emerald-100 text-emerald-800";
  if (status === "rejected") return "bg-slate-200 text-slate-700";
  return "bg-amber-100 text-amber-800";
}

function scopeLabel(locale: Locale, scope: string) {
  const labels: Record<string, Record<Locale, string>> = {
    case_only: { ja: "現在の案件", zh: "当前案件", ko: "현재 안건" },
    user_or_team: { ja: "チーム", zh: "团队", ko: "팀" },
    source_template: { ja: "資料読取", zh: "资料读取", ko: "자료 판독" },
    output_template: { ja: "書類作成", zh: "文书生成", ko: "문서 작성" },
    field_dictionary: { ja: "項目名", zh: "项目名称", ko: "항목명" },
    global_rule_candidate: { ja: "共通", zh: "通用", ko: "공통" },
    regression_case: { ja: "確認記録", zh: "验证记录", ko: "확인 기록" },
  };
  return labels[scope]?.[locale] ?? (locale === "zh" ? "其他" : locale === "ko" ? "기타" : "その他");
}

export default async function AiExperiencePage({ searchParams }: AiExperiencePageProps) {
  const [params, locale, session] = await Promise.all([
    searchParams,
    getLocale(),
    requireTenantSession({ permission: "ai.experience_review" }),
  ]);
  const user = session.user;
  const tenantId = session.tenant.id;

  const selectedStatus = isDraftStatus(params?.status) ? params.status : undefined;
  const [visibleDrafts, allDrafts, correctionEvents] = await Promise.all([
    listAiExperienceDrafts({ userId: user.id, tenantId, status: selectedStatus, limit: 80 }),
    listAiExperienceDrafts({ userId: user.id, tenantId, limit: 300 }),
    listCorrectionEvents({ userId: user.id, tenantId, limit: 120 }),
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
            <p className="text-xs font-black uppercase tracking-wider text-[#002FA7]">
              {tr(locale, { ja: "AI経験", zh: "AI 经验", ko: "AI 경험" })}
            </p>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
              {tr(locale, { ja: "AI経験レビュー", zh: "AI 经验审核", ko: "AI 경험 검토" })}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              {tr(locale, {
                ja: "承認した経験だけが、今後のAI処理で参考情報として使われます。案件事実として自動確定されることはありません。",
                zh: "只有已审核启用的经验会作为后续模型参考，不会被当作当前案件事实自动写入。",
                ko: "승인된 경험만 이후 AI 처리의 참고 정보로 사용되며, 현재 안건의 사실로 자동 확정되지 않습니다.",
              })}
            </p>
          </div>
          <form action={draftAiExperiencesAction}>
            <button className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-black text-white hover:bg-slate-800">
              <span className="material-symbols-outlined text-[18px]">sync</span>
              {tr(locale, { ja: "新しい経験候補を整理", zh: "整理新的经验候选", ko: "새 경험 후보 정리" })}
            </button>
          </form>
        </div>
        {params?.flash ? (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">
            {params.flash === "experience_drafted"
              ? tr(locale, { ja: `経験候補: ${createdCount}件`, zh: `经验候选：${createdCount} 条`, ko: `경험 후보: ${createdCount}건` })
              : tr(locale, { ja: "レビューを保存しました。", zh: "审核已保存。", ko: "검토를 저장했습니다." })}
          </div>
        ) : null}
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-bold text-slate-500">{tr(locale, { ja: "参考記録", zh: "可参考记录", ko: "참고 기록" })}</p>
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
                      <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-slate-600">{scopeLabel(locale, draft.scopeCandidate)}</span>
                      {draft.templateId ? <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-slate-600">{tr(locale, { ja: "書類関連", zh: "文书相关", ko: "문서 관련" })}</span> : null}
                    </div>
                    <h2 className="mt-2 text-base font-black text-slate-950">{draft.title}</h2>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      {tr(locale, { ja: "作成日", zh: "创建日期", ko: "생성일" })}: {formatDate(draft.createdAt, locale)}
                    </p>
                  </div>
                  {draft.status === "draft" ? (
                    <div className="flex gap-2">
                      <form action={reviewAiExperienceDraftAction}>
                        <input type="hidden" name="draftId" value={draft.id} />
                        <input type="hidden" name="status" value="approved" />
                        <button className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-black text-white hover:bg-emerald-800">
                          {tr(locale, { ja: "使う", zh: "启用", ko: "사용" })}
                        </button>
                      </form>
                      <form action={reviewAiExperienceDraftAction}>
                        <input type="hidden" name="draftId" value={draft.id} />
                        <input type="hidden" name="status" value="rejected" />
                        <button className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-100">
                          {tr(locale, { ja: "使わない", zh: "不使用", ko: "사용 안 함" })}
                        </button>
                      </form>
                    </div>
                  ) : null}
                </div>
                <pre className="mt-3 max-h-[360px] overflow-auto whitespace-pre-wrap rounded-lg bg-white p-3 text-xs leading-5 text-slate-700">
                  {draft.bodyMarkdown}
                </pre>
                <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold text-slate-500">
                  <span>{tr(locale, { ja: "参考記録", zh: "参考记录", ko: "참고 기록" })}: {draft.eventIds.length}</span>
                </div>
              </article>
            ))
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm font-bold text-slate-500">
              {tr(locale, { ja: "確認が必要な内容はありません。", zh: "暂无需要确认的内容。", ko: "확인이 필요한 내용이 없습니다." })}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
