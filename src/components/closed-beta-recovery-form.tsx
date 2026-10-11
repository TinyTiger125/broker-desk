"use client";

import { useActionState, useEffect, useState } from "react";
import { recoverClosedBetaInvitationAction, type ClosedBetaActionState } from "@/app/platform/closed-beta/actions";
import type { Locale } from "@/lib/locale";

const initialState: ClosedBetaActionState = { status: "idle" };

const copy: Record<Locale, {
  submit: string;
  pending: string;
  issued: string;
  copy: string;
  copied: string;
  warning: string;
  serviceEnd: string;
  membershipExpiry: string;
}> = {
  zh: {
    submit: "从已知失败状态重新发行",
    pending: "核对并发行中…",
    issued: "恢复链接只在本次响应中显示",
    copy: "复制链接",
    copied: "已复制",
    warning: "仅允许已知失败或尚未发行；sending、provider accepted、unknown 状态会被阻止。链接不会写入本地存储、审计或数据库。",
    serviceEnd: "workspace access end",
    membershipExpiry: "membership invitation expiry",
  },
  ja: {
    submit: "既知の失敗状態から再発行",
    pending: "確認して発行中…",
    issued: "復旧リンクは今回のレスポンスだけに表示されます",
    copy: "リンクをコピー",
    copied: "コピー済み",
    warning: "既知の失敗または未発行だけを許可します。sending、provider accepted、unknown はブロックされます。",
    serviceEnd: "workspace access end",
    membershipExpiry: "membership invitation expiry",
  },
  ko: {
    submit: "알려진 실패 상태에서 재발행",
    pending: "확인 및 발행 중…",
    issued: "복구 링크는 이번 응답에서만 표시됩니다",
    copy: "링크 복사",
    copied: "복사됨",
    warning: "알려진 실패 또는 미발행만 허용합니다. sending, provider accepted, unknown은 차단됩니다.",
    serviceEnd: "workspace access end",
    membershipExpiry: "membership invitation expiry",
  },
};

export function ClosedBetaRecoveryForm({
  locale,
  tenantId,
  membershipId,
}: {
  locale: Locale;
  tenantId: string;
  membershipId: string;
}) {
  const text = copy[locale];
  const [state, formAction, pending] = useActionState(recoverClosedBetaInvitationAction, initialState);
  const [hiddenIssuedAt, setHiddenIssuedAt] = useState<string | null>(null);
  const [copiedIssuedAt, setCopiedIssuedAt] = useState<string | null>(null);
  const issuedAt = state.status === "success" ? state.result?.invitation.issuedAt : undefined;
  const result = state.status === "success" && issuedAt !== hiddenIssuedAt ? state.result : undefined;
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
    <div className="space-y-2">
      <form action={formAction}>
        <input type="hidden" name="tenantId" value={tenantId} />
        <input type="hidden" name="membershipId" value={membershipId} />
        <button disabled={pending} className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm font-black text-slate-800 disabled:cursor-wait disabled:opacity-60">
          {pending ? text.pending : text.submit}
        </button>
      </form>
      <p className="text-xs leading-5 text-slate-500">{text.warning}</p>
      {state.status === "error" ? <p role="alert" className="text-xs font-semibold text-rose-800">{state.message}</p> : null}
      {result ? (
        <section role="status" aria-live="polite" className="space-y-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-950">
          <p className="font-black">{text.issued}</p>
          <p className="break-all font-mono">{result.invitation.invitationUrl}</p>
          <button type="button" onClick={copyInvitation} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-800">
            {copied ? text.copied : text.copy}
          </button>
          <dl className="grid gap-1 sm:grid-cols-2">
            <div><dt className="font-bold">{text.membershipExpiry}</dt><dd>{result.invitation.membershipInvitationExpiresAt ?? "-"}</dd></div>
            <div><dt className="font-bold">{text.serviceEnd}</dt><dd>{result.account.serviceEndAt ?? "-"}</dd></div>
          </dl>
        </section>
      ) : null}
    </div>
  );
}
