import type {
  AiExperienceDraft,
  CorrectionEvent,
  CorrectionEventChangeType,
  CorrectionEventScopeCandidate,
} from "@/lib/data.memory";

export type AiExperienceDraftInput = Omit<AiExperienceDraft, "id" | "userId" | "status" | "createdAt" | "updatedAt"> & {
  status?: AiExperienceDraft["status"];
};

type BuildAiExperienceDraftsInput = {
  events: CorrectionEvent[];
  minEventsPerDraft?: number;
};

function groupKey(event: CorrectionEvent) {
  return [
    event.scopeCandidate,
    event.templateId ?? "",
    event.fieldKey,
    event.changeType,
  ].join("|");
}

function labelForChange(changeType: CorrectionEventChangeType) {
  const labels: Record<CorrectionEventChangeType, string> = {
    ai_extraction_error: "AI読取修正",
    normalization_error: "表記整形修正",
    source_absent_user_completed: "資料外の手入力補完",
    missing_detected_by_user: "抽出漏れ補完",
    conflict_resolved_by_user: "不一致解決",
    template_output_position_error: "PDF位置修正",
    template_output_format_error: "PDF表記修正",
    user_or_team_preference: "社内表記",
    one_off_case_override: "案件個別修正",
  };
  return labels[changeType];
}

function scopeLabel(scope: CorrectionEventScopeCandidate) {
  const labels: Record<CorrectionEventScopeCandidate, string> = {
    case_only: "案件限定",
    user_or_team: "チーム候補",
    source_template: "入力テンプレート候補",
    output_template: "出力テンプレート候補",
    field_dictionary: "項目辞書候補",
    global_rule_candidate: "全体ルール候補",
    regression_case: "回帰テスト候補",
  };
  return labels[scope];
}

function firstNonEmpty(values: Array<string | undefined>) {
  return values.find((value) => value && value.trim())?.trim();
}

function buildBodyMarkdown(input: {
  events: CorrectionEvent[];
  fieldLabel: string;
  changeType: CorrectionEventChangeType;
  scopeCandidate: CorrectionEventScopeCandidate;
  templateId?: string;
}) {
  const examples = input.events.slice(0, 5);
  const before = firstNonEmpty(examples.map((event) => event.aiValue));
  const after = firstNonEmpty(examples.map((event) => event.confirmedValue));
  const locations = [...new Set(examples.map((event) => event.sourceLocation).filter(Boolean))];

  return [
    "## Finding",
    `${input.fieldLabel} で ${labelForChange(input.changeType)} が複数回発生しました。`,
    "",
    "## Applies To",
    [
      input.templateId ? `template=${input.templateId}` : undefined,
      `field=${input.events[0]?.fieldKey ?? input.fieldLabel}`,
      `scope=${scopeLabel(input.scopeCandidate)}`,
    ].filter(Boolean).join(" / "),
    "",
    "## Suggested Rule",
    after
      ? `次回同じ文脈で候補値を出す場合は、ユーザー確認済みの表記例「${after}」を優先候補として扱い、最終確定はユーザー確認に残してください。`
      : "同じ文脈では自動確定せず、確認対象として前台に出してください。",
    "",
    "## Regression Sample",
    examples.map((event) => `- ${event.caseId} / ${event.fieldKey} / ${event.id}`).join("\n"),
    "",
    "## Evidence",
    [
      before ? `candidate example: ${before}` : undefined,
      after ? `confirmed example: ${after}` : undefined,
      locations.length > 0 ? `source locations: ${locations.join(", ")}` : undefined,
    ].filter(Boolean).join("\n"),
    "",
    "## Risk",
    "この草稿は自動生成された候補です。個別案件の事情、個人情報、または一社だけの表記習慣を全体ルールに昇格しないでください。",
  ].join("\n");
}

export function buildAiExperienceDraftsFromCorrectionEvents(input: BuildAiExperienceDraftsInput): AiExperienceDraftInput[] {
  const minEvents = Math.max(2, input.minEventsPerDraft ?? 2);
  const reusableEvents = input.events.filter((event) => event.scopeCandidate !== "case_only" && event.changeType !== "one_off_case_override");
  const grouped = new Map<string, CorrectionEvent[]>();

  reusableEvents.forEach((event) => {
    const key = groupKey(event);
    grouped.set(key, [...(grouped.get(key) ?? []), event]);
  });

  return [...grouped.values()].flatMap((events) => {
    if (events.length < minEvents) return [];
    const sortedEvents = events.slice().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const first = sortedEvents[0];
    const title = `${first.fieldLabel} / ${labelForChange(first.changeType)} / ${scopeLabel(first.scopeCandidate)}`;
    return [{
      title,
      bodyMarkdown: buildBodyMarkdown({
        events: sortedEvents,
        fieldLabel: first.fieldLabel,
        changeType: first.changeType,
        scopeCandidate: first.scopeCandidate,
        templateId: first.templateId,
      }),
      eventIds: sortedEvents.map((event) => event.id),
      fieldKey: first.fieldKey,
      templateId: first.templateId,
      changeType: first.changeType,
      scopeCandidate: first.scopeCandidate,
      evidenceSummaryJson: {
        eventCount: sortedEvents.length,
        caseIds: [...new Set(sortedEvents.map((event) => event.caseId))],
        triggerTypes: [...new Set(sortedEvents.map((event) => event.trigger))],
        generatedBy: "deterministic_experience_draft_v1",
      },
    }];
  });
}
