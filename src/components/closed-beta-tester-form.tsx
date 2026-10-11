"use client";

import { useActionState, useEffect, useState } from "react";
import { createClosedBetaTesterAction, type ClosedBetaActionState } from "@/app/platform/closed-beta/actions";
import type { Locale } from "@/lib/locale";

const initialState: ClosedBetaActionState = { status: "idle" };

const copy: Record<Locale, {
  testerName: string;
  testerEmail: string;
  start: string;
  end: string;
  endHint: string;
  submit: string;
  pending: string;
  error: string;
  issued: string;
  demoNotice: string;
  invitationStatus: string;
  ready: string;
  serviceEnd: string;
  copyLink: string;
  copied: string;
  linkWarning: string;
}> = {
  zh: {
    testerName: "测试者姓名",
    testerEmail: "测试者邮箱",
    start: "服务开始日",
    end: "服务结束日（含当天）",
    endHint: "按东京时间计算，结束日当天仍可使用。",
    submit: "生成一次性邀请",
    pending: "创建中…",
    error: "操作失败",
    issued: "邀请已生成",
    demoNotice: "本地演示链接：仅用于预览，不能登录真实账号。",
    invitationStatus: "邀请状态",
    ready: "已生成",
    serviceEnd: "服务结束日",
    copyLink: "复制链接",
    copied: "已复制",
    linkWarning: "请立即私下交给测试者；离开页面或刷新后不会再次显示。",
  },
  ja: {
    testerName: "テスター氏名",
    testerEmail: "テスターメール",
    start: "サービス開始日",
    end: "サービス終了日（当日を含む）",
    endHint: "東京の日付で計算し、終了日当日まで利用できます。",
    submit: "一回限りの招待を生成",
    pending: "作成中…",
    error: "操作に失敗しました",
    issued: "招待を生成しました",
    demoNotice: "ローカルデモリンク：表示確認用で、実際のログインには使えません。",
    invitationStatus: "招待の状態",
    ready: "生成済み",
    serviceEnd: "サービス終了日",
    copyLink: "リンクをコピー",
    copied: "コピー済み",
    linkWarning: "手動で直ちに渡してください。ページを離れるか更新すると再表示されません。",
  },
  ko: {
    testerName: "테스터 이름",
    testerEmail: "테스터 이메일",
    start: "서비스 시작일",
    end: "서비스 종료일(당일 포함)",
    endHint: "도쿄 날짜로 계산하며 종료일 당일까지 사용할 수 있습니다.",
    submit: "일회성 초대 생성",
    pending: "생성 중…",
    error: "작업 실패",
    issued: "초대를 생성했습니다",
    demoNotice: "로컬 데모 링크: 화면 확인용이며 실제 로그인에는 사용할 수 없습니다.",
    invitationStatus: "초대 상태",
    ready: "생성됨",
    serviceEnd: "서비스 종료일",
    copyLink: "링크 복사",
    copied: "복사됨",
    linkWarning: "즉시 수동 전달하세요. 페이지를 떠나거나 새로 고치면 다시 표시되지 않습니다.",
  },
};

export function ClosedBetaTesterForm({ locale, defaultServiceStartAt, demoMode }: { locale: Locale; defaultServiceStartAt: string; demoMode: boolean }) {
  const text = copy[locale];
  const [state, formAction, pending] = useActionState(createClosedBetaTesterAction, initialState);
  const [copiedIssuedAt, setCopiedIssuedAt] = useState<string | null>(null);
  const [hiddenIssuedAt, setHiddenIssuedAt] = useState<string | null>(null);
  const issuedAt = state.status === "success" ? state.result?.invitation.issuedAt : undefined;
  const result = state.status === "success" && !pending && issuedAt !== hiddenIssuedAt ? state.result : undefined;
  const copied = Boolean(result && copiedIssuedAt === result.invitation.issuedAt);

  useEffect(() => {
    const hideLink = () => {
      if (issuedAt) setHiddenIssuedAt(issuedAt);
      setCopiedIssuedAt(null);
    };
    window.addEventListener("pagehide", hideLink);
    return () => window.removeEventListener("pagehide", hideLink);
  }, [issuedAt]);

  async function copyInvitation() {
    if (!result?.invitation.invitationUrl) return;
    try {
      await navigator.clipboard.writeText(result.invitation.invitationUrl);
      setCopiedIssuedAt(result.invitation.issuedAt);
    } catch {
      setCopiedIssuedAt(null);
    }
  }

  return (
    <div className="space-y-4">
      <form action={formAction} className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          <span>{text.testerName}</span>
          <input name="testerName" required autoComplete="off" className="min-h-11 rounded-lg border border-slate-300 px-3 py-2" />
        </label>
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          <span>{text.testerEmail}</span>
          <input name="testerEmail" required type="email" autoComplete="off" className="min-h-11 rounded-lg border border-slate-300 px-3 py-2" />
        </label>
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          <span>{text.start}</span>
          <input name="serviceStartAt" type="date" defaultValue={defaultServiceStartAt} className="min-h-11 rounded-lg border border-slate-300 px-3 py-2" />
        </label>
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          <span>{text.end}</span>
          <input name="serviceEndAt" required type="date" className="min-h-11 rounded-lg border border-slate-300 px-3 py-2" />
        </label>
        <p className="text-xs font-normal leading-5 text-slate-500 md:col-span-2">{text.endHint}</p>
        {demoMode ? <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 md:col-span-2">{text.demoNotice}</p> : null}
        <button disabled={pending} className="min-h-11 rounded-lg bg-slate-950 px-4 py-2 text-sm font-black text-white disabled:cursor-wait disabled:opacity-60 md:col-span-2">
          {pending ? text.pending : text.submit}
        </button>
      </form>

      {state.status === "error" ? (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900">
          <span className="font-black">{text.error}: </span>{state.message}
        </div>
      ) : null}

      {result ? (
        <section role="status" aria-live="polite" className="space-y-3 rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-950">
          <div>
            <p className="font-black">{text.issued}</p>
            <p className="mt-1 break-words font-semibold">{result.tester.name} · {result.tester.email} · {result.account.name}</p>
          </div>
          <div className="rounded-md border border-emerald-200 bg-white p-3">
            <p className="break-all font-mono text-xs leading-5 text-slate-800">{result.invitation.invitationUrl}</p>
            <button type="button" onClick={copyInvitation} className="mt-3 min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-800">
              {copied ? text.copied : text.copyLink}
            </button>
          </div>
          <dl className="grid gap-1 text-xs sm:grid-cols-2 sm:gap-3">
            <div><dt className="font-bold">{text.invitationStatus}</dt><dd>{text.ready}</dd></div>
            <div><dt className="font-bold">{text.serviceEnd}</dt><dd>{result.account.serviceEndAt ?? "-"}</dd></div>
          </dl>
          {result.invitation.provider === "manual" ? <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">{text.demoNotice}</p> : null}
          <p className="text-xs font-semibold text-emerald-800">{text.linkWarning}</p>
        </section>
      ) : null}
    </div>
  );
}
