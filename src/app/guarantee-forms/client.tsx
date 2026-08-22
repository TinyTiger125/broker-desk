"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type FormRow = {
  id: string;
  name: string;
  versions: Array<{ id: string; versionNumber: number; status: string; maskVersionId?: string; tested: boolean }>;
};

type Props = { enabled: boolean; isAdmin: boolean; forms: FormRow[] };

export function GuaranteeFormsClient({ enabled, isAdmin, forms }: Props) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);

  if (!enabled) {
    return <main className="mx-auto max-w-4xl px-6 py-12"><h1 className="text-3xl font-semibold text-slate-950">公司表格库</h1><p className="mt-3 text-sm text-slate-600">该功能当前仅在受控非生产环境开放。现有申请书流程不受影响。</p></main>;
  }

  async function upload(formElement: HTMLFormElement) {
    setError(""); setUploading(true);
    try {
      const response = await fetch("/api/guarantee-g1-slice1", { method: "POST", body: new FormData(formElement) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(payload.error ?? "upload_failed"));
      const id = String(payload.blankForm?.id ?? "");
      const blankFormVersionId = String(payload.blankFormVersion?.id ?? "");
      const maskId = String(payload.maskId ?? "");
      if (!id || !blankFormVersionId || !maskId) throw new Error("上传已完成，但编辑所需的表格版本信息不完整。请从公司表格库重新打开。");
      const params = new URLSearchParams({ blankFormVersionId, maskId });
      router.push(`/guarantee-forms/${encodeURIComponent(id)}/edit?${params.toString()}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "upload_failed");
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
