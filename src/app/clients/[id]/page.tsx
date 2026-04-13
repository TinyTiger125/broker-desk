import Link from "next/link";
import { notFound } from "next/navigation";
import { addFollowUp, changeTaskStatusAction, rescheduleTaskAction, updateClientStage } from "@/app/actions";
import { PageFlashBanner } from "@/components/page-flash-banner";
import { SectionCard } from "@/components/section-card";
import { formatCurrency, formatDate, formatRelativeDays } from "@/lib/format";
import { getClientDetail } from "@/lib/data";
import { getLocale } from "@/lib/locale";
import { buildClientWorkflowGuide, getAllowedStageTargets, WORKFLOW_STAGE_PATH } from "@/lib/workflow-engine";
import {
  getAmlCheckStatusLabel,
  getBrokerageContractTypeLabel,
  getBudgetTypeLabel,
  getFollowTypeLabel,
  getFollowTypeOptions,
  getLoanPreApprovalLabel,
  getPurposeLabel,
  getStageLabel,
  getStageOptions,
  getTemperatureLabel,
} from "@/lib/options";
import { type ClientStage } from "@/lib/domain";

export const dynamic = "force-dynamic";

const taskStatusBadgeClass = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  done: "bg-emerald-50 text-emerald-700 border-emerald-200",
  canceled: "bg-slate-100 text-slate-600 border-slate-200",
} as const;

const texts = {
  ja: {
    areaUnset: "エリア未設定",
    edit: "顧客編集",
    createQuote: "提案作成",
    basic: "顧客基本情報",
    legal: "法定対応ステータス",
    timeline: "フォロー履歴",
    timelineSub: "チャット感覚ですぐ追加",
    followContentPlaceholder: "本日の会話内容・顧客反応を入力",
    nextActionPlaceholder: "次回のアクション",
    addFollow: "フォローを記録",
    noFollow: "フォロー履歴はありません。",
    nextAction: "次のアクション",
    nextFollow: "次回フォロー",
    quotes: "提案履歴",
    noQuotes: "見積履歴はありません。",
    detail: "詳細",
    workflow: "ワークフローエンジン",
    workflowCurrent: "現在",
    nextTarget: "次の到達目標",
    doneClosed: "完了 / クローズ",
    summary: "顧客サマリー",
    updateStage: "ステージを更新",
    manualReason: "顧客詳細画面でステージを手動更新",
    stageGuard: "※ 遷移条件を満たすステージのみ選択可能です。",
    stageUpdate: "ステージ更新",
    stageSuggestion: "ステージ提案",
    suggestTo: "「{{stage}}」へ更新する",
    weeklyTasks: "今週のタスク",
    noTasks: "未完了タスクはありません。",
    due: "期限",
    created: "作成日",
    complete: "完了",
    cancel: "取消",
    postpone: "延期",
    usage: "用途",
    budget: "予算",
    budgetType: "予算種別",
    choices: "第1/第2希望エリア",
    loan: "ローン事前審査",
    period: "入居/運用希望時期",
    line: "LINE",
    email: "メール",
    stage: "現在ステージ",
    temp: "温度感",
    memo: "メモ",
    brokerage: "媒介契約",
    signedAt: "媒介契約締結日",
    expiresAt: "媒介契約満了日",
    matters35: "重要事項説明（35条）",
    matters37: "契約書面交付（37条）",
    consent: "個人情報同意確認",
    aml: "本人確認/AML",
    initialCost: "初期費用",
    monthlyCost: "月次支出",
    property: "物件",
    unlinked: "未連携",
    currentStage: "現在ステージ",
    lastContact: "最終連絡",
    dateStatus: "日付ステータス",
    dash: "-",
    taskPending: "未着手",
    taskDone: "完了",
    taskCanceled: "取消",
    suggestionViewing: "内見記録が追加されたため、「内見済み」への更新を推奨します。",
    suggestionNegotiating: "提案が複数回更新されているため、「申込・条件調整」への更新を推奨します。",
    suggestionQuoted: "提案が作成済みのため、「提案送付済み」への更新を推奨します。",
  },
  zh: {
    areaUnset: "未设置区域",
    edit: "编辑客户",
    createQuote: "创建提案",
    basic: "客户基本信息",
    legal: "法定应对状态",
    timeline: "跟进记录",
    timelineSub: "像聊天一样快速追加",
    followContentPlaceholder: "输入今日沟通内容和客户反馈",
    nextActionPlaceholder: "下次动作",
    addFollow: "记录跟进",
    noFollow: "暂无跟进记录。",
    nextAction: "下一动作",
    nextFollow: "下次跟进",
    quotes: "提案记录",
    noQuotes: "暂无报价记录。",
    detail: "详情",
    workflow: "工作流引擎",
    workflowCurrent: "当前",
    nextTarget: "下一目标",
    doneClosed: "完成 / 关闭",
    summary: "客户摘要",
    updateStage: "更新阶段",
    manualReason: "在客户详情页手动更新阶段",
    stageGuard: "※ 仅可选择满足迁移条件的阶段。",
    stageUpdate: "更新阶段",
    stageSuggestion: "阶段建议",
    suggestTo: "更新为“{{stage}}”",
    weeklyTasks: "本周任务",
    noTasks: "暂无未完成任务。",
    due: "到期",
    created: "创建",
    complete: "完成",
    cancel: "取消",
    postpone: "延期",
    usage: "用途",
    budget: "预算",
    budgetType: "预算类型",
    choices: "第一/第二意向区域",
    loan: "贷款预审",
    period: "入住/运营期望时间",
    line: "LINE",
    email: "邮箱",
    stage: "当前阶段",
    temp: "温度",
    memo: "备注",
    brokerage: "媒介合同",
    signedAt: "媒介合同签订日",
    expiresAt: "媒介合同到期日",
    matters35: "重要事项说明（35条）",
    matters37: "合同书面交付（37条）",
    consent: "个人信息同意确认",
    aml: "实名/AML",
    initialCost: "初期费用",
    monthlyCost: "月度支出",
    property: "物件",
    unlinked: "未关联",
    currentStage: "当前阶段",
    lastContact: "最近联系",
    dateStatus: "日期状态",
    dash: "-",
    taskPending: "未开始",
    taskDone: "已完成",
    taskCanceled: "已取消",
    suggestionViewing: "已新增带看记录，建议更新到“已带看”。",
    suggestionNegotiating: "提案已多次更新，建议更新到“谈判中”。",
    suggestionQuoted: "提案已创建，建议更新到“已提案”。",
  },
  ko: {
    areaUnset: "지역 미설정",
    edit: "고객 편집",
    createQuote: "제안 작성",
    basic: "고객 기본 정보",
    legal: "법정 대응 상태",
    timeline: "팔로업 이력",
    timelineSub: "채팅처럼 빠르게 추가",
    followContentPlaceholder: "오늘 대화 내용과 고객 반응 입력",
    nextActionPlaceholder: "다음 액션",
    addFollow: "팔로업 기록",
    noFollow: "팔로업 이력이 없습니다.",
    nextAction: "다음 액션",
    nextFollow: "다음 팔로업",
    quotes: "제안 이력",
    noQuotes: "견적 이력이 없습니다.",
    detail: "상세",
    workflow: "워크플로 엔진",
    workflowCurrent: "현재",
    nextTarget: "다음 목표",
    doneClosed: "완료 / 종료",
    summary: "고객 요약",
    updateStage: "단계 업데이트",
    manualReason: "고객 상세 화면에서 수동 단계 업데이트",
    stageGuard: "※ 전이 조건을 만족하는 단계만 선택 가능합니다.",
    stageUpdate: "단계 업데이트",
    stageSuggestion: "단계 제안",
    suggestTo: "“{{stage}}”로 업데이트",
    weeklyTasks: "이번 주 작업",
    noTasks: "미완료 작업이 없습니다.",
    due: "기한",
    created: "생성일",
    complete: "완료",
    cancel: "취소",
    postpone: "연기",
    usage: "용도",
    budget: "예산",
    budgetType: "예산 유형",
    choices: "1/2순위 희망 지역",
    loan: "대출 사전심사",
    period: "입주/운용 희망 시기",
    line: "LINE",
    email: "이메일",
    stage: "현재 단계",
    temp: "온도",
    memo: "메모",
    brokerage: "중개 계약",
    signedAt: "중개 계약 체결일",
    expiresAt: "중개 계약 만료일",
    matters35: "중요사항 설명(35조)",
    matters37: "계약서 교부(37조)",
    consent: "개인정보 동의 확인",
    aml: "본인확인/AML",
    initialCost: "초기 비용",
    monthlyCost: "월 지출",
    property: "매물",
    unlinked: "미연결",
    currentStage: "현재 단계",
    lastContact: "최근 연락",
    dateStatus: "날짜 상태",
    dash: "-",
    taskPending: "미착수",
    taskDone: "완료",
    taskCanceled: "취소",
    suggestionViewing: "현장 확인 기록이 추가되어 “현장 확인 완료”로의 업데이트를 권장합니다.",
    suggestionNegotiating: "제안이 여러 번 수정되어 “협의 진행”으로의 업데이트를 권장합니다.",
    suggestionQuoted: "제안이 작성되어 “제안 발송 완료”로의 업데이트를 권장합니다.",
  },
} as const;

function interpolate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, token: string) => values[token] ?? "");
}

function getTaskStatusLabel(locale: "ja" | "zh" | "ko") {
  const text = texts[locale];
  return {
    pending: text.taskPending,
    done: text.taskDone,
    canceled: text.taskCanceled,
  } as const;
}

function getStageSuggestion(
  client: Awaited<ReturnType<typeof getClientDetail>>,
  locale: "ja" | "zh" | "ko"
) {
  if (!client) return null;

  const text = texts[locale];
  const closed = client.stage === "won" || client.stage === "lost";
  if (closed) return null;

  const latestFollow = client.followUps[0];
  if (latestFollow?.type === "viewing" && client.stage !== "viewing") {
    return {
      stage: "viewing" as ClientStage,
      reason: text.suggestionViewing,
    };
  }

  if (client.quotations.length >= 2 && client.stage !== "negotiating") {
    return {
      stage: "negotiating" as ClientStage,
      reason: text.suggestionNegotiating,
    };
  }

  if (client.quotations.length > 0 && client.stage !== "quoted") {
    return {
      stage: "quoted" as ClientStage,
      reason: text.suggestionQuoted,
    };
  }

  return null;
}

type ClientDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ flash?: string }>;
};

export default async function ClientDetailPage({ params, searchParams }: ClientDetailPageProps) {
  const locale = await getLocale();
  const text = texts[locale];

  const purposeLabel = getPurposeLabel(locale);
  const budgetTypeLabel = getBudgetTypeLabel(locale);
  const loanPreApprovalLabel = getLoanPreApprovalLabel(locale);
  const stageLabel = getStageLabel(locale);
  const temperatureLabel = getTemperatureLabel(locale);
  const brokerageContractTypeLabel = getBrokerageContractTypeLabel(locale);
  const amlCheckStatusLabel = getAmlCheckStatusLabel(locale);
  const followTypeLabel = getFollowTypeLabel(locale);
  const followTypeOptions = getFollowTypeOptions(locale);
  const stageOptions = getStageOptions(locale);
  const taskStatusLabel = getTaskStatusLabel(locale);

  const { id } = await params;
  const query = (await searchParams) ?? {};
  const client = await getClientDetail(id);

  if (!client) {
    notFound();
  }
  const stageSuggestion = getStageSuggestion(client, locale);
  const workflowGuide = buildClientWorkflowGuide({
    clientId: client.id,
    stage: client.stage,
    quotationCount: client.quotations.length,
    locale,
  });
  const allowedStageTargets = new Set(getAllowedStageTargets(client.stage));
  const flashMap = {
    request_status_updated: {
      ja: "タスク状態を更新しました。",
      zh: "任务状态已更新。",
      ko: "작업 상태를 업데이트했습니다.",
    },
    request_status_undone: {
      ja: "タスク状態の変更を取り消しました。",
      zh: "已撤销任务状态变更。",
      ko: "작업 상태 변경을 되돌렸습니다.",
    },
  } as const;
  const flashKey = String(query.flash ?? "").trim() as keyof typeof flashMap;
  const flashMessage = flashMap[flashKey]?.[locale];

  return (
    <div className="space-y-6">
      <PageFlashBanner message={flashMessage} />
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">{client.name}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {client.phone} · {client.preferredArea ?? text.areaUnset}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/clients/${client.id}/edit`} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
            {text.edit}
          </Link>
          <Link href={`/quotes/new?clientId=${client.id}`} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700">
            {text.createQuote}
          </Link>
        </div>
      </header>

      <section className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          <SectionCard title={text.basic}>
            <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-sm">
              <dt className="text-slate-500">{text.usage}</dt>
              <dd>{purposeLabel[client.purpose]}</dd>
              <dt className="text-slate-500">{text.budget}</dt>
              <dd>
                {client.budgetMin || client.budgetMax
                  ? `${formatCurrency(client.budgetMin ?? 0, locale)} ~ ${formatCurrency(client.budgetMax ?? 0, locale)}`
                  : text.dash}
              </dd>
              <dt className="text-slate-500">{text.budgetType}</dt>
              <dd>{budgetTypeLabel[client.budgetType]}</dd>
              <dt className="text-slate-500">{text.choices}</dt>
              <dd>
                {client.firstChoiceArea ?? text.dash} / {client.secondChoiceArea ?? text.dash}
              </dd>
              <dt className="text-slate-500">{text.loan}</dt>
              <dd>{loanPreApprovalLabel[client.loanPreApprovalStatus]}</dd>
              <dt className="text-slate-500">{text.period}</dt>
              <dd>{client.desiredMoveInPeriod ?? text.dash}</dd>
              <dt className="text-slate-500">{text.line}</dt>
              <dd>{client.lineId ?? text.dash}</dd>
              <dt className="text-slate-500">{text.email}</dt>
              <dd>{client.email ?? text.dash}</dd>
              <dt className="text-slate-500">{text.stage}</dt>
              <dd>{stageLabel[client.stage]}</dd>
              <dt className="text-slate-500">{text.temp}</dt>
              <dd>{temperatureLabel[client.temperature]}</dd>
              <dt className="text-slate-500">{text.memo}</dt>
              <dd>{client.notes ?? text.dash}</dd>
            </dl>
          </SectionCard>

          <SectionCard title={text.legal}>
            <dl className="grid grid-cols-[180px_1fr] gap-y-2 text-sm">
              <dt className="text-slate-500">{text.brokerage}</dt>
              <dd>{brokerageContractTypeLabel[client.brokerageContractType]}</dd>
              <dt className="text-slate-500">{text.signedAt}</dt>
              <dd>{formatDate(client.brokerageContractSignedAt, locale)}</dd>
              <dt className="text-slate-500">{text.expiresAt}</dt>
              <dd>{formatDate(client.brokerageContractExpiresAt, locale)}</dd>
              <dt className="text-slate-500">{text.matters35}</dt>
              <dd>{formatDate(client.importantMattersExplainedAt, locale)}</dd>
              <dt className="text-slate-500">{text.matters37}</dt>
              <dd>{formatDate(client.contractDocumentDeliveredAt, locale)}</dd>
              <dt className="text-slate-500">{text.consent}</dt>
              <dd>{formatDate(client.personalInfoConsentAt, locale)}</dd>
              <dt className="text-slate-500">{text.aml}</dt>
              <dd>{amlCheckStatusLabel[client.amlCheckStatus]}</dd>
            </dl>
          </SectionCard>

          <SectionCard title={text.timeline} subtitle={text.timelineSub}>
            <form id="timeline" action={addFollowUp} className="mb-4 space-y-2 rounded-xl border border-slate-200 p-3">
              <input type="hidden" name="clientId" value={client.id} />
              <div className="grid grid-cols-2 gap-2">
                <select name="type" defaultValue="note" className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  {followTypeOptions.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <input name="nextFollowUpAt" type="date" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <textarea
                name="content"
                rows={3}
                required
                placeholder={text.followContentPlaceholder}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <input name="nextAction" placeholder={text.nextActionPlaceholder} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <button type="submit" className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
                {text.addFollow}
              </button>
            </form>

            <ul className="space-y-3">
              {client.followUps.length === 0 ? <li className="text-sm text-slate-500">{text.noFollow}</li> : null}
              {client.followUps.map((item) => (
                <li key={item.id} className="rounded-xl border border-slate-200 p-3">
                  <p className="text-sm font-medium text-slate-900">
                    {followTypeLabel[item.type]} · {formatDate(item.createdAt, locale)}
                  </p>
                  <p className="mt-1 text-sm text-slate-700">{item.content}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {text.nextAction}：{item.nextAction ?? text.dash} · {text.nextFollow} {formatDate(item.nextFollowUpAt, locale)}
                  </p>
                </li>
              ))}
            </ul>
          </SectionCard>

          <SectionCard title={text.quotes} subtitle={`${client.quotations.length}${locale === "zh" ? "条" : locale === "ko" ? "건" : "件"}`}>
            <ul className="space-y-3">
              {client.quotations.length === 0 ? <li className="text-sm text-slate-500">{text.noQuotes}</li> : null}
              {client.quotations.map((quotation) => (
                <li key={quotation.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-slate-900">{quotation.quoteTitle}</p>
                    <Link href={`/quotes/${quotation.id}`} className="text-xs text-blue-700 hover:underline">
                      {text.detail}
                    </Link>
                  </div>
                  <p className="mt-1 text-slate-600">
                    {text.initialCost} {formatCurrency(quotation.totalInitialCost, locale)} · {text.monthlyCost} {formatCurrency(quotation.monthlyTotalCost, locale)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {text.property} {quotation.property?.name ?? text.unlinked} · {formatDate(quotation.createdAt, locale)}
                  </p>
                </li>
              ))}
            </ul>
          </SectionCard>
        </div>

        <aside className="space-y-4">
          <SectionCard title={text.workflow} subtitle={`${text.workflowCurrent}: ${workflowGuide.currentLabel}`}>
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1">
                {WORKFLOW_STAGE_PATH.map((stage) => (
                  <span
                    key={stage}
                    className={`rounded-full border px-2 py-1 text-xs ${
                      stage === client.stage
                        ? "border-blue-300 bg-blue-50 text-blue-700"
                        : "border-slate-200 bg-slate-50 text-slate-500"
                    }`}
                  >
                    {stageLabel[stage]}
                  </span>
                ))}
              </div>
              <p className="text-sm text-slate-700">{workflowGuide.guidance}</p>
              <p className="text-xs text-slate-500">
                {text.nextTarget}: {workflowGuide.nextLabel ?? text.doneClosed}
              </p>
              <div className="space-y-2">
                {workflowGuide.quickActions.map((action, index) => {
                  if (action.type === "link") {
                    return (
                      <Link
                        key={`${action.type}-${index}`}
                        href={action.href}
                        className="block rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                      >
                        {action.label}
                      </Link>
                    );
                  }
                  return (
                    <form action={updateClientStage} key={`${action.type}-${action.stage}-${index}`}>
                      <input type="hidden" name="clientId" value={client.id} />
                      <input type="hidden" name="stage" value={action.stage} />
                      <input type="hidden" name="reason" value={action.reason} />
                      <button
                        type="submit"
                        className="w-full rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
                      >
                        {action.label}
                      </button>
                    </form>
                  );
                })}
              </div>
            </div>
          </SectionCard>

          <SectionCard title={text.summary}>
            <div className="space-y-2 text-sm">
              <p>
                {text.currentStage}：<strong>{stageLabel[client.stage]}</strong>
              </p>
              <p>
                {text.lastContact}：<strong>{formatDate(client.lastContactedAt, locale)}</strong>
              </p>
              <p>
                {text.nextFollow}：<strong>{formatDate(client.nextFollowUpAt, locale)}</strong>
              </p>
              <p>
                {text.dateStatus}：<strong>{formatRelativeDays(client.nextFollowUpAt, locale)}</strong>
              </p>
            </div>
          </SectionCard>

          <SectionCard title={text.updateStage}>
            <form action={updateClientStage} className="space-y-2">
              <input type="hidden" name="clientId" value={client.id} />
              <input type="hidden" name="reason" value={text.manualReason} />
              <select name="stage" defaultValue={client.stage} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                {stageOptions
                  .filter((item) => allowedStageTargets.has(item.value))
                  .map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
              </select>
              <p className="text-xs text-slate-500">{text.stageGuard}</p>
              <button type="submit" className="ui-button-stable w-full rounded-lg bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-700">
                {text.stageUpdate}
              </button>
            </form>
          </SectionCard>

          {stageSuggestion ? (
            <SectionCard title={text.stageSuggestion}>
              <p className="text-sm text-slate-700">{stageSuggestion.reason}</p>
              <form action={updateClientStage} className="mt-3">
                <input type="hidden" name="clientId" value={client.id} />
                <input type="hidden" name="stage" value={stageSuggestion.stage} />
                <input type="hidden" name="reason" value={stageSuggestion.reason} />
                <button type="submit" className="ui-button-stable w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
                  {interpolate(text.suggestTo, { stage: stageLabel[stageSuggestion.stage] })}
                </button>
              </form>
            </SectionCard>
          ) : null}

          <SectionCard title={text.weeklyTasks}>
            <ul className="space-y-2">
              {client.tasks.length === 0 ? <li className="text-sm text-slate-500">{text.noTasks}</li> : null}
              {client.tasks.map((task) => (
                <li key={task.id} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-slate-800">{task.title}</p>
                    <span className={`ui-tag-stable rounded-md border px-2 py-0.5 text-xs ${taskStatusBadgeClass[task.status]}`}>
                      {taskStatusLabel[task.status]}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {text.due} {formatDate(task.dueAt, locale)} · {text.created} {formatDate(task.createdAt, locale)}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <form action={changeTaskStatusAction}>
                      <input type="hidden" name="taskId" value={task.id} />
                      <input type="hidden" name="clientId" value={client.id} />
                      <input type="hidden" name="status" value="done" />
                      <input type="hidden" name="previousStatus" value={task.status} />
                      <input type="hidden" name="returnTo" value={`/clients/${client.id}`} />
                      <button
                        type="submit"
                        disabled={task.status === "done"}
                        className="ui-button-stable rounded-md border border-emerald-300 px-2 py-1 text-xs text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {text.complete}
                      </button>
                    </form>
                    <form action={changeTaskStatusAction}>
                      <input type="hidden" name="taskId" value={task.id} />
                      <input type="hidden" name="clientId" value={client.id} />
                      <input type="hidden" name="status" value="canceled" />
                      <input type="hidden" name="previousStatus" value={task.status} />
                      <input type="hidden" name="returnTo" value={`/clients/${client.id}`} />
                      <button
                        type="submit"
                        disabled={task.status === "canceled"}
                        className="ui-button-stable rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {text.cancel}
                      </button>
                    </form>
                    <form action={rescheduleTaskAction} className="flex items-center gap-1">
                      <input type="hidden" name="taskId" value={task.id} />
                      <input type="hidden" name="clientId" value={client.id} />
                      <input type="hidden" name="returnTo" value={`/clients/${client.id}`} />
                      <input type="date" name="dueAt" required className="rounded-md border border-slate-300 px-2 py-1 text-xs" />
                      <button type="submit" className="ui-button-stable rounded-md border border-blue-300 px-2 py-1 text-xs text-blue-700">
                        {text.postpone}
                      </button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          </SectionCard>
        </aside>
      </section>
    </div>
  );
}
