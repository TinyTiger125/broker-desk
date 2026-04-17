import Link from "next/link";
import { formatDate } from "@/lib/format";
import { getDefaultUser, listAuditLogs, listUsers } from "@/lib/data";
import { getLocale, type Locale } from "@/lib/locale";

export const dynamic = "force-dynamic";

type AuditLogPageProps = {
  searchParams?: Promise<{
    preset?: string;
    actor?: string;
    action?: string;
    target?: string;
    q?: string;
    from?: string;
    to?: string;
  }>;
};

function getCopy(locale: Locale) {
  const copyByLocale = {
    ja: {
      title: "監査ログ",
      subtitle: "誰が・いつ・何を更新したかを検索できます。",
      backToContracts: "契約管理へ戻る",
      totalLogs: "ログ件数",
      uniqueActions: "操作種別",
      actorCount: "実行アカウント",
      preset: "プリセット",
      presetAll: "すべて",
      presetLast7Days: "直近7日",
      presetKeyWrites: "主要書き込み",
      actor: "実行者",
      action: "操作",
      target: "対象",
      query: "検索",
      dateFrom: "開始日",
      dateTo: "終了日",
      apply: "適用",
      reset: "リセット",
      exportCsv: "CSV出力",
      colTime: "時刻",
      colActor: "実行者",
      colAction: "操作",
      colTarget: "対象",
      colMessage: "メッセージ",
      colContext: "コンテキスト",
      allActors: "すべて",
      allActions: "すべて",
      allTargets: "すべて",
      noLogs: "該当する監査ログはありません。",
      noContext: "なし",
    },
    zh: {
      title: "审计日志",
      subtitle: "可检索“谁在何时对什么做了什么”。",
      backToContracts: "返回合同管理",
      totalLogs: "日志总数",
      uniqueActions: "操作类型",
      actorCount: "执行账号",
      preset: "预设",
      presetAll: "全部",
      presetLast7Days: "最近7天",
      presetKeyWrites: "关键写入",
      actor: "执行者",
      action: "操作",
      target: "目标",
      query: "搜索",
      dateFrom: "开始日期",
      dateTo: "结束日期",
      apply: "应用",
      reset: "重置",
      exportCsv: "导出 CSV",
      colTime: "时间",
      colActor: "执行者",
      colAction: "操作",
      colTarget: "目标",
      colMessage: "消息",
      colContext: "上下文",
      allActors: "全部",
      allActions: "全部",
      allTargets: "全部",
      noLogs: "没有符合条件的审计日志。",
      noContext: "无",
    },
    ko: {
      title: "감사 로그",
      subtitle: "누가 언제 무엇을 변경했는지 검색할 수 있습니다.",
      backToContracts: "계약 관리로 돌아가기",
      totalLogs: "로그 건수",
      uniqueActions: "작업 유형",
      actorCount: "실행 계정",
      preset: "프리셋",
      presetAll: "전체",
      presetLast7Days: "최근 7일",
      presetKeyWrites: "핵심 쓰기 작업",
      actor: "실행자",
      action: "작업",
      target: "대상",
      query: "검색",
      dateFrom: "시작일",
      dateTo: "종료일",
      apply: "적용",
      reset: "초기화",
      exportCsv: "CSV 내보내기",
      colTime: "시각",
      colActor: "실행자",
      colAction: "작업",
      colTarget: "대상",
      colMessage: "메시지",
      colContext: "컨텍스트",
      allActors: "전체",
      allActions: "전체",
      allTargets: "전체",
      noLogs: "조건에 맞는 감사 로그가 없습니다.",
      noContext: "없음",
    },
  } as const;

  return copyByLocale[locale];
}

function parseDateInput(raw: string | undefined, endOfDay = false): Date | undefined {
  if (!raw) return undefined;
  const date = new Date(`${raw}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`);
  if (Number.isNaN(date.getTime())) return undefined;
  return date;
}

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default async function AuditLogPage({ searchParams }: AuditLogPageProps) {
  const locale = await getLocale();
  const copy = getCopy(locale);
  const params = searchParams ? await searchParams : undefined;
  const user = await getDefaultUser();
  if (!user) {
    throw new Error("担当ユーザーが見つかりません。");
  }

  const rawPreset = String(params?.preset ?? "").trim();
  const preset = rawPreset === "last_7_days" || rawPreset === "key_writes" ? rawPreset : "all";
  const actor = String(params?.actor ?? "").trim();
  const action = String(params?.action ?? "").trim();
  const target = String(params?.target ?? "").trim();
  const query = String(params?.q ?? "").trim();
  const from = String(params?.from ?? "").trim();
  const to = String(params?.to ?? "").trim();
  const today = new Date();
  const last7DefaultFrom = new Date(today);
  last7DefaultFrom.setDate(today.getDate() - 6);
  const effectiveFrom = preset === "last_7_days" ? parseDateInput(from) ?? last7DefaultFrom : parseDateInput(from);
  const effectiveTo = preset === "last_7_days" ? parseDateInput(to, true) ?? parseDateInput(toDateInputValue(today), true) : parseDateInput(to, true);
  const displayedFrom = preset === "last_7_days" ? from || toDateInputValue(last7DefaultFrom) : from;
  const displayedTo = preset === "last_7_days" ? to || toDateInputValue(today) : to;
  const keyWriteActions = new Set([
    "import_job_created",
    "import_mapping_updated",
    "import_validation_resolved",
    "import_job_retried",
    "attachment_registered",
    "property_created",
    "party_created",
    "service_request_created",
    "contract_batch_status_updated",
    "contract_batch_status_undone",
    "output_generated",
    "output_template_updated",
    "output_template_version_applied",
  ]);

  const [users, baseLogs] = await Promise.all([listUsers(20), listAuditLogs(user.id, { limit: 400 })]);
  const actions = [...new Set(baseLogs.map((log) => log.action))];
  const targets = [...new Set(baseLogs.map((log) => log.targetType))];
  const rawFilteredLogs = await listAuditLogs(user.id, {
    actorId: actor && actor !== "all" ? actor : undefined,
    action: action && action !== "all" ? action : undefined,
    targetType: target && target !== "all" ? (target as typeof baseLogs[number]["targetType"]) : "all",
    query: query || undefined,
    from: effectiveFrom,
    to: effectiveTo,
    limit: 300,
  });
  const filteredLogs =
    preset === "key_writes" ? rawFilteredLogs.filter((log) => keyWriteActions.has(log.action)) : rawFilteredLogs;
  const exportParams = new URLSearchParams({
    scope: "audit_logs",
    locale,
  });
  if (preset !== "all") exportParams.set("preset", preset);
  if (actor) exportParams.set("actor", actor);
  if (action) exportParams.set("action", action);
  if (target) exportParams.set("target", target);
  if (query) exportParams.set("q", query);
  if (displayedFrom) exportParams.set("from", displayedFrom);
  if (displayedTo) exportParams.set("to", displayedTo);
  const exportHref = `/api/hub/export?${exportParams.toString()}`;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">{copy.title}</h1>
          <p className="mt-1 text-sm text-slate-600">{copy.subtitle}</p>
        </div>
        <Link href="/contracts" className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
          {copy.backToContracts}
        </Link>
      </header>

      <section className="grid gap-3 md:grid-cols-3">
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">{copy.totalLogs}</p>
          <p className="mt-1 text-2xl font-black tabular-nums text-slate-900">{filteredLogs.length}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">{copy.uniqueActions}</p>
          <p className="mt-1 text-2xl font-black tabular-nums text-slate-900">{new Set(filteredLogs.map((log) => log.action)).size}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">{copy.actorCount}</p>
          <p className="mt-1 text-2xl font-black tabular-nums text-slate-900">{new Set(filteredLogs.map((log) => log.actorId)).size}</p>
        </article>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <form action="/audit-log" method="get" className="grid gap-3 md:grid-cols-7">
          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-600">{copy.preset}</span>
            <select name="preset" defaultValue={preset} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-sm">
              <option value="all">{copy.presetAll}</option>
              <option value="last_7_days">{copy.presetLast7Days}</option>
              <option value="key_writes">{copy.presetKeyWrites}</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-600">{copy.actor}</span>
            <select name="actor" defaultValue={actor || "all"} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-sm">
              <option value="all">{copy.allActors}</option>
              {users.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-600">{copy.action}</span>
            <select name="action" defaultValue={action || "all"} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-sm">
              <option value="all">{copy.allActions}</option>
              {actions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-600">{copy.target}</span>
            <select name="target" defaultValue={target || "all"} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-sm">
              <option value="all">{copy.allTargets}</option>
              {targets.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-600">{copy.dateFrom}</span>
            <input type="date" name="from" defaultValue={displayedFrom} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-sm" />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-600">{copy.dateTo}</span>
            <input type="date" name="to" defaultValue={displayedTo} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-sm" />
          </label>
          <label className="space-y-1 md:col-span-2">
            <span className="text-xs font-semibold text-slate-600">{copy.query}</span>
            <input name="q" defaultValue={query} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-sm" />
          </label>
          <div className="flex items-end gap-2 md:col-span-5">
            <button type="submit" className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700">
              {copy.apply}
            </button>
            <Link href="/audit-log" className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
              {copy.reset}
            </Link>
            <Link href={exportHref} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
              {copy.exportCsv}
            </Link>
          </div>
        </form>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-left">
            <thead className="bg-slate-50">
              <tr className="text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">{copy.colTime}</th>
                <th className="px-4 py-3">{copy.colActor}</th>
                <th className="px-4 py-3">{copy.colAction}</th>
                <th className="px-4 py-3">{copy.colTarget}</th>
                <th className="px-4 py-3">{copy.colMessage}</th>
                <th className="px-4 py-3">{copy.colContext}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="align-top">
                  <td className="px-4 py-3 text-xs tabular-nums text-slate-500">{formatDate(log.createdAt, locale)}</td>
                  <td className="px-4 py-3 text-sm font-medium text-slate-900">{users.find((item) => item.id === log.actorId)?.name ?? log.actorId}</td>
                  <td className="px-4 py-3 text-xs font-semibold text-slate-700">{log.action}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">{log.targetType}{log.targetId ? ` / ${log.targetId}` : ""}</td>
                  <td className="px-4 py-3 text-sm text-slate-800">{log.message}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {log.context ? (
                      <code className="whitespace-pre-wrap break-words">{JSON.stringify(log.context)}</code>
                    ) : (
                      copy.noContext
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredLogs.length === 0 ? <p className="px-4 py-8 text-center text-sm text-slate-500">{copy.noLogs}</p> : null}
      </section>
    </div>
  );
}
