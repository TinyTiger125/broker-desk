"use client";

import { useEffect, useRef, useState } from "react";
import {
  canvasDeltaToPdfDelta,
  movePdfField,
  pdfPointsToCanvasRect,
  resizePdfFieldFromBottomRight,
  serializeMaskLayout,
} from "@/lib/guarantee-slice1-coordinates.mjs";
import { getCaseFieldDefinition } from "@/lib/case-field-catalog";
import type { GuaranteeTestCaseSummary } from "@/lib/guarantee-test-case-summary";

type Props = {
  enabled: boolean;
  isAdmin: boolean;
  cases: GuaranteeTestCaseSummary[];
  publishedVersions: Array<{ id: string; versionNumber: number; blankFormVersionId: string; maskId: string }>;
  initialMaskVersionId?: string;
  initialBlankFormId?: string;
  initialBlankFormVersionId?: string;
  initialMaskId?: string;
  initialAdminContext?: InitialAdminContext;
  adminOnly?: boolean;
  showUpload?: boolean;
  heading?: string;
};
type FieldType = "text" | "date" | "checkbox";
export type MaskField = { fieldId: string; type: FieldType; sourceFieldKey: string; label: string; pageNumber: number; x: number; y: number; width: number; height: number };
export type InitialAdminContext = {
  status: "loaded" | "failed";
  versionStatus?: "draft" | "published";
  blankFormId?: string;
  blankFormVersionId?: string;
  maskId?: string;
  maskVersionId?: string;
  pageWidth?: number;
  pageHeight?: number;
  fields?: MaskField[];
  blankPdfBase64?: string;
  blankPagePngBase64?: string;
  errorMessage?: string;
};
type ApiPayload = Record<string, unknown> & { blankForm?: { id?: string }; blankFormVersion?: { id?: string; pageWidth?: number; pageHeight?: number }; maskVersion?: { id?: string; status?: string; testedLayoutDigest?: string; layoutSnapshot?: Record<string, unknown> }; confirmationId?: string; outputId?: string; blankPdfBase64?: string; blankPagePngBase64?: string; testPdfBase64?: string; testPdfSha256?: string; layoutDigest?: string; requestId?: string };
type Interaction = { index: number; mode: "move" | "resize"; startX: number; startY: number; startField: MaskField; scaleX: number; scaleY: number };
type GuaranteeRequestError = Error & { requestId?: string };
type AdminContextLoadResult = { status: "loaded" | "fallback" | "failed"; requestId?: string };
type AdminBlankFormLoadResult = { loaded: boolean; requestId?: string };
type PostJsonOptions = { signal?: AbortSignal; timeoutMs?: number };
type RecoveryContext = { signal: AbortSignal; isCurrent: () => boolean };

const ADMIN_MASK_CONTEXT_FALLBACK_ERRORS = new Set(["mask_version_not_found", "mask_draft_target_not_found"]);
const GUARANTEE_REQUEST_TIMEOUT_MS = 10_000;

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

function createClientRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return `client-${crypto.randomUUID()}`;
  return `client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function requestIdFromError(error: unknown) {
  return error instanceof Error && "requestId" in error && typeof error.requestId === "string" ? error.requestId : undefined;
}

async function postJson(action: string, body: Record<string, unknown>, options?: PostJsonOptions) {
  const controller = options?.timeoutMs ? new AbortController() : undefined;
  const clientRequestId = createClientRequestId();
  let timedOut = false;
  let timeoutId: number | undefined;
  let externalAbortHandler: (() => void) | undefined;
  if (controller && options?.signal) {
    externalAbortHandler = () => controller.abort();
    if (options.signal.aborted) controller.abort();
    else options.signal.addEventListener("abort", externalAbortHandler, { once: true });
  }
  if (controller && options?.timeoutMs) {
    timeoutId = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, options.timeoutMs);
  }
  const signal = controller?.signal ?? options?.signal;
  try {
    const response = await fetch("/api/guarantee-g1-slice1", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ...body }), ...(signal ? { signal } : {}) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const code = response.status === 429 || payload.error === "rate_limited" ? "rate_limited" : String(payload.error ?? "request_failed");
      const requestError = new Error(code) as GuaranteeRequestError;
      requestError.requestId = typeof payload.requestId === "string" ? payload.requestId : clientRequestId;
      throw requestError;
    }
    return payload as ApiPayload;
  } catch (caught) {
    if (timedOut || (caught instanceof Error && caught.name === "AbortError")) {
      const abortError = new Error(timedOut ? "guarantee_request_timeout" : "guarantee_request_cancelled") as GuaranteeRequestError;
      abortError.requestId = clientRequestId;
      throw abortError;
    }
    if (caught instanceof Error) {
      const requestError = caught as GuaranteeRequestError;
      requestError.requestId ??= clientRequestId;
      throw requestError;
    }
    const requestError = new Error("request_failed") as GuaranteeRequestError;
    requestError.requestId = clientRequestId;
    throw requestError;
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    if (controller && options?.signal && externalAbortHandler) options.signal.removeEventListener("abort", externalAbortHandler);
  }
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
  mask_test_version_not_found: "测试草稿不存在或已不是草稿，请重新打开表格后重试。",
  mask_test_blank_form_not_ready: "客户空白 PDF 尚未准备好，草稿已保留，请稍后重试。",
  mask_test_case_not_accessible: "测试案件不可用。请选择当前经营主体内自己有权查看的案件；草稿已保存，尚未发布，可以重试。",
  mask_test_pdf_generation_failed: "PDF 测试生成失败。草稿已保存，尚未发布，请重试。",
  guarantee_pdf_font_unavailable: "PDF 测试生成失败：日文字体不可用。草稿已保存，尚未发布，请稍后重试。",
  blank_form_unavailable: "客户空白 PDF 暂时不可用。草稿已保存，尚未发布，请重试。",
  rate_limited: "请求较多，请稍后重试。",
  guarantee_request_timeout: "请求超时，请稍后重试。",
  guarantee_request_cancelled: "请求已取消，请重试。",
  request_failed: "请求未完成，请重试。",
};

function explainGuaranteeError(error: unknown) {
  const code = error instanceof Error ? error.message : String(error);
  const message = GUARANTEE_ERROR_MESSAGES[code] ?? "操作未完成，请重试。";
  const requestId = error instanceof Error && "requestId" in error && typeof error.requestId === "string" ? error.requestId : "";
  return requestId ? `${message}（请求编号：${requestId}）` : message;
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

function testLayoutError(fields: MaskField[], pageWidth: number, pageHeight: number) {
  if (!Number.isFinite(pageWidth) || !Number.isFinite(pageHeight) || pageWidth <= 0 || pageHeight <= 0) {
    return "客户空白 PDF 页面尺寸无效，请重新打开表格后重试。";
  }
  if (fields.length !== 3) {
    return "请配置文本、日期和复选框三个测试字段后再生成 PDF。";
  }
  const allowedTypes = new Set<FieldType>(["text", "date", "checkbox"]);
  const textValueKinds = new Set(["text", "textarea", "phone", "email", "postal_code", "money_yen", "money_man_yen", "number", "duration_years", "select", "id_number"]);
  const missingType = (["text", "date", "checkbox"] as const).find((type) => !fields.some((field) => field.type === type));
  if (missingType) return `请各配置一个文本、日期和复选框字段；当前缺少“${missingType === "text" ? "文本" : missingType === "date" ? "日期" : "复选框"}”。`;
  for (const field of fields) {
    const fieldName = field.label || field.fieldId;
    if (!allowedTypes.has(field.type)) return `字段“${fieldName}”的类型无效，请选择文本、日期或复选框。`;
    if (!field.sourceFieldKey.trim()) return `字段“${fieldName}”尚未绑定案件字段，请先完成绑定。`;
    const definition = getCaseFieldDefinition(field.sourceFieldKey.trim());
    if (!definition) return `字段“${fieldName}”绑定的案件字段不存在，请重新选择有效字段。`;
    if (field.type === "date" && definition.valueKind !== "date") return `字段“${fieldName}”是日期字段，必须绑定日期类型的案件字段。`;
    if (field.type === "checkbox" && definition.valueKind !== "boolean") return `字段“${fieldName}”是复选框，必须绑定布尔类型的案件字段。`;
    if (field.type === "text" && !textValueKinds.has(definition.valueKind)) return `字段“${fieldName}”是文本字段，不能绑定日期或布尔类型的案件字段。`;
    if (field.pageNumber !== 1) return `字段“${fieldName}”必须放在第 1 页。`;
    if (![field.x, field.y, field.width, field.height].every(Number.isFinite)) return `字段“${fieldName}”的坐标或尺寸无效。`;
    if (field.width <= 0 || field.height <= 0) return `字段“${fieldName}”的宽度和高度必须大于 0。`;
    if (field.x < 0 || field.y < 0 || field.x + field.width > pageWidth || field.y + field.height > pageHeight) {
      return `字段“${fieldName}”超出客户空白 PDF 页面范围，请调整位置或尺寸。`;
    }
  }
  return "";
}

export function GuaranteeSlice1Client({ enabled, isAdmin, cases, publishedVersions, initialMaskVersionId, initialBlankFormId, initialBlankFormVersionId, initialMaskId, initialAdminContext, adminOnly = false, showUpload = true, heading }: Props) {
  // Legacy contract marker: the editor no longer asks an administrator to type or copy an internal case ID (当前可访问案件 ID).
  const hasInitialAdminContext = Boolean(initialAdminContext);
  const initialLoadedContext = initialAdminContext?.status === "loaded" ? initialAdminContext : undefined;
  const initialBlankPageSrc = initialLoadedContext?.blankPagePngBase64 ? `data:image/png;base64,${initialLoadedContext.blankPagePngBase64}` : "";
  const initialContextFields = initialLoadedContext?.fields && initialLoadedContext.fields.length > 0 ? initialLoadedContext.fields : initialFields;
  const restoreContextRequested = Boolean(enabled && isAdmin && (initialMaskVersionId || initialBlankFormId));
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [blankFormVersionId, setBlankFormVersionId] = useState(initialLoadedContext?.blankFormVersionId ?? initialBlankFormVersionId ?? "");
  const [blankFormId, setBlankFormId] = useState(initialLoadedContext?.blankFormId ?? initialBlankFormId ?? "");
  const [maskId, setMaskId] = useState(initialLoadedContext?.maskId ?? initialMaskId ?? "");
  const [maskVersionId, setMaskVersionId] = useState(initialLoadedContext?.maskVersionId ?? initialMaskVersionId ?? "");
  const [caseId, setCaseId] = useState("");
  const [memberMaskVersionId, setMemberMaskVersionId] = useState("");
  const [memberBlankFormVersionId, setMemberBlankFormVersionId] = useState("");
  const [testCaseId, setTestCaseId] = useState("");
  const [confirmationId, setConfirmationId] = useState("");
  const [outputId, setOutputId] = useState("");
  const [previewSrc, setPreviewSrc] = useState("");
  const [blankPdfSrc, setBlankPdfSrc] = useState("");
  const [blankPageSrc, setBlankPageSrc] = useState(initialBlankPageSrc);
  const [testPdfSrc, setTestPdfSrc] = useState("");
  const [testedPdfSha256, setTestedPdfSha256] = useState("");
  const [testConfirmed, setTestConfirmed] = useState(false);
  const [draftDirty, setDraftDirty] = useState(initialLoadedContext?.versionStatus === "published");
  const [testedLayoutDigest, setTestedLayoutDigest] = useState("");
  const [loadingExistingContext, setLoadingExistingContext] = useState(Boolean(!hasInitialAdminContext && restoreContextRequested));
  const [existingContextError, setExistingContextError] = useState(initialAdminContext?.status === "failed" ? initialAdminContext.errorMessage ?? "表格恢复失败，请稍后重试。" : "");
  const [existingContextRetry, setExistingContextRetry] = useState(0);
  const [testConsent, setTestConsent] = useState(false);
  const [memberConsent, setMemberConsent] = useState(false);
  const [memberDraftPersisted, setMemberDraftPersisted] = useState(false);
  const [pageWidth, setPageWidth] = useState(initialLoadedContext?.pageWidth ?? 612);
  const [pageHeight, setPageHeight] = useState(initialLoadedContext?.pageHeight ?? 792);
  const [fields, setFields] = useState<MaskField[]>(initialContextFields);
  const [interaction, setInteraction] = useState<Interaction>();
  const editorRef = useRef<HTMLDivElement>(null);
  const pageCanvasRef = useRef<HTMLCanvasElement>(null);

  const invalidateTestResult = () => {
    setTestConfirmed(false);
    setTestedLayoutDigest("");
    setTestPdfSrc("");
    setTestedPdfSha256("");
    setError("");
    setMessage("测试条件已变化，请重新生成并确认测试 PDF。");
  };

  const invalidateTestState = () => {
    setDraftDirty(true);
    invalidateTestResult();
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

  const run = async (operation: () => Promise<void>, onError?: (caught: unknown) => void) => {
    setError(""); setMessage("");
    try { await operation(); } catch (caught) { onError?.(caught); setError(explainGuaranteeError(caught)); }
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

  const loadExistingAdminMask = async (nextMaskVersionId: string, recoveryContext: RecoveryContext): Promise<AdminContextLoadResult> => {
    if (!nextMaskVersionId || !isAdmin) return { status: "failed" };
    let loaded = false;
    let errorCode = "";
    let requestId: string | undefined;
    try {
      const payload = await postJson("loadAdminMask", { maskVersionId: nextMaskVersionId }, { signal: recoveryContext.signal, timeoutMs: GUARANTEE_REQUEST_TIMEOUT_MS });
      if (!recoveryContext.isCurrent()) return { status: "failed" };
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
      loaded = true;
    } catch (caught) {
      if (!recoveryContext.isCurrent()) return { status: "failed" };
      errorCode = caught instanceof Error ? caught.message : "";
      requestId = requestIdFromError(caught);
    }
    if (loaded) return { status: "loaded" };
    return { status: ADMIN_MASK_CONTEXT_FALLBACK_ERRORS.has(errorCode) ? "fallback" : "failed", requestId };
  };

  const loadExistingAdminBlankForm = async (nextBlankFormId: string, nextBlankFormVersionId: string | undefined, nextMaskId: string | undefined, recoveryContext: RecoveryContext): Promise<AdminBlankFormLoadResult> => {
    if (!nextBlankFormId || !isAdmin) return { loaded: false };
    let loaded = false;
    let requestId: string | undefined;
    try {
      const payload = await postJson("loadAdminBlankForm", { blankFormId: nextBlankFormId, blankFormVersionId: nextBlankFormVersionId, maskId: nextMaskId }, { signal: recoveryContext.signal, timeoutMs: GUARANTEE_REQUEST_TIMEOUT_MS });
      if (!recoveryContext.isCurrent()) return { loaded: false };
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
      loaded = true;
    } catch (caught) {
      if (!recoveryContext.isCurrent()) return { loaded: false };
      requestId = requestIdFromError(caught);
    }
    return { loaded, requestId };
  };

  const recoveryGenerationRef = useRef(0);

  useEffect(() => {
    if (!enabled || !isAdmin || (hasInitialAdminContext && existingContextRetry === 0)) return;
    const generation = recoveryGenerationRef.current + 1;
    recoveryGenerationRef.current = generation;
    const controller = new AbortController();
    let cancelled = false;
    const isCurrentRecovery = () => !cancelled && recoveryGenerationRef.current === generation;
    const recoveryContext: RecoveryContext = { signal: controller.signal, isCurrent: isCurrentRecovery };
    setLoadingExistingContext(true);
    setExistingContextError("");
    void (async () => {
      let loaded = false;
      let failureRequestId: string | undefined;
      if (initialMaskVersionId) {
        const result = await loadExistingAdminMask(initialMaskVersionId, recoveryContext);
        if (!isCurrentRecovery()) return;
        if (result.status === "loaded") loaded = true;
        if (result.status === "fallback" && initialBlankFormId) {
          const fallback = await loadExistingAdminBlankForm(initialBlankFormId, initialBlankFormVersionId, initialMaskId, recoveryContext);
          if (!isCurrentRecovery()) return;
          loaded = fallback.loaded;
          failureRequestId = fallback.requestId ?? result.requestId;
        } else if (result.status === "failed") {
          failureRequestId = result.requestId;
        }
      } else if (initialBlankFormId) {
        const result = await loadExistingAdminBlankForm(initialBlankFormId, initialBlankFormVersionId, initialMaskId, recoveryContext);
        if (!isCurrentRecovery()) return;
        loaded = result.loaded;
        failureRequestId = result.requestId;
      }
      if (cancelled) return;
      if (!loaded && (initialMaskVersionId || initialBlankFormId)) {
        const requestSuffix = failureRequestId ? `（请求编号：${failureRequestId}）` : "";
        setExistingContextError(`表格恢复失败，请稍后重试。草稿已保留，当前没有可编辑内容，发布仍不可用。${requestSuffix}`);
      }
      setLoadingExistingContext(false);
    })();
    return () => {
      cancelled = true;
      controller.abort();
      if (recoveryGenerationRef.current === generation) recoveryGenerationRef.current += 1;
    };
    // The formal edit route intentionally loads one existing version once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMaskVersionId, initialBlankFormId, initialBlankFormVersionId, initialMaskId, existingContextRetry, hasInitialAdminContext]);

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

  const selectedTestCase = cases.find((item) => item.id === testCaseId);
  const testBlockReasons = [
    !maskVersionId ? "请先保存当前蒙板草稿，再生成测试 PDF。" : "",
    draftDirty ? "当前编辑内容存在未保存修改。请先保存当前修改，再生成测试 PDF。" : "",
    !testCaseId ? "请选择一条当前有权访问的测试案件。" : "",
    testCaseId && !selectedTestCase ? "所选测试案件当前不可用，请重新选择当前有权访问的案件。" : "",
    !blankPageSrc ? "客户空白 PDF 校准预览不可用，请重新打开表格后重试。" : "",
    testLayoutError(fields, pageWidth, pageHeight),
  ].filter(Boolean);

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
        {!showUpload && loadingExistingContext && <p className="mt-4 text-sm text-slate-600" role="status">正在恢复已保存的表格版本，请稍候。</p>}
        {!showUpload && existingContextError && <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert"><p>{existingContextError}</p><div className="mt-3 flex flex-wrap gap-3"><button type="button" className="rounded border border-red-300 bg-white px-3 py-1.5 font-medium text-red-800" onClick={() => { setError(""); setExistingContextError(""); if (initialAdminContext?.status === "failed" && typeof window !== "undefined") { window.location.reload(); return; } setExistingContextRetry((value) => value + 1); }}>重新加载表格</button><a href="/guarantee-forms" className="rounded border border-red-300 bg-white px-3 py-1.5 font-medium text-red-800">返回公司表格库</a></div></div>}
        {!showUpload && !maskId && !loadingExistingContext && !existingContextError && !initialBlankFormId && !initialMaskVersionId && <p className="mt-4 text-sm text-slate-600">请选择表格库中的版本后继续编辑。此处不会要求重新上传客户空白 PDF。</p>}
        {maskId && !loadingExistingContext && !existingContextError && <div className="mt-6 border-t border-slate-200 pt-5">
          <p className="text-sm text-slate-600">表格版本：<code>{blankFormVersionId}</code> · 公司蒙板：<code>{maskId}</code></p>
          {blankPageSrc && <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <div ref={editorRef} className="relative mx-auto w-full max-w-[720px] overflow-hidden border border-slate-300 bg-slate-100" style={{ aspectRatio: `${pageWidth} / ${pageHeight}` }} aria-label="客户空白 PDF 与蒙板字段叠加校准区">
              <img src={blankPageSrc} alt="客户空白 PDF 第 1 页" className="absolute inset-0 h-full w-full object-fill" />
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
            <label className="grid gap-1 text-xs text-slate-600">测试案件{cases.length > 0 ? <select value={testCaseId} onChange={(event) => { setTestCaseId(event.target.value); invalidateTestResult(); }} className="rounded border border-slate-300 px-2 py-1.5 text-sm"><option value="">选择当前可访问案件</option>{cases.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.customerDisplayName}</option>)}</select> : <span className="rounded border border-dashed border-slate-300 bg-slate-50 px-2 py-2 text-sm text-slate-500">当前没有可访问案件</span>}</label>
            <label className="grid gap-1 text-xs text-slate-600">测试复选框补充值<select value={testConsent ? "confirmed" : "unconfirmed"} onChange={(event) => { setTestConsent(event.target.value === "confirmed"); invalidateTestResult(); }} className="rounded border border-slate-300 px-2 py-1.5 text-sm"><option value="unconfirmed">未確認</option><option value="confirmed">確認済み</option></select></label>
            <button type="button" disabled={testBlockReasons.length > 0} className="rounded-md border border-slate-300 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40" onClick={() => void run(async () => {
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
          {cases.length === 0 && <p className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800" role="status">当前没有可用于测试的案件。请先准备一条有权访问的案件资料。本页面不要求输入或复制内部案件编号。</p>}
          {testBlockReasons.length > 0 && <div className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800" role="status" aria-label="测试前置条件"><p className="font-medium">尚不能生成测试 PDF：</p><ul className="mt-1 list-disc pl-5">{testBlockReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></div>}
          {selectedTestCase && <section className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4" aria-labelledby="test-case-summary-title"><h3 id="test-case-summary-title" className="text-sm font-semibold text-slate-900">已选择测试案件</h3><dl className="mt-3 grid gap-x-5 gap-y-2 text-sm sm:grid-cols-2"><div><dt className="text-slate-500">案件名称</dt><dd className="font-medium text-slate-900">{selectedTestCase.title}</dd></div><div><dt className="text-slate-500">客户显示名</dt><dd className="font-medium text-slate-900">{selectedTestCase.customerDisplayName}</dd></div><div><dt className="text-slate-500">管理编号</dt><dd className="font-medium text-slate-900">{selectedTestCase.managementNumber}</dd></div><div><dt className="text-slate-500">文本字段</dt><dd className="font-medium text-slate-900">{selectedTestCase.textValue}</dd></div><div><dt className="text-slate-500">日期字段</dt><dd className="font-medium text-slate-900">{selectedTestCase.dateValue}</dd></div><div><dt className="text-slate-500">复选框（严格布尔值）</dt><dd className="font-medium text-slate-900">{testConsent ? "true · 確認済み" : "false · 未確認"}</dd></div></dl><p className="mt-3 text-xs text-slate-500">测试只读取你当前有权访问的案件资料；复选框值是本次测试补充数据，不会改写案件事实。</p></section>}
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
