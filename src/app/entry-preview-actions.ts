"use server";

import { requireTenantSession } from "@/lib/tenant-session";
import { getLocale } from "@/lib/locale";
import type { Locale } from "@/lib/locale";
import { validateEntryUploads } from "@/lib/entry-upload-validation";
import { entryFileKey, type EntryPreviewCandidate, type EntryPreviewState } from "@/lib/entry-preview";
import { readIdentityDocumentWithOpenAi } from "@/lib/openai-identity-reader";
import { readObjectDocumentWithOpenAi } from "@/lib/openai-object-reader";
import { selectPrimaryIdentityReaderCandidates } from "@/lib/identity-reader-attribution";
import { selectSingleObjectReaderCandidates } from "@/lib/object-reader-attribution";
import { customerIdentityFieldKey, customerIdentityFieldLabel, normalizeCustomerGenderValue, normalizeCustomerIdentityValue } from "@/lib/customer-identity-field-catalog";
import { toObjectRecordFieldKey } from "@/lib/object-import-contract";
import { normalizeObjectReaderCandidateValue } from "@/lib/object-import-processor-adapter";
import { OBJECT_READER_FIELD_LABELS } from "@/lib/object-reader-mapping";
import { readExcelWorkbook } from "@/lib/excel-workbook";
import { extractInputFileFromWorkbook } from "@/lib/input-file-extractor";
import { CASE_FIELD_KEY_SET, getCaseFieldLabel } from "@/lib/case-field-catalog";
import { createHash } from "node:crypto";
import { signEntryPreviewProof } from "@/lib/entry-preview-proof";
import { RemoteDocumentReaderError } from "@/lib/identity-reader-contract";
import { parseEntryUploadStagedRefs, readEntryUploadStagedFiles } from "@/lib/entry-upload-staging";

const PROPERTY_NUMERIC_PREVIEW_KEYS = new Set(["sizeSqm", "listingPrice", "listingRent", "listingCommonFee", "managementFee", "repairFee"]);

function hasCustomerIdentityAnchor(fields: Array<{ fieldKey: string; value: string; uncertainty: "clear" | "unclear" | "conflict" | "not_found" }>) {
  return fields.some((field) =>
    (field.fieldKey === "applicant.name"
      || field.fieldKey === "applicant.nameLatin"
      || field.fieldKey === "applicant.nameKanji"
      || field.fieldKey === "applicant.nameKatakana"
      || field.fieldKey === "applicant.birthDate"
      || field.fieldKey === "applicant.gender")
    && field.value.trim()
    && field.uncertainty !== "not_found",
  );
}

function validPropertyNumericPreview(key: string, value: string): boolean {
  if (!PROPERTY_NUMERIC_PREVIEW_KEYS.has(key)) return true;
  if (!/^\d+(?:\.\d+)?$/.test(value)) return false;
  const number = Number(value);
  if (key === "sizeSqm") return Number.isFinite(number) && number > 0 && number <= 1_000_000;
  return Number.isSafeInteger(number) && number <= 2_147_483_647 && (key === "listingPrice" ? number > 0 : number >= 0);
}

function readerFailureMessage(locale: Locale, errorCode: string) {
  if (locale === "zh") {
    if (errorCode === "remote_document_reader_file_upload_failed") return "资料已保留，但无法上传到临时读取服务。尚未创建档案，请重试或手动填写。";
    if (errorCode === "remote_document_reader_file_cleanup_failed") return "读取完成后，临时文件清理未得到确认。尚未创建档案，请重试；如仍失败请联系管理员。";
    if (errorCode === "remote_document_reader_timeout") return "资料读取超时。原件未丢失，尚未创建档案，请重试或手动填写。";
    if (errorCode === "remote_document_reader_http_error" || errorCode === "remote_document_reader_request_failed") return "远程资料读取服务失败。原件未丢失，尚未创建档案，请重试或手动填写。";
  }
  if (locale === "ko") {
    if (errorCode === "remote_document_reader_file_upload_failed") return "자료는 보존되었지만 임시 읽기 서비스로 업로드하지 못했습니다. 기록은 만들지 않았습니다. 다시 시도하거나 직접 입력해 주세요.";
    if (errorCode === "remote_document_reader_file_cleanup_failed") return "읽기 후 임시 파일 삭제를 확인하지 못했습니다. 기록은 만들지 않았습니다. 다시 시도하고 계속되면 관리자에게 문의해 주세요.";
    if (errorCode === "remote_document_reader_timeout") return "자료 읽기 시간이 초과되었습니다. 원본은 보존되며 기록은 만들지 않았습니다. 다시 시도하거나 직접 입력해 주세요.";
    if (errorCode === "remote_document_reader_http_error" || errorCode === "remote_document_reader_request_failed") return "원격 자료 읽기 서비스에 실패했습니다. 원본은 보존되며 기록은 만들지 않았습니다. 다시 시도하거나 직접 입력해 주세요.";
  }
  if (errorCode === "remote_document_reader_file_upload_failed") return "資料は保持されていますが、一時読み取りサービスへのアップロードに失敗しました。記録はまだ作成していません。再試行するか手動で入力してください。";
  if (errorCode === "remote_document_reader_file_cleanup_failed") return "読み取り後の一時ファイル削除を確認できませんでした。記録はまだ作成していません。再試行し、続く場合は管理者に連絡してください。";
  if (errorCode === "remote_document_reader_timeout") return "資料の読み取りがタイムアウトしました。原本は保持され、記録はまだ作成していません。再試行するか手動で入力してください。";
  if (errorCode === "remote_document_reader_http_error" || errorCode === "remote_document_reader_request_failed") return "遠隔読み取りサービスに失敗しました。原本は保持され、記録はまだ作成していません。再試行するか手動で入力してください。";
  return undefined;
}

/** Ephemeral suggestions only: this action never creates a record, job, or attachment. */
export async function previewEntryDocumentsAction(formData: FormData): Promise<EntryPreviewState> {
  const session = await requireTenantSession({ permission: "source.upload" });
  const locale = await getLocale();
  const kind = String(formData.get("previewKind") ?? "");
  const caseContext = formData.get("previewContext") === "case";
  const rawFiles = formData.getAll("uploadFile").filter((value): value is File => value instanceof File && value.size > 0);
  let files = rawFiles;
  try {
    const refs = parseEntryUploadStagedRefs(formData.get("entryStagedFiles"));
    if (refs.length) {
      const staged = await readEntryUploadStagedFiles({ refs, tenantId: session.tenant.id, userId: session.user.id });
      files = [...rawFiles, ...staged.files];
    }
  } catch {
    return { status: "error", candidates: [], readFileKeys: [], errorCode: "entry_upload_staging_reference_invalid", message: locale === "zh" ? "临时上传引用已失效或不匹配。请重新选择资料；尚未创建档案。" : locale === "ko" ? "임시 업로드 참조가 만료되었거나 일치하지 않습니다. 자료를 다시 선택해 주세요. 기록은 생성되지 않았습니다." : "一時アップロードの参照が失効したか一致しません。資料を選び直してください。記録はまだ作成していません。" };
  }
  const candidates: EntryPreviewCandidate[] = [];
  const readFileKeys: string[] = [];
  const readProofs: Record<string, string> = {};
  const invalid = locale === "zh" ? "请选择有效的 PDF、PNG、JPEG 或单独一份 XLSX。尚未创建档案。" : locale === "ko" ? "유효한 PDF, PNG, JPEG 또는 XLSX 한 개를 선택해 주세요. 아직 기록을 만들지 않았습니다." : "有効な PDF・PNG・JPEG、または XLSX を単独で選択してください。記録はまだ作成されていません。";
  if (new Set(files.map(entryFileKey)).size !== files.length) return { status: "error", candidates, readFileKeys, message: locale === "zh" ? "本次资料中存在同名且同大小的文件，请重命名后重新选择。尚未读取或创建档案。" : locale === "ko" ? "이름과 크기가 같은 파일이 있습니다. 이름을 바꾸고 다시 선택해 주세요. 읽기나 기록 생성은 시작되지 않았습니다." : "同名・同サイズのファイルがあります。名前を変更して選び直してください。読取や記録作成はまだ行っていません。" };
  if (!["customer", "property"].includes(kind) || files.length === 0 || !(await validateEntryUploads(files))) return { status: "error", candidates, readFileKeys, message: invalid };
  let failed = false;
  let failureCode: string | undefined;
  for (const file of files) {
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      let fields: Array<{ fieldKey: string; value: string; pageNumber?: number; sourceText?: string; uncertainty: "clear" | "unclear" | "conflict" | "not_found" }>;
      if (file.name.toLowerCase().endsWith(".xlsx")) {
        const extracted = extractInputFileFromWorkbook(await readExcelWorkbook(buffer), file.name);
        fields = extracted.fields.map((field) => ({ fieldKey: field.fieldKey, value: field.normalizedValue || field.value, pageNumber: field.sourcePageNumber, sourceText: field.sourceText || [field.sourceSheet, field.sourceCell || field.sourceRange].filter(Boolean).join(" / "), uncertainty: field.uncertainty ?? "unclear" }));
      } else if (kind === "customer") {
        const result = await readIdentityDocumentWithOpenAi({ buffer, filename: file.name, scope: "customer" });
        // Keep the supported customer document list closed. An unclassified
        // image may still be archived for human inspection, but its model
        // fields must never silently become formal customer values.
        const selected = selectPrimaryIdentityReaderCandidates(result.candidates, { scope: "customer" }).candidates;
        // An address/contact-only response is not enough to identify the
        // customer. This also fails closed when vision misses the printed
        // marker on an unsupported card: never surface a plausible address as
        // a customer field without a holder identity anchor.
        fields = result.documentType === "unknown_identity_scan" || !hasCustomerIdentityAnchor(selected)
          ? []
          : selected;
      } else {
        const result = await readObjectDocumentWithOpenAi({ buffer, filename: file.name });
        fields = selectSingleObjectReaderCandidates(result.candidates).candidates;
      }
      for (const [index, field] of fields.entries()) {
        if (!field.value.trim() || field.uncertainty === "not_found") continue;
        let key: string;
        let label: string;
        let value: string;
        let uncertainty: EntryPreviewCandidate["uncertainty"] = field.uncertainty;
        if (caseContext) {
          if (!CASE_FIELD_KEY_SET.has(field.fieldKey)) continue;
          key = field.fieldKey;
          label = getCaseFieldLabel(key);
          value = normalizeObjectReaderCandidateValue(field.fieldKey, field.value, field.uncertainty).value;
        } else if (kind === "customer") {
          const customerKey = customerIdentityFieldKey(field.fieldKey);
          if (!customerKey) continue;
          key = customerKey;
          label = customerIdentityFieldLabel(field.fieldKey);
          value = normalizeCustomerIdentityValue(customerKey, field.value);
          if (customerKey === "gender" && !normalizeCustomerGenderValue(field.value)) {
            // Contradictory/unknown gender evidence is review-only and must
            // never qualify for automatic form persistence.
            uncertainty = uncertainty === "conflict" ? "conflict" : "unclear";
          }
        } else {
          try { key = toObjectRecordFieldKey("property", field.fieldKey); } catch { continue; }
          label = OBJECT_READER_FIELD_LABELS[field.fieldKey] ?? key;
          const normalized = normalizeObjectReaderCandidateValue(field.fieldKey, field.value, field.uncertainty);
          value = normalized.value;
          uncertainty = normalized.uncertainty;
          // An invalid number would appear accepted while an HTML number input submits an empty value.
          if (!validPropertyNumericPreview(key, value)) continue;
        }
        candidates.push({
          id: `${entryFileKey(file)}:${index}`,
          key,
          sourceKey: field.fieldKey,
          label,
          value,
          ...(kind === "customer" && value !== field.value ? { rawValue: field.value } : {}),
          fileName: file.name,
          pageNumber: field.pageNumber,
          sourceText: field.sourceText,
          uncertainty,
        });
      }
      readFileKeys.push(entryFileKey(file));
      readProofs[entryFileKey(file)] = signEntryPreviewProof({ tenantId: session.tenant.id, userId: session.user.id, fileKey: entryFileKey(file), digest: createHash("sha256").update(buffer).digest("hex"), kind: kind as "customer" | "property", context: caseContext ? "case" : "entry", candidates: candidates.filter((candidate) => candidate.id.startsWith(`${entryFileKey(file)}:`)) });
    } catch (error) {
      failed = true;
      if (error instanceof RemoteDocumentReaderError) failureCode ??= `remote_document_reader_${error.code}`;
    }
  }
  // Multiple sources may disagree; preserve all alternatives for explicit review.
  for (const candidate of candidates) {
    if (candidates.some((other) => other.key === candidate.key && other.value !== candidate.value)) candidate.uncertainty = "conflict";
  }
  const message = failed
    ? (failureCode ? readerFailureMessage(locale, failureCode) : undefined) ?? (locale === "zh" ? "部分或全部资料未能读取。已完成的候选保留；未创建档案，可重试失败资料或继续手动填写。" : locale === "ko" ? "일부 자료를 읽지 못했습니다. 완료된 후보는 보존되며 기록은 생성되지 않았습니다. 실패한 자료를 다시 읽거나 직접 입력하세요." : "一部の資料を読み取れませんでした。完了した候補は保持され、記録はまだ作成されていません。失敗した資料を再試行するか手入力してください。")
    : candidates.length === 0 ? locale === "zh" ? "没有可确认的现有字段候选，或资料对象归属不明确。请手动填写；原件将在最终保存时归档。" : locale === "ko" ? "확인 가능한 기존 항목이 없거나 대상이 불명확합니다. 직접 입력해 주세요. 원본은 최종 저장 시 보관됩니다." : "確認できる既存項目がないか、対象が不明確です。手入力してください。原本は最終保存時に保管します。" : undefined;
  return { status: failed ? "error" : "ready", candidates, readFileKeys, readProofs, ...(failureCode ? { errorCode: failureCode } : {}), message };
}
