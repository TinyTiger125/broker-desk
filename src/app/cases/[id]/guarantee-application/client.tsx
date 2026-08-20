"use client";

import { useEffect, useState } from "react";

type PublishedVersion = { id: string; versionNumber: number; blankFormVersionId: string; formName: string };
type HistoryItem = { id: string; generatedAt: string; version?: string; fileReady: boolean };

type Props = {
  enabled: boolean;
  caseId: string;
  caseTitle: string;
  publishedVersions: PublishedVersion[];
  initialHistory: HistoryItem[];
  canGenerate: boolean;
};

async function postJson(action: string, body: Record<string, unknown>) {
  const response = await fetch("/api/guarantee-g1-slice1", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ...body }) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(payload.error ?? "request_failed"));
  return payload as Record<string, unknown>;
}

export function GuaranteeApplicationClient({ enabled, caseId, caseTitle, publishedVersions, initialHistory, canGenerate }: Props) {
  const [maskVersionId, setMaskVersionId] = useState(publishedVersions[0]?.id ?? "");
  const [consent, setConsent] = useState(false);
  const [confirmationId, setConfirmationId] = useState("");
  const [previewSrc, setPreviewSrc] = useState("");
  const [history, setHistory] = useState(initialHistory);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!maskVersionId) return;
      setError("");
      try {
        const result = await postJson("loadApplicationDraft", { caseId, maskVersionId });
        if (cancelled) return;
        const supplement = result.supplement as Record<string, unknown> | undefined;
        setConsent(supplement?.["company_option.friends_consent"] === true);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "request_failed");
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [caseId, maskVersionId]);

  if (!enabled) return <main className="mx-auto max-w-3xl px-6 py-12"><h1 className="text-2xl font-semibold text-slate-950">生成申请书</h1><p className="mt-3 text-sm text-slate-600">该功能当前仅在受控非生产环境开放。</p></main>;

  const selected = publishedVersions.find((item) => item.id === maskVersionId);
  const run = async (operation: () => Promise<void>) => {
    setBusy(true); setError(""); setMessage("");
    try { await operation(); } catch (caught) { setError(caught instanceof Error ? caught.message : "request_failed"); } finally { setBusy(false); }
  };

  return <main className="mx-auto max-w-4xl px-6 py-10">
    <header className="border-b border-slate-200 pb-6"><a href={`/cases/${encodeURIComponent(caseId)}`} className="text-sm text-blue-700 underline">返回案件</a><p className="mt-5 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">案件申请资料</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">生成保证公司申请书</h1><p className="mt-2 text-sm text-slate-600">{caseTitle}</p></header>
    {error && <p role="alert" className="mt-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
    {message && <p role="status" className="mt-5 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</p>}
    {publishedVersions.length === 0 ? <p className="mt-8 rounded-md border border-dashed border-slate-300 px-4 py-8 text-sm text-slate-600">当前公司没有可用的已发布表格。请联系公司表格管理员。</p> : <>
      <section className="mt-8 border-b border-slate-200 pb-8" aria-labelledby="select-form"><h2 id="select-form" className="text-lg font-semibold text-slate-950">选择已发布表格</h2><label className="mt-4 grid max-w-xl gap-2 text-sm text-slate-700">表格<select value={maskVersionId} onChange={(event) => { setMaskVersionId(event.target.value); setConfirmationId(""); setPreviewSrc(""); }} className="rounded-md border border-slate-300 px-3 py-2"><option value="">请选择</option>{publishedVersions.map((item) => <option key={item.id} value={item.id}>{item.formName} · v{item.versionNumber}</option>)}</select></label><p className="mt-3 text-xs leading-5 text-slate-500">案件姓名、地址、工作和房源等长期资料只读自案件；本次申请的声明和选择保存在案件下面的申请记录中，不会改写案件事实。</p><label className="mt-5 flex max-w-xl items-start gap-2 text-sm text-slate-700"><input type="checkbox" checked={consent} onChange={(event) => { setConsent(event.target.checked); setConfirmationId(""); setPreviewSrc(""); }} className="mt-1" />本次申请的个人信息同意确认（确认済み）</label></section>
      <section className="mt-8" aria-labelledby="preview-generate"><h2 id="preview-generate" className="text-lg font-semibold text-slate-950">预览与生成</h2><p className="mt-2 text-sm text-slate-600">系统会锁定案件资料、表格版本和本次申请记录后生成预览。普通成员不能进入蒙板编辑或下载客户空白原件。</p><div className="mt-5 flex flex-wrap gap-3"><button type="button" disabled={!selected || busy} onClick={() => void run(async () => { const result = await postJson("preview", { caseId, blankFormVersionId: selected?.blankFormVersionId, maskVersionId, supplement: { consent } }); setConfirmationId(String(result.confirmationId ?? "")); setPreviewSrc(result.previewPdfBase64 ? `data:application/pdf;base64,${String(result.previewPdfBase64)}` : ""); setMessage("预览已锁定，可以确认后生成文件。"); })} className="rounded-md border border-slate-300 px-4 py-2 text-sm disabled:opacity-50">预览申请书</button><button type="button" disabled={!confirmationId || !canGenerate || busy} onClick={() => void run(async () => { const result = await postJson("generate", { confirmationId }); const id = String(result.outputId ?? ""); setHistory((items) => [{ id, generatedAt: new Date().toISOString(), version: String(selected?.versionNumber ?? ""), fileReady: true }, ...items.filter((item) => item.id !== id)]); setMessage("申请书已生成并保存到本案件历史。"); })} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{canGenerate ? "确认并生成文件" : "没有生成权限"}</button></div>{previewSrc && <iframe title="申请书预览" src={previewSrc} className="mt-6 h-[560px] w-full rounded border border-slate-200" />}</section>
    </>}
    <section className="mt-10 border-t border-slate-200 pt-8" aria-labelledby="history-title"><h2 id="history-title" className="text-lg font-semibold text-slate-950">案件申请书历史</h2>{history.length === 0 ? <p className="mt-3 text-sm text-slate-600">尚无已生成文件。</p> : <ul className="mt-4 divide-y divide-slate-200 border-y border-slate-200">{history.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><span className="text-sm text-slate-700">版本 v{item.version || "-"} · {new Date(item.generatedAt).toLocaleString("ja-JP")}</span>{item.fileReady && <a className="text-sm text-blue-700 underline" href={`/api/guarantee-g1-slice1/output/${encodeURIComponent(item.id)}?caseId=${encodeURIComponent(caseId)}`}>查看 PDF</a>}</li>)}</ul>}</section>
  </main>;
}
