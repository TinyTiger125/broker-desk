"use client";

import { useEffect, useRef, type ReactNode } from "react";

type ListReturnStateProps = {
  children: ReactNode;
  listUrl: string;
  scope: ListReturnScope;
};

export type ListReturnScope = "organize" | "parties" | "properties";

export type ListReturnIntent = {
  listUrl: string;
  preserveExisting?: boolean;
  scope: ListReturnScope;
  triggerKey: string;
};

type StoredListReturnState = {
  scrollY: number;
  triggerKey: string;
};

type ActivationFacts = {
  altKey: boolean;
  button: number;
  ctrlKey: boolean;
  download: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  target: string;
};

const LOCAL_ORIGIN = "http://broker-desk.local";
const STORAGE_PREFIX = "list-return-state:";
const FOCUS_VISIBILITY_MARGIN = 5;
const TOP_OCCLUDER_SELECTOR = "[data-app-shell-top-occluder]";

function canonicalListUrl(value: string): string | undefined {
  const raw = value.trim();
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return undefined;
  try {
    const parsed = new URL(raw, LOCAL_ORIGIN);
    if (parsed.origin !== LOCAL_ORIGIN || parsed.hash) return undefined;
    parsed.searchParams.sort();
    const search = parsed.searchParams.toString();
    return `${parsed.pathname}${search ? `?${search}` : ""}`;
  } catch {
    return undefined;
  }
}

function shouldRememberActivation(facts: ActivationFacts): boolean {
  if (facts.button !== 0 || facts.metaKey || facts.ctrlKey || facts.shiftKey || facts.altKey || facts.download) return false;
  return !facts.target || facts.target === "_self";
}

function parseStoredState(raw: string): StoredListReturnState | undefined {
  const value = JSON.parse(raw) as { scrollY?: unknown; triggerKey?: unknown };
  if (
    typeof value.triggerKey !== "string"
    || !value.triggerKey
    || typeof value.scrollY !== "number"
    || !Number.isFinite(value.scrollY)
  ) return undefined;
  return { scrollY: value.scrollY, triggerKey: value.triggerKey };
}

function storageKey(scope: ListReturnStateProps["scope"], listUrl: string): string {
  return `${STORAGE_PREFIX}${scope}:${listUrl}`;
}

function clearStoredState(key: string) {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Navigation must remain usable when session storage is unavailable.
  }
}

function readStoredState(key: string): StoredListReturnState | undefined {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return undefined;
    const value = parseStoredState(raw);
    if (!value) {
      clearStoredState(key);
      return undefined;
    }
    return value;
  } catch {
    clearStoredState(key);
    return undefined;
  }
}

function writeStoredState(key: string, state: StoredListReturnState): boolean {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function rememberListReturnIntent({ listUrl, preserveExisting = false, scope, triggerKey }: ListReturnIntent): boolean {
  const canonicalUrl = canonicalListUrl(listUrl);
  if (!canonicalUrl || !triggerKey) return false;
  const key = storageKey(scope, canonicalUrl);
  const existing = preserveExisting ? readStoredState(key) : undefined;
  return writeStoredState(key, {
    scrollY: existing?.triggerKey === triggerKey ? existing.scrollY : preserveExisting ? 0 : window.scrollY,
    triggerKey,
  });
}

function topOcclusionBoundary() {
  let bottom = 0;
  for (const candidate of document.querySelectorAll<HTMLElement>(TOP_OCCLUDER_SELECTOR)) {
    const rect = candidate.getBoundingClientRect();
    const style = window.getComputedStyle(candidate);
    if (
      style.display === "none"
      || style.visibility === "hidden"
      || style.visibility === "collapse"
      || rect.width <= 0
      || rect.height <= 0
      || rect.top > FOCUS_VISIBILITY_MARGIN
      || rect.bottom <= FOCUS_VISIBILITY_MARGIN
    ) continue;
    bottom = Math.max(bottom, rect.bottom);
  }
  return bottom + FOCUS_VISIBILITY_MARGIN;
}

function focusRestoredTarget(target: HTMLElement | null | undefined) {
  if (!target) return;
  target.focus({ preventScroll: true });
  const rect = target.getBoundingClientRect();
  if (rect.top < topOcclusionBoundary() || rect.bottom > window.innerHeight - FOCUS_VISIBILITY_MARGIN) {
    target.scrollIntoView({ block: "nearest", inline: "nearest" });
    const correctedRect = target.getBoundingClientRect();
    const correctedTop = topOcclusionBoundary();
    const correctedBottom = window.innerHeight - FOCUS_VISIBILITY_MARGIN;
    const availableHeight = correctedBottom - correctedTop;
    if (correctedRect.height > availableHeight || correctedRect.top < correctedTop) {
      window.scrollBy({ top: correctedRect.top - correctedTop, behavior: "auto" });
    } else if (correctedRect.bottom > correctedBottom) {
      window.scrollBy({ top: correctedRect.bottom - correctedBottom, behavior: "auto" });
    }
  }
}

export function ListReturnState({ children, listUrl, scope }: ListReturnStateProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canonicalUrl = canonicalListUrl(listUrl);

  useEffect(() => {
    if (!canonicalUrl) return undefined;
    const key = storageKey(scope, canonicalUrl);
    const state = readStoredState(key);
    if (!state) return undefined;

    const frame = window.requestAnimationFrame(() => {
      try {
        window.scrollTo({ top: state.scrollY, behavior: "auto" });
        const root = rootRef.current;
        const exact = Array.from(root?.querySelectorAll<HTMLElement>("[data-list-return-trigger]") ?? []).find(
          (candidate) => candidate.dataset.listReturnTrigger === state.triggerKey,
        );
        const fallback = root?.querySelector<HTMLElement>("[data-list-return-fallback]");
        focusRestoredTarget(exact ?? fallback);
      } finally {
        clearStoredState(key);
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [canonicalUrl, scope]);

  useEffect(() => {
    if (!canonicalUrl) return undefined;
    const root = rootRef.current;
    if (!root) return undefined;
    const key = storageKey(scope, canonicalUrl);

    const rememberTrigger = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const trigger = event.target.closest<HTMLElement>("[data-list-return-trigger]");
      if (!trigger || !root.contains(trigger)) return;
      if (!shouldRememberActivation({
        altKey: event.altKey,
        button: event.button,
        ctrlKey: event.ctrlKey,
        download: trigger instanceof HTMLAnchorElement && trigger.hasAttribute("download"),
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        target: trigger instanceof HTMLAnchorElement ? trigger.target : "",
      })) return;
      const triggerKey = trigger.dataset.listReturnTrigger;
      if (!triggerKey) return;
      writeStoredState(key, { scrollY: window.scrollY, triggerKey });
    };

    root.addEventListener("click", rememberTrigger);
    return () => root.removeEventListener("click", rememberTrigger);
  }, [canonicalUrl, scope]);

  return <div ref={rootRef}>{children}</div>;
}
