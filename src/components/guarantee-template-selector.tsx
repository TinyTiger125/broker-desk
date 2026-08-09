"use client";
/* eslint-disable @next/next/no-img-element -- Template previews use generated, authenticated image URLs. */

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type GuaranteeTemplateOption = {
  id: string;
  companyDisplayName: string;
  companyLegalName: string;
  missingCount: number;
};

type GuaranteeTemplateSelectorProps = {
  caseId: string;
  initialTemplateId: string;
  templates: GuaranteeTemplateOption[];
  labels: {
    preview: string;
    loading: string;
    ready: string;
    missing: string;
  };
};

export function GuaranteeTemplateSelector({
  caseId,
  initialTemplateId,
  templates,
  labels,
}: GuaranteeTemplateSelectorProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchQuery = searchParams.toString();
  const locationKey = `${pathname || "/output-center"}?${searchQuery}`;
  const [selectedTemplateId, setSelectedTemplateId] = useState(initialTemplateId);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [previewPageCount, setPreviewPageCount] = useState(1);
  const [isFullscreenPreviewOpen, setIsFullscreenPreviewOpen] = useState(false);

  useEffect(() => {
    setSelectedTemplateId(initialTemplateId);
  }, [initialTemplateId]);

  useEffect(() => {
    const pendingKey = `preserve-scroll:${locationKey}`;
    const raw = window.sessionStorage.getItem(pendingKey);
    if (!raw) return;

    window.sessionStorage.removeItem(pendingKey);
    const top = Number(raw);
    if (!Number.isFinite(top) || top < 0) return;

    const restore = () => window.scrollTo({ top, left: 0, behavior: "auto" });
    let firstFrame = 0;
    let secondFrame = 0;
    const settleTimers: number[] = [];

    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        restore();
        settleTimers.push(
          window.setTimeout(restore, 80),
          window.setTimeout(restore, 280),
          window.setTimeout(restore, 700),
          window.setTimeout(restore, 1100),
        );
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      settleTimers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [locationKey]);

  const selectedTemplate =
    templates.find((template) => template.id === selectedTemplateId) ?? templates[0];
  const selectedTemplatePreviewId = selectedTemplate?.id;
  const previewSrc = useMemo(() => {
    if (!selectedTemplatePreviewId) return "";
    const params = new URLSearchParams({ caseId, mode: "preview", format: "png" });
    return `/api/guarantee-applications/${encodeURIComponent(selectedTemplatePreviewId)}/download?${params.toString()}`;
  }, [caseId, selectedTemplatePreviewId]);
  const previewSources = useMemo(
    () => Array.from({ length: previewPageCount }, (_, index) => `${previewSrc}&page=${index + 1}`),
    [previewPageCount, previewSrc],
  );
  const fullscreenPreviewSources = useMemo(
    () => previewSources.map((source) => `${source}&resolution=216`),
    [previewSources],
  );

  useEffect(() => {
    setPreviewLoading(true);
    setPreviewFailed(false);
    setPreviewPageCount(1);
    setIsFullscreenPreviewOpen(false);
  }, [previewSrc]);

  useEffect(() => {
    if (!isFullscreenPreviewOpen) return;

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsFullscreenPreviewOpen(false);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isFullscreenPreviewOpen]);

  useEffect(() => {
    if (!selectedTemplatePreviewId || !caseId) return;

    const controller = new AbortController();
    const params = new URLSearchParams({ caseId, mode: "preview", format: "preview-info" });

    void fetch(
      `/api/guarantee-applications/${encodeURIComponent(selectedTemplatePreviewId)}/download?${params.toString()}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load preview details");
        return (await response.json()) as { pageCount?: unknown };
      })
      .then((payload) => {
        const pageCount = Number(payload.pageCount);
        setPreviewPageCount(Number.isInteger(pageCount) && pageCount > 0 ? Math.min(pageCount, 12) : 1);
      })
      .catch((error: unknown) => {
        if ((error as { name?: string } | null)?.name !== "AbortError") setPreviewPageCount(1);
      });

    return () => controller.abort();
  }, [caseId, selectedTemplatePreviewId]);

  function selectTemplate(templateId: string) {
    if (templateId === selectedTemplateId) return;

    const params = new URLSearchParams(searchQuery);
    params.set("caseId", caseId);
    params.set("guaranteeTemplate", templateId);
    const query = params.toString();
    const safePathname = pathname || "/output-center";
    const nextHref = `${safePathname}?${query}`;
    const top = window.scrollY;

    window.sessionStorage.setItem(`preserve-scroll:${nextHref}`, String(top));
    setSelectedTemplateId(templateId);
    setPreviewLoading(true);
    setPreviewFailed(false);
    setPreviewPageCount(1);
    router.replace(nextHref, { scroll: false });
  }

  if (!selectedTemplate) return null;

  return (
    <div className="grid min-w-0 gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_minmax(24rem,32rem)]">
      <div className="grid content-start gap-2 sm:grid-cols-2">
        {templates.map((template) => {
          const selected = template.id === selectedTemplate.id;
          const statusLabel = template.missingCount > 0 ? `${labels.missing}: ${template.missingCount}` : labels.ready;
          return (
            <button
              key={template.id}
              type="button"
              aria-pressed={selected}
              onClick={() => selectTemplate(template.id)}
              className={`group min-h-28 rounded border p-3 text-left transition focus:outline-none focus:ring-2 focus:ring-[#1960a3] focus:ring-offset-2 ${
                selected
                  ? "border-[#1960a3] bg-blue-50 ring-1 ring-[#1960a3]"
                  : "border-slate-200 bg-white hover:border-[#1960a3] hover:bg-slate-50"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full ${
                    selected
                      ? "bg-[#1960a3] text-white"
                      : "bg-slate-100 text-slate-500 group-hover:bg-blue-100 group-hover:text-[#1960a3]"
                  }`}
                >
                  <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
                    {selected ? "check" : "article"}
                  </span>
                </span>
                <span
                  className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-black ${
                    template.missingCount > 0
                      ? "bg-rose-50 text-rose-700 ring-1 ring-rose-100"
                      : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
                  }`}
                >
                  {statusLabel}
                </span>
              </div>
              <h3 className="mt-3 truncate text-base font-black text-slate-950">{template.companyDisplayName}</h3>
              <p className="mt-1 truncate text-xs font-semibold text-slate-600">{template.companyLegalName}</p>
            </button>
          );
        })}
      </div>

      <section className="overflow-hidden rounded border border-slate-300 bg-white">
        <div className="flex min-h-12 items-center justify-between gap-3 border-b border-slate-200 px-3 py-2">
          <h3 className="truncate text-sm font-black text-slate-950">
            {selectedTemplate.companyDisplayName} {labels.preview}
          </h3>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setIsFullscreenPreviewOpen(true)}
              disabled={previewLoading || previewFailed}
              title="全屏预览"
              aria-label="全屏预览"
              className="flex h-8 w-8 items-center justify-center rounded text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-[#1960a3]"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">fullscreen</span>
            </button>
            <span
              className={`rounded px-2 py-0.5 text-[10px] font-black ${
                selectedTemplate.missingCount > 0
                  ? "bg-rose-50 text-rose-700 ring-1 ring-rose-100"
                  : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
              }`}
            >
              {selectedTemplate.missingCount > 0 ? `${labels.missing}: ${selectedTemplate.missingCount}` : labels.ready}
            </span>
          </div>
        </div>
        <div className="relative h-[34rem] overflow-y-auto bg-slate-100 p-3">
          {previewLoading ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-white/80 text-sm font-semibold text-slate-600">
              <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
              {labels.loading}
            </div>
          ) : null}
          {previewFailed ? (
            <p className="text-sm font-semibold text-slate-600">{labels.preview}</p>
          ) : null}
          <div className={`flex flex-col items-center gap-3 ${previewFailed ? "hidden" : ""}`}>
            {previewSources.map((source, index) => (
              <img
                key={source}
                title={`${selectedTemplate.companyDisplayName} ${labels.preview}`}
                src={source}
                alt={`${selectedTemplate.companyDisplayName} ${labels.preview} ${index + 1}`}
                onLoad={() => setPreviewLoading(false)}
                onError={() => {
                  setPreviewLoading(false);
                  setPreviewFailed(true);
                }}
                className="max-w-full object-contain shadow-sm"
              />
            ))}
          </div>
        </div>
      </section>

      {isFullscreenPreviewOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${selectedTemplate.companyDisplayName} ${labels.preview}`}
          className="fixed inset-0 z-[100] bg-slate-950/70 p-3 sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsFullscreenPreviewOpen(false);
          }}
        >
          <div className="mx-auto flex h-full max-w-[110rem] flex-col overflow-hidden rounded bg-slate-200 shadow-2xl">
            <div className="flex min-h-14 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4">
              <h3 className="truncate text-sm font-black text-slate-950">
                {selectedTemplate.companyDisplayName} {labels.preview}
              </h3>
              <button
                type="button"
                onClick={() => setIsFullscreenPreviewOpen(false)}
                title="关闭预览"
                aria-label="关闭预览"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-[#1960a3]"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto bg-slate-200 p-3 sm:p-8">
              <div className="mx-auto flex max-w-[92rem] flex-col items-center gap-6">
                {fullscreenPreviewSources.map((source, index) => (
                  <img
                    key={source}
                    src={source}
                    alt={`${selectedTemplate.companyDisplayName} ${labels.preview} ${index + 1}`}
                    className="h-auto max-w-full bg-white shadow-xl"
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
