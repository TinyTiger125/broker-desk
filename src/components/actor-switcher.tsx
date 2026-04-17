"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

type ActorOption = {
  id: string;
  name: string;
};

type ActorSwitcherProps = {
  currentActorId?: string;
  options: ActorOption[];
  label: string;
};

export function ActorSwitcher({ currentActorId, options, label }: ActorSwitcherProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (options.length <= 1) {
    return null;
  }

  return (
    <label className="inline-flex min-w-[11rem] items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700">
      <span className="whitespace-nowrap">{label}</span>
      <select
        value={currentActorId ?? options[0]?.id}
        disabled={pending}
        className="min-w-[5.25rem] bg-transparent outline-none"
        onChange={(event) => {
          const actorId = event.target.value;
          startTransition(async () => {
            await fetch("/api/actor", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ actorId }),
            });
            router.refresh();
          });
        }}
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </label>
  );
}
