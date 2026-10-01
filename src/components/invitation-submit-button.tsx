"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui-foundation";

type InvitationSubmitButtonProps = {
  label: string;
  pendingLabel: string;
  className?: string;
  ariaLabel?: string;
};

export function InvitationSubmitButton({ label, pendingLabel, className, ariaLabel }: InvitationSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      loading={pending}
      aria-label={ariaLabel}
      className={className}
    >
      {pending ? pendingLabel : label}
    </Button>
  );
}
