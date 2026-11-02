"use client";

import { useRef, useState } from "react";
import type { DragEvent } from "react";
import type { Locale } from "@/lib/locale";

const MAX_FILES = 6;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_TOTAL_BYTES = 60 * 1024 * 1024;

type CaseDocumentUploadFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  targetCaseId: string;
  locale?: Locale;
};

const copy = {
  ja: {
    fileLabel: "PDF / 画像",
    submit: "案件資料を保存",
    dropHint: "案件の契約書・説明書などをここに置くか、クリックして選択",
    selected: "選択中",
    required: "案件資料ファイルを選択してください。",
    tooMany: `案件資料は一度に${MAX_FILES}件まで選択できます。`,
    tooLarge: "1ファイル25MB以下にしてください。",
    totalTooLarge: "合計60MB以下にしてください。",
    helper: "本人確認資料として読み取らず、現在の案件の原本資料として保存します。",
  },
  zh: {
    fileLabel: "PDF / 图片",
    submit: "保存案件资料",
    dropHint: "把合同、说明书等案件资料拖到这里，或点击选择",
    selected: "已选择",
    required: "请选择案件资料文件。",
    tooMany: `案件资料一次最多选择${MAX_FILES}个文件。`,
    tooLarge: "单个文件请控制在25MB以内。",
    totalTooLarge: "文件合计请控制在60MB以内。",
    helper: "不会按身份证明资料读取；原件将保存到当前案件，字段可在案件中继续核对。",
  },
  ko: {
    fileLabel: "PDF / 이미지",
    submit: "안건 자료 저장",
    dropHint: "계약서·설명서 등 안건 자료를 놓거나 클릭해서 선택",
    selected: "선택됨",
    required: "안건 자료 파일을 선택해 주세요.",
    tooMany: `안건 자료는 한 번에 ${MAX_FILES}개까지 선택할 수 있습니다.`,
    tooLarge: "파일 1개는 25MB 이하로 선택해 주세요.",
    totalTooLarge: "전체 파일 합계는 60MB 이하로 선택해 주세요.",
    helper: "신원 확인 자료로 읽지 않고 현재 안건의 원본으로 저장합니다. 필드는 안건에서 계속 확인할 수 있습니다.",
  },
} as const;

function formatMegabytes(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function validationKey(files: File[]) {
  if (files.length === 0) return "required" as const;
  if (files.length > MAX_FILES) return "tooMany" as const;
  if (files.some((file) => file.size > MAX_FILE_BYTES)) return "tooLarge" as const;
  if (files.reduce((sum, file) => sum + file.size, 0) > MAX_TOTAL_BYTES) return "totalTooLarge" as const;
  return null;
}

export function CaseDocumentUploadForm({ action, targetCaseId, locale = "ja" }: CaseDocumentUploadFormProps) {
  const text = copy[locale];
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  function updateFiles(files: File[]) {
    const key = validationKey(files);
    setError(key ? text[key] : null);
    const total = files.reduce((sum, file) => sum + file.size, 0);
    setSummary(files.length ? `${text.selected}: ${files.length} / ${formatMegabytes(total)}` : null);
    return key;
  }

  function assignDroppedFiles(files: File[]) {
    if (inputRef.current && typeof DataTransfer !== "undefined") {
      const transfer = new DataTransfer();
      files.forEach((file) => transfer.items.add(file));
      inputRef.current.files = transfer.files;
    }
    updateFiles(files);
  }

  const dropHandlers = {
    onDragEnter: (event: DragEvent<HTMLLabelElement>) => { event.preventDefault(); setDragging(true); },
    onDragOver: (event: DragEvent<HTMLLabelElement>) => { event.preventDefault(); setDragging(true); },
    onDragLeave: () => setDragging(false),
    onDrop: (event: DragEvent<HTMLLabelElement>) => {
      event.preventDefault();
      setDragging(false);
      assignDroppedFiles(Array.from(event.dataTransfer.files));
    },
  };

  return (
    <form
      action={action}
      noValidate
      className="w-full space-y-3 rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50 p-5"
      onSubmit={(event) => {
        const files = inputRef.current ? Array.from(inputRef.current.files ?? []) : [];
        if (updateFiles(files)) event.preventDefault();
      }}
    >
      <input type="hidden" name="targetCaseId" value={targetCaseId} />
      <input type="hidden" name="uploadContext" value="case" />
      <label
        className={`block min-h-32 cursor-pointer rounded-xl border-2 border-dashed p-5 transition ${dragging ? "border-blue-500 bg-white shadow-sm" : "border-blue-200 bg-white hover:border-blue-400 hover:bg-blue-50/60"}`}
        {...dropHandlers}
      >
        <span className="flex items-start gap-3">
          <span className="material-symbols-outlined flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700" aria-hidden="true">upload_file</span>
          <span className="min-w-0">
            <span className="block text-sm font-black text-blue-950">{text.dropHint}</span>
            <span className="mt-1 block text-xs font-semibold text-blue-800">{text.fileLabel}</span>
          </span>
        </span>
        <input
          ref={inputRef}
          name="caseDocumentFile"
          type="file"
          accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg"
          multiple
          required
          className="sr-only"
          onChange={(event) => updateFiles(Array.from(event.currentTarget.files ?? []))}
        />
      </label>
      <p className="text-xs font-semibold leading-5 text-blue-900">{text.helper}</p>
      {summary ? <p className="text-[11px] font-semibold text-blue-900">{summary}</p> : null}
      {error ? <p className="text-[11px] font-bold text-red-700" role="alert">{error}</p> : null}
      <button type="submit" className="h-10 w-full rounded-md bg-blue-700 px-4 text-sm font-bold text-white hover:bg-blue-800">
        {text.submit}
      </button>
    </form>
  );
}
