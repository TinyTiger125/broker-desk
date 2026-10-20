"use server";

import { requireTenantSession } from "@/lib/tenant-session";
import { getLocale } from "@/lib/locale";
import { validateEntryUploads } from "@/lib/entry-upload-validation";
import { entryFileKey, type EntryPreviewCandidate, type EntryPreviewState } from "@/lib/entry-preview";
import { readIdentityDocumentWithOpenAi } from "@/lib/openai-identity-reader";
import { readObjectDocumentWithOpenAi } from "@/lib/openai-object-reader";
import { selectPrimaryIdentityReaderCandidates } from "@/lib/identity-reader-attribution";
import { selectSingleObjectReaderCandidates } from "@/lib/object-reader-attribution";
import { customerIdentityFieldKey, customerIdentityFieldLabel, normalizeCustomerIdentityValue } from "@/lib/customer-identity-field-catalog";
import { toObjectRecordFieldKey } from "@/lib/object-import-contract";
import { normalizeObjectReaderCandidateValue } from "@/lib/object-import-processor-adapter";
import { OBJECT_READER_FIELD_LABELS } from "@/lib/object-reader-mapping";
import { readExcelWorkbook } from "@/lib/excel-workbook";
import { extractInputFileFromWorkbook } from "@/lib/input-file-extractor";
import { CASE_FIELD_KEY_SET, getCaseFieldLabel } from "@/lib/case-field-catalog";
import { createHash } from "node:crypto";
import { signEntryPreviewProof } from "@/lib/entry-preview-proof";

const PROPERTY_NUMERIC_PREVIEW_KEYS = new Set(["sizeSqm", "listingPrice", "listingRent", "listingCommonFee", "managementFee", "repairFee"]);

function validPropertyNumericPreview(key: string, value: string): boolean {
  if (!PROPERTY_NUMERIC_PREVIEW_KEYS.has(key)) return true;
  if (!/^\d+(?:\.\d+)?$/.test(value)) return false;
  const number = Number(value);
  if (key === "sizeSqm") return Number.isFinite(number) && number > 0 && number <= 1_000_000;
  return Number.isSafeInteger(number) && number <= 2_147_483_647 && (key === "listingPrice" ? number > 0 : number >= 0);
}

/** Ephemeral suggestions only: this action never creates a record, job, or attachment. */
export async function previewEntryDocumentsAction(formData: FormData): Promise<EntryPreviewState> {
  const session = await requireTenantSession({ permission: "source.upload" });
  const locale = await getLocale();
  const kind = String(formData.get("previewKind") ?? "");
  const caseContext = formData.get("previewContext") === "case";
  const files = formData.getAll("uploadFile").filter((value): value is File => value instanceof File && value.size > 0);
  const candidates: EntryPreviewCandidate[] = [];
  const readFileKeys: string[] = [];
  const readProofs: Record<string, string> = {};
  const invalid = locale === "zh" ? "请选择有效的 PDF、PNG、JPEG 或单独一份 XLSX。尚未创建档案。" : locale === "ko" ? "유효한 PDF, PNG, JPEG 또는 XLSX 한 개를 선택해 주세요. 아직 기록을 만들지 않았습니다." : "有効な PDF・PNG・JPEG、または XLSX を単独で選択してください。記録はまだ作成されていません。";
  if (new Set(files.map(entryFileKey)).size !== files.length) return { status: "error", candidates, readFileKeys, message: locale === "zh" ? "本次资料中存在同名且同大小的文件，请重命名后重新选择。尚未读取或创建档案。" : locale === "ko" ? "이름과 크기가 같은 파일이 있습니다. 이름을 바꾸고 다시 선택해 주세요. 읽기나 기록 생성은 시작되지 않았습니다." : "同名・同サイズのファイルがあります。名前を変更して選び直してください。読取や記録作成はまだ行っていません。" };
  if (!["customer", "property"].includes(kind) || files.length === 0 || !(await validateEntryUploads(files))) return { status: "error", candidates, readFileKeys, message: invalid };
  let failed = false;
  for (const file of files) {
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      let fields: Array<{ fieldKey: string; value: string; pageNumber?: number; sourceText?: string; uncertainty: "clear" | "unclear" | "conflict" | "not_found" }>;
      if (file.name.toLowerCase().endsWith(".xlsx")) {
        const extracted = extractInputFileFromWorkbook(await readExcelWorkbook(buffer), file.name);
        fields = extracted.fields.map((field) => ({ fieldKey: field.fieldKey, value: field.normalizedValue || field.value, pageNumber: field.sourcePageNumber, sourceText: field.sourceText || [field.sourceSheet, field.sourceCell || field.sourceRange].filter(Boolean).join(" / "), uncertainty: field.uncertainty ?? "unclear" }));
      } else if (kind === "customer") {
        const result = await readIdentityDocumentWithOpenAi({ buffer, filename: file.name, scope: "customer" });
        fields = selectPrimaryIdentityReaderCandidates(result.candidates, { scope: "customer" }).candidates;
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
        } else {
          if (!field.fieldKey.startsWith("property.")) continue;
          try { key = toObjectRecordFieldKey("property", field.fieldKey); } catch { continue; }
          label = OBJECT_READER_FIELD_LABELS[field.fieldKey] ?? key;
          const normalized = normalizeObjectReaderCandidateValue(field.fieldKey, field.value, field.uncertainty);
          value = normalized.value;
          uncertainty = normalized.uncertainty;
          // An invalid number would appear accepted while an HTML number input submits an empty value.
          if (!validPropertyNumericPreview(key, value)) continue;
        }
        candidates.push({ id: `${entryFileKey(file)}:${index}`, key, sourceKey: field.fieldKey, label, value, fileName: file.name, pageNumber: field.pageNumber, sourceText: field.sourceText, uncertainty });
      }
      readFileKeys.push(entryFileKey(file));
      readProofs[entryFileKey(file)] = signEntryPreviewProof({ tenantId: session.tenant.id, userId: session.user.id, fileKey: entryFileKey(file), digest: createHash("sha256").update(buffer).digest("hex"), kind: kind as "customer" | "property", context: caseContext ? "case" : "entry", candidates: candidates.filter((candidate) => candidate.id.startsWith(`${entryFileKey(file)}:`)) });
    } catch {
      failed = true;
    }
  }
  // Multiple sources may disagree; preserve all alternatives for explicit review.
  for (const candidate of candidates) {
    if (candidates.some((other) => other.key === candidate.key && other.value !== candidate.value)) candidate.uncertainty = "conflict";
  }
  const message = failed
    ? locale === "zh" ? "部分或全部资料未能读取。已完成的候选保留；未创建档案，可重试失败资料或继续手动填写。" : locale === "ko" ? "일부 자료를 읽지 못했습니다. 완료된 후보는 보존되며 기록은 생성되지 않았습니다. 실패한 자료를 다시 읽거나 직접 입력하세요." : "一部の資料を読み取れませんでした。完了した候補は保持され、記録はまだ作成されていません。失敗した資料を再試行するか手入力してください。"
    : candidates.length === 0 ? locale === "zh" ? "没有可确认的现有字段候选，或资料对象归属不明确。请手动填写；原件将在最终保存时归档。" : locale === "ko" ? "확인 가능한 기존 항목이 없거나 대상이 불명확합니다. 직접 입력해 주세요. 원본은 최종 저장 시 보관됩니다." : "確認できる既存項目がないか、対象が不明確です。手入力してください。原本は最終保存時に保管します。" : undefined;
  return { status: failed ? "error" : "ready", candidates, readFileKeys, readProofs, message };
}
