"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Schema, Template } from "@pdfme/common";
import type {
  FriendsCustomOverlayField,
  FriendsOverlayBox,
  FriendsOverlayField,
  FriendsOverlayLayoutOverrides,
} from "@/lib/friends-guarantee-pdf";

const PT_PER_MM = 72 / 25.4;
const MM_PER_PT = 25.4 / 72;

type PdfmeOfficialTemplateDesignerProps = {
  basePdfDataUri: string;
  fields: readonly FriendsOverlayField[];
  fieldValues: Record<string, string>;
  formId: string;
  initialLayoutOverrides: FriendsOverlayLayoutOverrides;
  pageSize: { width: number; height: number };
  requiredFieldKeys: readonly string[];
  templateName: string;
};

type PdfmeDesignerHandle = {
  destroy: () => void;
  getTemplate: () => Template;
  onChangeTemplate: (cb: (template: Template) => void) => void;
  onSaveTemplate: (cb: (template: Template) => void) => void;
};

function ptToMm(value: number) {
  return value * MM_PER_PT;
}

function mmToPt(value: number) {
  return value * PT_PER_MM;
}

function boxToPdfmeSchema(input: {
  field: FriendsOverlayField;
  box: FriendsOverlayBox;
  pageSize: { width: number; height: number };
  required: boolean;
  value: string;
}): Schema {
  const fontSize = Math.max(5, Math.min(14, input.field.size));
  return {
    name: input.field.fieldKey,
    type: "text",
    content: input.value || input.field.label,
    position: {
      x: ptToMm(input.box.x),
      y: ptToMm(input.pageSize.height - input.box.y - input.box.height),
    },
    width: ptToMm(input.box.width),
    height: ptToMm(input.box.height),
    required: input.required,
    readOnly: false,
    fontSize,
    lineHeight: 1,
    characterSpacing: input.field.segment ? 1 : 0,
    alignment: input.field.align === "right" ? "right" : "left",
    verticalAlignment: "middle",
    dynamicFontSize: {
      min: Math.max(4, input.field.minSize ?? fontSize - 2),
      max: fontSize,
      fit: "horizontal",
    },
    fontColor: "#0f172a",
    backgroundColor: input.required && !input.value ? "#fff1f2" : "transparent",
    borderColor: input.field.segment ? "#2563eb" : "#10b981",
    borderWidth: 0.2,
    padding: 0,
  } as Schema;
}

function pdfmeSchemaToBox(schema: Schema, pageSize: { width: number; height: number }): FriendsOverlayBox | null {
  const raw = schema as Schema & { position?: { x?: unknown; y?: unknown }; width?: unknown; height?: unknown };
  const x = Number(raw.position?.x);
  const top = Number(raw.position?.y);
  const width = Number(raw.width);
  const height = Number(raw.height);
  if (![x, top, width, height].every(Number.isFinite)) return null;
  const box = {
    x: mmToPt(x),
    y: pageSize.height - mmToPt(top) - mmToPt(height),
    width: mmToPt(width),
    height: mmToPt(height),
  };
  if (box.width <= 0 || box.height <= 0) return null;
  return box;
}

function clampBox(box: FriendsOverlayBox, pageSize: { width: number; height: number }): FriendsOverlayBox {
  const width = Math.min(Math.max(4, box.width), pageSize.width);
  const height = Math.min(Math.max(4, box.height), pageSize.height);
  return {
    x: Math.min(Math.max(0, box.x), Math.max(0, pageSize.width - width)),
    y: Math.min(Math.max(0, box.y), Math.max(0, pageSize.height - height)),
    width,
    height,
  };
}

export function PdfmeOfficialTemplateDesigner({
  basePdfDataUri,
  fields,
  fieldValues,
  formId,
  initialLayoutOverrides,
  pageSize,
  requiredFieldKeys,
  templateName,
}: PdfmeOfficialTemplateDesignerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const designerRef = useRef<PdfmeDesignerHandle | null>(null);
  const syncTemplateRef = useRef<((template: Template) => void) | null>(null);
  const requiredSet = useMemo(() => new Set(requiredFieldKeys), [requiredFieldKeys]);
  const fieldByKey = useMemo(() => new Map(fields.map((field) => [field.fieldKey, field])), [fields]);
  const [layoutSaveScope, setLayoutSaveScope] = useState<"case" | "template">("template");
  const [layoutOverrides, setLayoutOverrides] = useState<FriendsOverlayLayoutOverrides>(initialLayoutOverrides);
  const [customOverlayFields, setCustomOverlayFields] = useState<FriendsCustomOverlayField[]>(
    () => fields.filter((field): field is FriendsCustomOverlayField => field.custom === true && Boolean(field.box)),
  );
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const initialTemplate = useMemo<Template>(() => {
    const schemas = fields.map((field) => {
      const box = initialLayoutOverrides[field.fieldKey]?.box ?? field.box ?? {
        x: field.x,
        y: field.y,
        width: field.maxWidth,
        height: Math.max(10, field.size + 4),
      };
      return boxToPdfmeSchema({
        field,
        box,
        pageSize,
        required: requiredSet.has(field.fieldKey),
        value: fieldValues[field.fieldKey] ?? "",
      });
    });
    return {
      basePdf: basePdfDataUri,
      schemas: [schemas],
      pdfmeVersion: "6.1.2",
    };
  }, [basePdfDataUri, fields, fieldValues, initialLayoutOverrides, pageSize, requiredSet]);

  useEffect(() => {
    let disposed = false;
    const container = containerRef.current;
    if (!container) return;

    async function boot() {
      try {
        const [{ Designer }, { text }] = await Promise.all([
          import("@pdfme/ui"),
          import("@pdfme/schemas"),
        ]);
        if (disposed || !containerRef.current) return;
        containerRef.current.innerHTML = "";
        const designer = new Designer({
          domContainer: containerRef.current,
          template: initialTemplate,
          plugins: { text },
          options: {
            lang: "ja",
            zoomLevel: 1,
            maxZoom: 4,
            sidebarOpen: true,
            requiredByDefault: false,
            theme: {
              token: {
                colorPrimary: "#001e40",
                colorPrimaryBg: "#e6eeff",
              },
            },
          },
        }) as PdfmeDesignerHandle;

        const syncTemplate = (template: Template) => {
          const nextOverrides: FriendsOverlayLayoutOverrides = {};
          const nextCustomFields: FriendsCustomOverlayField[] = [];
          template.schemas.flat().forEach((schema) => {
            if (!schema.name) return;
            const box = pdfmeSchemaToBox(schema, pageSize);
            if (!box) return;
            const clampedBox = clampBox(box, pageSize);
            nextOverrides[schema.name] = { box: clampedBox };

            const existingField = fieldByKey.get(schema.name);
            if (!existingField?.custom) return;
            const existingCustomField = existingField as FriendsCustomOverlayField;
            nextCustomFields.push({
              ...existingCustomField,
              box: clampedBox,
              x: clampedBox.x + 3,
              y: clampedBox.y + Math.max(0, (clampedBox.height - existingCustomField.size) / 2),
              maxWidth: Math.max(8, clampedBox.width - 6),
              value: fieldValues[schema.name] ?? existingCustomField.value ?? "",
              custom: true,
            });
          });
          setLayoutOverrides(nextOverrides);
          setCustomOverlayFields(nextCustomFields);
          setDirty(true);
        };

        syncTemplateRef.current = syncTemplate;
        designer.onChangeTemplate(syncTemplate);
        designer.onSaveTemplate(syncTemplate);
        designerRef.current = designer;
        setReady(true);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "pdfme designer failed to load.";
        setError(message);
      }
    }

    void boot();
    return () => {
      disposed = true;
      designerRef.current?.destroy();
      designerRef.current = null;
      syncTemplateRef.current = null;
      container.innerHTML = "";
    };
  }, [fieldByKey, fieldValues, initialTemplate, pageSize]);

  const layoutOverridesValue = useMemo(() => JSON.stringify(layoutOverrides), [layoutOverrides]);
  const customOverlayFieldsValue = useMemo(() => JSON.stringify(customOverlayFields), [customOverlayFields]);

  return (
    <div className="flex h-[calc(100vh-132px)] flex-col">
      <input form={formId} type="hidden" name="layoutOverrides" value={layoutOverridesValue} readOnly />
      <input form={formId} type="hidden" name="customOverlayFields" value={customOverlayFieldsValue} readOnly />
      <input form={formId} type="hidden" name="layoutDirty" value={dirty ? "true" : "false"} readOnly />
      <input form={formId} type="hidden" name="layoutSaveScope" value={layoutSaveScope} readOnly />

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div>
          <p className="text-sm font-black text-slate-950">公式PDF精校モード</p>
          <p className="mt-0.5 text-xs font-semibold text-slate-500">
            {ready
              ? `${templateName} / 底版PDFは固定、移動できるのは入力欄だけです。`
              : "公式PDF底版を読み込んでいます。"}
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
                onClick={() => {
                  setLayoutSaveScope(scope);
                  setDirty(true);
                }}
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
            onClick={() => {
              const template = designerRef.current?.getTemplate();
              if (!template) return;
              syncTemplateRef.current?.(template);
              setDirty(true);
            }}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"
          >
            現在位置を保存対象にする
          </button>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${dirty ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"}`}>
            {dirty ? "位置変更あり" : "未変更"}
          </span>
        </div>
      </div>

      {error ? (
        <div className="m-4 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-800">
          pdfme の読み込みに失敗しました: {error}
        </div>
      ) : null}
      <div ref={containerRef} className="min-h-0 flex-1 bg-white" />
    </div>
  );
}
