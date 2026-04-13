"use client";

import { useState } from "react";
import type { Locale } from "@/lib/locale";

type CopyTextButtonProps = {
  text: string;
  className?: string;
  label?: string;
  doneLabel?: string;
  locale?: Locale;
};

const defaults = {
  ja: { label: "提案文をコピー", doneLabel: "コピー済み" },
  zh: { label: "复制提案文", doneLabel: "已复制" },
  ko: { label: "제안 문구 복사", doneLabel: "복사 완료" },
} as const;

export function CopyTextButton({ text, className, label, doneLabel, locale = "ja" }: CopyTextButtonProps) {
  const [copied, setCopied] = useState(false);
  const copyLabel = label ?? defaults[locale].label;
  const copiedLabel = doneLabel ?? defaults[locale].doneLabel;

  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      className={className}
    >
      {copied ? copiedLabel : copyLabel}
    </button>
  );
}
