"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/locale";
import { getGuaranteeFormsMessages } from "@/lib/guarantee-forms-locale";

type FormRow = {
  id: string;
  name: string;
  versions: Array<{ id: string; versionNumber: number; status: string; maskVersionId?: string; tested: boolean }>;
};

type UploadErrorCode =
  | "blank_form_pdf_required"
  | "blank_form_pdf_rejected"
  | "blank_form_encrypted_unsupported"
  | "blank_form_file_too_large"
  | "slice1_single_page_pdf_required"
  | "blank_form_rotation_unsupported"
  | "blank_form_cropbox_unsupported"
  | "blank_form_page_origin_unsupported"
  | "blank_form_dimensions_unsupported"
  | "blank_form_processing_timeout"
  | "blank_form_preview_unavailable"
  | "blank_form_declaration_required"
  | "guarantee_slice1_failed"
  | "upload_failed";

const UPLOAD_ERROR_MESSAGES: Record<Locale, Record<UploadErrorCode, string>> = {
  ja: {
    blank_form_pdf_required: "PDFファイルを選択してください。",
    blank_form_pdf_rejected: "PDFを読み取れません。ファイルが破損していないか確認して、もう一度アップロードしてください。",
    blank_form_encrypted_unsupported: "暗号化またはパスワード保護されたPDFには対応していません。保護を解除した空白のPDFをもう一度アップロードしてください。",
    blank_form_file_too_large: "PDFファイルは10MB以下にしてください。",
    slice1_single_page_pdf_required: "現在は1ページのPDFのみ対応しています。",
    blank_form_rotation_unsupported: "ページ回転が設定されたPDFには対応していません。向きを固定した1ページのPDFとして書き出してから、もう一度お試しください。",
    blank_form_cropbox_unsupported: "このPDFのページのトリミング設定には対応していません。標準的な1ページのPDFとして書き出してから、もう一度お試しください。",
    blank_form_page_origin_unsupported: "このPDFのページのトリミング設定には対応していません。標準的な1ページのPDFとして書き出してから、もう一度お試しください。",
    blank_form_dimensions_unsupported: "このPDFのページサイズまたは構造には対応していません。標準的な1ページのPDFとして書き出してから、もう一度お試しください。",
    blank_form_processing_timeout: "PDFの処理に時間がかかっています。しばらくしてからもう一度お試しください。",
    blank_form_preview_unavailable: "PDFの校正プレビューを作成できませんでした。別のファイルをお試しください。",
    blank_form_declaration_required: "空白のPDFであり、この会社が利用する権利を持つことを確認してください。",
    guarantee_slice1_failed: "アップロードを完了できませんでした。しばらくしてからもう一度お試しください。",
    upload_failed: "アップロードを完了できませんでした。しばらくしてからもう一度お試しください。",
  },
  zh: {
    blank_form_pdf_required: "请选择PDF文件。",
    blank_form_pdf_rejected: "无法读取该PDF。请确认文件未损坏后重新上传。",
    blank_form_encrypted_unsupported: "暂不支持加密或密码保护的PDF。请解除保护后重新上传空白PDF。",
    blank_form_file_too_large: "PDF文件不能超过10MB。",
    slice1_single_page_pdf_required: "第一版仅支持单页PDF。",
    blank_form_rotation_unsupported: "暂不支持带页面旋转设置的PDF。请导出为方向固定的单页PDF后重试。",
    blank_form_cropbox_unsupported: "该PDF的页面裁切设置暂不支持。请重新导出为标准单页PDF后重试。",
    blank_form_page_origin_unsupported: "该PDF的页面裁切设置暂不支持。请重新导出为标准单页PDF后重试。",
    blank_form_dimensions_unsupported: "该PDF的页面尺寸或结构暂不支持，请重新导出为标准单页PDF后重试。",
    blank_form_processing_timeout: "PDF处理超时，请稍后重试。",
    blank_form_preview_unavailable: "无法生成该PDF的校准预览，请更换文件后重试。",
    blank_form_declaration_required: "请先确认这是空白PDF且本经营主体有权使用。",
    guarantee_slice1_failed: "上传未完成，请稍后重试。",
    upload_failed: "上传未完成，请稍后重试。",
  },
  ko: {
    blank_form_pdf_required: "PDF 파일을 선택해 주세요.",
    blank_form_pdf_rejected: "PDF를 읽을 수 없습니다. 파일이 손상되지 않았는지 확인한 후 다시 업로드해 주세요.",
    blank_form_encrypted_unsupported: "암호화되었거나 비밀번호로 보호된 PDF는 지원하지 않습니다. 보호를 해제한 빈 PDF를 다시 업로드해 주세요.",
    blank_form_file_too_large: "PDF 파일은 10MB를 초과할 수 없습니다.",
    slice1_single_page_pdf_required: "현재는 한 페이지 PDF만 지원합니다.",
    blank_form_rotation_unsupported: "페이지 회전이 설정된 PDF는 지원하지 않습니다. 방향을 고정한 한 페이지 PDF로 내보낸 후 다시 시도해 주세요.",
    blank_form_cropbox_unsupported: "이 PDF의 페이지 자르기 설정은 지원하지 않습니다. 표준 한 페이지 PDF로 내보낸 후 다시 시도해 주세요.",
    blank_form_page_origin_unsupported: "이 PDF의 페이지 자르기 설정은 지원하지 않습니다. 표준 한 페이지 PDF로 내보낸 후 다시 시도해 주세요.",
    blank_form_dimensions_unsupported: "이 PDF의 페이지 크기 또는 구조는 지원하지 않습니다. 표준 한 페이지 PDF로 내보낸 후 다시 시도해 주세요.",
    blank_form_processing_timeout: "PDF 처리 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.",
    blank_form_preview_unavailable: "PDF 교정 미리보기를 만들 수 없습니다. 다른 파일을 시도해 주세요.",
    blank_form_declaration_required: "빈 PDF이며 이 회사가 사용할 권리가 있음을 확인해 주세요.",
    guarantee_slice1_failed: "업로드를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    upload_failed: "업로드를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  },
};

function explainUploadError(error: unknown, locale: Locale) {
  const code = error instanceof Error ? error.message : String(error);
  const messages = UPLOAD_ERROR_MESSAGES[locale] ?? UPLOAD_ERROR_MESSAGES.ja;
  const message = messages[code as UploadErrorCode] ?? messages.guarantee_slice1_failed;
  const requestId = error instanceof Error && "requestId" in error && typeof error.requestId === "string" ? error.requestId : "";
  const requestLabel = locale === "ja" ? "リクエスト番号" : locale === "ko" ? "요청 번호" : "请求编号";
  return requestId ? `${message}（${requestLabel}：${requestId}）` : message;
}

type Props = { enabled: boolean; isAdmin: boolean; forms: FormRow[]; locale: Locale };

export function GuaranteeFormsClient({ enabled, isAdmin, forms, locale }: Props) {
  const router = useRouter();
  const messages = getGuaranteeFormsMessages(locale);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);

  if (!enabled) {
    return <main className="mx-auto max-w-4xl px-6 py-12"><h1 className="text-3xl font-semibold text-slate-950">{messages.title}</h1><p className="mt-3 text-sm text-slate-600">{messages.disabled}</p><Link href="/" className="mt-5 inline-block text-sm text-blue-700 underline">{messages.returnHome}</Link></main>;
  }

  async function upload(formElement: HTMLFormElement) {
    setError("");
    const fileField = formElement.elements.namedItem("file");
    const selectedFile = fileField instanceof HTMLInputElement ? fileField.files?.[0] : undefined;
    if (!selectedFile || selectedFile.type !== "application/pdf") {
      setError(UPLOAD_ERROR_MESSAGES[locale].blank_form_pdf_required);
      return;
    }
    if (selectedFile.size > 10 * 1024 * 1024) {
      setError(UPLOAD_ERROR_MESSAGES[locale].blank_form_file_too_large);
      return;
    }
    setUploading(true);
    try {
      const response = await fetch("/api/guarantee-g1-slice1", { method: "POST", body: new FormData(formElement) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const uploadError = new Error(String(payload.error ?? "upload_failed")) as Error & { requestId?: string };
        uploadError.requestId = typeof payload.requestId === "string" ? payload.requestId : undefined;
        throw uploadError;
      }
      const id = String(payload.blankForm?.id ?? "");
      const blankFormVersionId = String(payload.blankFormVersion?.id ?? "");
      const maskId = String(payload.maskId ?? "");
      if (!id || !blankFormVersionId || !maskId) throw new Error("上传已完成，但编辑所需的表格版本信息不完整。请从公司表格库重新打开。");
      const params = new URLSearchParams({ blankFormVersionId, maskId });
      router.push(`/guarantee-forms/${encodeURIComponent(id)}/edit?${params.toString()}`);
    } catch (caught) {
      setError(explainUploadError(caught, locale));
    } finally {
      setUploading(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="border-b border-slate-200 pb-6">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">受控 Preview/Staging</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">公司表格库</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">公司表格管理员在这里保存、校准、测试和发布本公司的表格。普通成员只使用已发布表格，不进入蒙板编辑。</p>
      </header>
      {error && <p role="alert" className="mt-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      <section className="mt-8" aria-labelledby="platform-forms-title">
        <h2 id="platform-forms-title" className="text-lg font-semibold text-slate-950">平台所有</h2>
        <p className="mt-2 rounded-md border border-dashed border-slate-300 px-4 py-6 text-sm leading-6 text-slate-600">当前没有可安装的平台蒙板。平台蒙板目录尚未开放，现有旧配置不会在这里自动展示。</p>
      </section>
      {isAdmin && <section id="upload-company-form" className="mt-8 border-y border-slate-200 py-8" aria-labelledby="upload-title">
        <h2 id="upload-title" className="text-lg font-semibold text-slate-950">上传客户空白表格</h2>
        <form className="mt-4 grid gap-4 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); void upload(event.currentTarget); }}>
          <label className="grid gap-2 text-sm text-slate-700">表格名称<input name="name" required className="rounded-md border border-slate-300 px-3 py-2" placeholder="测试申请书" /></label>
          <label className="grid gap-2 text-sm text-slate-700">空白 PDF<input name="file" required type="file" accept="application/pdf" className="rounded-md border border-slate-300 px-3 py-2" /></label>
          <label className="flex items-start gap-2 text-sm text-slate-700 md:col-span-2"><input name="blankFormDeclaration" value="on" required type="checkbox" className="mt-1" />我确认这是空白 PDF，且本经营主体有权用于业务。</label>
          <p className="text-xs leading-5 text-slate-600 md:col-span-2">第一版仅支持一页、10 MB 以内、未加密且未设密码的 PDF。上传后表格会长期保存在公司表格库；再次编辑或生成文件不需要重新上传。</p>
          <button disabled={uploading} className="w-fit rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" type="submit">{uploading ? "正在上传…" : "上传并制作蒙板"}</button>
        </form>
      </section>}
      <section className="mt-8" aria-labelledby="company-forms-title">
        <div className="flex items-baseline justify-between gap-4"><h2 id="company-forms-title" className="text-lg font-semibold text-slate-950">公司内部</h2><span className="text-sm text-slate-500">{forms.length} 张表格</span></div>
        {forms.length === 0 ? <div className="mt-4 rounded-md border border-dashed border-slate-300 px-4 py-8 text-sm text-slate-600"><p>还没有保存的公司表格。</p>{isAdmin && <a href="#upload-company-form" className="mt-3 inline-block rounded-md bg-slate-900 px-3 py-2 font-medium text-white">上传公司表格</a>}</div> : <ul className="mt-4 divide-y divide-slate-200 border-y border-slate-200">{forms.map((form) => {
          const published = form.versions.filter((version) => version.status === "published").sort((a, b) => b.versionNumber - a.versionNumber)[0];
          const draft = isAdmin ? form.versions.filter((version) => version.status === "draft").sort((a, b) => b.versionNumber - a.versionNumber)[0] : undefined;
          return <li key={form.id} className="flex flex-wrap items-center justify-between gap-4 py-4"><div><p className="font-medium text-slate-950">{form.name}</p><p className="mt-1 text-xs text-slate-500">{published ? `当前发布 v${published.versionNumber}` : "尚无发布版本"}{draft ? ` · 有待继续编辑的草稿 v${draft.versionNumber}` : ""}</p></div>{isAdmin ? <a href={`/guarantee-forms/${encodeURIComponent(form.id)}/edit`} className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800">打开并编辑</a> : <span className="text-sm text-slate-600">可用于案件申请书生成</span>}</li>;
        })}</ul>}
      </section>
    </main>
  );
}
