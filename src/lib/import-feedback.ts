import type { Locale } from "@/lib/locale";

type ImportJobStatus = "queued" | "processing" | "mapped" | "completed" | "failed";
type ObjectImportTargetStatus = "queued" | "processing" | "needs_review" | "completed" | "failed" | "conflict";

const importJobCopy = {
  ja: {
    unknown: "資料を受け付けました。読取状態を確認しています。",
    queued: "資料を受け付けました。読み取り待ちです。",
    processing: "資料を読み取っています。",
    ready: "この資料は処理済みです。読取結果を確認できます。",
    failed: "資料の読み取りに失敗しました。失敗理由を確認してください。",
  },
  zh: {
    unknown: "资料已接收，正在确认读取状态。",
    queued: "资料已接收，正在等待读取。",
    processing: "资料正在读取。",
    ready: "这份资料已处理，可查看读取结果。",
    failed: "资料读取失败，请查看失败原因。",
  },
  ko: {
    unknown: "자료를 접수했습니다. 읽기 상태를 확인하는 중입니다.",
    queued: "자료를 접수했습니다. 읽기를 기다리는 중입니다.",
    processing: "자료를 읽고 있습니다.",
    ready: "이 자료는 처리되었습니다. 읽기 결과를 확인할 수 있습니다.",
    failed: "자료를 읽지 못했습니다. 실패 원인을 확인해 주세요.",
  },
} as const;

const objectTargetCopy = {
  ja: {
    queued: "資料を受け付けました。読取待ちです。主資料はまだ更新されていません。",
    processing: "資料を読み取っています。主資料はまだ更新されていません。",
    needs_review: (count: number) => `資料を読み取りました。${count}件の候補を確認してから反映してください。主資料はまだ更新されていません。`,
    completed: "この資料は処理済みです。読取結果を確認できます。このアップロードでは主資料を変更していません。",
    failed: "資料の読み取りに失敗しました。主資料は更新されていません。失敗理由を確認してください。",
    conflict: "資料の読取結果に競合があります。再確認してください。主資料はまだ更新されていません。",
  },
  zh: {
    queued: "资料已接收，正在等待读取。主资料尚未更新。",
    processing: "资料正在读取。主资料尚未更新。",
    needs_review: (count: number) => `已读取 ${count} 项对象候选，请确认后再写入。主资料尚未更新。`,
    completed: "这份资料已处理，可查看读取结果。本次上传未更改主资料。",
    failed: "资料读取失败，主资料未更新，请查看失败原因。",
    conflict: "资料读取结果存在冲突，请重新核对。主资料尚未更新。",
  },
  ko: {
    queued: "자료를 접수했습니다. 읽기를 기다리는 중입니다. 원본 자료는 아직 업데이트되지 않았습니다.",
    processing: "자료를 읽고 있습니다. 원본 자료는 아직 업데이트되지 않았습니다.",
    needs_review: (count: number) => `자료를 읽었습니다. ${count}개의 후보를 확인한 뒤 반영해 주세요. 원본 자료는 아직 업데이트되지 않았습니다.`,
    completed: "이 자료는 처리되었습니다. 읽기 결과를 확인할 수 있습니다. 이번 업로드에서는 원본 자료를 변경하지 않았습니다.",
    failed: "자료를 읽지 못했으며 원본 자료는 업데이트되지 않았습니다. 실패 원인을 확인해 주세요.",
    conflict: "자료 읽기 결과에 충돌이 있습니다. 다시 확인해 주세요. 원본 자료는 아직 업데이트되지 않았습니다.",
  },
} as const;

export function getImportJobFeedbackMessage(locale: Locale, status?: ImportJobStatus) {
  const copy = importJobCopy[locale];
  if (!status) return copy.unknown;
  if (status === "queued") return copy.queued;
  if (status === "processing") return copy.processing;
  if (status === "failed") return copy.failed;
  return copy.ready;
}

export function getObjectImportTargetFeedbackMessage(locale: Locale, status: ObjectImportTargetStatus, candidateCount: number) {
  const copy = objectTargetCopy[locale];
  if (status === "queued") return copy.queued;
  if (status === "processing") return copy.processing;
  if (status === "needs_review") return copy.needs_review(candidateCount);
  if (status === "failed") return copy.failed;
  if (status === "conflict") return copy.conflict;
  return copy.completed;
}
