"use client";

import { useEffect, useRef, useState } from "react";
import {
  canvasDeltaToPdfDelta,
  movePdfField,
  pdfPointsToCanvasRect,
  resizePdfFieldFromBottomRight,
  serializeMaskLayout,
} from "@/lib/guarantee-slice1-coordinates.mjs";

type Props = {
  enabled: boolean;
  isAdmin: boolean;
  cases: Array<{ id: string; title: string }>;
  publishedVersions: Array<{ id: string; versionNumber: number; blankFormVersionId: string; maskId: string }>;
  initialMaskVersionId?: string;
  initialBlankFormId?: string;
  initialBlankFormVersionId?: string;
  initialMaskId?: string;
  adminOnly?: boolean;
  showUpload?: boolean;
  heading?: string;
};
type FieldType = "text" | "date" | "checkbox";
type MaskField = { fieldId: string; type: FieldType; sourceFieldKey: string; label: string; pageNumber: number; x: number; y: number; width: number; height: number };
type ApiPayload = Record<string, unknown> & { blankForm?: { id?: string }; blankFormVersion?: { id?: string; pageWidth?: number; pageHeight?: number }; maskVersion?: { id?: string; status?: string; testedLayoutDigest?: string; layoutSnapshot?: Record<string, unknown> }; confirmationId?: string; outputId?: string; blankPdfBase64?: string; blankPagePngBase64?: string; testPdfBase64?: string; testPdfSha256?: string; layoutDigest?: string };
type Interaction = { index: number; mode: "move" | "resize"; startX: number; startY: number; startField: MaskField; scaleX: number; scaleY: number };

const initialFields: MaskField[] = [
  { fieldId: "applicant_name", type: "text", sourceFieldKey: "applicant.name", label: "氏名", pageNumber: 1, x: 72, y: 700, width: 180, height: 18 },
  { fieldId: "applicant_birth_date", type: "date", sourceFieldKey: "applicant.birthDate", label: "生年月日", pageNumber: 1, x: 72, y: 660, width: 100, height: 18 },
  { fieldId: "consent", type: "checkbox", sourceFieldKey: "company_option.friends_consent", label: "同意（申请书补充项）", pageNumber: 1, x: 72, y: 620, width: 14, height: 14 },
];

function defaultFieldsForPage(pageWidth: number, pageHeight: number): MaskField[] {
  // Keep the three demonstration fields inside every accepted one-page PDF.
  // The values remain PDF points; this only provides an editable starting
  // position and does not infer any production template coordinates.
  const width = Math.max(120, pageWidth);
  const height = Math.max(120, pageHeight);
  const textWidth = Math.min(width * 0.42, 180);
  const dateWidth = Math.min(width * 0.26, 110);
  const left = Math.min(width * 0.12, Math.max(0, width - textWidth - 12));
  const top = Math.min(height * 0.78, Math.max(24, height - 24));
  return [
    { ...initialFields[0], x: left, y: Math.max(0, top - 18), width: textWidth, height: Math.min(18, height * 0.12) },
    { ...initialFields[1], x: left, y: Math.max(0, top - height * 0.18), width: dateWidth, height: Math.min(18, height * 0.12) },
    { ...initialFields[2], x: left, y: Math.max(0, top - height * 0.34), width: Math.min(14, width * 0.08), height: Math.min(14, height * 0.08) },
  ];
}

async function postJson(action: string, body: Record<string, unknown>) {
  const response = await fetch("/api/guarantee-g1-slice1", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ...body }) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(payload.error ?? "request_failed"));
  return payload as ApiPayload;
}

const GUARANTEE_ERROR_MESSAGES: Record<string, string> = {
  blank_form_file_too_large: "文件超过 20 MB，请选择更小的空白 PDF。",
  blank_form_pdf_required: "请上传 PDF 文件。",
  blank_form_pdf_rejected: "该文件无法安全读取，请确认它是未加密且未设密码的 PDF。",
  blank_form_encrypted_unsupported: "加密或密码保护的 PDF 暂不支持。",
  blank_form_rotation_unsupported: "旋转页面暂不支持，请上传页面方向正常的 PDF。",
  blank_form_cropbox_unsupported: "该 PDF 的裁切范围与页面范围不一致，暂不支持。",
  blank_form_page_origin_unsupported: "该 PDF 的页面坐标原点不标准，暂不支持。",
  blank_form_dimensions_unsupported: "该 PDF 的页面尺寸或结构异常，暂不支持。",
  blank_form_processing_timeout: "PDF 处理超时，请更换较简单的一页空白 PDF 后重试。",
  blank_form_preview_unavailable: "无法生成该 PDF 的校准预览，请更换文件后重试。",
  slice1_single_page_pdf_required: "第一版只支持一页 PDF。",
};

function explainGuaranteeError(error: unknown) {
  const code = error instanceof Error ? error.message : String(error);
  return GUARANTEE_ERROR_MESSAGES[code] ?? code;
}

function pdfFieldStyle(field: MaskField, pageWidth: number, pageHeight: number) {
  const rect = pdfPointsToCanvasRect(field, pageWidth, pageHeight, 100, 100);
  return {
    left: `${rect.left}%`,
    top: `${rect.top}%`,
    width: `${rect.width}%`,
    height: `${rect.height}%`,
  };
}

export function GuaranteeSlice1Client({ enabled, isAdmin, cases, publishedVersions, initialMaskVersionId, initialBlankFormId, initialBlankFormVersionId, initialMaskId, adminOnly = false, showUpload = true, heading }: Props) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [blankFormVersionId, setBlankFormVersionId] = useState(initialBlankFormVersionId ?? "");
  const [blankFormId, setBlankFormId] = useState("");
  const [maskId, setMaskId] = useState(initialMaskId ?? "");
  const [maskVersionId, setMaskVersionId] = useState("");
  const [caseId, setCaseId] = useState("");
  const [memberMaskVersionId, setMemberMaskVersionId] = useState("");
  const [memberBlankFormVersionId, setMemberBlankFormVersionId] = useState("");
  const [testCaseId, setTestCaseId] = useState("");
  const [confirmationId, setConfirmationId] = useState("");
  const [outputId, setOutputId] = useState("");
  const [previewSrc, setPreviewSrc] = useState("");
  const [blankPdfSrc, setBlankPdfSrc] = useState("");
  const [blankPageSrc, setBlankPageSrc] = useState("");
  const [testPdfSrc, setTestPdfSrc] = useState("");
  const [testedPdfSha256, setTestedPdfSha256] = useState("");
  const [testConfirmed, setTestConfirmed] = useState(false);
  const [draftDirty, setDraftDirty] = useState(false);
  const [testedLayoutDigest, setTestedLayoutDigest] = useState("");
  const [testConsent, setTestConsent] = useState(false);
  const [memberConsent, setMemberConsent] = useState(false);
  const [memberDraftPersisted, setMemberDraftPersisted] = useState(false);
  const [pageWidth, setPageWidth] = useState(612);
  const [pageHeight, setPageHeight] = useState(792);
  const [fields, setFields] = useState<MaskField[]>(initialFields);
  const [interaction, setInteraction] = useState<Interaction>();
  const editorRef = useRef<HTMLDivElement>(null);
  const pageCanvasRef = useRef<HTMLCanvasElement>(null);

  const invalidateTestState = () => {
    setDraftDirty(true);
    setTestConfirmed(false);
    setTestedLayoutDigest("");
    setTestPdfSrc("");
    setTestedPdfSha256("");
  };

  useEffect(() => {
    const canvas = pageCanvasRef.current;
    if (!canvas) return;
    const pixelRatio = 2;
    canvas.width = Math.max(1, Math.round(pageWidth * pixelRatio));
    canvas.height = Math.max(1, Math.round(pageHeight * pixelRatio));
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, pageWidth, pageHeight);
    context.strokeStyle = "#cbd5e1";
    context.lineWidth = 1;
    context.strokeRect(0.5, 0.5, pageWidth - 1, pageHeight - 1);
    context.fillStyle = "#64748b";
    context.font = "12px sans-serif";
    context.fillText("客户空白 PDF · 第 1 页 · 坐标校准画布", 18, 24);
    if (!blankPageSrc) return undefined;
    const image = new Image();
    image.onload = () => {
      context.clearRect(0, 0, pageWidth, pageHeight);
      context.drawImage(image, 0, 0, pageWidth, pageHeight);
    };
    image.src = blankPageSrc;
    return () => { image.onload = null; };
  }, [pageHeight, pageWidth, blankPageSrc]);

  useEffect(() => {
    if (!interaction) return undefined;
    const move = (event: PointerEvent) => {
      const dx = (event.clientX - interaction.startX) * interaction.scaleX;
      const dy = (event.clientY - interaction.startY) * interaction.scaleY;
      if (dx === 0 && dy === 0) return;
      invalidateTestState();
      setFields((current) => current.map((field, index) => {
        if (index !== interaction.index) return field;
        const delta = canvasDeltaToPdfDelta(
          event.clientX - interaction.startX,
          event.clientY - interaction.startY,
          pageWidth / interaction.scaleX,
          pageHeight / interaction.scaleY,
          pageWidth,
          pageHeight,
        );
        if (interaction.mode === "resize") return resizePdfFieldFromBottomRight(interaction.startField, delta.x, delta.y, pageWidth, pageHeight);
        return movePdfField(interaction.startField, delta.x, -delta.y, pageWidth, pageHeight);
      }));
    };
    const end = () => setInteraction(undefined);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end, { once: true });
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end); };
  }, [interaction, pageHeight, pageWidth]);

  const run = async (operation: () => Promise<void>) => {
    setError(""); setMessage("");
    try { await operation(); } catch (caught) { setError(explainGuaranteeError(caught)); }
  };

  const upload = async (formElement: HTMLFormElement) => {
    const form = new FormData(formElement);
    const response = await fetch("/api/guarantee-g1-slice1", { method: "POST", body: form });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(String(payload.error ?? "upload_failed"));
    setBlankFormId(String((payload.blankForm as { id?: string } | undefined)?.id ?? ""));
    setBlankFormVersionId(String(payload.blankFormVersion?.id ?? ""));
    setMaskId(String(payload.maskId ?? ""));
    setMaskVersionId(""); setTestConfirmed(false); setTestPdfSrc(""); setTestedPdfSha256(""); setTestedLayoutDigest(""); setDraftDirty(false);
    const width = Number(payload.blankFormVersion?.pageWidth ?? 612); const height = Number(payload.blankFormVersion?.pageHeight ?? 792);
    setPageWidth(width); setPageHeight(height);
    setFields(defaultFieldsForPage(width, height));
    setBlankPdfSrc(payload.blankPdfBase64 ? `data:application/pdf;base64,${String(payload.blankPdfBase64)}` : "");
    setBlankPageSrc(payload.blankPagePngBase64 ? `data:image/png;base64,${String(payload.blankPagePngBase64)}` : "");
    setMessage("空白表格を受け取りました。PDF 上の字段框をドラッグまたは右下ハンドルで校准してから保存してください。");
  };

  const loadExistingAdminMask = async (nextMaskVersionId: string) => {
    if (!nextMaskVersionId || !isAdmin) return;
    await run(async () => {
      const payload = await postJson("loadAdminMask", { maskVersionId: nextMaskVersionId });
      const loadedVersion = payload.maskVersion ?? {};
      const loadedLayout = loadedVersion.layoutSnapshot ?? {};
      const loadedFields = Array.isArray(loadedLayout.fields) ? loadedLayout.fields as MaskField[] : [];
      setBlankFormId(String(payload.blankForm?.id ?? ""));
      setBlankFormVersionId(String(payload.blankFormVersion?.id ?? ""));
      setMaskId(String(payload.maskId ?? ""));
      setMaskVersionId(String(loadedVersion.id ?? nextMaskVersionId));
      const width = Number(payload.blankFormVersion?.pageWidth ?? 612);
      const height = Number(payload.blankFormVersion?.pageHeight ?? 792);
      setPageWidth(width); setPageHeight(height);
      setFields(loadedFields.length > 0 ? loadedFields : defaultFieldsForPage(width, height));
      setBlankPdfSrc(payload.blankPdfBase64 ? `data:application/pdf;base64,${String(payload.blankPdfBase64)}` : "");
      setBlankPageSrc(payload.blankPagePngBase64 ? `data:image/png;base64,${String(payload.blankPagePngBase64)}` : "");
      setDraftDirty(loadedVersion.status === "published");
      setTestConfirmed(false); setTestPdfSrc(""); setTestedPdfSha256(""); setTestedLayoutDigest("");
      setMessage(loadedVersion.status === "published" ? "已打开发布版本。修改后请另存草稿、重新测试并确认。" : "已恢复公司蒙板草稿，可以继续编辑。");
    });
  };

  const loadExistingAdminBlankForm = async (nextBlankFormId: string, nextBlankFormVersionId?: string, nextMaskId?: string) => {
    if (!nextBlankFormId || !isAdmin) return;
    await run(async () => {
      const payload = await postJson("loadAdminBlankForm", { blankFormId: nextBlankFormId, blankFormVersionId: nextBlankFormVersionId, maskId: nextMaskId });
      const width = Number(payload.blankFormVersion?.pageWidth ?? 612);
      const height = Number(payload.blankFormVersion?.pageHeight ?? 792);
      setBlankFormId(String(payload.blankForm?.id ?? nextBlankFormId));
      setBlankFormVersionId(String(payload.blankFormVersion?.id ?? ""));
      setMaskId(String(payload.maskId ?? ""));
      setMaskVersionId("");
      setPageWidth(width); setPageHeight(height); setFields(defaultFieldsForPage(width, height));
      setBlankPdfSrc(payload.blankPdfBase64 ? `data:application/pdf;base64,${String(payload.blankPdfBase64)}` : "");
      setBlankPageSrc(payload.blankPagePngBase64 ? `data:image/png;base64,${String(payload.blankPagePngBase64)}` : "");
      setDraftDirty(false); setTestConfirmed(false); setTestPdfSrc(""); setTestedPdfSha256(""); setTestedLayoutDigest("");
      setMessage("已打开公司表格。请放置字段框后保存草稿、测试并确认。");
    });
  };

  useEffect(() => {
    if (!enabled) return;
    if (initialMaskVersionId) void loadExistingAdminMask(initialMaskVersionId);
    else if (initialBlankFormId) void loadExistingAdminBlankForm(initialBlankFormId, initialBlankFormVersionId, initialMaskId);
    // The formal edit route intentionally loads one existing version once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMaskVersionId, initialBlankFormId, initialBlankFormVersionId, initialMaskId]);

  const updateField = (index: number, key: keyof MaskField, value: string) => {
    invalidateTestState();
    setFields((current) => current.map((field, fieldIndex) => fieldIndex === index ? { ...field, [key]: key === "type" || key === "fieldId" || key === "sourceFieldKey" || key === "label" ? value : Number(value) } : field));
  };

  const beginInteraction = (event: React.PointerEvent<HTMLElement>, index: number, mode: Interaction["mode"]) => {
    event.preventDefault(); event.stopPropagation();
    const rect = editorRef.current?.getBoundingClientRect();
    const field = fields[index];
    if (!rect || !field) return;
    setInteraction({ index, mode, startX: event.clientX, startY: event.clientY, startField: { ...field }, scaleX: pageWidth / rect.width, scaleY: pageHeight / rect.height });
  };

  const loadMemberDraft = async (nextCaseId: string, nextMaskVersionId: string) => {
    if (!nextCaseId || !nextMaskVersionId) {
      setMemberConsent(false);
      setMemberDraftPersisted(false);
      return;
    }
    await run(async () => {
      const result = await postJson("loadApplicationDraft", { caseId: nextCaseId, maskVersionId: nextMaskVersionId });
      const supplement = result.supplement as Record<string, unknown> | undefined;
      setMemberConsent(supplement?.["company_option.friends_consent"] === true);
      setMemberDraftPersisted(Boolean(result.persisted));
    });
  };

  if (!enabled) {
    return <main className="mx-auto max-w-3xl px-6 py-12"><h1 className="text-2xl font-semibold text-slate-950">保証会社申込書（試験切片）</h1><p className="mt-3 text-sm text-slate-600">この試験切片は現在無効です。既存の申込書経路は変更されません。</p></main>;
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="border-b border-slate-200 pb-6">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">受控 Preview/Staging · TASK-038</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{heading ?? "保证公司申请书最小闭环"}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">客户空白表格只在本经营主体内部使用。公司表格管理员制作蒙板，普通成员从案件预览并生成文件。普通成员不能进入蒙板编辑。</p>
      </header>
      {message && <p className="mt-5 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">{message}</p>}
      {error && <p className="mt-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{error}</p>}

      {isAdmin && <section className="mt-8 border-t border-slate-200 pt-6" aria-labelledby="admin-title">
        <h2 id="admin-title" className="text-xl font-semibold text-slate-950">公司表格管理员：在客户 PDF 上制作并发布蒙板</h2>
        {showUpload && <form className="mt-4 grid gap-4 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); void run(() => upload(event.currentTarget)); }}>
          <input type="hidden" name="blankFormId" value={blankFormId} />
          <label className="grid gap-2 text-sm text-slate-700">表格名称<input name="name" required className="rounded-md border border-slate-300 px-3 py-2" placeholder="测试申请书" /></label>
          <label className="grid gap-2 text-sm text-slate-700">客户空白 PDF<input name="file" required type="file" accept="application/pdf" className="rounded-md border border-slate-300 px-3 py-2" /></label>
          <label className="flex items-start gap-2 text-sm text-slate-700 md:col-span-2"><input name="blankFormDeclaration" value="on" required type="checkbox" className="mt-1" />このファイルが空白の PDF であり、本经营主体が業務で使用する権利を有することを確認します。</label>
          <p className="text-xs leading-5 text-slate-600 md:col-span-2">第一版仅支持一页、20 MB 以下、未加密且未设密码的空白 PDF。旋转页面、非标准裁切框、尺寸或结构异常的文件会在上传时拒绝；失败时请更换文件，不会一直停留在处理中。</p>
          <button className="w-fit rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white" type="submit">上传空白表格</button>
        </form>}
        {!showUpload && !maskId && <p className="mt-4 text-sm text-slate-600">请选择表格库中的版本后继续编辑。此处不会要求重新上传客户空白 PDF。</p>}
        {maskId && <div className="mt-6 border-t border-slate-200 pt-5">
          <p className="text-sm text-slate-600">表格版本：<code>{blankFormVersionId}</code> · 公司蒙板：<code>{maskId}</code></p>
          {blankPageSrc && <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <div ref={editorRef} className="relative mx-auto w-full max-w-[720px] overflow-hidden border border-slate-300 bg-slate-100" style={{ aspectRatio: `${pageWidth} / ${pageHeight}` }} aria-label="客户空白 PDF 与蒙板字段叠加校准区">
              <canvas ref={pageCanvasRef} className="absolute inset-0 h-full w-full" aria-label="客户空白 PDF 第 1 页固定坐标画布" />
              <div className="absolute inset-0">
                {fields.map((field, index) => <div key={field.fieldId} onPointerDown={(event) => beginInteraction(event, index, "move")} style={pdfFieldStyle(field, pageWidth, pageHeight)} className="absolute cursor-move border-2 border-blue-600 bg-blue-200/30 text-[10px] font-medium text-blue-900" aria-label={`${field.label}字段框，可拖动`}>
                  <span className="pointer-events-none absolute -top-5 left-0 whitespace-nowrap rounded bg-blue-700 px-1.5 py-0.5 text-white">{field.label}</span>
                  <button type="button" aria-label={`${field.label}调整大小`} onPointerDown={(event) => beginInteraction(event, index, "resize")} className="absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-se-resize rounded-full border border-blue-800 bg-white" />
                </div>)}
              </div>
            </div>
            <aside className="text-sm text-slate-600"><p className="font-medium text-slate-900">人工校准</p><p className="mt-2 leading-5">字段框与固定 PDF 页面画布使用同一套 PDF points 坐标。浏览器缩放只改变显示，不改变保存坐标。</p>{blankPdfSrc && <a className="mt-3 inline-block text-blue-700 underline" href={blankPdfSrc} target="_blank" rel="noreferrer">在新窗口查看客户空白 PDF</a>}</aside>
          </div>}
          <div className="mt-5 grid gap-4">
            {fields.map((field, index) => <fieldset key={field.fieldId} className="grid gap-3 border-b border-slate-100 pb-4 md:grid-cols-6"><legend className="sr-only">{field.label}</legend><label className="grid gap-1 text-xs text-slate-600 md:col-span-2">字段名<input value={field.label} onChange={(event) => updateField(index, "label", event.target.value)} className="rounded border border-slate-300 px-2 py-1.5 text-sm" /></label><label className="grid gap-1 text-xs text-slate-600">类型<select value={field.type} onChange={(event) => updateField(index, "type", event.target.value)} className="rounded border border-slate-300 px-2 py-1.5 text-sm"><option value="text">文本</option><option value="date">日期</option><option value="checkbox">复选框</option></select></label><label className="grid gap-1 text-xs text-slate-600 md:col-span-2">来源字段<input value={field.sourceFieldKey} onChange={(event) => updateField(index, "sourceFieldKey", event.target.value)} className="rounded border border-slate-300 px-2 py-1.5 text-sm" /></label><label className="grid gap-1 text-xs text-slate-600">X<input type="number" min="0" value={field.x} onChange={(event) => updateField(index, "x", event.target.value)} className="rounded border border-slate-300 px-2 py-1.5 text-sm" /></label><label className="grid gap-1 text-xs text-slate-600">Y<input type="number" min="0" value={field.y} onChange={(event) => updateField(index, "y", event.target.value)} className="rounded border border-slate-300 px-2 py-1.5 text-sm" /></label><label className="grid gap-1 text-xs text-slate-600">宽<input type="number" min="1" value={field.width} onChange={(event) => updateField(index, "width", event.target.value)} className="rounded border border-slate-300 px-2 py-1.5 text-sm" /></label><label className="grid gap-1 text-xs text-slate-600">高<input type="number" min="1" value={field.height} onChange={(event) => updateField(index, "height", event.target.value)} className="rounded border border-slate-300 px-2 py-1.5 text-sm" /></label></fieldset>)}
          </div>
          <div className="mt-5 flex flex-wrap items-end gap-3">
            <button type="button" className="rounded-md border border-slate-300 px-4 py-2 text-sm" onClick={() => void run(async () => {
              const result = await postJson("draft", { maskId, blankFormVersionId, fields });
              setMaskVersionId(String(result.maskVersion?.id ?? ""));
              setDraftDirty(false);
              setTestConfirmed(false);
              setTestedLayoutDigest("");
              setTestPdfSrc("");
              setTestedPdfSha256("");
              setMessage("蒙板草稿已保存。当前编辑内容尚未测试，请生成并查看测试 PDF。");
            })}>保存测试草稿</button>
            <label className="grid gap-1 text-xs text-slate-600">测试案件 ID<input value={testCaseId} onChange={(event) => { setTestCaseId(event.target.value); invalidateTestState(); }} className="rounded border border-slate-300 px-2 py-1.5 text-sm" /></label>
            <label className="grid gap-1 text-xs text-slate-600">测试复选框补充值<select value={testConsent ? "confirmed" : "unconfirmed"} onChange={(event) => { setTestConsent(event.target.value === "confirmed"); invalidateTestState(); }} className="rounded border border-slate-300 px-2 py-1.5 text-sm"><option value="unconfirmed">未確認</option><option value="confirmed">確認済み</option></select></label>
            <button type="button" disabled={!maskVersionId || !testCaseId || draftDirty} className="rounded-md border border-slate-300 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40" onClick={() => void run(async () => {
              const result = await postJson("test", { maskVersionId, caseId: testCaseId, supplement: { consent: testConsent } });
              setTestedPdfSha256(String(result.testPdfSha256 ?? ""));
              setTestedLayoutDigest(String(result.layoutDigest ?? ""));
              setTestPdfSrc(result.testPdfBase64 ? `data:application/pdf;base64,${String(result.testPdfBase64)}` : "");
              setTestConfirmed(false);
              setMessage("测试 PDF 已生成并显示。请人工确认位置后再允许发布。");
            })}>测试并显示 PDF</button>
            <button type="button" disabled={!testPdfSrc || !testedPdfSha256 || !testedLayoutDigest || testConfirmed || draftDirty} className="rounded-md border border-emerald-700 px-4 py-2 text-sm text-emerald-800 disabled:cursor-not-allowed disabled:opacity-40" onClick={() => void run(async () => { await postJson("confirmTest", { maskVersionId, testPdfSha256: testedPdfSha256 }); setTestConfirmed(true); setMessage("已记录管理员对测试 PDF 的明确确认，现在可以发布。"); })}>我已查看测试 PDF，确认位置正确</button>
            <button type="button" disabled={!maskVersionId || !testConfirmed || draftDirty} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40" onClick={() => void run(async () => { const result = await postJson("publish", { maskVersionId, layoutDigest: serializeMaskLayout(fields) }); setMaskVersionId(String(result.maskVersion?.id ?? maskVersionId)); setMessage("公司蒙板已发布，并以原子操作建立 exact 匹配。"); })}>发布公司蒙板</button>
            <button type="button" disabled={!maskVersionId} className="rounded-md border border-slate-300 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40" onClick={() => void run(async () => { await postJson("rollback", { maskId, maskVersionId }); setMessage("活动版本已回退到所选版本。"); })}>回退到此版本</button>
          </div>
          {draftDirty && <p className="mt-3 text-sm text-amber-700" role="status">当前编辑内容尚未测试。保存、生成测试 PDF 并确认后才能发布。</p>}
          {testPdfSrc && <div className="mt-5"><p className="text-sm font-medium text-slate-900">管理员可查看的测试 PDF</p><iframe title="蒙板测试 PDF" src={testPdfSrc} className="mt-2 h-[520px] w-full rounded border border-slate-200" /></div>}
        </div>}
      </section>}

      {!adminOnly && <section className="mt-10 border-t border-slate-200 pt-6" aria-labelledby="member-title">
        <h2 id="member-title" className="text-xl font-semibold text-slate-950">普通成员：从案件预览并生成文件</h2>
        <p className="mt-2 text-sm text-slate-600">普通成员不能移动坐标或进入蒙板编辑。案件事实只读；申请书专属补充值只属于本次申请书。</p>
        <div className="mt-4 grid gap-4 md:grid-cols-3"><label className="grid gap-2 text-sm text-slate-700">案件<select value={caseId} onChange={(event) => { const next = event.target.value; setCaseId(next); setConfirmationId(""); setPreviewSrc(""); setOutputId(""); void loadMemberDraft(next, memberMaskVersionId); }} className="rounded-md border border-slate-300 px-3 py-2"><option value="">案件を選択</option>{cases.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label className="grid gap-2 text-sm text-slate-700">已发布公司蒙板<select value={memberMaskVersionId} onChange={(event) => { const next = event.target.value; const selected = publishedVersions.find((item) => item.id === next); setMemberMaskVersionId(next); setMemberBlankFormVersionId(selected?.blankFormVersionId ?? ""); setConfirmationId(""); setPreviewSrc(""); setOutputId(""); void loadMemberDraft(caseId, next); }} className="rounded-md border border-slate-300 px-3 py-2"><option value="">蒙板を選択</option>{publishedVersions.map((item) => <option key={item.id} value={item.id}>v{item.versionNumber}（{item.id}）</option>)}</select></label><label className="flex items-center gap-2 self-end text-sm text-slate-700"><input type="checkbox" checked={memberConsent} onChange={(event) => { setMemberConsent(event.target.checked); setMemberDraftPersisted(false); setConfirmationId(""); setPreviewSrc(""); }} />本次申请书个人信息同意确认（确认済み）</label></div>
        <p className="mt-3 text-xs text-slate-500">补充项保存于当前案件的申请记录，可在同一已发布蒙板下再次打开；案件姓名、地址等事实只从案件读取。</p>
        {memberDraftPersisted && <p className="mt-2 text-xs text-emerald-700" role="status">已恢复该案件的申请记录补充项。</p>}
        <div className="mt-5 flex flex-wrap gap-3"><button type="button" disabled={!caseId || !memberMaskVersionId || !memberBlankFormVersionId} className="rounded-md border border-slate-300 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40" onClick={() => void run(async () => { const result = await postJson("preview", { caseId, blankFormVersionId: memberBlankFormVersionId, maskVersionId: memberMaskVersionId, supplement: { consent: memberConsent } }); setConfirmationId(String(result.confirmationId ?? "")); setOutputId(""); setPreviewSrc(result.previewPdfBase64 ? `data:application/pdf;base64,${String(result.previewPdfBase64)}` : ""); setMemberDraftPersisted(true); setMessage("预览已锁定案件、表格、蒙板、字段目录和本次补充值，可继续生成文件。") })}>锁定并显示预览</button><button type="button" disabled={!confirmationId} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40" onClick={() => void run(async () => { const result = await postJson("generate", { confirmationId }); setOutputId(String(result.outputId ?? "")); setMessage(`已生成文件：${String(result.outputId ?? "")}`) })}>确认并生成文件</button>{outputId && <a className="rounded-md border border-slate-300 px-4 py-2 text-sm" href={`/api/guarantee-g1-slice1/output/${encodeURIComponent(outputId)}?caseId=${encodeURIComponent(caseId)}`}>打开历史文件</a>}</div>
        {previewSrc && <iframe title="申请书预览" src={previewSrc} className="mt-6 h-[520px] w-full rounded border border-slate-200" />}
      </section>}
    </main>
  );
}
