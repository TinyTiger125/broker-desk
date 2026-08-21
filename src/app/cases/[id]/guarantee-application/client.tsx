"use client";

import { useEffect, useState } from "react";

type PublishedVersion = { id: string; versionNumber: number; blankFormVersionId: string; formName: string };
type HistoryItem = { id: string; generatedAt: string; version?: string; fileReady: boolean };
type ApplicationDraftValues = {
  guaranteeCompany: string;
  applicationDate: string;
  planType: string;
  consent: boolean;
  collectionAgency: string;
  singleRider: string;
  notes: string;
};

function defaultApplicationDate() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function defaultApplicationValues(): ApplicationDraftValues {
  return {
    guaranteeCompany: "friends_guarantee",
    applicationDate: defaultApplicationDate(),
    planType: "住居用標準プラン",
    consent: false,
    collectionAgency: "",
    singleRider: "",
    notes: "",
  };
}

type Props = {
  enabled: boolean;
  caseId: string;
  caseTitle: string;
  caseFacts: Array<{ label: string; value: string }>;
  publishedVersions: PublishedVersion[];
  initialHistory: HistoryItem[];
  canGenerate: boolean;
};

async function postJson(action: string, body: Record<string, unknown>) {
  const response = await fetch("/api/guarantee-g1-slice1", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ...body }) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = String(payload.error ?? "");
    const messages: Record<string, string> = {
      case_not_found: "当前案件不存在或已无法访问。",
      mask_match_not_exact: "当前表格版本暂不可用，请返回公司表格库后重新进入。",
      application_draft_context_required: "请先选择已发布的公司表格。",
      application_draft_save_context_required: "请先选择已发布的公司表格后再保存。",
      permission_denied: "当前身份没有执行此操作的权限。",
      guarantee_slice1_failed: "申请资料暂时无法读取，请稍后重试。",
    };
    throw new Error(messages[code] ?? "申请资料暂时无法读取，请稍后重试。");
  }
  return payload as Record<string, unknown>;
}

export function GuaranteeApplicationClient({ enabled, caseId, caseTitle, caseFacts, publishedVersions, initialHistory, canGenerate }: Props) {
  const [maskVersionId, setMaskVersionId] = useState(publishedVersions[0]?.id ?? "");
  const initialValues = defaultApplicationValues();
  const [guaranteeCompany, setGuaranteeCompany] = useState(initialValues.guaranteeCompany);
  const [applicationDate, setApplicationDate] = useState(initialValues.applicationDate);
  const [planType, setPlanType] = useState(initialValues.planType);
  const [consent, setConsent] = useState(initialValues.consent);
  const [collectionAgency, setCollectionAgency] = useState(initialValues.collectionAgency);
  const [singleRider, setSingleRider] = useState(initialValues.singleRider);
  const [notes, setNotes] = useState(initialValues.notes);
  const [persisted, setPersisted] = useState(false);
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
        const defaults = defaultApplicationValues();
        const stringValue = (key: string, fallback: string) => typeof supplement?.[key] === "string" && String(supplement[key]).trim() ? String(supplement[key]) : fallback;
        setConsent(supplement?.["company_option.friends_consent"] === true);
        setGuaranteeCompany(stringValue("application.guarantee_company", defaults.guaranteeCompany));
        setApplicationDate(stringValue("application.application_date", defaults.applicationDate));
        setPlanType(stringValue("company_option.friends_plan_type", defaults.planType));
        setCollectionAgency(stringValue("company_option.friends_collection_agency", defaults.collectionAgency));
        setSingleRider(stringValue("company_option.friends_single_rider", defaults.singleRider));
        setNotes(stringValue("company_option.friends_notes", defaults.notes));
        setPersisted(result.persisted === true);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "申请资料暂时无法读取，请稍后重试。");
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [caseId, maskVersionId]);

  if (!enabled) return <main className="mx-auto max-w-3xl px-6 py-12"><h1 className="text-2xl font-semibold text-slate-950">生成申请书</h1><p className="mt-3 text-sm text-slate-600">该功能当前仅在受控非生产环境开放。</p></main>;

  const selected = publishedVersions.find((item) => item.id === maskVersionId);
  const run = async (operation: () => Promise<void>) => {
    setBusy(true); setError(""); setMessage("");
    try { await operation(); } catch (caught) { setError(caught instanceof Error ? caught.message : "申请资料暂时无法读取，请稍后重试。"); } finally { setBusy(false); }
  };

  const currentDraftValues = (): ApplicationDraftValues => ({
    guaranteeCompany,
    applicationDate,
    planType,
    consent,
    collectionAgency,
    singleRider,
    notes,
  });

  const resetApplicationValues = () => {
    const defaults = defaultApplicationValues();
    setGuaranteeCompany(defaults.guaranteeCompany);
    setApplicationDate(defaults.applicationDate);
    setPlanType(defaults.planType);
    setConsent(defaults.consent);
    setCollectionAgency(defaults.collectionAgency);
    setSingleRider(defaults.singleRider);
    setNotes(defaults.notes);
    setPersisted(false);
  };

  const saveDraft = () => void run(async () => {
    if (!selected) throw new Error("application_draft_save_context_required");
    await postJson("saveApplicationDraft", { caseId, maskVersionId, supplement: currentDraftValues() });
    setPersisted(true);
    setMessage("本次保证申请已保存到当前案件。离开后重新进入仍可恢复。");
  });

  return <main className="mx-auto max-w-4xl px-6 py-10">
    <header className="border-b border-slate-200 pb-6"><a href={`/cases/${encodeURIComponent(caseId)}`} className="text-sm text-blue-700 underline">返回案件</a><p className="mt-5 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">案件申请资料</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">生成保证公司申请书</h1><p className="mt-2 text-sm text-slate-600">{caseTitle}</p></header>
    {error && <p role="alert" className="mt-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
    {message && <p role="status" className="mt-5 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</p>}
    <section className="mt-8 rounded-lg border border-slate-200 bg-slate-50 p-5" aria-labelledby="case-data-title"><h2 id="case-data-title" className="text-lg font-semibold text-slate-950">案件资料</h2><p className="mt-2 text-sm text-slate-600">以下资料读取自当前案件，属于案件长期资料；本页面不会因填写本次保证申请而改写。</p>{caseFacts.length === 0 ? <p className="mt-4 text-sm text-slate-600">当前案件暂无可显示的案件资料。</p> : <dl className="mt-4 grid gap-3 sm:grid-cols-2">{caseFacts.map((fact) => <div key={fact.label} className="rounded-md border border-slate-200 bg-white px-3 py-2"><dt className="text-xs text-slate-500">{fact.label}</dt><dd className="mt-1 text-sm font-medium text-slate-900">{fact.value}</dd></div>)}</dl>}</section>
    {publishedVersions.length === 0 ? <p className="mt-8 rounded-md border border-dashed border-slate-300 px-4 py-8 text-sm text-slate-600">当前公司没有可用的已发布表格。请联系公司表格管理员。</p> : <>
      <section className="mt-8 border-b border-slate-200 pb-8" aria-labelledby="select-form"><h2 id="select-form" className="text-lg font-semibold text-slate-950">选择已发布表格</h2><label className="mt-4 grid max-w-xl gap-2 text-sm text-slate-700">表格<select value={maskVersionId} onChange={(event) => { setMaskVersionId(event.target.value); setConfirmationId(""); setPreviewSrc(""); resetApplicationValues(); }} className="rounded-md border border-slate-300 px-3 py-2"><option value="">请选择</option>{publishedVersions.map((item) => <option key={item.id} value={item.id}>{item.formName} · v{item.versionNumber}</option>)}</select></label><p className="mt-3 text-xs leading-5 text-slate-500">案件姓名、地址、工作和房源等长期资料属于案件资料；保证公司、申请日期和本次声明/选择属于当前案件的本次保证申请记录，不会改写案件事实。</p><div className="mt-5 grid max-w-xl gap-4 sm:grid-cols-2"><label className="grid gap-2 text-sm text-slate-700">保证公司<input value={guaranteeCompany === "friends_guarantee" ? "ふれんず保証" : guaranteeCompany} readOnly className="rounded-md border border-slate-300 bg-slate-50 px-3 py-2" /></label><label className="grid gap-2 text-sm text-slate-700">申请日期<input type="date" value={applicationDate} onChange={(event) => { setApplicationDate(event.target.value); setConfirmationId(""); setPreviewSrc(""); setPersisted(false); }} className="rounded-md border border-slate-300 px-3 py-2" /></label><label className="grid gap-2 text-sm text-slate-700">本次保证选择<select value={planType} onChange={(event) => { setPlanType(event.target.value); setConfirmationId(""); setPreviewSrc(""); setPersisted(false); }} className="rounded-md border border-slate-300 px-3 py-2"><option>住居用標準プラン</option><option>サポート50</option><option>サポート100</option><option>学生</option><option>駐車場プラン</option><option>店舗・事務所プラン</option><option>その他</option></select></label><label className="grid gap-2 text-sm text-slate-700">収納代行<select value={collectionAgency} onChange={(event) => { setCollectionAgency(event.target.value); setConfirmationId(""); setPreviewSrc(""); setPersisted(false); }} className="rounded-md border border-slate-300 px-3 py-2"><option value="">未選択</option><option>利用する</option><option>利用しない</option><option>未定</option></select></label><label className="grid gap-2 text-sm text-slate-700">单身特约<select value={singleRider} onChange={(event) => { setSingleRider(event.target.value); setConfirmationId(""); setPreviewSrc(""); setPersisted(false); }} className="rounded-md border border-slate-300 bg-white px-3 py-2"><option value="">未选择</option><option>あり</option><option>なし</option><option>未確認</option></select></label></div><label className="mt-4 flex max-w-xl items-start gap-2 text-sm text-slate-700"><input type="checkbox" checked={consent} onChange={(event) => { setConsent(event.target.checked); setConfirmationId(""); setPreviewSrc(""); setPersisted(false); }} className="mt-1" />本次申请的个人信息同意确认（确认済み）</label><label className="mt-4 grid max-w-xl gap-2 text-sm text-slate-700">本次声明/备注<textarea value={notes} onChange={(event) => { setNotes(event.target.value); setConfirmationId(""); setPreviewSrc(""); setPersisted(false); }} rows={3} className="rounded-md border border-slate-300 px-3 py-2" /></label><div className="mt-4 flex flex-wrap items-center gap-3"><button type="button" disabled={!selected || busy} onClick={saveDraft} className="rounded-md border border-slate-300 px-4 py-2 text-sm disabled:opacity-50">保存本次保证申请</button>{persisted && <span className="text-xs text-emerald-700">已保存到当前案件</span>}</div></section>
      <section className="mt-8" aria-labelledby="preview-generate"><h2 id="preview-generate" className="text-lg font-semibold text-slate-950">预览与生成</h2><p className="mt-2 text-sm text-slate-600">系统会锁定案件资料、表格版本和本次申请记录后生成预览。普通成员不能进入蒙板编辑或下载客户空白原件。</p><div className="mt-5 flex flex-wrap gap-3"><button type="button" disabled={!selected || busy} onClick={() => void run(async () => { const result = await postJson("preview", { caseId, blankFormVersionId: selected?.blankFormVersionId, maskVersionId, supplement: currentDraftValues() }); setConfirmationId(String(result.confirmationId ?? "")); setPreviewSrc(result.previewPdfBase64 ? `data:application/pdf;base64,${String(result.previewPdfBase64)}` : ""); setMessage("预览已锁定，可以确认后生成文件。"); setPersisted(true); })} className="rounded-md border border-slate-300 px-4 py-2 text-sm disabled:opacity-50">预览申请书</button><button type="button" disabled={!confirmationId || !canGenerate || busy} onClick={() => void run(async () => { const result = await postJson("generate", { confirmationId }); const id = String(result.outputId ?? ""); setHistory((items) => [{ id, generatedAt: new Date().toISOString(), version: String(selected?.versionNumber ?? ""), fileReady: true }, ...items.filter((item) => item.id !== id)]); setMessage("申请书已生成并保存到本案件历史。"); })} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{canGenerate ? "确认并生成文件" : "没有生成权限"}</button></div>{previewSrc && <iframe title="申请书预览" src={previewSrc} className="mt-6 h-[560px] w-full rounded border border-slate-200" />}</section>
    </>}
    <section className="mt-10 border-t border-slate-200 pt-8" aria-labelledby="history-title"><h2 id="history-title" className="text-lg font-semibold text-slate-950">案件申请书历史</h2>{history.length === 0 ? <p className="mt-3 text-sm text-slate-600">尚无已生成文件。</p> : <ul className="mt-4 divide-y divide-slate-200 border-y border-slate-200">{history.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><span className="text-sm text-slate-700">版本 v{item.version || "-"} · {new Date(item.generatedAt).toLocaleString("ja-JP")}</span>{item.fileReady && <a className="text-sm text-blue-700 underline" href={`/api/guarantee-g1-slice1/output/${encodeURIComponent(item.id)}?caseId=${encodeURIComponent(caseId)}`}>查看 PDF</a>}</li>)}</ul>}</section>
  </main>;
}
