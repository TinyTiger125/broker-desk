import { type AmlCheckStatus, type ClientStage } from "@/lib/domain";
import type { Locale } from "@/lib/locale";
import { getStageLabel } from "@/lib/options";

export const WORKFLOW_STAGE_PATH: ClientStage[] = [
  "lead",
  "contacted",
  "quoted",
  "viewing",
  "negotiating",
  "won",
];

const STAGE_ORDER: Record<ClientStage, number> = {
  lead: 0,
  contacted: 1,
  quoted: 2,
  viewing: 3,
  negotiating: 4,
  won: 5,
  lost: 5,
};

type WorkflowQuickAction =
  | {
      type: "link";
      label: string;
      href: string;
    }
  | {
      type: "stage";
      label: string;
      stage: ClientStage;
      reason: string;
    };

export type ClientWorkflowGuide = {
  currentStage: ClientStage;
  currentLabel: string;
  nextStage: ClientStage | null;
  nextLabel: string | null;
  guidance: string;
  quickActions: WorkflowQuickAction[];
};

export class StageTransitionBlockedError extends Error {
  blockers: string[];

  constructor(blockers: string[]) {
    super(blockers.join(" / "));
    this.name = "StageTransitionBlockedError";
    this.blockers = blockers;
  }
}

function getNextStage(currentStage: ClientStage): ClientStage | null {
  const index = WORKFLOW_STAGE_PATH.indexOf(currentStage);
  if (index < 0) return null;
  const next = WORKFLOW_STAGE_PATH[index + 1];
  return next ?? null;
}

export function getAllowedStageTargets(from: ClientStage): ClientStage[] {
  if (from === "won" || from === "lost") {
    return [from];
  }

  const currentOrder = STAGE_ORDER[from];
  return (Object.keys(STAGE_ORDER) as ClientStage[]).filter((stage) => {
    if (stage === from) return true;
    if (stage === "lost") return true;
    return STAGE_ORDER[stage] <= currentOrder + 1;
  });
}

const transitionText = {
  ja: {
    closed: "クローズ済み案件のステージは変更できません。",
    firstContactRequired: "初回接触の記録（フォロー履歴）を追加してから遷移してください。",
    quoteRequired: "提案を1件以上作成してから「提案送付済み」へ遷移してください。",
    viewingRequired: "内見タイプのフォロー履歴を追加してから「内見済み」へ遷移してください。",
    negotiationRequired: "提案履歴とフォロー履歴の両方を整備してから「申込・条件調整」へ遷移してください。",
    wonQuoteRequired: "成約前に提案履歴が必要です。",
    wonMatters: "重要事項説明（35条）の実施日を入力してください。",
    wonConsent: "個人情報同意の確認日を入力してください。",
    wonAml: "本人確認/AMLが確認待ちのため成約へ進めません。",
    invalidRoute: "{{from}} から {{to}} へは直接遷移できません。",
  },
  zh: {
    closed: "已关闭案件不可变更阶段。",
    firstContactRequired: "请先新增首次接触记录（跟进记录）再进行阶段变更。",
    quoteRequired: "请先创建至少1个提案后再变更为“已提案”。",
    viewingRequired: "请先新增“带看”类型跟进记录后再变更为“已带看”。",
    negotiationRequired: "请先补齐提案记录与跟进记录后再变更为“谈判中”。",
    wonQuoteRequired: "成交前必须有提案记录。",
    wonMatters: "请填写重要事项说明（35条）日期。",
    wonConsent: "请填写个人信息同意确认日期。",
    wonAml: "实名/AML 仍待确认，无法推进为成交。",
    invalidRoute: "不支持从 {{from}} 直接变更到 {{to}}。",
  },
  ko: {
    closed: "종료된 건은 단계를 변경할 수 없습니다.",
    firstContactRequired: "초기 접촉 기록(팔로업 이력)을 추가한 뒤 단계를 변경하세요.",
    quoteRequired: "제안을 1건 이상 생성한 뒤 “제안 발송 완료”로 변경하세요.",
    viewingRequired: "현장 확인 유형의 팔로업 이력을 추가한 뒤 “현장 확인 완료”로 변경하세요.",
    negotiationRequired: "제안 이력과 팔로업 이력을 모두 갖춘 뒤 “협의 진행”으로 변경하세요.",
    wonQuoteRequired: "계약 성사 전에는 제안 이력이 필요합니다.",
    wonMatters: "중요사항 설명(35조) 실시일을 입력하세요.",
    wonConsent: "개인정보 동의 확인일을 입력하세요.",
    wonAml: "본인확인/AML이 확인 대기 상태여서 계약 성사로 진행할 수 없습니다.",
    invalidRoute: "{{from}} 에서 {{to}}(으)로 직접 이동할 수 없습니다.",
  },
} as const;

function interpolate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, token: string) => values[token] ?? "");
}

export function validateStageTransition(input: {
  from: ClientStage;
  to: ClientStage;
  quotationCount: number;
  followUpCount: number;
  hasViewingFollowUp: boolean;
  importantMattersExplainedAt?: Date;
  personalInfoConsentAt?: Date;
  amlCheckStatus: AmlCheckStatus;
  locale?: Locale;
}): string[] {
  if (input.from === input.to) return [];

  const locale = input.locale ?? "ja";
  const text = transitionText[locale];
  const stageLabel = getStageLabel(locale);

  if (input.from === "won" || input.from === "lost") {
    return [text.closed];
  }

  const allowed = getAllowedStageTargets(input.from);
  if (!allowed.includes(input.to)) {
    return [interpolate(text.invalidRoute, { from: stageLabel[input.from], to: stageLabel[input.to] })];
  }

  if (input.to === "contacted" && input.followUpCount === 0) {
    return [text.firstContactRequired];
  }

  if (input.to === "quoted" && input.quotationCount === 0) {
    return [text.quoteRequired];
  }

  if (input.to === "viewing" && !input.hasViewingFollowUp) {
    return [text.viewingRequired];
  }

  if (input.to === "negotiating" && (input.quotationCount === 0 || input.followUpCount === 0)) {
    return [text.negotiationRequired];
  }

  if (input.to === "won") {
    const blockers: string[] = [];
    if (input.quotationCount === 0) {
      blockers.push(text.wonQuoteRequired);
    }
    if (!input.importantMattersExplainedAt) {
      blockers.push(text.wonMatters);
    }
    if (!input.personalInfoConsentAt) {
      blockers.push(text.wonConsent);
    }
    if (input.amlCheckStatus === "pending") {
      blockers.push(text.wonAml);
    }
    return blockers;
  }

  return [];
}

const guideText = {
  ja: {
    leadGuidance: "初回ヒアリングを記録し、次回フォロー日を確定して「初回接触済み」へ進めてください。",
    contactedGuidanceNoQuote: "条件ヒアリング後は、48時間以内に提案を作成して送付してください。",
    contactedGuidanceWithQuote: "提案作成済みです。送付・説明完了後に「提案送付済み」へ更新してください。",
    quotedGuidance: "提案送付後の反応確認を行い、内見日程を確定したら「内見済み」へ進めてください。",
    viewingGuidance: "内見後の所感を記録し、条件調整フェーズへ移行して申込可否を判断してください。",
    negotiatingGuidance: "申込・条件調整の結論を確定し、成約または見送りを確実に記録してください。",
    wonGuidance: "成約済みです。引渡し・アフターフォローに関する記録を継続してください。",
    lostGuidance: "見送り案件です。再アプローチ可能性がある場合は再開メモを残してください。",
    logFollow: "フォローを記録",
    createQuote: "提案を作成",
    nextTarget: "次の到達目標",
    done: "完了 / クローズ",
    reasonContacted: "初回ヒアリング記録を完了したためステージ更新",
    reasonQuoted: "提案送付・説明完了のためステージ更新",
    reasonViewing: "内見実施を確認したためステージ更新",
    reasonNegotiating: "条件調整フェーズへ移行したためステージ更新",
    reasonWon: "条件合意により成約となったためステージ更新",
    reasonLost: "案件見送りのためステージ更新",
    toStage: "「{{stage}}」へ更新",
  },
  zh: {
    leadGuidance: "请记录首次访谈并确认下次跟进日期，然后推进到“已接触”。",
    contactedGuidanceNoQuote: "完成需求访谈后，请在 48 小时内创建并发送提案。",
    contactedGuidanceWithQuote: "提案已创建。发送并说明完成后，请更新为“已提案”。",
    quotedGuidance: "提案发送后请确认反馈，确定带看日程后推进到“已带看”。",
    viewingGuidance: "请记录带看反馈并进入条件协商阶段，判断是否进入申请。",
    negotiatingGuidance: "请明确协商结论并准确记录为成交或流失。",
    wonGuidance: "已成交。请持续记录交接与售后跟进。",
    lostGuidance: "已流失。如有再接触可能，请补充重启备注。",
    logFollow: "记录跟进",
    createQuote: "创建提案",
    nextTarget: "下一目标",
    done: "完成 / 关闭",
    reasonContacted: "已完成首次访谈记录，更新阶段",
    reasonQuoted: "提案发送与说明完成，更新阶段",
    reasonViewing: "已确认带看执行，更新阶段",
    reasonNegotiating: "已进入条件协商阶段，更新阶段",
    reasonWon: "条件达成一致，更新为成交",
    reasonLost: "案件终止，更新为流失",
    toStage: "更新为“{{stage}}”",
  },
  ko: {
    leadGuidance: "초기 상담을 기록하고 다음 팔로업 일정을 확정한 뒤 “초기 접촉 완료”로 진행하세요.",
    contactedGuidanceNoQuote: "조건 상담 후 48시간 이내에 제안을 작성/발송하세요.",
    contactedGuidanceWithQuote: "제안이 작성되었습니다. 발송 및 설명 완료 후 “제안 발송 완료”로 업데이트하세요.",
    quotedGuidance: "제안 발송 후 반응을 확인하고 현장 확인 일정을 확정하면 “현장 확인 완료”로 진행하세요.",
    viewingGuidance: "현장 확인 소감을 기록하고 조건 협의 단계로 이동해 신청 여부를 판단하세요.",
    negotiatingGuidance: "협의 결론을 확정하고 계약 성사 또는 종료를 반드시 기록하세요.",
    wonGuidance: "계약 성사 상태입니다. 인도/사후 팔로업 기록을 계속 유지하세요.",
    lostGuidance: "종료된 건입니다. 재접근 가능성이 있으면 재개 메모를 남기세요.",
    logFollow: "팔로업 기록",
    createQuote: "제안 작성",
    nextTarget: "다음 목표",
    done: "완료 / 종료",
    reasonContacted: "초기 상담 기록 완료로 단계 업데이트",
    reasonQuoted: "제안 발송/설명 완료로 단계 업데이트",
    reasonViewing: "현장 확인 수행 확인으로 단계 업데이트",
    reasonNegotiating: "조건 협의 단계 진입으로 단계 업데이트",
    reasonWon: "조건 합의로 계약 성사 단계 업데이트",
    reasonLost: "건 종료로 단계 업데이트",
    toStage: "“{{stage}}”(으)로 업데이트",
  },
} as const;

export function buildClientWorkflowGuide(input: {
  clientId: string;
  stage: ClientStage;
  quotationCount: number;
  locale?: Locale;
}): ClientWorkflowGuide {
  const locale = input.locale ?? "ja";
  const stageLabel = getStageLabel(locale);
  const text = guideText[locale];
  const nextStage = getNextStage(input.stage);

  const toStageLabel = (stage: ClientStage) => interpolate(text.toStage, { stage: stageLabel[stage] });

  if (input.stage === "lead") {
    return {
      currentStage: input.stage,
      currentLabel: stageLabel[input.stage],
      nextStage: "contacted",
      nextLabel: stageLabel.contacted,
      guidance: text.leadGuidance,
      quickActions: [
        { type: "link", label: text.logFollow, href: `/clients/${input.clientId}#timeline` },
        {
          type: "stage",
          label: toStageLabel("contacted"),
          stage: "contacted",
          reason: text.reasonContacted,
        },
      ],
    };
  }

  if (input.stage === "contacted") {
    return {
      currentStage: input.stage,
      currentLabel: stageLabel[input.stage],
      nextStage: "quoted",
      nextLabel: stageLabel.quoted,
      guidance: input.quotationCount === 0 ? text.contactedGuidanceNoQuote : text.contactedGuidanceWithQuote,
      quickActions: [
        { type: "link", label: text.createQuote, href: `/quotes/new?clientId=${input.clientId}` },
        {
          type: "stage",
          label: toStageLabel("quoted"),
          stage: "quoted",
          reason: text.reasonQuoted,
        },
      ],
    };
  }

  if (input.stage === "quoted") {
    return {
      currentStage: input.stage,
      currentLabel: stageLabel[input.stage],
      nextStage: "viewing",
      nextLabel: stageLabel.viewing,
      guidance: text.quotedGuidance,
      quickActions: [
        { type: "link", label: text.logFollow, href: `/clients/${input.clientId}#timeline` },
        {
          type: "stage",
          label: toStageLabel("viewing"),
          stage: "viewing",
          reason: text.reasonViewing,
        },
      ],
    };
  }

  if (input.stage === "viewing") {
    return {
      currentStage: input.stage,
      currentLabel: stageLabel[input.stage],
      nextStage: "negotiating",
      nextLabel: stageLabel.negotiating,
      guidance: text.viewingGuidance,
      quickActions: [
        { type: "link", label: text.logFollow, href: `/clients/${input.clientId}#timeline` },
        {
          type: "stage",
          label: toStageLabel("negotiating"),
          stage: "negotiating",
          reason: text.reasonNegotiating,
        },
      ],
    };
  }

  if (input.stage === "negotiating") {
    return {
      currentStage: input.stage,
      currentLabel: stageLabel[input.stage],
      nextStage: "won",
      nextLabel: stageLabel.won,
      guidance: text.negotiatingGuidance,
      quickActions: [
        {
          type: "stage",
          label: toStageLabel("won"),
          stage: "won",
          reason: text.reasonWon,
        },
        {
          type: "stage",
          label: toStageLabel("lost"),
          stage: "lost",
          reason: text.reasonLost,
        },
      ],
    };
  }

  if (input.stage === "won") {
    return {
      currentStage: input.stage,
      currentLabel: stageLabel[input.stage],
      nextStage: null,
      nextLabel: null,
      guidance: text.wonGuidance,
      quickActions: [{ type: "link", label: text.logFollow, href: `/clients/${input.clientId}#timeline` }],
    };
  }

  return {
    currentStage: input.stage,
    currentLabel: stageLabel[input.stage],
    nextStage,
    nextLabel: nextStage ? stageLabel[nextStage] : null,
    guidance: text.lostGuidance,
    quickActions: [{ type: "link", label: text.logFollow, href: `/clients/${input.clientId}#timeline` }],
  };
}
