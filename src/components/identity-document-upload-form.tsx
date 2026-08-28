"use client";

import { useRef, useState } from "react";
import type { DragEvent } from "react";
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
    fileLabel: "PDF / 画像",
    submit: "本人資料を読み取る",
    dropHint: "ここにファイルを置くか、クリックして選択",
    selected: "選択中",
    fileRequired: "本人確認資料ファイルを選択してください。",
    tooManyFiles: `本人確認資料は一度に${MAX_IDENTITY_DOCUMENT_FILES}件まで選択できます。`,
    fileTooLarge: "1ファイル25MB以下にしてください。",
    totalTooLarge: "合計60MB以下にしてください。",
  },
  zh: {
    fileLabel: "PDF / 图片",
    submit: "读取本人资料",
    dropHint: "把文件拖到这里，或点击选择",
    selected: "已选择",
    fileRequired: "请选择本人资料文件。",
    tooManyFiles: `本人资料一次最多选择${MAX_IDENTITY_DOCUMENT_FILES}个文件。`,
    fileTooLarge: "单个文件请控制在25MB以内。",
    totalTooLarge: "文件合计请控制在60MB以内。",
  },
  ko: {
    fileLabel: "PDF / 이미지",
    submit: "본인 자료 읽기",
    dropHint: "파일을 여기에 놓거나 클릭해서 선택",
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const compact = density === "compact";

  function updateFileState(files: File[]) {
    const validationError = validateIdentityFiles(files);
    setError(validationError ? text[validationError] : null);
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    setSummary(files.length > 0 ? `${text.selected}: ${files.length} / ${formatMegabytes(totalBytes)}` : null);
    return validationError;
  }

  function assignDroppedFiles(files: File[]) {
    const input = fileInputRef.current;
    if (input && typeof DataTransfer !== "undefined") {
      const transfer = new DataTransfer();
      files.forEach((file) => transfer.items.add(file));
      input.files = transfer.files;
    }
    updateFileState(files);
  }

  const dropHandlers = {
    onDragEnter: (event: DragEvent<HTMLLabelElement>) => {
      event.preventDefault();
      setDragging(true);
    },
    onDragOver: (event: DragEvent<HTMLLabelElement>) => {
      event.preventDefault();
      setDragging(true);
    },
    onDragLeave: () => setDragging(false),
    onDrop: (event: DragEvent<HTMLLabelElement>) => {
      event.preventDefault();
      setDragging(false);
      assignDroppedFiles(Array.from(event.dataTransfer.files));
    },
  };

  if (compact) {
    return (
      <form
        action={action}
        noValidate
        className="grid w-full gap-2 rounded-md border border-emerald-100 bg-emerald-50 p-2"
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
        <input type="hidden" name="identityUploadMode" value="same_person" />
        <label
          className={`block cursor-pointer rounded-md border border-dashed p-3 transition ${
            dragging ? "border-emerald-500 bg-white" : "border-emerald-200 bg-white/80 hover:border-emerald-400 hover:bg-white"
          }`}
          {...dropHandlers}
        >
          <span className="flex items-center gap-2 text-xs font-black text-emerald-950">
            <span className="material-symbols-outlined text-[18px] text-emerald-700" aria-hidden="true">upload_file</span>
            {text.dropHint}
          </span>
          <span className="mt-1 block text-[11px] font-semibold text-emerald-800">{text.fileLabel}</span>
          <input
            ref={fileInputRef}
            name="identityDocumentFile"
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,image/*,application/pdf"
            multiple
            className="sr-only"
            onChange={(event) => updateFileState(Array.from(event.currentTarget.files ?? []))}
          />
        </label>
        <button type="submit" className="h-9 w-full rounded-md bg-emerald-700 px-3 text-xs font-bold text-white hover:bg-emerald-800">
          {text.submit}
        </button>
        {summary ? <p className="text-[11px] font-semibold text-emerald-900">{summary}</p> : null}
        {error ? <p className="text-[11px] font-bold text-red-700" role="alert">{error}</p> : null}
      </form>
    );
  }

  return (
    <form
      action={action}
      noValidate
      className="w-full space-y-4 rounded-2xl border-2 border-dashed border-emerald-200 bg-emerald-50 p-5"
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
      <input type="hidden" name="identityUploadMode" value="same_person" />
      <label
        className={`block min-h-40 cursor-pointer rounded-xl border-2 border-dashed p-5 transition ${
          dragging ? "border-emerald-500 bg-white shadow-sm" : "border-emerald-200 bg-white hover:border-emerald-400 hover:bg-emerald-50/60"
        }`}
        {...dropHandlers}
      >
        <span className="flex items-start gap-3">
          <span className="material-symbols-outlined flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700" aria-hidden="true">upload_file</span>
          <span className="min-w-0">
            <span className="block text-sm font-black text-emerald-950">{text.dropHint}</span>
            <span className="mt-1 block text-xs font-semibold text-emerald-800">{text.fileLabel}</span>
          </span>
        </span>
        <input
          ref={fileInputRef}
          name="identityDocumentFile"
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,image/*,application/pdf"
          multiple
          className="sr-only"
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
