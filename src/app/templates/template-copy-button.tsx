"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui-foundation";

export function TemplateCopyButton({ idleLabel, pendingLabel }: { idleLabel: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      tone="quiet"
      controlSize="touch"
      loading={pending}
      aria-live="polite"
      className="w-full"
    >
      {!pending ? <span aria-hidden="true" className="material-symbols-outlined text-[18px]">content_copy</span> : null}
      {pending ? pendingLabel : idleLabel}
    </Button>
  );
}
