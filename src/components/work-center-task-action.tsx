"use client";

import { useFormStatus } from "react-dom";

export function WorkCenterTaskSubmitButton({ idleLabel, pendingLabel }: { idleLabel: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-live="polite"
      className="ui-button-stable inline-flex min-h-10 items-center justify-center rounded-md border border-emerald-300 bg-white px-3 text-xs font-black text-emerald-700 transition disabled:cursor-wait disabled:border-emerald-200 disabled:bg-emerald-50 disabled:text-emerald-600"
    >
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}
