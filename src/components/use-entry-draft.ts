"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type EntryDraftRecord<T extends Record<string, string>> = {
  version: 1;
  baseline: T;
  current: T;
  dirty: string[];
};

type UseEntryDraftOptions<T extends Record<string, string>> = {
  storageKey?: string;
  serverValues: T;
  appliedFields?: readonly string[];
};

type UseEntryDraftResult<T extends Record<string, string>> = {
  values: T;
  setValues: (next: T | ((current: T) => T)) => void;
  setField: <K extends keyof T>(field: K, value: T[K]) => void;
  hydrated: boolean;
};

function readRecord<T extends Record<string, string>>(storageKey: string): EntryDraftRecord<T> | undefined {
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<EntryDraftRecord<T>>;
    if (parsed.version !== 1 || !parsed.current || !parsed.baseline || !Array.isArray(parsed.dirty)) return undefined;
    return {
      version: 1,
      baseline: parsed.baseline as T,
      current: parsed.current as T,
      dirty: parsed.dirty.filter((field): field is string => typeof field === "string"),
    };
  } catch {
    return undefined;
  }
}

function writeRecord<T extends Record<string, string>>(storageKey: string, baseline: T, current: T) {
  const dirty = (Object.keys(baseline) as Array<keyof T>)
    .filter((field) => current[field] !== baseline[field])
    .map(String);
  try {
    if (dirty.length === 0) {
      window.sessionStorage.removeItem(storageKey);
      return;
    }
    window.sessionStorage.setItem(storageKey, JSON.stringify({ version: 1, baseline, current, dirty } satisfies EntryDraftRecord<T>));
  } catch {
    // Private browsing or a full sessionStorage quota must not block editing.
  }
}

function readAppliedValues(storageKey: string): Record<string, string> {
  try {
    const raw = window.sessionStorage.getItem(`${storageKey}:applied`);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  } catch {
    return {};
  }
}

function writeAppliedValues(storageKey: string, values: Record<string, string>) {
  try {
    if (Object.keys(values).length === 0) {
      window.sessionStorage.removeItem(`${storageKey}:applied`);
      return;
    }
    window.sessionStorage.setItem(`${storageKey}:applied`, JSON.stringify(values));
  } catch {
    // Private browsing or a full sessionStorage quota must not block editing.
  }
}

/**
 * Merge server values with only the fields that were manually changed in a
 * previous entry session. Confirmed extraction fields are deliberately
 * applied from the fresh server snapshot, so a review cannot be hidden by a
 * stale manual draft.
 */
export function useEntryDraft<T extends Record<string, string>>({ storageKey, serverValues, appliedFields = [] }: UseEntryDraftOptions<T>): UseEntryDraftResult<T> {
  const baselineRef = useRef(serverValues);
  const [values, setValuesState] = useState<T>(serverValues);
  const [hydrated, setHydrated] = useState(!storageKey);
  const appliedKey = appliedFields.join(",");
  const serverSnapshot = JSON.stringify(serverValues);

  useEffect(() => {
    baselineRef.current = serverValues;
    if (!storageKey) {
      setValuesState(serverValues);
      setHydrated(true);
      return;
    }
    const record = readRecord<T>(storageKey);
    const applied = new Set(appliedFields);
    const appliedValues = readAppliedValues(storageKey);
    const dirty = new Set(record
      ? record.dirty.length > 0
        ? record.dirty
        : Object.keys(record.baseline).filter((field) => record.current[field] !== record.baseline[field])
      : []);
    const merged = { ...serverValues };
    for (const field of dirty) {
      const keepDraft = !applied.has(field) || appliedValues[field] === serverValues[field as keyof T];
      if (keepDraft && field in merged && record && field in record.current) {
        merged[field as keyof T] = record.current[field as keyof T];
      }
    }
    for (const field of applied) {
      const serverValue = serverValues[field as keyof T];
      if (typeof serverValue === "string" && appliedValues[field] !== serverValue) {
        appliedValues[field] = serverValue;
        if (field in merged) merged[field as keyof T] = serverValue as T[keyof T];
      }
    }
    writeAppliedValues(storageKey, appliedValues);
    writeRecord(storageKey, serverValues, merged);
    setValuesState(merged);
    setHydrated(true);
  // The JSON snapshot intentionally makes server refreshes explicit while
  // keeping the caller's object identity out of the dependency cycle.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, appliedKey, serverSnapshot]);

  useEffect(() => {
    if (!storageKey || !hydrated) return;
    writeRecord(storageKey, baselineRef.current, values);
  }, [hydrated, storageKey, values]);

  const setValues = useCallback((next: T | ((current: T) => T)) => {
    setValuesState((current) => typeof next === "function" ? next(current) : next);
  }, []);
  const setField = useCallback(<K extends keyof T>(field: K, value: T[K]) => {
    setValuesState((current) => ({ ...current, [field]: value }));
  }, []);

  return { values, setValues, setField, hydrated };
}

export { buildEntryDraftKey } from "@/lib/entry-draft-key";
