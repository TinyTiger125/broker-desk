"use client";

import { useActionState } from "react";
import {
  acceptTenantInvitationAction,
  type TenantInvitationActionState,
} from "@/app/actions";

type AcceptInvitationFormProps = {
  tenantId: string;
  membershipId: string;
  invitationToken: string;
  acceptLabel: string;
  pendingLabel: string;
};

export function AcceptInvitationForm({
  tenantId,
  membershipId,
  invitationToken,
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
          {state.message}
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
