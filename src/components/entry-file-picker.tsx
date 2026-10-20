"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import type { Locale } from "@/lib/locale";

export const ENTRY_FILE_INPUT_NAME = "uploadFile";
export const MAX_ENTRY_FILES = 6;

export function replaceEntryFiles(formData: FormData, files: readonly File[]) {
  formData.delete(ENTRY_FILE_INPUT_NAME);
  files.forEach((file) => formData.append(ENTRY_FILE_INPUT_NAME, file));
}

type EntryFilePickerProps = {
  locale?: Locale;
  files: File[];
  onFilesChange: (files: File[]) => void;
  name?: string;
  disabled?: boolean;
};

const copy = {
  ja: {
    label: "資料を選択",
    hint: "PDF、PNG、JPEG、または XLSX（最大6件。XLSX は単独）",
    empty: "ファイルはまだ選択されていません。",
    tooMany: "資料は一度に6件まで選択できます。",
    mixedExcel: "XLSX は他の資料と同時に選択できません。",
    unsupported: "PDF、PNG、JPEG、または XLSX のみ選択できます。",
    remove: "削除",
    selected: "選択中",
  },
  zh: {
    label: "选择资料",
    hint: "PDF、PNG、JPEG 或 XLSX（最多6个；XLSX 必须单独上传）",
    empty: "尚未选择文件。",
    tooMany: "一次最多选择6个资料文件。",
    mixedExcel: "XLSX 不能与其他资料同时选择。",
    unsupported: "只能选择 PDF、PNG、JPEG 或 XLSX。",
    remove: "删除",
    selected: "已选择",
  },
  ko: {
    label: "자료 선택",
    hint: "PDF, PNG, JPEG 또는 XLSX (최대 6개, XLSX는 단독)",
    empty: "아직 파일을 선택하지 않았습니다.",
    tooMany: "한 번에 최대 6개의 자료를 선택할 수 있습니다.",
    mixedExcel: "XLSX는 다른 자료와 함께 선택할 수 없습니다.",
    unsupported: "PDF, PNG, JPEG 또는 XLSX만 선택할 수 있습니다.",
    remove: "삭제",
    selected: "선택됨",
  },
} as const;

function isXlsx(file: File) {
  return file.name.toLowerCase().endsWith(".xlsx")
    || file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
}

function isSupported(file: File) {
  if (isXlsx(file)) return true;
  const name = file.name.toLowerCase();
  return file.type === "application/pdf"
    || file.type === "image/png"
    || file.type === "image/jpeg"
    || /\.(pdf|png|jpe?g)$/.test(name);
}

function describeSelection(files: File[], text: (typeof copy)[Locale]) {
  if (files.length > MAX_ENTRY_FILES) return text.tooMany;
  if (files.some((file) => !isSupported(file))) return text.unsupported;
  if (files.some(isXlsx) && files.length !== 1) return text.mixedExcel;
  return undefined;
}

export function EntryFilePicker({
  locale = "ja",
  files,
  onFilesChange,
  name = ENTRY_FILE_INPUT_NAME,
  disabled = false,
}: EntryFilePickerProps) {
  const text = copy[locale];
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const input = inputRef.current;
    if (!input || typeof DataTransfer === "undefined") return;
    const transfer = new DataTransfer();
    files.forEach((file) => transfer.items.add(file));
    input.files = transfer.files;
  }, [files]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFiles = Array.from(event.currentTarget.files ?? []);
    const nextError = describeSelection(nextFiles, text);
    setError(nextError);
    if (nextError) {
      onFilesChange([]);
      event.currentTarget.value = "";
      return;
    }
    onFilesChange(nextFiles);
  };

  const removeFile = (index: number) => {
    onFilesChange(files.filter((_, currentIndex) => currentIndex !== index));
    setError(undefined);
  };

  return (
    <section aria-labelledby="entry-upload-heading" className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/50 p-4">
      <div>
        <h2 id="entry-upload-heading" className="text-sm font-black text-slate-950">{text.label}</h2>
        <p className="mt-1 text-xs leading-5 text-slate-600">{text.hint}</p>
      </div>
      <label className="block text-sm font-semibold text-slate-700">
        <span className="sr-only">{text.label}</span>
        <input
          ref={inputRef}
          name={name}
          type="file"
          multiple
          accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg,.xlsx"
          disabled={disabled}
          onChange={handleChange}
          className="box-border min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:text-xs file:font-bold file:text-slate-800"
        />
      </label>
      {error ? <p role="alert" className="text-xs font-bold text-rose-700">{error}</p> : null}
      {files.length > 0 ? (
        <ul aria-label={text.selected} className="grid gap-2 sm:grid-cols-2">
          {files.map((file, index) => (
            <li key={`${file.name}-${file.lastModified}-${index}`} className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-blue-100 bg-white px-3 py-2 text-xs">
              <span className="min-w-0 truncate font-semibold text-slate-700" title={file.name}>{file.name}</span>
              <button type="button" disabled={disabled} onClick={() => removeFile(index)} className="shrink-0 rounded-md px-2 py-1 font-bold text-slate-600 hover:bg-slate-100">{text.remove}</button>
            </li>
          ))}
        </ul>
      ) : <p className="text-xs text-slate-500">{text.empty}</p>}
    </section>
  );
}
