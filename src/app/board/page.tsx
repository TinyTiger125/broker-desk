import { BoardKanban } from "@/components/board-kanban";
import { getBoardData, getDefaultUser } from "@/lib/data";
import { getLocale } from "@/lib/locale";

export const dynamic = "force-dynamic";

const texts = {
  ja: {
    noUser: "利用可能なユーザーがありません。",
    title: "進捗ボード",
    desc: "カードをドラッグしてステージを進め、ボトルネックを可視化します。",
  },
  zh: {
    noUser: "没有可用用户。",
    title: "进度看板",
    desc: "拖拽卡片推进阶段，直观看到流程瓶颈。",
  },
  ko: {
    noUser: "사용 가능한 사용자가 없습니다.",
    title: "진행 보드",
    desc: "카드를 드래그해 단계를 진행하고 병목을 시각화합니다.",
  },
} as const;

export default async function BoardPage() {
  const locale = await getLocale();
  const text = texts[locale];

  const user = await getDefaultUser();
  if (!user) {
    return <p className="text-sm text-slate-600">{text.noUser}</p>;
  }

  const board = await getBoardData(user.id);

  const initialBoard = {
    lead: board.lead.map((item) => ({
      id: item.id,
      name: item.name,
      preferredArea: item.preferredArea,
      budgetMax: item.budgetMax,
      lastContactedAt: item.lastContactedAt?.toISOString(),
      nextFollowUpAt: item.nextFollowUpAt?.toISOString(),
    })),
    contacted: board.contacted.map((item) => ({
      id: item.id,
      name: item.name,
      preferredArea: item.preferredArea,
      budgetMax: item.budgetMax,
      lastContactedAt: item.lastContactedAt?.toISOString(),
      nextFollowUpAt: item.nextFollowUpAt?.toISOString(),
    })),
    quoted: board.quoted.map((item) => ({
      id: item.id,
      name: item.name,
      preferredArea: item.preferredArea,
      budgetMax: item.budgetMax,
      lastContactedAt: item.lastContactedAt?.toISOString(),
      nextFollowUpAt: item.nextFollowUpAt?.toISOString(),
    })),
    viewing: board.viewing.map((item) => ({
      id: item.id,
      name: item.name,
      preferredArea: item.preferredArea,
      budgetMax: item.budgetMax,
      lastContactedAt: item.lastContactedAt?.toISOString(),
      nextFollowUpAt: item.nextFollowUpAt?.toISOString(),
    })),
    negotiating: board.negotiating.map((item) => ({
      id: item.id,
      name: item.name,
      preferredArea: item.preferredArea,
      budgetMax: item.budgetMax,
      lastContactedAt: item.lastContactedAt?.toISOString(),
      nextFollowUpAt: item.nextFollowUpAt?.toISOString(),
    })),
    won: board.won.map((item) => ({
      id: item.id,
      name: item.name,
      preferredArea: item.preferredArea,
      budgetMax: item.budgetMax,
      lastContactedAt: item.lastContactedAt?.toISOString(),
      nextFollowUpAt: item.nextFollowUpAt?.toISOString(),
    })),
    lost: board.lost.map((item) => ({
      id: item.id,
      name: item.name,
      preferredArea: item.preferredArea,
      budgetMax: item.budgetMax,
      lastContactedAt: item.lastContactedAt?.toISOString(),
      nextFollowUpAt: item.nextFollowUpAt?.toISOString(),
    })),
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">{text.title}</h1>
        <p className="mt-1 text-sm text-slate-600">{text.desc}</p>
      </div>
      <BoardKanban initialBoard={initialBoard} locale={locale} />
    </div>
  );
}
