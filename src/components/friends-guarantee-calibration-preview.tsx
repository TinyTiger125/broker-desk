"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { FriendsCustomOverlayField, FriendsOverlayField, FriendsOverlayLayoutOverrides } from "@/lib/friends-guarantee-pdf";

type PageSize = {
  width: number;
  height: number;
};

type DragMode = "move" | "resize-width";

type OverlayBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type DragState = {
  fieldKey: string;
  mode: DragMode;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startBox: OverlayBox;
};

type AlignmentGuide = {
  axis: "x" | "y";
  position: number;
  label: "left" | "center" | "right" | "top" | "middle" | "bottom";
};

type LayoutSaveScope = "case" | "template";

const SNAP_THRESHOLD = 6;
const CUSTOM_SEGMENT_DEFAULT: NonNullable<FriendsOverlayField["segment"]> = { mode: "digits", cells: 7, align: "left" };

type FriendsGuaranteeCalibrationPreviewProps = {
  fields: readonly FriendsOverlayField[];
  fieldValues: Record<string, string>;
  formId: string;
  imageAlt: string;
  imageHeight: number;
  imageSrc: string;
  imageWidth: number;
  initialLayoutOverrides: FriendsOverlayLayoutOverrides;
  pageSize: PageSize;
  requiredFieldKeys: string[];
};

function getDefaultBox(field: FriendsOverlayField) {
  if (field.box) return { ...field.box };
  const inputHeight = Math.max(18, field.size * 2.4);
  return {
    x: field.x,
    y: field.y - 4,
    width: field.maxWidth + 12,
    height: inputHeight,
  };
}

function normalizeSegmentValue(value: string, segment: NonNullable<FriendsOverlayField["segment"]>) {
  const normalized = value.replace(/[^\d]/g, "");
  if (segment.mode === "amount") return normalized.replace(/^0+(?=\d)/, "");
  return normalized;
}

function segmentValue(value: string, segment: NonNullable<FriendsOverlayField["segment"]>) {
  const cells = Math.max(1, Math.floor(segment.cells));
  const normalized = normalizeSegmentValue(value, segment);
  const chars = [...normalized];
  const visibleChars = segment.align === "right" ? chars.slice(-cells) : chars.slice(0, cells);
  const padded = Array<string>(cells).fill("");
  const offset = segment.align === "right" ? Math.max(0, cells - visibleChars.length) : 0;
  visibleChars.forEach((char, index) => {
    padded[offset + index] = char;
  });
  return padded;
}

function hasSegmentOverflow(value: string, segment: NonNullable<FriendsOverlayField["segment"]>) {
  return normalizeSegmentValue(value, segment).length > Math.max(1, Math.floor(segment.cells));
}

function clampSegmentCells(value: number) {
  if (!Number.isFinite(value)) return 7;
  return Math.min(16, Math.max(1, Math.floor(value)));
}

function clampBox(box: OverlayBox, pageSize: PageSize) {
  const width = Math.min(pageSize.width, Math.max(8, box.width));
  const height = Math.min(pageSize.height, Math.max(8, box.height));
  return {
    x: Math.min(pageSize.width - width, Math.max(0, box.x)),
    y: Math.min(pageSize.height - height, Math.max(0, box.y)),
    width,
    height,
  };
}

function previewFieldId(fieldKey: string) {
  return `field-${fieldKey.replaceAll(".", "-")}`;
}

function boxToStyle(box: OverlayBox, pageSize: PageSize) {
  return {
    left: `${(box.x / pageSize.width) * 100}%`,
    top: `${((pageSize.height - box.y - box.height) / pageSize.height) * 100}%`,
    width: `${(box.width / pageSize.width) * 100}%`,
    height: `${(box.height / pageSize.height) * 100}%`,
  };
}

function lineToStyle(guide: AlignmentGuide, pageSize: PageSize) {
  if (guide.axis === "x") {
    return {
      left: `${(guide.position / pageSize.width) * 100}%`,
    };
  }
  return {
    top: `${((pageSize.height - guide.position) / pageSize.height) * 100}%`,
  };
}

function distanceToNearest(value: number, candidates: AlignmentGuide[]) {
  return candidates.reduce<{ delta: number; guide: AlignmentGuide } | null>((best, guide) => {
    const delta = guide.position - value;
    if (Math.abs(delta) > SNAP_THRESHOLD) return best;
    if (!best || Math.abs(delta) < Math.abs(best.delta)) return { delta, guide };
    return best;
  }, null);
}

function snapBox(input: {
  box: OverlayBox;
  candidates: AlignmentGuide[];
  mode: DragMode;
  pageSize: PageSize;
}) {
  const xCandidates = input.candidates.filter((guide) => guide.axis === "x");
  const yCandidates = input.candidates.filter((guide) => guide.axis === "y");
  const box = { ...input.box };
  const guides: AlignmentGuide[] = [];

  const xTargets =
    input.mode === "resize-width"
      ? [{ value: box.x + box.width, kind: "right" as const }]
      : [
          { value: box.x, kind: "left" as const },
          { value: box.x + box.width / 2, kind: "center" as const },
          { value: box.x + box.width, kind: "right" as const },
        ];
  const nearestX = xTargets
    .map((target) => {
      const match = distanceToNearest(target.value, xCandidates);
      return match ? { ...match, target } : null;
    })
    .filter(Boolean)
    .sort((a, b) => Math.abs(a!.delta) - Math.abs(b!.delta))[0];
  if (nearestX) {
    if (input.mode === "resize-width") {
      box.width = Math.max(8, box.width + nearestX.delta);
    } else {
      box.x += nearestX.delta;
    }
    guides.push(nearestX.guide);
  }

  if (input.mode === "move") {
    const yTargets = [
      { value: box.y, kind: "bottom" as const },
      { value: box.y + box.height / 2, kind: "middle" as const },
      { value: box.y + box.height, kind: "top" as const },
    ];
    const nearestY = yTargets
      .map((target) => {
        const match = distanceToNearest(target.value, yCandidates);
        return match ? { ...match, target } : null;
      })
      .filter(Boolean)
      .sort((a, b) => Math.abs(a!.delta) - Math.abs(b!.delta))[0];
    if (nearestY) {
      box.y += nearestY.delta;
      guides.push(nearestY.guide);
    }
  }

  return {
    box: clampBox(box, input.pageSize),
    guides,
  };
}

export function FriendsGuaranteeCalibrationPreview({
  fields,
  fieldValues,
  formId,
  imageAlt,
  imageHeight,
  imageSrc,
  imageWidth,
  initialLayoutOverrides,
  pageSize,
  requiredFieldKeys,
}: FriendsGuaranteeCalibrationPreviewProps) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const requiredSet = useMemo(() => new Set(requiredFieldKeys), [requiredFieldKeys]);
  const [calibrationMode, setCalibrationMode] = useState(false);
  const [layoutOverrides, setLayoutOverrides] = useState<FriendsOverlayLayoutOverrides>(initialLayoutOverrides);
  const [activeFieldKey, setActiveFieldKey] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [alignmentGuides, setAlignmentGuides] = useState<AlignmentGuide[]>([]);
  const [layoutSaveScope, setLayoutSaveScope] = useState<LayoutSaveScope>("case");
  const [draftFieldValues, setDraftFieldValues] = useState<Record<string, string>>(() => ({ ...fieldValues }));
  const [customFields, setCustomFields] = useState<FriendsCustomOverlayField[]>(
    () => fields.filter((field): field is FriendsCustomOverlayField => field.custom === true && Boolean(field.box)),
  );
  const baseFields = useMemo(() => fields.filter((field) => !field.custom), [fields]);
  const allFields = useMemo(() => [...baseFields, ...customFields], [baseFields, customFields]);

  const defaultBoxByFieldKey = useMemo(
    () => new Map(allFields.map((field) => [field.fieldKey, getDefaultBox(field)])),
    [allFields],
  );
  const activeField = activeFieldKey ? allFields.find((field) => field.fieldKey === activeFieldKey) : null;
  const layoutOverrideValue = useMemo(() => JSON.stringify(layoutOverrides), [layoutOverrides]);
  const customOverlayFieldsValue = useMemo(() => {
    return JSON.stringify(
      customFields.map((field) => ({
        fieldKey: field.fieldKey,
        label: field.label,
        size: field.size,
        segment: field.segment ? { ...field.segment } : undefined,
        value: draftFieldValues[field.fieldKey] ?? field.value ?? "",
        box: layoutOverrides[field.fieldKey]?.box ?? field.box,
      })),
    );
  }, [customFields, draftFieldValues, layoutOverrides]);

  const boxForField = useCallback(
    (field: FriendsOverlayField) =>
      layoutOverrides[field.fieldKey]?.box ?? defaultBoxByFieldKey.get(field.fieldKey) ?? getDefaultBox(field),
    [defaultBoxByFieldKey, layoutOverrides],
  );

  const getAlignmentCandidates = useCallback((excludedFieldKey: string) => {
    return allFields.flatMap((field) => {
      if (field.fieldKey === excludedFieldKey) return [];
      const box = boxForField(field);
      return [
        { axis: "x" as const, position: box.x, label: "left" as const },
        { axis: "x" as const, position: box.x + box.width / 2, label: "center" as const },
        { axis: "x" as const, position: box.x + box.width, label: "right" as const },
        { axis: "y" as const, position: box.y, label: "bottom" as const },
        { axis: "y" as const, position: box.y + box.height / 2, label: "middle" as const },
        { axis: "y" as const, position: box.y + box.height, label: "top" as const },
      ];
    });
  }, [boxForField, allFields]);
  const activeBoxGuides = useMemo<AlignmentGuide[]>(() => {
    if (!activeField || !calibrationMode) return [];
    const box = boxForField(activeField);
    return [
      { axis: "x", position: box.x, label: "left" },
      { axis: "x", position: box.x + box.width, label: "right" },
      { axis: "y", position: box.y, label: "bottom" },
      { axis: "y", position: box.y + box.height, label: "top" },
    ];
  }, [activeField, boxForField, calibrationMode]);

  const applyDrag = useCallback((pointerId: number, clientX: number, clientY: number) => {
    const drag = dragRef.current;
    const canvas = canvasRef.current;
    if (!drag || drag.pointerId !== pointerId || !canvas) return false;

    const rect = canvas.getBoundingClientRect();
    const scaleX = pageSize.width / rect.width;
    const scaleY = pageSize.height / rect.height;
    const deltaX = (clientX - drag.startClientX) * scaleX;
    const deltaY = (clientY - drag.startClientY) * scaleY;
    const nextBox =
      drag.mode === "move"
        ? {
            ...drag.startBox,
            x: drag.startBox.x + deltaX,
            y: drag.startBox.y - deltaY,
          }
        : {
            ...drag.startBox,
            width: drag.startBox.width + deltaX,
          };
    const snapped = snapBox({
      box: nextBox,
      candidates: getAlignmentCandidates(drag.fieldKey),
      mode: drag.mode,
      pageSize,
    });
    setLayoutOverrides((current) => ({
      ...current,
      [drag.fieldKey]: { box: snapped.box },
    }));
    setAlignmentGuides(snapped.guides);
    setDirty(true);
    return true;
  }, [getAlignmentCandidates, pageSize]);

  useEffect(() => {
    if (!dragging) return;

    const handleMove = (event: PointerEvent) => {
      if (applyDrag(event.pointerId, event.clientX, event.clientY)) {
        event.preventDefault();
      }
    };
    const handleEnd = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (drag && drag.pointerId === event.pointerId) {
        dragRef.current = null;
        setDragging(false);
        setAlignmentGuides([]);
      }
    };
    window.addEventListener("pointermove", handleMove, { passive: false });
    window.addEventListener("pointerup", handleEnd);
    window.addEventListener("pointercancel", handleEnd);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleEnd);
      window.removeEventListener("pointercancel", handleEnd);
    };
  }, [applyDrag, dragging]);

  const startDrag = (event: ReactPointerEvent<HTMLElement>, field: FriendsOverlayField, mode: DragMode) => {
    if (!calibrationMode) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const startBox = boxForField(field);
    dragRef.current = {
      fieldKey: field.fieldKey,
      mode,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startBox,
    };
    setActiveFieldKey(field.fieldKey);
    setDragging(true);
    setAlignmentGuides([]);
  };

  const updateDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (applyDrag(event.pointerId, event.clientX, event.clientY)) {
      event.preventDefault();
    }
  };

  const endDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (drag && drag.pointerId === event.pointerId) {
      dragRef.current = null;
      setDragging(false);
      setAlignmentGuides([]);
    }
  };

  const addCustomField = (segment?: NonNullable<FriendsOverlayField["segment"]>) => {
    const fieldKey = `custom.${Date.now().toString(36)}`;
    const segmentCells = segment ? Math.max(1, Math.floor(segment.cells)) : 0;
    const box = clampBox(
      {
        x: pageSize.width * 0.42,
        y: pageSize.height * 0.45,
        width: segment ? Math.min(24 * segmentCells, pageSize.width * 0.22) : Math.min(180, pageSize.width * 0.18),
        height: Math.max(18, pageSize.height * 0.024),
      },
      pageSize,
    );
    const field: FriendsCustomOverlayField = {
      fieldKey,
      label: segment ? `分格欄${customFields.length + 1}` : `追加欄${customFields.length + 1}`,
      x: box.x + 3,
      y: box.y + 6,
      size: 8,
      minSize: 5,
      maxWidth: box.width - 6,
      box,
      segment,
      custom: true,
      value: "",
    };
    setCustomFields((current) => [...current, field]);
    setDraftFieldValues((current) => ({ ...current, [fieldKey]: "" }));
    setLayoutOverrides((current) => ({ ...current, [fieldKey]: { box } }));
    setActiveFieldKey(fieldKey);
    setCalibrationMode(true);
    setDirty(true);
  };

  const activeCustomField = activeFieldKey
    ? customFields.find((field) => field.fieldKey === activeFieldKey)
    : null;

  const updateActiveCustomSegmentCells = (delta: number) => {
    if (!activeCustomField?.segment) return;
    setCustomFields((current) =>
      current.map((field) =>
        field.fieldKey === activeCustomField.fieldKey && field.segment
          ? {
              ...field,
              segment: {
                ...field.segment,
                cells: clampSegmentCells(field.segment.cells + delta),
              },
            }
          : field,
      ),
    );
    setDirty(true);
  };

  const deleteActiveCustomField = () => {
    if (!activeCustomField) return;
    setCustomFields((current) => current.filter((field) => field.fieldKey !== activeCustomField.fieldKey));
    setLayoutOverrides((current) => {
      const next = { ...current };
      delete next[activeCustomField.fieldKey];
      return next;
    });
    setDraftFieldValues((current) => {
      const next = { ...current };
      delete next[activeCustomField.fieldKey];
      return next;
    });
    setActiveFieldKey(null);
    setDirty(true);
  };

  return (
    <div className="flex h-[calc(100vh-132px)] flex-col">
      <input form={formId} type="hidden" name="layoutOverrides" value={layoutOverrideValue} readOnly />
      <input form={formId} type="hidden" name="customOverlayFields" value={customOverlayFieldsValue} readOnly />
      <input form={formId} type="hidden" name="layoutDirty" value={dirty ? "true" : "false"} readOnly />
      <input form={formId} type="hidden" name="layoutSaveScope" value={layoutSaveScope} readOnly />
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <div>
          <p className="text-sm font-black text-slate-950">可編集プレビュー</p>
          <p className="mt-0.5 text-xs font-semibold text-slate-500">
            {activeField
              ? `${activeField.label}${alignmentGuides.length > 0 ? " / 吸着中" : ""}`
              : dirty
                ? "位置変更あり"
                : "入力欄を空にすると、PDFからその値を削除します。"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
            {([
              ["case", "この案件"],
              ["template", "テンプレート"],
            ] as const).map(([scope, label]) => (
              <button
                key={scope}
                type="button"
                title={scope === "case" ? "今回の案件だけ位置を保存" : "この申込書テンプレートの標準位置として保存"}
                onClick={() => setLayoutSaveScope(scope)}
                className={`rounded-md px-2.5 py-1.5 text-xs font-black ${
                  layoutSaveScope === scope ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            title="PDF上に入力欄を追加"
            onClick={() => addCustomField()}
            className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800 hover:bg-emerald-100"
          >
            <span className="material-symbols-outlined text-[16px]">add_box</span>
            入力欄を追加
          </button>
          <button
            type="button"
            title="郵便番号や金額用の分格欄を追加"
            onClick={() => addCustomField(CUSTOM_SEGMENT_DEFAULT)}
            className="inline-flex items-center gap-2 rounded-lg border border-[#002FA7]/30 bg-[#002FA7]/5 px-3 py-2 text-xs font-black text-[#002FA7] hover:bg-[#002FA7]/10"
          >
            <span className="material-symbols-outlined text-[16px]">view_column</span>
            分格欄を追加
          </button>
          {activeCustomField?.segment ? (
            <div className="inline-flex items-center rounded-lg border border-slate-300 bg-white p-0.5 text-xs font-black text-slate-700">
              <span className="px-2">桁数 {activeCustomField.segment.cells}</span>
              <button
                type="button"
                title="桁数を減らす"
                onClick={() => updateActiveCustomSegmentCells(-1)}
                className="rounded-md px-2 py-1 hover:bg-slate-100"
              >
                -
              </button>
              <button
                type="button"
                title="桁数を増やす"
                onClick={() => updateActiveCustomSegmentCells(1)}
                className="rounded-md px-2 py-1 hover:bg-slate-100"
              >
                +
              </button>
            </div>
          ) : null}
          {activeCustomField ? (
            <button
              type="button"
              title="選択中の追加欄を削除"
              onClick={deleteActiveCustomField}
              className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-black text-rose-700 hover:bg-rose-50"
            >
              <span className="material-symbols-outlined text-[16px]">delete</span>
              追加欄を削除
            </button>
          ) : null}
          <button
            type="button"
            title="印字位置を調整"
            onClick={() => setCalibrationMode((current) => !current)}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-black ${
              calibrationMode
                ? "border-[#001e40] bg-[#001e40] text-white"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">open_with</span>
            位置調整
          </button>
          <button
            type="button"
            title="初期位置に戻す"
            onClick={() => {
              setLayoutOverrides({});
              setDirty(true);
              setActiveFieldKey(null);
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"
          >
            <span className="material-symbols-outlined text-[16px]">restart_alt</span>
            初期位置
          </button>
          <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
            <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-rose-700">未入力</span>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-amber-700">要配置</span>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-700">入力済み</span>
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-slate-200 p-6">
        <div ref={canvasRef} className="relative mx-auto min-w-[980px] max-w-[1600px] shadow-2xl">
          <Image
            src={imageSrc}
            width={imageWidth}
            height={imageHeight}
            alt={imageAlt}
            priority
            className="h-auto w-full select-none bg-white"
            draggable={false}
          />
          {calibrationMode
            ? activeBoxGuides.map((guide) => (
                <span
                  key={`active-guide-${guide.axis}-${guide.label}`}
                  aria-hidden="true"
                  className={`pointer-events-none absolute z-[15] ${
                    guide.axis === "x"
                      ? "top-0 h-full border-l border-dashed border-slate-400/45"
                      : "left-0 w-full border-t border-dashed border-slate-400/45"
                  }`}
                  style={lineToStyle(guide, pageSize)}
                />
              ))
            : null}
          {alignmentGuides.map((guide) => (
            <span
              key={`snap-guide-${guide.axis}-${guide.position}-${guide.label}`}
              aria-hidden="true"
              className={`pointer-events-none absolute z-[25] ${
                guide.axis === "x"
                  ? "top-0 h-full border-l-2 border-dashed border-[#002FA7]"
                  : "left-0 w-full border-t-2 border-dashed border-[#002FA7]"
              }`}
              style={lineToStyle(guide, pageSize)}
            >
              <span
                className={`absolute rounded bg-[#002FA7] px-1.5 py-0.5 text-[9px] font-black text-white shadow-sm ${
                  guide.axis === "x" ? "left-1 top-2" : "left-2 top-1"
                }`}
              >
                吸着
              </span>
            </span>
          ))}
          {allFields.map((field) => {
            const value = draftFieldValues[field.fieldKey] ?? "";
            const required = requiredSet.has(field.fieldKey);
            const missing = required && !value;
            const box = boxForField(field);
            const manualPlacementRequired = field.print === false && !layoutOverrides[field.fieldKey];
            const segmentOverflow = field.segment ? hasSegmentOverflow(value, field.segment) : false;
            const inputClass = missing
              ? "border-rose-500 bg-rose-50/95 text-rose-950 placeholder:text-rose-400 ring-2 ring-rose-300"
              : manualPlacementRequired
                ? "border-amber-500 bg-amber-50/90 text-amber-950 ring-2 ring-amber-200"
              : segmentOverflow
                ? "border-amber-500 bg-amber-50/95 text-amber-950 ring-2 ring-amber-300"
              : value
                ? "border-emerald-500 bg-emerald-50/90 text-slate-950"
                : "border-slate-300 bg-white/75 text-slate-900";
            const active = activeFieldKey === field.fieldKey;
            const segmentCells = field.segment ? segmentValue(value, field.segment) : [];
            const segmentGap =
              field.segment && field.segment.gap
                ? `${Math.max(0, (field.segment.gap / Math.max(1, box.width)) * 100)}%`
                : "0";
            return (
              <label
                key={`overlay-${field.fieldKey}`}
                id={previewFieldId(field.fieldKey)}
                className={`group absolute scroll-mt-24 ${
                  calibrationMode ? "cursor-move touch-none" : ""
                } ${active ? "z-20" : "z-10"}`}
                style={boxToStyle(box, pageSize)}
                title={manualPlacementRequired ? `${field.label} / 位置を調整するとPDFに印字されます` : field.label}
                onPointerDown={(event) => startDrag(event, field, "move")}
                onPointerMove={updateDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
              >
	                <span className="absolute -top-5 left-0 hidden whitespace-nowrap rounded bg-slate-950 px-2 py-0.5 text-[10px] font-bold text-white shadow group-focus-within:block group-hover:block">
	                  {field.label}{field.segment ? " / 分格" : ""}{manualPlacementRequired ? " / 要手動配置" : ""}
	                </span>
	                {field.segment ? (
	                  <>
	                    <input
	                      form={formId}
	                      name={`field:${field.fieldKey}`}
	                      value={value}
	                      onChange={(event) => {
	                        setDraftFieldValues((current) => ({ ...current, [field.fieldKey]: event.target.value }));
	                        setDirty(true);
	                      }}
	                      placeholder={missing ? "入力" : ""}
	                      aria-label={field.label}
	                      readOnly={calibrationMode}
	                      inputMode="numeric"
	                      className={`absolute inset-0 z-10 h-full w-full rounded-sm border bg-transparent px-1 !text-transparent caret-[#001e40] outline-none transition placeholder:text-rose-400 focus:border-[#001e40] focus:bg-white/20 focus:ring-2 focus:ring-[#001e40]/30 ${
	                        calibrationMode ? "pointer-events-none select-none" : ""
	                      } ${active ? "ring-2 ring-[#001e40]" : ""} ${inputClass}`}
	                    />
	                    <span
	                      aria-hidden="true"
	                      className="pointer-events-none relative z-[11] grid h-full w-full tabular-nums"
	                      style={{
	                        gridTemplateColumns: `repeat(${segmentCells.length}, minmax(0, 1fr))`,
	                        gap: segmentGap,
	                      }}
	                    >
	                      {segmentCells.map((char, index) => (
	                        <span
	                          key={`${field.fieldKey}-segment-${index}`}
	                          className={`flex min-w-0 items-center justify-center border text-[11px] font-black leading-none ${
	                            manualPlacementRequired
	                              ? "border-amber-500 bg-amber-50/90 text-amber-950"
	                              : segmentOverflow
	                              ? "border-amber-500 bg-amber-50/95 text-amber-950"
	                              : missing
	                                ? "border-rose-500 bg-rose-50/95 text-rose-950"
	                                : value
	                                  ? "border-emerald-500 bg-emerald-50/90 text-slate-950"
	                                  : "border-slate-300 bg-white/75 text-slate-900"
	                          }`}
	                        >
	                          {char}
	                        </span>
	                      ))}
	                    </span>
	                    {segmentOverflow ? (
	                      <span className="pointer-events-none absolute -bottom-5 right-0 rounded bg-amber-500 px-1.5 py-0.5 text-[9px] font-black text-white">
	                        桁数超過
	                      </span>
	                    ) : null}
	                    {manualPlacementRequired ? (
	                      <span className="pointer-events-none absolute -bottom-5 right-0 rounded bg-amber-600 px-1.5 py-0.5 text-[9px] font-black text-white">
	                        要配置
	                      </span>
	                    ) : null}
	                  </>
	                ) : (
	                  <input
	                    form={formId}
	                    name={`field:${field.fieldKey}`}
	                    value={value}
	                    onChange={(event) => {
	                      setDraftFieldValues((current) => ({ ...current, [field.fieldKey]: event.target.value }));
	                      setDirty(true);
	                    }}
	                    placeholder={missing ? "入力" : ""}
	                    aria-label={field.label}
	                    readOnly={calibrationMode}
	                    className={`h-full w-full rounded-sm border px-1 text-[11px] font-bold leading-none outline-none transition focus:border-[#001e40] focus:bg-white focus:ring-2 focus:ring-[#001e40]/30 ${
	                      field.align === "right" ? "text-right" : ""
	                    } ${calibrationMode ? "pointer-events-none select-none" : ""} ${active ? "ring-2 ring-[#001e40]" : ""} ${inputClass}`}
	                  />
	                )}
                {!field.segment && manualPlacementRequired ? (
                  <span className="pointer-events-none absolute -bottom-5 right-0 rounded bg-amber-600 px-1.5 py-0.5 text-[9px] font-black text-white">
                    要配置
                  </span>
                ) : null}
                {calibrationMode ? (
                  <span
                    role="presentation"
                    className="absolute -right-1 top-1/2 h-4 w-2 -translate-y-1/2 cursor-ew-resize rounded-full border border-[#001e40] bg-white shadow"
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      startDrag(event, field, "resize-width");
                    }}
                    onPointerMove={updateDrag}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                  />
                ) : null}
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}
