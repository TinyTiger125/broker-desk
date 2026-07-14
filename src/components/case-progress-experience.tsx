"use client";

import { useEffect, useState } from "react";

type CaseProgressExperienceLabels = {
  overall: string;
  remaining: string;
  helper: string;
  gainPrefix: string;
  gainSuffix: string;
};

type CaseProgressExperienceProps = {
  completed: number;
  total: number;
  open: number;
  currentPercent: number;
  animateFromPercent?: number;
  gainCount?: number;
  labels: CaseProgressExperienceLabels;
};

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function CaseProgressExperience({
  completed,
  total,
  open,
  currentPercent,
  animateFromPercent,
  gainCount = 0,
  labels,
}: CaseProgressExperienceProps) {
  const fromPercent = clampPercent(animateFromPercent ?? currentPercent);
  const toPercent = clampPercent(currentPercent);
  const shouldAnimate = gainCount > 0 && fromPercent < toPercent;
  const [displayPercent, setDisplayPercent] = useState(shouldAnimate ? fromPercent : toPercent);
  const [isCelebrating, setIsCelebrating] = useState(shouldAnimate);

  useEffect(() => {
    const canAnimate = gainCount > 0 && fromPercent < toPercent;

    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      setDisplayPercent(canAnimate ? fromPercent : toPercent);
      setIsCelebrating(canAnimate);
      if (canAnimate) {
        secondFrame = window.requestAnimationFrame(() => {
          setDisplayPercent(toPercent);
        });
      }
    });
    const settleTimer = window.setTimeout(() => setIsCelebrating(false), 1700);

    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      window.clearTimeout(settleTimer);
    };
  }, [fromPercent, gainCount, toPercent]);

  return (
    <div className={`mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 ${isCelebrating ? "motion-safe:animate-[caseProgressGlow_1500ms_ease-out]" : ""}`}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-black text-slate-500">{labels.overall}</p>
          <p className="mt-1 text-2xl font-black tabular-nums text-slate-950">
            {completed}/{total}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 text-right">
          {isCelebrating ? (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-black text-emerald-800 motion-safe:animate-[caseXpBadge_900ms_ease-out]">
              {labels.gainPrefix}
              {gainCount}
              {labels.gainSuffix}
            </span>
          ) : null}
          <p className="text-[11px] font-black text-rose-700">{labels.remaining}</p>
          <p className="text-2xl font-black tabular-nums text-rose-700">{open}</p>
        </div>
      </div>
      <div className={`relative mt-3 h-2 overflow-hidden rounded-full bg-white ${isCelebrating ? "ring-2 ring-indigo-100" : ""}`}>
        <div
          className="relative h-full overflow-hidden rounded-full bg-indigo-700 transition-[width] duration-1000 ease-out"
          style={{ width: `${displayPercent}%` }}
        >
          {isCelebrating ? <span className="absolute inset-y-0 -left-1/3 w-1/3 bg-white/45 motion-safe:animate-[caseProgressShine_950ms_ease-out]" /> : null}
        </div>
      </div>
      <p className="mt-3 text-[11px] font-semibold leading-5 text-slate-600">{labels.helper}</p>
    </div>
  );
}
