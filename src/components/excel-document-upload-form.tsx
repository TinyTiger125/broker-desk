"use client";

import { useRef, useState } from "react";
import type { DragEvent } from "react";
import type { Locale } from "@/lib/locale";

type ExcelDocumentUploadFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  locale?: Locale;
  targetCaseId?: string;
  uploadContext?: "case" | "import";
  density?: "default" | "compact";
};

const textByLocale = {
  ja: {
    dropHint: "Excelファイルをここに置くか、クリックして選択",
    fileLabel: ".xlsx",
    submit: "資料を読み取る",
    selected: "選択中",
    fileRequired: ".xlsx ファイルを選択してください。",
    fileType: ".xlsx ファイルを選択してください。",
  },
  zh: {
    dropHint: "把 Excel 文件拖到这里，或点击选择",
    fileLabel: ".xlsx",
    submit: "读取申请资料",
    selected: "已选择",
    fileRequired: "请选择 .xlsx 文件。",
    fileType: "请选择 .xlsx 文件。",
  },
  ko: {
    dropHint: "Excel 파일을 여기에 놓거나 클릭해서 선택",
    fileLabel: ".xlsx",
    submit: "자료 읽기",
    selected: "선택됨",
    fileRequired: ".xlsx 파일을 선택해 주세요.",
    fileType: ".xlsx 파일을 선택해 주세요.",
  },
} as const;

function formatMegabytes(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function validateExcelFile(files: File[]) {
  if (files.length === 0) return "fileRequired" as const;
  if (!files[0]?.name.toLowerCase().endsWith(".xlsx")) return "fileType" as const;
  return null;
}

export function ExcelDocumentUploadForm({ action, locale = "ja", targetCaseId, uploadContext, density = "default" }: ExcelDocumentUploadFormProps) {
  const text = textByLocale[locale];
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const compact = density === "compact";

  function updateFileState(files: File[]) {
    const selectedFiles = files.slice(0, 1);
    const validationError = validateExcelFile(selectedFiles);
    setError(validationError ? text[validationError] : null);
    const file = selectedFiles[0];
    setSummary(file ? `${text.selected}: ${file.name} / ${formatMegabytes(file.size)}` : null);
    return validationError;
  }

  function assignDroppedFiles(files: File[]) {
    const selectedFiles = files.slice(0, 1);
    const input = fileInputRef.current;
    if (input && typeof DataTransfer !== "undefined") {
      const transfer = new DataTransfer();
      selectedFiles.forEach((file) => transfer.items.add(file));
      input.files = transfer.files;
    }
    updateFileState(selectedFiles);
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

  return (
    <form
      action={action}
      noValidate
      className={compact ? "grid w-full gap-2 rounded-md border border-blue-100 bg-blue-50 p-2" : "w-full space-y-4 rounded-2xl border-2 border-dashed border-blue-200 bg-white p-5"}
      onSubmit={(event) => {
        const input = event.currentTarget.elements.namedItem("excelFile");
        const files = input instanceof HTMLInputElement && input.files ? Array.from(input.files) : [];
        if (updateFileState(files)) {
          event.preventDefault();
        }
      }}
    >
      {targetCaseId ? <input type="hidden" name="targetCaseId" value={targetCaseId} /> : null}
      {uploadContext ? <input type="hidden" name="uploadContext" value={uploadContext} /> : null}
      <label
        className={
          compact
            ? `block cursor-pointer rounded-md border border-dashed p-3 transition ${
                dragging ? "border-blue-500 bg-white" : "border-blue-200 bg-white/80 hover:border-blue-400 hover:bg-white"
              }`
            : `block min-h-40 cursor-pointer rounded-xl border-2 border-dashed p-5 transition ${
                dragging ? "border-blue-500 bg-white shadow-sm" : "border-blue-200 bg-blue-50/50 hover:border-blue-400 hover:bg-blue-50"
              }`
        }
        {...dropHandlers}
      >
        <span className="flex items-start gap-3">
          <span className={`${compact ? "h-8 w-8 text-[18px]" : "h-10 w-10 text-[22px]"} material-symbols-outlined flex shrink-0 items-center justify-center rounded-lg bg-white text-blue-700`} aria-hidden="true">
            upload_file
          </span>
          <span className="min-w-0">
            <span className={`${compact ? "text-xs" : "text-sm"} block font-black text-blue-950`}>{text.dropHint}</span>
            <span className="mt-1 block text-xs font-semibold text-blue-700">{text.fileLabel}</span>
          </span>
        </span>
        <input
          ref={fileInputRef}
          name="excelFile"
          type="file"
          accept=".xlsx"
          className="sr-only"
          onChange={(event) => updateFileState(Array.from(event.currentTarget.files ?? []))}
        />
      </label>
      <button type="submit" className={`${compact ? "h-9 text-xs" : "h-10 text-sm"} w-full rounded-md bg-blue-700 px-4 font-bold text-white hover:bg-blue-800`}>
        {text.submit}
      </button>
      {summary ? <p className="text-[11px] font-semibold text-blue-900">{summary}</p> : null}
      {error ? <p className="text-[11px] font-bold text-red-700" role="alert">{error}</p> : null}
    </form>
  );
}
