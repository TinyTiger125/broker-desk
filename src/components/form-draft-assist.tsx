"use client";

import { useEffect, useMemo, useState } from "react";
import type { Locale } from "@/lib/locale";

type FormDraftAssistProps = {
  formId: string;
  storageKey: string;
  fieldNames: string[];
  reuseKey?: string;
  reuseFields?: string[];
  locale: Locale;
  className?: string;
};

type DraftPayload = {
  values: Record<string, string>;
  savedAt: string;
};

function escapeFieldName(value: string): string {
  return value.replace(/["\\]/g, "\\$&");
}

const copyByLocale: Record<
  Locale,
  {
    available: string;
    restore: string;
    clear: string;
    reuseAvailable: string;
    applyReuse: string;
    clearReuse: string;
    autosave: string;
    saved: string;
  }
> = {
  ja: {
    available: "下書きがあります",
    restore: "復元",
    clear: "破棄",
    reuseAvailable: "前回入力があります",
    applyReuse: "適用",
    clearReuse: "忘却",
    autosave: "自動保存",
    saved: "保存済み",
  },
  zh: {
    available: "有草稿可恢复",
    restore: "恢复",
    clear: "清除",
    reuseAvailable: "有上次输入",
    applyReuse: "应用",
    clearReuse: "清空",
    autosave: "自动保存",
    saved: "已保存",
  },
  ko: {
    available: "복원 가능한 초안이 있습니다",
    restore: "복원",
    clear: "삭제",
    reuseAvailable: "최근 입력값이 있습니다",
    applyReuse: "적용",
    clearReuse: "초기화",
    autosave: "자동 저장",
    saved: "저장됨",
  },
};

function parseDraft(raw: string | null): DraftPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as DraftPayload;
    if (!parsed || typeof parsed !== "object" || !parsed.values || typeof parsed.values !== "object") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function readFieldValue(el: Element): string {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) {
    return "";
  }
  if (el instanceof HTMLInputElement) {
    if (el.type === "radio") return el.checked ? el.value : "";
    if (el.type === "checkbox") return el.checked ? "1" : "";
    if (el.type === "file") return "";
  }
  return el.value;
}

function writeFieldValue(el: Element, value: string) {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) {
    return;
  }
  if (el instanceof HTMLInputElement) {
    if (el.type === "radio") {
      el.checked = el.value === value;
      return;
    }
    if (el.type === "checkbox") {
      el.checked = value === "1";
      return;
    }
    if (el.type === "file") return;
  }
  el.value = value;
}

export function FormDraftAssist({
  formId,
  storageKey,
  fieldNames,
  reuseKey,
  reuseFields,
  locale,
  className = "",
}: FormDraftAssistProps) {
  const copy = copyByLocale[locale];
  const [hasDraft, setHasDraft] = useState(false);
  const [hasReuse, setHasReuse] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [savedState, setSavedState] = useState<"idle" | "saving" | "saved">("idle");

  const fieldSelector = useMemo(
    () => fieldNames.map((field) => `[name="${escapeFieldName(field)}"]`).join(","),
    [fieldNames]
  );
  const resolvedReuseFields = reuseFields ?? fieldNames;

  useEffect(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;
    const syncExistingDraft = () => {
      const existing = parseDraft(window.localStorage.getItem(storageKey));
      setHasDraft(Boolean(existing));
      setSavedAt(existing?.savedAt ?? null);
      if (reuseKey) {
        setHasReuse(Boolean(parseDraft(window.localStorage.getItem(`reuse:${reuseKey}`))));
      }
    };
    const frameId = window.requestAnimationFrame(syncExistingDraft);

    const saveDraft = () => {
      const values: Record<string, string> = {};
      for (const field of fieldNames) {
        const nodes = form.querySelectorAll(`[name="${escapeFieldName(field)}"]`);
        if (nodes.length === 0) continue;
        if (nodes[0] instanceof HTMLInputElement && nodes[0].type === "radio") {
          const checked = Array.from(nodes).find(
            (node) => node instanceof HTMLInputElement && node.checked
          );
          values[field] = checked ? readFieldValue(checked) : "";
          continue;
        }
        values[field] = readFieldValue(nodes[0]);
      }
      const payload: DraftPayload = { values, savedAt: new Date().toISOString() };
      window.localStorage.setItem(storageKey, JSON.stringify(payload));
      setHasDraft(true);
      setSavedAt(payload.savedAt);
      setSavedState("saved");
      window.setTimeout(() => setSavedState("idle"), 900);
    };

    let timer: number | undefined;
    const scheduleSave = () => {
      setSavedState("saving");
      window.clearTimeout(timer);
      timer = window.setTimeout(saveDraft, 300);
    };

    const clearOnSubmit = () => {
      const reuseValues: Record<string, string> = {};
      for (const field of resolvedReuseFields) {
        const nodes = form.querySelectorAll(`[name="${escapeFieldName(field)}"]`);
        if (nodes.length === 0) continue;
        if (nodes[0] instanceof HTMLInputElement && nodes[0].type === "radio") {
          const checked = Array.from(nodes).find(
            (node) => node instanceof HTMLInputElement && node.checked
          );
          reuseValues[field] = checked ? readFieldValue(checked) : "";
          continue;
        }
        reuseValues[field] = readFieldValue(nodes[0]);
      }
      if (reuseKey) {
        const reusePayload: DraftPayload = { values: reuseValues, savedAt: new Date().toISOString() };
        window.localStorage.setItem(`reuse:${reuseKey}`, JSON.stringify(reusePayload));
        setHasReuse(true);
      }
      window.localStorage.removeItem(storageKey);
      setHasDraft(false);
      setSavedAt(null);
    };

    form.addEventListener("input", scheduleSave);
    form.addEventListener("change", scheduleSave);
    form.addEventListener("submit", clearOnSubmit);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(timer);
      form.removeEventListener("input", scheduleSave);
      form.removeEventListener("change", scheduleSave);
      form.removeEventListener("submit", clearOnSubmit);
    };
  }, [fieldNames, formId, resolvedReuseFields, reuseKey, storageKey]);

  const restoreDraft = () => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;
    const draft = parseDraft(window.localStorage.getItem(storageKey));
    if (!draft) return;

    for (const [field, value] of Object.entries(draft.values)) {
      const nodes = form.querySelectorAll(`[name="${escapeFieldName(field)}"]`);
      nodes.forEach((node) => writeFieldValue(node, value));
    }
    form
      .querySelectorAll(fieldSelector)
      .forEach((node) => {
        node.dispatchEvent(new Event("input", { bubbles: true }));
        node.dispatchEvent(new Event("change", { bubbles: true }));
      });
  };

  const clearDraft = () => {
    window.localStorage.removeItem(storageKey);
    setHasDraft(false);
    setSavedAt(null);
    setSavedState("idle");
  };

  const applyReuse = () => {
    if (!reuseKey) return;
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;
    const reuse = parseDraft(window.localStorage.getItem(`reuse:${reuseKey}`));
    if (!reuse) return;
    for (const [field, value] of Object.entries(reuse.values)) {
      const nodes = form.querySelectorAll(`[name="${escapeFieldName(field)}"]`);
      nodes.forEach((node) => writeFieldValue(node, value));
    }
    form
      .querySelectorAll(fieldSelector)
      .forEach((node) => {
        node.dispatchEvent(new Event("input", { bubbles: true }));
        node.dispatchEvent(new Event("change", { bubbles: true }));
      });
  };

  const clearReuse = () => {
    if (!reuseKey) return;
    window.localStorage.removeItem(`reuse:${reuseKey}`);
    setHasReuse(false);
  };

  return (
    <div className={`flex flex-wrap items-center gap-2 text-xs text-slate-500 ${className}`}>
      <span className="rounded-md bg-slate-100 px-2 py-1 font-semibold text-slate-600">
        {copy.autosave} · {savedState === "saving" ? "..." : savedState === "saved" ? copy.saved : ""}
      </span>
      {hasDraft ? (
        <>
          <span>
            {copy.available}
            {savedAt ? ` (${new Date(savedAt).toLocaleTimeString()})` : ""}
          </span>
          <button
            type="button"
            onClick={restoreDraft}
            className="rounded-md border border-slate-300 px-2 py-1 font-semibold text-slate-700 hover:bg-slate-50"
          >
            {copy.restore}
          </button>
          <button
            type="button"
            onClick={clearDraft}
            className="rounded-md border border-slate-200 px-2 py-1 font-semibold text-slate-500 hover:bg-slate-50"
          >
            {copy.clear}
          </button>
        </>
      ) : null}
      {hasReuse ? (
        <>
          <span>{copy.reuseAvailable}</span>
          <button
            type="button"
            onClick={applyReuse}
            className="rounded-md border border-slate-300 px-2 py-1 font-semibold text-slate-700 hover:bg-slate-50"
          >
            {copy.applyReuse}
          </button>
          <button
            type="button"
            onClick={clearReuse}
            className="rounded-md border border-slate-200 px-2 py-1 font-semibold text-slate-500 hover:bg-slate-50"
          >
            {copy.clearReuse}
          </button>
        </>
      ) : null}
    </div>
  );
}
