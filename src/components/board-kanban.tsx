"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatCurrency, formatDate } from "@/lib/format";
import { type ClientStage } from "@/lib/domain";
import type { Locale } from "@/lib/locale";
import { getStageLabel, getStageOptions } from "@/lib/options";

type BoardCard = {
  id: string;
  name: string;
  preferredArea?: string;
  budgetMax?: number;
  lastContactedAt?: string;
  nextFollowUpAt?: string;
};

type BoardState = Record<ClientStage, BoardCard[]>;

type BoardKanbanProps = {
  initialBoard: BoardState;
  locale?: Locale;
};

type DragMeta = {
  id: string;
  from: ClientStage;
};

const texts = {
  ja: {
    dragHint: "顧客カードを別ステージへドラッグすると更新されます。",
    saving: "保存中...",
    updateFailed: "ステージ更新に失敗しました。",
    areaNotSet: "エリア未設定",
    budgetNotSet: "予算未設定",
    lastContact: "最終連絡",
    nextFollow: "次回フォロー",
    noClients: "顧客なし",
    boardReasonPrefix: "ボード操作",
  },
  zh: {
    dragHint: "将客户卡片拖拽到其他阶段即可更新。",
    saving: "保存中...",
    updateFailed: "阶段更新失败。",
    areaNotSet: "未设置区域",
    budgetNotSet: "未设置预算",
    lastContact: "最近联系",
    nextFollow: "下次跟进",
    noClients: "无客户",
    boardReasonPrefix: "看板操作",
  },
  ko: {
    dragHint: "고객 카드를 다른 단계로 드래그하면 상태가 업데이트됩니다.",
    saving: "저장 중...",
    updateFailed: "단계 업데이트에 실패했습니다.",
    areaNotSet: "지역 미설정",
    budgetNotSet: "예산 미설정",
    lastContact: "최근 연락",
    nextFollow: "다음 팔로업",
    noClients: "고객 없음",
    boardReasonPrefix: "보드 조작",
  },
} as const;

function parseDragData(raw: string): DragMeta | null {
  try {
    const parsed = JSON.parse(raw) as DragMeta;
    if (!parsed.id || !parsed.from) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function BoardKanban({ initialBoard, locale = "ja" }: BoardKanbanProps) {
  const [board, setBoard] = useState<BoardState>(initialBoard);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const text = texts[locale];
  const stageLabel = getStageLabel(locale);
  const stageOptions = getStageOptions(locale);

  const counts = useMemo(
    () =>
      stageOptions.reduce<Record<ClientStage, number>>(
        (acc, stage) => {
          acc[stage.value] = board[stage.value].length;
          return acc;
        },
        {
          lead: 0,
          contacted: 0,
          quoted: 0,
          viewing: 0,
          negotiating: 0,
          won: 0,
          lost: 0,
        }
      ),
    [board, stageOptions]
  );

  async function moveCard(clientId: string, from: ClientStage, to: ClientStage) {
    if (from === to) return;
    setErrorMessage(null);

    const previous = board;
    const card = previous[from].find((item) => item.id === clientId);
    if (!card) return;

    setBoard((current) => {
      const next: BoardState = {
        lead: [...current.lead],
        contacted: [...current.contacted],
        quoted: [...current.quoted],
        viewing: [...current.viewing],
        negotiating: [...current.negotiating],
        won: [...current.won],
        lost: [...current.lost],
      };

      next[from] = next[from].filter((item) => item.id !== clientId);
      next[to] = [card, ...next[to]];
      return next;
    });

    setSaving(true);
    const response = await fetch(`/api/clients/${clientId}/stage`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        stage: to,
        reason: `${text.boardReasonPrefix}: ${stageLabel[from]} -> ${stageLabel[to]}`,
      }),
    });
    setSaving(false);

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string; blockers?: string[] };
      const reason = payload.blockers?.[0] ?? payload.error ?? text.updateFailed;
      setErrorMessage(reason);
      setBoard(previous);
      return;
    }
    setErrorMessage(null);
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        {text.dragHint}
        {saving ? ` ${text.saving}` : ""}
      </p>
      {errorMessage ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{errorMessage}</p>
      ) : null}
      <div className="grid gap-3 xl:grid-cols-7">
        {stageOptions.map((column) => (
          <section
            key={column.value}
            className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const data = parseDragData(event.dataTransfer.getData("text/plain"));
              if (!data) return;
              void moveCard(data.id, data.from, column.value);
            }}
          >
            <header className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">{stageLabel[column.value]}</h2>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{counts[column.value]}</span>
            </header>
            <div className="space-y-2">
              {board[column.value].slice(0, 20).map((client) => (
                <article
                  key={client.id}
                  draggable
                  onDragStart={(event) => {
                    const payload: DragMeta = { id: client.id, from: column.value };
                    event.dataTransfer.setData("text/plain", JSON.stringify(payload));
                    event.dataTransfer.effectAllowed = "move";
                  }}
                  className="cursor-grab rounded-xl border border-slate-200 p-2 text-sm active:cursor-grabbing"
                >
                  <Link href={`/clients/${client.id}`} className="font-medium text-slate-900 hover:underline">
                    {client.name}
                  </Link>
                  <p className="mt-1 text-xs text-slate-600">{client.preferredArea ?? text.areaNotSet}</p>
                  <p className="mt-1 text-xs text-slate-600">
                    {client.budgetMax ? formatCurrency(client.budgetMax, locale) : text.budgetNotSet}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {text.lastContact} {formatDate(client.lastContactedAt, locale)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {text.nextFollow} {formatDate(client.nextFollowUpAt, locale)}
                  </p>
                </article>
              ))}
              {board[column.value].length === 0 ? <p className="text-xs text-slate-500">{text.noClients}</p> : null}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
