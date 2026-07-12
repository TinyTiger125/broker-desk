"use client";

import { useState } from "react";
import type { Locale } from "@/lib/locale";

const MAX_IDENTITY_DOCUMENT_FILES = 6;
const MAX_IDENTITY_DOCUMENT_FILE_BYTES = 25 * 1024 * 1024;
const MAX_IDENTITY_DOCUMENT_TOTAL_BYTES = 60 * 1024 * 1024;

type IdentityDocumentUploadFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  locale?: Locale;
  targetCaseId?: string;
  uploadContext?: "case" | "import";
  density?: "default" | "compact";
};

const textByLocale = {
  ja: {
    modeLabel: "処理方法",
    samePerson: "同一人物の複数資料",
    separatePeople: "複数人物の資料を個別確認",
    fileLabel: "PDF または画像を選択、複数可",
    submit: "本人資料を読み取る",
    selected: "選択中",
    fileRequired: "本人確認資料ファイルを選択してください。",
    tooManyFiles: `本人確認資料は一度に${MAX_IDENTITY_DOCUMENT_FILES}件まで選択できます。`,
    fileTooLarge: "1ファイル25MB以下にしてください。",
    totalTooLarge: "合計60MB以下にしてください。",
  },
  zh: {
    modeLabel: "处理方式",
    samePerson: "同一人的多张证件",
    separatePeople: "多人资料，分别核对",
    fileLabel: "选择 PDF 或图片，可多选",
    submit: "读取本人资料",
    selected: "已选择",
    fileRequired: "请选择本人资料文件。",
    tooManyFiles: `本人资料一次最多选择${MAX_IDENTITY_DOCUMENT_FILES}个文件。`,
    fileTooLarge: "单个文件请控制在25MB以内。",
    totalTooLarge: "文件合计请控制在60MB以内。",
  },
  ko: {
    modeLabel: "처리 방식",
    samePerson: "동일인의 여러 증명서",
    separatePeople: "여러 사람 자료, 개별 확인",
    fileLabel: "PDF 또는 이미지 선택, 여러 개 가능",
    submit: "본인 자료 읽기",
    selected: "선택됨",
    fileRequired: "본인 확인 자료 파일을 선택해 주세요.",
    tooManyFiles: `본인 자료는 한 번에 ${MAX_IDENTITY_DOCUMENT_FILES}개까지 선택할 수 있습니다.`,
    fileTooLarge: "파일 1개는 25MB 이하로 선택해 주세요.",
    totalTooLarge: "전체 파일 합계는 60MB 이하로 선택해 주세요.",
  },
} as const;

function formatMegabytes(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function validateIdentityFiles(files: File[]) {
  if (files.length === 0) return "fileRequired" as const;
  if (files.length > MAX_IDENTITY_DOCUMENT_FILES) return "tooManyFiles" as const;
  if (files.some((file) => file.size > MAX_IDENTITY_DOCUMENT_FILE_BYTES)) return "fileTooLarge" as const;
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > MAX_IDENTITY_DOCUMENT_TOTAL_BYTES) return "totalTooLarge" as const;
  return null;
}

export function IdentityDocumentUploadForm({ action, locale = "ja", targetCaseId, uploadContext, density = "default" }: IdentityDocumentUploadFormProps) {
  const text = textByLocale[locale];
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const compact = density === "compact";

  function updateFileState(files: File[]) {
    const validationError = validateIdentityFiles(files);
    setError(validationError ? text[validationError] : null);
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    setSummary(files.length > 0 ? `${text.selected}: ${files.length} / ${formatMegabytes(totalBytes)}` : null);
    return validationError;
  }

  if (compact) {
    return (
      <form
        action={action}
        noValidate
        className="grid w-full gap-2 rounded-md border border-emerald-100 bg-emerald-50 p-2 md:grid-cols-[170px_minmax(220px,1fr)_140px] md:items-end"
        onSubmit={(event) => {
          const input = event.currentTarget.elements.namedItem("identityDocumentFile");
          const files = input instanceof HTMLInputElement && input.files ? Array.from(input.files) : [];
          if (updateFileState(files)) {
            event.preventDefault();
          }
        }}
      >
        {targetCaseId ? <input type="hidden" name="targetCaseId" value={targetCaseId} /> : null}
        {uploadContext ? <input type="hidden" name="uploadContext" value={uploadContext} /> : null}
        <label className="block space-y-1">
          <span className="text-[11px] font-semibold text-emerald-900">{text.modeLabel}</span>
          <select name="identityUploadMode" defaultValue="same_person" className="h-9 w-full rounded-md border border-emerald-200 bg-white px-2 text-xs font-semibold">
            <option value="same_person">{text.samePerson}</option>
            <option value="separate_people">{text.separatePeople}</option>
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-[11px] font-semibold text-emerald-900">{text.fileLabel}</span>
          <input
            name="identityDocumentFile"
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,image/*,application/pdf"
            multiple
            className="h-9 w-full rounded-md border border-emerald-200 bg-white px-2 py-1 text-xs"
            onChange={(event) => updateFileState(Array.from(event.currentTarget.files ?? []))}
          />
        </label>
        <button type="submit" className="h-9 w-full rounded-md bg-emerald-700 px-3 text-xs font-bold text-white hover:bg-emerald-800">
          {text.submit}
        </button>
        {summary ? <p className="text-[11px] font-semibold text-emerald-900 md:col-span-3">{summary}</p> : null}
        {error ? <p className="text-[11px] font-bold text-red-700 md:col-span-3" role="alert">{error}</p> : null}
      </form>
    );
  }

  return (
    <form
      action={action}
      noValidate
      className="w-full space-y-3 rounded-xl border border-emerald-100 bg-emerald-50 p-4 lg:max-w-md"
      onSubmit={(event) => {
        const input = event.currentTarget.elements.namedItem("identityDocumentFile");
        const files = input instanceof HTMLInputElement && input.files ? Array.from(input.files) : [];
        if (updateFileState(files)) {
          event.preventDefault();
        }
      }}
    >
      {targetCaseId ? <input type="hidden" name="targetCaseId" value={targetCaseId} /> : null}
      {uploadContext ? <input type="hidden" name="uploadContext" value={uploadContext} /> : null}
      <label className="block space-y-1">
        <span className="text-xs font-semibold text-emerald-900">{text.modeLabel}</span>
        <select name="identityUploadMode" defaultValue="same_person" className="h-10 w-full rounded-md border border-emerald-200 bg-white px-3 text-sm">
          <option value="same_person">{text.samePerson}</option>
          <option value="separate_people">{text.separatePeople}</option>
        </select>
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-semibold text-emerald-900">{text.fileLabel}</span>
        <input
          name="identityDocumentFile"
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,image/*,application/pdf"
          multiple
          className="w-full rounded-md border border-emerald-200 bg-white px-3 py-2 text-sm"
          onChange={(event) => updateFileState(Array.from(event.currentTarget.files ?? []))}
        />
      </label>
      {summary ? <p className="text-[11px] font-semibold text-emerald-900">{summary}</p> : null}
      {error ? <p className="text-[11px] font-bold text-red-700" role="alert">{error}</p> : null}
      <button type="submit" className="h-10 w-full rounded-md bg-emerald-700 px-4 text-sm font-bold text-white hover:bg-emerald-800">
        {text.submit}
      </button>
    </form>
  );
}
