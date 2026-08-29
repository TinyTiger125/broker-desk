"use client";

import { useActionState } from "react";
import {
  acceptTenantInvitationAction,
  type TenantInvitationActionMessageToken,
  type TenantInvitationActionState,
} from "@/app/actions";
import type { Locale } from "@/lib/locale";

const INVITATION_MESSAGE_COPY: Record<TenantInvitationActionMessageToken, Record<Locale, string>> = {
  email_verification_required: {
    ja: "現在のログインメールアドレスを確認してから、会社への招待を承諾してください。",
    zh: "请先验证当前登录邮箱，再接受公司邀请。",
    ko: "현재 로그인 이메일을 인증한 후 회사 초대를 수락해 주세요.",
  },
  invitation_identity_not_bound: {
    ja: "現在のログイン情報は招待にまだ紐づいていません。招待されたメールアドレスでログインしているか確認してください。",
    zh: "当前登录身份尚未完成邀请绑定，请确认使用受邀邮箱登录。",
    ko: "현재 로그인 정보가 초대에 아직 연결되지 않았습니다. 초대받은 이메일로 로그인했는지 확인해 주세요.",
  },
  invitation_email_mismatch: {
    ja: "現在のログインメールアドレスは招待先と一致しません。",
    zh: "当前登录邮箱与受邀邮箱不一致。",
    ko: "현재 로그인 이메일이 초대받은 이메일과 일치하지 않습니다.",
  },
  invitation_payload_invalid: {
    ja: "招待情報が不足しています。ページを再読み込みして、もう一度お試しください。",
    zh: "邀请信息不完整，请刷新后重试。",
    ko: "초대 정보가 완전하지 않습니다. 페이지를 새로고침한 후 다시 시도해 주세요.",
  },
  invitation_unavailable: {
    ja: "この招待は取り消されたか期限切れです。または、ログイン中のメールアドレスが招待先と一致していません。",
    zh: "邀请已撤销、已过期，或当前登录邮箱与受邀邮箱不一致。",
    ko: "이 초대는 취소되었거나 만료되었으며, 로그인 이메일이 초대받은 이메일과 일치하지 않을 수도 있습니다.",
  },
  accepted_workspace_switch_failed: {
    ja: "招待は承諾されましたが、ワークスペースの切り替えを完了できませんでした。ページを再読み込みして続けてください。",
    zh: "邀请已接受，但工作区切换尚未完成。请刷新页面后继续。",
    ko: "초대는 수락되었지만 워크스페이스 전환을 완료하지 못했습니다. 페이지를 새로고침한 후 계속해 주세요.",
  },
  invitation_accept_failed: {
    ja: "招待を一時的に承諾できません。ログイン情報を確認して、もう一度お試しください。",
    zh: "邀请暂时无法接受，请检查登录身份后重试。",
    ko: "현재 초대를 수락할 수 없습니다. 로그인 정보를 확인한 후 다시 시도해 주세요.",
  },
};

function getInvitationMessage(token: TenantInvitationActionMessageToken, locale: Locale): string {
  const copy = Object.prototype.hasOwnProperty.call(INVITATION_MESSAGE_COPY, token)
    ? INVITATION_MESSAGE_COPY[token]
    : INVITATION_MESSAGE_COPY.invitation_accept_failed;
  return copy[locale];
}

type AcceptInvitationFormProps = {
  tenantId: string;
  membershipId: string;
  invitationToken: string;
  locale: Locale;
  acceptLabel: string;
  pendingLabel: string;
};

export function AcceptInvitationForm({
  tenantId,
  membershipId,
  invitationToken,
  locale,
  acceptLabel,
  pendingLabel,
}: AcceptInvitationFormProps) {
  const [state, formAction, pending] = useActionState<TenantInvitationActionState, FormData>(
    acceptTenantInvitationAction,
    { status: "idle" },
  );

  return (
    <form action={formAction} className="grid gap-3" aria-busy={pending}>
      <input type="hidden" name="tenantId" value={tenantId} />
      <input type="hidden" name="membershipId" value={membershipId} />
      <input type="hidden" name="invitationToken" value={invitationToken} />
      {state.status === "error" ? (
        <p role="alert" className="border border-rose-200 bg-rose-50 px-3 py-2 text-sm leading-6 text-rose-800">
          {state.message ? getInvitationMessage(state.message, locale) : INVITATION_MESSAGE_COPY.invitation_accept_failed[locale]}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="min-h-10 bg-slate-950 px-4 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? pendingLabel : acceptLabel}
      </button>
    </form>
  );
}
