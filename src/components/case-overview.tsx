"use client";

import Link from "next/link";
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { CaseWorkbenchFieldForm } from "@/components/case-workbench-field-form";
import { ObjectPageShell, ResponsiveFormEditorSlot, ResponsiveFormField, ResponsiveFormLayout, ResponsiveFormRow } from "@/components/layout-system";
import type { Locale } from "@/lib/locale";
import layoutStyles from "@/components/layout-system/layout-system.module.css";

export type CaseFieldInputSpec = {
  kind: "text" | "textarea" | "tel" | "email" | "money" | "number" | "date" | "select";
  inputMode?: "text" | "numeric" | "decimal" | "tel" | "email";
  unit?: string;
  rows?: number;
  placeholder?: Partial<Record<Locale, string>>;
  options?: string[];
  validation?: "japanese_postal_code";
};

type EvidenceItem = {
  id: string;
  value: string;
  sourceLabel: string;
  reviewStatus: string;
  confidencePercent: number;
  method: string;
};

export type CaseOverviewField = {
  fieldKey: string;
  label: string;
  value: string;
  displayValue: string;
  required: boolean;
  state: string;
  importance: string;
  applicable: boolean;
  issueLabel?: string;
  treePath: readonly string[];
  sourceLabel: string;
  evidenceItems: EvidenceItem[];
  inputSpec: CaseFieldInputSpec;
};

export type CaseOverviewChildSection = {
  id: string;
  label: string;
  fields: CaseOverviewField[];
};

export type CaseOverviewSection = {
  id: string;
  label: string;
  children: CaseOverviewChildSection[];
};

type OutputBlockerField = {
  fieldKey: string;
  label: string;
  actionUrl: string;
};

export type CaseOverviewOutputBlocker = {
  code: string;
  count: number;
  label: string;
  message: string;
  fields: OutputBlockerField[];
};

type SaveAction = (formData: FormData) => void | Promise<void>;

type CaseViewSwitchProps = {
  caseId: string;
  activeView: "quick" | "overview";
  issueCount: number;
  locale: Locale;
};

function viewHref(caseId: string, view: "quick" | "overview") {
  return `/cases/${encodeURIComponent(caseId)}?view=${view}`;
}

export function CaseViewSwitch({ caseId, activeView, issueCount, locale }: CaseViewSwitchProps) {
  const labels = {
    quick: { ja: "補完", zh: "快速补全", ko: "빠른 보완" },
    overview: { ja: "案件全体", zh: "案件总览", ko: "안건 전체" },
  } as const;

  return (
    <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm" aria-label={locale === "zh" ? "案件视图" : locale === "ko" ? "안건 보기" : "案件表示"}>
      {(["quick", "overview"] as const).map((view) => (
        <Link
          key={view}
          href={viewHref(caseId, view)}
          aria-current={activeView === view ? "page" : undefined}
          className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-1 sm:px-4 ${
            activeView === view ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
          }`}
        >
          {labels[view][locale]}
          {view === "quick" && issueCount > 0 ? <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${activeView === view ? "bg-white/15 text-white" : "bg-rose-100 text-rose-700"}`}>{issueCount}</span> : null}
        </Link>
      ))}
    </div>
  );
}

export function CaseStatusSummary({
  locale,
  issueCount,
  expanded = false,
  onToggle,
}: {
  locale: Locale;
  issueCount: number;
  expanded?: boolean;
  onToggle?: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs font-bold text-amber-950">
      <span className="shrink-0">{issueCount > 0 ? (locale === "zh" ? `待处理（${issueCount}）` : locale === "ko" ? `처리 필요 (${issueCount})` : `要対応（${issueCount}件）`) : locale === "zh" ? "案件信息已整理" : locale === "ko" ? "안건 정보가 정리되었습니다" : "案件情報を整理しました"}</span>
      {onToggle ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls="case-attention-queue"
          className="rounded-md px-2 py-1 text-blue-700 underline-offset-2 hover:bg-blue-50 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
        >
          {locale === "zh" ? (expanded ? "收起" : "展开") : locale === "ko" ? (expanded ? "접기" : "펼치기") : expanded ? "閉じる" : "展開"}
        </button>
      ) : null}
    </div>
  );
}

export function CaseFieldState({
  issueLabel,
  normalLabel,
}: {
  issueLabel?: string;
  normalLabel?: string;
}) {
  return issueLabel ? (
    <span className="inline-flex max-w-full items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-[10px] font-black text-amber-900 ring-1 ring-amber-200">
      <span aria-hidden="true">!</span>
      <span className="break-words">{issueLabel}</span>
    </span>
  ) : normalLabel ? (
    <span className="text-xs font-semibold text-slate-500">{normalLabel}</span>
  ) : null;
}

export function CaseFieldValue({
  label,
  value,
  required = false,
  sourceLabel,
  showSource = false,
}: {
  label?: string;
  value: string;
  required?: boolean;
  sourceLabel?: string;
  showSource?: boolean;
}) {
  return (
    <div className="min-w-0">
      {label ? (
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="break-words text-sm font-black text-slate-950">
            {label}
            {required ? <span className="ml-1 text-slate-400" aria-label="required">*</span> : null}
          </span>
        </div>
      ) : null}
      <p className={`mt-1 break-words text-sm ${value === "-" ? "font-semibold text-slate-400" : "font-bold text-slate-800"}`}>{value}</p>
      {showSource && sourceLabel ? <p className="mt-1 break-words text-[11px] font-semibold text-slate-500">{sourceLabel}</p> : null}
    </div>
  );
}

export function CaseEvidenceSummary({
  locale,
  title,
  evidenceItems,
  currentValue,
  candidateFieldKey,
}: {
  locale: Locale;
  title: string;
  evidenceItems: EvidenceItem[];
  currentValue: string;
  candidateFieldKey: string;
}) {
  if (evidenceItems.length === 0) return null;
  const candidate = evidenceItems[0];
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
      <p className="text-xs font-black text-amber-950">{title}</p>
      <div className="mt-2 space-y-2">
        {evidenceItems.slice(0, 3).map((evidence) => (
          <div key={evidence.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-white px-3 py-2">
            <span className="break-words text-sm font-bold text-slate-900">{evidence.value || "-"}</span>
            <span className="break-words text-[11px] font-semibold text-slate-500">{evidence.sourceLabel}</span>
          </div>
        ))}
      </div>
      {candidate.value ? (
        <button type="submit" name="useCandidateField" value={candidateFieldKey} className="mt-3 w-full rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black text-blue-800 hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300">
          {candidate.value === currentValue
            ? locale === "zh" ? "按此值保存" : locale === "ko" ? "이 값으로 저장" : "この値で保存"
            : locale === "zh" ? "采用资料中的值" : locale === "ko" ? "자료 값을 사용" : "資料の値を使う"}
        </button>
      ) : null}
    </div>
  );
}

export function CaseEditPanel({
  title,
  context,
  issueLabel,
  closeLabel,
  onClose,
  children,
  className = "",
}: {
  title: string;
  context?: string;
  issueLabel?: string;
  closeLabel?: string;
  onClose?: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="min-w-0">
          {context ? <p className="text-[11px] font-bold text-blue-700">{context}</p> : null}
          <h3 className="mt-1 break-words text-lg font-black text-slate-950">{title}</h3>
          {issueLabel ? <p className="mt-1 break-words text-xs font-bold text-amber-900">{issueLabel}</p> : null}
        </div>
        {onClose && closeLabel ? (
          <button type="button" onClick={onClose} className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300">
            {closeLabel}
          </button>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function CaseIdentityHeader({
  caseId,
  caseTitle,
  applicantSummary,
  propertySummary,
  guaranteeCompanySummary,
  currentHandlerSummary,
  locale,
  activeView,
  issueCount,
  actions,
  showViewSwitch = true,
  queueOpen,
  onToggleQueue,
}: {
  caseId: string;
  caseTitle: string;
  applicantSummary: string;
  propertySummary: string;
  guaranteeCompanySummary: string;
  currentHandlerSummary: string;
  locale: Locale;
  activeView: "quick" | "overview";
  issueCount: number;
  actions: ReactNode;
  showViewSwitch?: boolean;
  queueOpen?: boolean;
  onToggleQueue?: () => void;
}) {
  const [compactHeader, setCompactHeader] = useState(false);
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const scrollContainer = findScrollContainer(header);
    const usesWindow = !scrollContainer || scrollContainer === document.scrollingElement;
    const onScroll = () => setCompactHeader((usesWindow ? window.scrollY : scrollContainer.scrollTop) > 80);
    onScroll();
    const target = usesWindow ? window : scrollContainer;
    target.addEventListener("scroll", onScroll, { passive: true });
    if (usesWindow) document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      target.removeEventListener("scroll", onScroll);
      if (usesWindow) document.removeEventListener("scroll", onScroll, { capture: true });
    };
  }, []);

  return (
    <header ref={headerRef} data-case-object-header className={`sticky top-16 z-30 border border-slate-200 bg-white/95 shadow-sm backdrop-blur transition-[padding,box-shadow] duration-200 lg:top-20 ${compactHeader ? "rounded-lg px-3 py-2 sm:px-4" : "rounded-xl px-3 py-3 sm:px-5 sm:py-4"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[11px] font-bold text-slate-500">
            <span>{activeView === "quick" ? (locale === "zh" ? "快速补全" : locale === "ko" ? "빠른 보완" : "補完") : locale === "zh" ? "案件总览" : locale === "ko" ? "안건 전체" : "案件全体"}</span>
            {compactHeader ? <span className="truncate text-slate-900">· {caseTitle}</span> : null}
          </div>
          {!compactHeader ? <h1 className="mt-1 break-words text-lg font-black tracking-tight text-slate-950 sm:text-2xl">{caseTitle}</h1> : null}
          <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-slate-600 ${compactHeader ? "mt-0" : "mt-2"}`}>
            <span>{locale === "zh" ? "申请人" : locale === "ko" ? "신청인" : "申込人"}：{applicantSummary}</span>
            <span className="hidden sm:inline">{locale === "zh" ? "物件" : locale === "ko" ? "물건" : "物件"}：{propertySummary}</span>
            <span className="hidden md:inline">{locale === "zh" ? "负责人" : locale === "ko" ? "담당" : "担当"}：{currentHandlerSummary}</span>
            <span className="hidden lg:inline">{locale === "zh" ? "保证公司" : locale === "ko" ? "보증 회사" : "保証会社"}：{guaranteeCompanySummary}</span>
          </div>
        </div>
        <div className="flex max-w-full shrink-0 flex-wrap items-center justify-end gap-2">{actions}</div>
      </div>
      {!compactHeader ? (
        <div className={`mt-3 flex flex-wrap items-center gap-2 sm:mt-4 ${showViewSwitch ? "sm:grid sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center" : ""}`}>
          {showViewSwitch ? <CaseViewSwitch caseId={caseId} activeView={activeView} issueCount={issueCount} locale={locale} /> : null}
          <CaseStatusSummary locale={locale} issueCount={issueCount} expanded={queueOpen} onToggle={onToggleQueue} />
        </div>
      ) : null}
    </header>
  );
}

function fieldAnchor(fieldKey: string) {
  return `case-field-${fieldKey.replaceAll(".", "-")}`;
}

function fieldIssue(field: CaseOverviewField) {
  return Boolean(field.issueLabel);
}

function isApplicantChild(child: CaseOverviewChildSection) {
  return child.id.includes("participants_applicant_");
}

function isWideResponsiveField(field: CaseOverviewField) {
  return field.inputSpec.kind === "textarea";
}

function buildResponsiveFieldRows(fields: CaseOverviewField[]) {
  const rows: CaseOverviewField[][] = [];
  let index = 0;
  while (index < fields.length) {
    const current = fields[index];
    const next = fields[index + 1];
    if (isWideResponsiveField(current)) {
      rows.push([current]);
      index += 1;
      continue;
    }
    if (next && !isWideResponsiveField(next)) {
      rows.push([current, next]);
      index += 2;
      continue;
    }
    rows.push([current]);
    index += 1;
  }
  return rows;
}

let suppressHashSyncUntil = 0;

function findScrollContainer(element: HTMLElement) {
  let parent = element.parentElement;
  while (parent) {
    const style = window.getComputedStyle(parent);
    const canScroll = /(auto|scroll|overlay)/.test(style.overflowY);
    if (canScroll && parent.scrollHeight > parent.clientHeight) return parent;
    parent = parent.parentElement;
  }
  return document.scrollingElement instanceof HTMLElement ? document.scrollingElement : null;
}

function getStickyOffset() {
  const header = document.querySelector<HTMLElement>("[data-case-object-header]");
  const anchorNav = document.querySelector<HTMLElement>("[data-case-anchor-nav]");
  const headerBottom = header?.getBoundingClientRect().bottom ?? 0;
  const anchorBottom = anchorNav?.getBoundingClientRect().bottom ?? 0;
  return Math.max(headerBottom, anchorBottom) + 12;
}

function inputClass(tone: "default" | "attention") {
  return tone === "attention"
    ? "w-full rounded-lg border border-rose-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-950 outline-none transition focus:border-slate-950 focus:ring-2 focus:ring-rose-100"
    : "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-950 outline-none transition focus:border-slate-950 focus:ring-2 focus:ring-blue-100";
}

export function CaseFieldInput({
  name,
  value,
  label,
  inputSpec,
  locale,
  tone = "default",
}: {
  name: string;
  value: string;
  label: string;
  inputSpec: CaseFieldInputSpec;
  locale: Locale;
  tone?: "default" | "attention";
}) {
  const spec = inputSpec;
  const placeholder = spec.placeholder?.[locale];
  const currentOptionExists = spec.options?.some((option) => option === value);

  if (spec.kind === "select") {
    return (
      <select name={name} defaultValue={value} aria-label={label} data-case-validation={spec.validation?.replaceAll("_", "-")} className={inputClass(tone)}>
        <option value="">{locale === "zh" ? "未填写" : locale === "ko" ? "미입력" : "未入力"}</option>
        {value && !currentOptionExists ? <option value={value}>{value}</option> : null}
        {spec.options?.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    );
  }

  if (spec.kind === "textarea") {
    return <textarea name={name} aria-label={label} defaultValue={value} rows={spec.rows ?? 3} placeholder={placeholder} className={inputClass(tone)} />;
  }

  return (
    <span className="relative block">
      <input
        name={name}
        type={spec.kind === "date" ? "date" : spec.kind === "email" ? "email" : spec.kind === "tel" ? "tel" : "text"}
        inputMode={spec.inputMode}
        aria-label={label}
        data-case-validation={spec.validation?.replaceAll("_", "-")}
        data-validation-message={spec.validation === "japanese_postal_code" ? locale === "zh" ? "日本邮政编码必须为7位数字。" : locale === "ko" ? "일본 우편번호는 7자리로 입력해 주세요." : "日本の郵便番号は7桁で入力してください。" : undefined}
        defaultValue={value}
        placeholder={placeholder}
        className={`${inputClass(tone)} ${spec.unit ? "pr-14" : ""}`}
      />
      {spec.unit ? <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-bold text-slate-500">{spec.unit}</span> : null}
    </span>
  );
}

function FieldInput({ field, locale }: { field: CaseOverviewField; locale: Locale }) {
  return <CaseFieldInput name={`field:${field.fieldKey}`} value={field.value} label={field.label} inputSpec={field.inputSpec} locale={locale} tone={fieldIssue(field) ? "attention" : "default"} />;
}

function localizeOutputLabel(locale: Locale, code: string) {
  const labels: Record<string, Record<Locale, string>> = {
    required_fields_missing: { ja: "必須情報が未入力", zh: "必填信息未填写", ko: "필수 정보가 비어 있음" },
    draft_required_missing: { ja: "申込書の追加情報が未入力", zh: "申请书追加信息未填写", ko: "신청서 추가 정보가 비어 있음" },
    template_not_verified: { ja: "テンプレートの確認が必要", zh: "模板仍需确认", ko: "템플릿 확인 필요" },
    candidate_fields_unconfirmed: { ja: "候補入力の確認が必要", zh: "候选输入仍需处理", ko: "후보 입력 확인 필요" },
    manual_fields_unplaced: { ja: "印字位置の確認が必要", zh: "打印位置仍需确认", ko: "인쇄 위치 확인 필요" },
    print_fit_blocked: { ja: "文字が印字枠に収まらない", zh: "文字超出打印区域", ko: "문자가 인쇄 영역을 넘음" },
  };
  return labels[code]?.[locale] ?? (locale === "zh" ? "输出前需要处理" : locale === "ko" ? "출력 전에 처리 필요" : "出力前に対応が必要");
}

function localizeOutputMessage(locale: Locale, code: string) {
  const messages: Record<string, Record<Locale, string>> = {
    required_fields_missing: { ja: "案件の必須情報を補ってください。", zh: "请补齐案件必填信息。", ko: "안건의 필수 정보를 보완해 주세요." },
    draft_required_missing: { ja: "申込書の追加情報を補ってください。", zh: "请补齐申请书追加信息。", ko: "신청서 추가 정보를 보완해 주세요." },
    template_not_verified: { ja: "テンプレートを確認してから出力してください。", zh: "请先确认模板，再进行输出。", ko: "템플릿을 확인한 뒤 출력해 주세요." },
    candidate_fields_unconfirmed: { ja: "候補入力を申込書プレビューで確認してください。", zh: "请在申请书预览中处理候选输入。", ko: "신청서 미리보기에서 후보 입력을 확인해 주세요." },
    manual_fields_unplaced: { ja: "申込書上の入力位置を確認してください。", zh: "请确认申请书上的输入位置。", ko: "신청서 입력 위치를 확인해 주세요." },
    print_fit_blocked: { ja: "長い文字列や桁数超過をプレビューで調整してください。", zh: "请在预览中调整过长文字或超出位数。", ko: "미리보기에서 긴 문자열이나 자릿수 초과를 조정해 주세요." },
  };
  return messages[code]?.[locale] ?? (locale === "zh" ? "请处理后再下载。" : locale === "ko" ? "처리한 뒤 다운로드해 주세요." : "対応してからダウンロードしてください。");
}

function useActiveSection(sectionIds: string[]) {
  const [activeSection, setActiveSection] = useState(sectionIds[0] ?? "");

  useEffect(() => {
    const elements = sectionIds.map((id) => document.getElementById(id)).filter((element): element is HTMLElement => Boolean(element));
    if (elements.length === 0) return;
    const scrollContainer = findScrollContainer(elements[0]);
    const observerRoot = scrollContainer && scrollContainer !== document.scrollingElement ? scrollContainer : null;
    const updateFromScroll = (syncHash = false) => {
      const boundary = getStickyOffset() + 8;
      const current = elements.filter((element) => element.getBoundingClientRect().top <= boundary).at(-1);
      const nextSectionId = current?.id ?? elements[0].id;
      setActiveSection(nextSectionId);
      if (syncHash && Date.now() >= suppressHashSyncUntil) {
        const nextHash = `#${nextSectionId}`;
        if (window.location.hash !== nextHash) window.history.replaceState(window.history.state, "", nextHash);
      }
    };

    const observer = new IntersectionObserver(
      () => updateFromScroll(),
      { root: observerRoot, rootMargin: `-${Math.ceil(getStickyOffset())}px 0px -55% 0px`, threshold: [0, 0.1, 0.4] },
    );
    elements.forEach((element) => observer.observe(element));
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => updateFromScroll());
    const header = document.querySelector<HTMLElement>("[data-case-object-header]");
    const anchorNav = document.querySelector<HTMLElement>("[data-case-anchor-nav]");
    if (header) resizeObserver?.observe(header);
    if (anchorNav) resizeObserver?.observe(anchorNav);
    const target = observerRoot ?? window;
    const onScroll = () => updateFromScroll(true);
    const onResize = () => updateFromScroll();
    target.addEventListener("scroll", onScroll, { passive: true });
    if (!observerRoot) document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("resize", onResize, { passive: true });
    updateFromScroll();
    return () => {
      observer.disconnect();
      resizeObserver?.disconnect();
      target.removeEventListener("scroll", onScroll);
      if (!observerRoot) document.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", onResize);
    };
  }, [sectionIds]);

  return [activeSection, setActiveSection] as const;
}

function scrollToId(id: string, behavior: ScrollBehavior = "smooth", updateHistory = true) {
  const target = document.getElementById(id);
  if (!target) return;
  suppressHashSyncUntil = Date.now() + (behavior === "smooth" ? 800 : 250);
  const scrollContainer = findScrollContainer(target);
  const documentScroller = document.scrollingElement;
  const usesWindow = !scrollContainer || scrollContainer === documentScroller;
  const currentScrollTop = usesWindow ? window.scrollY : scrollContainer.scrollTop;
  const top = target.getBoundingClientRect().top + currentScrollTop - getStickyOffset();
  if (usesWindow) {
    window.scrollTo({ top: Math.max(0, top), behavior });
  } else {
    scrollContainer.scrollTo({ top: Math.max(0, top), behavior });
  }
  const correctPosition = () => {
    const correction = target.getBoundingClientRect().top - getStickyOffset();
    if (Math.abs(correction) < 4) return;
    if (usesWindow) {
      window.scrollTo({ top: Math.max(0, window.scrollY + correction), behavior: "auto" });
    } else {
      scrollContainer.scrollTo({ top: Math.max(0, scrollContainer.scrollTop + correction), behavior: "auto" });
    }
  };
  window.requestAnimationFrame(() => window.requestAnimationFrame(correctPosition));
  window.setTimeout(correctPosition, behavior === "smooth" ? 650 : 0);
  const nextHash = `#${id}`;
  if (updateHistory && window.location.hash !== nextHash) window.history.pushState(null, "", nextHash);
}

export function CaseOverview({
  caseId,
  caseTitle,
  applicantSummary,
  propertySummary,
  guaranteeCompanySummary,
  currentHandlerSummary,
  sections,
  locale,
  issueCount,
  outputHref,
  previewHref,
  downloadHref,
  dataVersion,
  outputBlockers,
  hasOutputTemplate,
  saveAction,
  readOnly = false,
  showViewSwitch,
  associationPanel,
  visibilityLabel,
  flash,
  initialFieldKey,
  initialScrollTop,
}: {
  caseId: string;
  caseTitle: string;
  applicantSummary: string;
  propertySummary: string;
  guaranteeCompanySummary: string;
  currentHandlerSummary: string;
  sections: CaseOverviewSection[];
  locale: Locale;
  issueCount: number;
  outputHref: string;
  previewHref: string;
  downloadHref: string | null;
  dataVersion: string;
  outputBlockers: CaseOverviewOutputBlocker[];
  hasOutputTemplate: boolean;
  saveAction: SaveAction;
  readOnly?: boolean;
  showViewSwitch: boolean;
  associationPanel?: ReactNode;
  visibilityLabel?: string;
  flash?: ReactNode;
  initialFieldKey?: string;
  initialScrollTop?: number;
}) {
  const sectionIds = useMemo(() => sections.map((section) => section.id), [sections]);
  const [activeSection, setActiveSection] = useActiveSection(sectionIds);
  const [queueOpen, setQueueOpen] = useState(false);
  const [downloadAttempted, setDownloadAttempted] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmedVersion, setConfirmedVersion] = useState<string | null>(null);
  const [editingFieldKey, setEditingFieldKey] = useState<string | null>(null);
  const [wideResponsiveLayout, setWideResponsiveLayout] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const lastTriggerIdRef = useRef<string | null>(null);
  const hasBlockingOutput = outputBlockers.length > 0;
  const isConfirmedForCurrentData = confirmedVersion === dataVersion;
  const attentionFields = useMemo(
    () => sections.flatMap((section) => section.children.flatMap((child) => child.fields.filter(fieldIssue))),
    [sections],
  );
  const editingField = editingFieldKey ? sections.flatMap((section) => section.children.flatMap((child) => child.fields)).find((field) => field.fieldKey === editingFieldKey) : undefined;
  const editingSection = editingField
    ? sections.find((section) => section.children.some((child) => child.fields.some((field) => field.fieldKey === editingField.fieldKey)))
    : undefined;
  const initialFieldSectionId = initialFieldKey
    ? sections.find((section) => section.children.some((child) => child.fields.some((field) => field.fieldKey === initialFieldKey)))?.id
    : undefined;

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 64rem)");
    const syncViewport = () => setWideResponsiveLayout(mediaQuery.matches);
    syncViewport();
    mediaQuery.addEventListener?.("change", syncViewport);
    return () => mediaQuery.removeEventListener?.("change", syncViewport);
  }, []);

  useEffect(() => {
    const page = pageRef.current;
    if (!page) return;
    const syncScrollMargin = () => page.style.setProperty("--case-object-scroll-margin", `${Math.ceil(getStickyOffset())}px`);
    syncScrollMargin();
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(syncScrollMargin);
    const header = document.querySelector<HTMLElement>("[data-case-object-header]");
    const anchorNav = document.querySelector<HTMLElement>("[data-case-anchor-nav]");
    if (header) resizeObserver?.observe(header);
    if (anchorNav) resizeObserver?.observe(anchorNav);
    window.addEventListener("resize", syncScrollMargin, { passive: true });
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", syncScrollMargin);
      page.style.removeProperty("--case-object-scroll-margin");
    };
  }, []);

  useEffect(() => {
    if (!editingFieldKey) return;
    const frame = window.requestAnimationFrame(() => {
      const input = editorRef.current?.querySelector<HTMLElement>("input:not([type=hidden]), select, textarea") ?? editorRef.current?.querySelector<HTMLElement>("button");
      input?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [editingFieldKey]);

  useLayoutEffect(() => {
    if (editingFieldKey || !lastTriggerIdRef.current) return;
    const triggerId = lastTriggerIdRef.current;
    document.querySelector<HTMLButtonElement>(`[data-field-trigger="${triggerId}"]`)?.focus({ preventScroll: true });
  }, [editingFieldKey]);

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    const initialFieldAnchor = initialFieldKey ? fieldAnchor(initialFieldKey) : "";
    const targetId = hash || initialFieldAnchor;
    if (!targetId && initialScrollTop === undefined) return;
    const frame = window.requestAnimationFrame(() => {
      suppressHashSyncUntil = Date.now() + 600;
      if (initialScrollTop === undefined && targetId) scrollToId(targetId, "auto", false);
      const trigger = initialFieldAnchor
        ? document.querySelector<HTMLButtonElement>(`[data-field-trigger="${initialFieldAnchor}"]`)
        : targetId.startsWith("case-field-")
          ? document.querySelector<HTMLButtonElement>(`[data-field-trigger="${targetId}"]`)
          : null;
      trigger?.focus({ preventScroll: true });
      if (initialScrollTop !== undefined) {
        window.requestAnimationFrame(() => {
          window.scrollTo({ top: Math.max(0, initialScrollTop), behavior: "auto" });
          if (initialFieldSectionId) {
            window.history.replaceState(window.history.state, "", `#${initialFieldSectionId}`);
          }
          trigger?.focus({ preventScroll: true });
        });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [initialFieldKey, initialFieldSectionId, initialScrollTop]);

  useEffect(() => {
    const onPopState = () => {
      const hash = window.location.hash.slice(1);
      if (hash) scrollToId(hash, "auto", false);
      else {
        suppressHashSyncUntil = Date.now() + 250;
        window.scrollTo({ top: 0, behavior: "auto" });
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const focusField = (fieldKey: string) => {
    const id = fieldAnchor(fieldKey);
    setQueueOpen(false);
    scrollToId(id);
    window.setTimeout(() => document.querySelector<HTMLButtonElement>(`[data-field-trigger="${id}"]`)?.focus({ preventScroll: true }), 350);
  };

  const activateAnchorWithKeyboard = (event: React.KeyboardEvent<HTMLAnchorElement>, id: string) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    setActiveSection(id);
    scrollToId(id);
  };

  const openEditor = (field: CaseOverviewField) => {
    lastTriggerIdRef.current = fieldAnchor(field.fieldKey);
    setEditingFieldKey(field.fieldKey);
  };

  const closeEditor = () => {
    setEditingFieldKey(null);
  };

  useEffect(() => {
    if (!editingFieldKey) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeEditor();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editingFieldKey]);

  const handleDownload = () => {
    if (!hasOutputTemplate || !downloadHref) {
      window.location.assign(outputHref);
      return;
    }
    if (hasBlockingOutput) {
      setDownloadAttempted(true);
      setQueueOpen(true);
      window.requestAnimationFrame(() => document.getElementById("case-output-blockers")?.scrollIntoView({ behavior: "smooth", block: "center" }));
      return;
    }
    if (isConfirmedForCurrentData) {
      window.location.assign(downloadHref);
      return;
    }
    setConfirmOpen(true);
  };

  const visibleAnchors = sections.slice(0, 4);
  const overflowAnchors = sections.slice(4);
  const editingApplicantField = editingField && sections.some((section) => section.children.some((child) => isApplicantChild(child) && child.fields.some((field) => field.fieldKey === editingField.fieldKey)));

  const renderEditor = () => {
    if (!editingField) return null;
    return (
      <CaseEditPanel
        title={editingField.label}
        context={editingField.treePath.join(" / ")}
        issueLabel={fieldIssue(editingField) ? editingField.issueLabel : undefined}
        closeLabel={locale === "zh" ? "取消" : locale === "ko" ? "취소" : "キャンセル"}
        onClose={closeEditor}
        className={layoutStyles.editorPanel}
      >
        <CaseWorkbenchFieldForm
          action={saveAction}
          caseId={caseId}
          fieldKey={editingField.fieldKey}
          returnField={editingField.fieldKey}
          returnAnchor={editingSection?.id ?? fieldAnchor(editingField.fieldKey)}
          returnView="overview"
          showSaveWhenPristine
          saveLabel={fieldIssue(editingField) ? (locale === "zh" ? "处理问题" : locale === "ko" ? "문제 처리" : "対応して保存") : (locale === "zh" ? "保存" : locale === "ko" ? "저장" : "保存")}
          savingLabel={locale === "zh" ? "保存中" : locale === "ko" ? "저장 중" : "保存中"}
          className={`${layoutStyles.editorForm} mt-5 space-y-4`}
        >
          <CaseEvidenceSummary
            locale={locale}
            title={locale === "zh" ? "资料候选" : locale === "ko" ? "자료 후보" : "資料候補"}
            evidenceItems={editingField.evidenceItems}
            currentValue={editingField.value}
            candidateFieldKey={editingField.fieldKey}
          />
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-black text-slate-600">{locale === "zh" ? "案件信息" : locale === "ko" ? "안건 정보" : "案件情報"}</p>
            <div className="mt-2"><FieldInput field={editingField} locale={locale} /></div>
          </div>
        </CaseWorkbenchFieldForm>
      </CaseEditPanel>
    );
  };

  const attentionQueue = queueOpen ? (
    <section id="case-attention-queue" className="rounded-xl border border-amber-200 bg-amber-50/60 p-4" aria-label={locale === "zh" ? "待处理项目" : locale === "ko" ? "처리 필요 항목" : "要対応項目"}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-black text-amber-950">{locale === "zh" ? "待处理" : locale === "ko" ? "처리 필요" : "要対応"}</h2>
          <p className="mt-1 text-xs font-semibold text-amber-900">{locale === "zh" ? "只列出缺失、冲突或无法可靠决定的项目。" : locale === "ko" ? "누락, 충돌 또는 안정적으로 결정할 수 없는 항목만 표시합니다." : "未入力、相違、判断できない項目だけを表示します。"}</p>
        </div>
        <button type="button" onClick={() => setQueueOpen(false)} className="rounded-md px-2 py-1 text-xs font-bold text-amber-900 underline underline-offset-2">{locale === "zh" ? "收起" : locale === "ko" ? "접기" : "閉じる"}</button>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {attentionFields.map((field) => (
          <button key={field.fieldKey} type="button" onClick={() => focusField(field.fieldKey)} className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-white px-3 py-2 text-left text-xs font-bold text-slate-800 hover:border-amber-400">
            <span className="min-w-0 truncate">{field.label}</span>
            <span className="shrink-0 text-amber-800">{locale === "zh" ? "定位" : locale === "ko" ? "이동" : "移動"}</span>
          </button>
        ))}
        {attentionFields.length === 0 ? <p className="text-xs font-semibold text-amber-900">{locale === "zh" ? "当前没有可定位的字段异常。" : locale === "ko" ? "현재 이동할 필드 문제가 없습니다." : "移動できる項目はありません。"}</p> : null}
      </div>
    </section>
  ) : null;

  const outputState = downloadAttempted && hasBlockingOutput ? (
    <section id="case-output-blockers" role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4">
      <div className="flex items-start gap-3">
        <span className="material-symbols-outlined text-[20px] text-rose-700" aria-hidden="true">error</span>
        <div>
          <h2 className="text-sm font-black text-rose-950">{locale === "zh" ? "暂时不能下载申请书" : locale === "ko" ? "신청서를 아직 다운로드할 수 없습니다" : "申込書をまだダウンロードできません"}</h2>
          <p className="mt-1 text-xs font-semibold text-rose-900">{locale === "zh" ? "请处理以下问题后重试。申请书预览仍然可以打开。" : locale === "ko" ? "아래 문제를 처리한 뒤 다시 시도해 주세요. 신청서 미리보기는 계속 열 수 있습니다." : "次の項目を対応してから再試行してください。申込書プレビューは開けます。"}</p>
        </div>
      </div>
      <div className="mt-3 grid gap-2">
        {outputBlockers.map((blocker) => (
          <div key={blocker.code} className="rounded-lg border border-rose-200 bg-white p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-black text-rose-900">{blocker.label || localizeOutputLabel(locale, blocker.code)}</p>
              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-black text-rose-800">{blocker.count}</span>
            </div>
            <p className="mt-1 text-xs font-semibold text-slate-600">{blocker.message || localizeOutputMessage(locale, blocker.code)}</p>
            {blocker.fields.length > 0 ? <div className="mt-2 flex flex-wrap gap-2">{blocker.fields.slice(0, 5).map((field) => <Link key={`${blocker.code}-${field.fieldKey}`} href={field.actionUrl} className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50">{field.label}</Link>)}</div> : null}
          </div>
        ))}
      </div>
    </section>
  ) : null;

  return (
    <div ref={pageRef} className="flex min-w-0 flex-col gap-4 pb-16">
      <ObjectPageShell
        header={
          <CaseIdentityHeader
            caseId={caseId}
            caseTitle={caseTitle}
            applicantSummary={applicantSummary}
            propertySummary={propertySummary}
            guaranteeCompanySummary={guaranteeCompanySummary}
            currentHandlerSummary={currentHandlerSummary}
            locale={locale}
            activeView="overview"
            showViewSwitch={showViewSwitch}
            issueCount={issueCount}
            queueOpen={queueOpen}
            onToggleQueue={() => setQueueOpen((open) => !open)}
            actions={
              <>
                {!readOnly ? (
                  <>
                    <a href={`/cases/${encodeURIComponent(caseId)}/guarantee-application`} className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black text-blue-900 hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300">
                      {locale === "zh" ? "生成申请书" : locale === "ko" ? "신청서 생성" : "申込書を生成"}
                    </a>
                    <Link href={previewHref} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-900 hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300">
                      <span className="material-symbols-outlined text-[16px]" aria-hidden="true">visibility</span>
                      {locale === "zh" ? "申请书预览" : locale === "ko" ? "신청서 미리보기" : "申込書プレビュー"}
                    </Link>
                    <button type="button" onClick={handleDownload} className="hidden items-center gap-1.5 rounded-lg bg-slate-950 px-3 py-2 text-xs font-black text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 sm:inline-flex">
                      <span className="material-symbols-outlined text-[16px]" aria-hidden="true">download</span>
                      {hasOutputTemplate ? (locale === "zh" ? "下载申请书" : locale === "ko" ? "신청서 다운로드" : "申込書をダウンロード") : (locale === "zh" ? "选择输出模板" : locale === "ko" ? "출력模板を選ぶ" : "出力テンプレートを選ぶ")}
                    </button>
                  </>
                ) : null}
              </>
            }
          />
        }
        feedback={
          <>
            {readOnly && visibilityLabel ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700" role="status">
                {visibilityLabel}
              </div>
            ) : null}
            {flash}
            {outputState}
          </>
        }
        state={attentionQueue}
      >
        {associationPanel}
        <nav data-case-anchor-nav aria-label={locale === "zh" ? "案件章节" : locale === "ko" ? "안건 섹션" : "案件セクション"} className="sticky top-[8.75rem] z-20 rounded-xl border border-slate-200 bg-white/95 px-2 py-2 shadow-sm backdrop-blur lg:top-[10.5rem]">
          <div className="hidden items-center gap-1 sm:flex">
            {visibleAnchors.map((section) => (
              <a key={section.id} href={`#${section.id}`} onClick={(event) => { event.preventDefault(); setActiveSection(section.id); scrollToId(section.id); }} onKeyDown={(event) => activateAnchorWithKeyboard(event, section.id)} aria-current={activeSection === section.id ? "location" : undefined} className={`min-w-0 flex-1 truncate rounded-lg px-3 py-2 text-center text-xs font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 ${activeSection === section.id ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"}`}>
                {section.label}
              </a>
            ))}
            {overflowAnchors.length > 0 ? (
              <details className="relative shrink-0">
                <summary className="cursor-pointer list-none rounded-lg px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-50">{locale === "zh" ? "更多" : locale === "ko" ? "더보기" : "その他"}</summary>
                <div className="absolute right-0 top-full mt-1 w-52 rounded-lg border border-slate-200 bg-white p-1 shadow-xl">
                  {overflowAnchors.map((section) => <a key={section.id} href={`#${section.id}`} onClick={(event) => { event.preventDefault(); setActiveSection(section.id); scrollToId(section.id); }} onKeyDown={(event) => activateAnchorWithKeyboard(event, section.id)} className={`block rounded-md px-3 py-2 text-left text-xs font-bold ${activeSection === section.id ? "bg-slate-100 text-slate-950" : "text-slate-600 hover:bg-slate-50"}`}>{section.label}</a>)}
                </div>
              </details>
            ) : null}
          </div>
          <label className="flex items-center gap-2 sm:hidden">
            <span className="sr-only">{locale === "zh" ? "当前章节" : locale === "ko" ? "현재 섹션" : "現在のセクション"}</span>
            <select value={activeSection} onChange={(event) => { setActiveSection(event.target.value); scrollToId(event.target.value); }} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-900 focus:border-slate-950 focus:ring-2 focus:ring-blue-100">
              {sections.map((section) => <option key={section.id} value={section.id}>{section.label}</option>)}
            </select>
          </label>
        </nav>
        <main className="space-y-4">
          {sections.map((section) => {
            const sectionFields = section.children.flatMap((child) => child.fields);
            const sectionIssues = sectionFields.filter(fieldIssue).length;
            return (
              <section key={section.id} id={section.id} style={{ scrollMarginTop: "var(--case-object-scroll-margin, 11rem)" }} className="scroll-mt-[11rem] rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-4 py-4 sm:px-6">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-lg font-black text-slate-950">{section.label}</h2>
                    {sectionIssues > 0 ? <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-black text-amber-900 ring-1 ring-amber-200">{locale === "zh" ? `待处理 ${sectionIssues}` : locale === "ko" ? `처리 필요 ${sectionIssues}` : `要対応 ${sectionIssues}`}</span> : null}
                  </div>
                </div>
                <div className="space-y-5 p-4 sm:p-6">
                  {section.children.map((child) => {
                    const applicantChild = isApplicantChild(child);
                    const childEditing = Boolean(editingApplicantField && child.fields.some((field) => field.fieldKey === editingField?.fieldKey));
                    const renderField = (field: CaseOverviewField) => (
                      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <CaseFieldValue label={field.label} value={field.displayValue} required={field.required} />
                          {fieldIssue(field) ? <CaseFieldState issueLabel={field.issueLabel} normalLabel={locale === "zh" ? "已填写" : locale === "ko" ? "입력됨" : "入力済み"} /> : null}
                          {fieldIssue(field) && field.evidenceItems.length > 0 ? (
                            <details className="mt-2 text-xs">
                              <summary className="cursor-pointer font-bold text-slate-600">{locale === "zh" ? "查看资料依据" : locale === "ko" ? "자료 근거 보기" : "資料の根拠を見る"}</summary>
                              <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-white p-2">
                                {field.evidenceItems.slice(0, 3).map((evidence) => <div key={evidence.id} className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold text-slate-700">{evidence.value || "-"}</span><span className="text-[11px] font-semibold text-slate-500">{evidence.sourceLabel}</span></div>)}
                              </div>
                            </details>
                          ) : null}
                        </div>
                        {!readOnly ? (
                          <button
                            type="button"
                            data-field-trigger={fieldAnchor(field.fieldKey)}
                            onClick={() => openEditor(field)}
                            onKeyDown={(event) => {
                              if (event.key !== "Enter" && event.key !== " ") return;
                              event.preventDefault();
                              openEditor(field);
                            }}
                            className={`inline-flex shrink-0 items-center justify-center rounded-lg border px-3 py-2 text-xs font-black focus:outline-none focus:ring-2 focus:ring-blue-300 ${fieldIssue(field) ? "border-amber-300 bg-white text-amber-900 hover:bg-amber-50" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
                          >
                            {fieldIssue(field) ? (locale === "zh" ? "处理问题" : locale === "ko" ? "문제 처리" : "要対応") : (locale === "zh" ? "编辑" : locale === "ko" ? "편집" : "編集")}
                          </button>
                        ) : null}
                      </div>
                    );

                    return (
                      <section key={child.id} id={`${section.id}-${child.id}`}>
                        <h3 className="text-sm font-black text-slate-700">{child.label}</h3>
                        {applicantChild ? (
                          <ResponsiveFormLayout aria-label={child.label} editorOpen={childEditing} className="mt-2">
                            <div className={layoutStyles.formFields}>
                              {buildResponsiveFieldRows(child.fields).map((row) => (
                                <ResponsiveFormRow key={row.map((field) => field.fieldKey).join("-")}>
                                  {row.map((field, fieldIndex) => {
                                    const selectedIndex = editingField ? row.findIndex((rowField) => rowField.fieldKey === editingField.fieldKey) : -1;
                                    const selectionClass = selectedIndex >= 0
                                      ? fieldIndex === selectedIndex
                                        ? layoutStyles.formFieldSelected
                                        : fieldIndex < selectedIndex
                                          ? layoutStyles.formFieldBeforeSelected
                                          : layoutStyles.formFieldAfterSelected
                                      : "";
                                    const columnClass = isWideResponsiveField(field)
                                      ? ""
                                      : fieldIndex === 1
                                        ? layoutStyles.formFieldColumnTwo
                                        : layoutStyles.formFieldColumnOne;
                                    return (
                                      <Fragment key={field.fieldKey}>
                                        <ResponsiveFormField
                                          id={fieldAnchor(field.fieldKey)}
                                          style={{ scrollMarginTop: "var(--case-object-scroll-margin, 11rem)" }}
                                          className={`scroll-mt-[11rem] ${fieldIssue(field) ? "bg-amber-50/45" : "bg-white"} ${selectionClass} ${columnClass}`}
                                          wide={isWideResponsiveField(field)}
                                          selected={editingField?.fieldKey === field.fieldKey}
                                        >
                                          {renderField(field)}
                                        </ResponsiveFormField>
                                      </Fragment>
                                    );
                                  })}
                                  {!wideResponsiveLayout && childEditing && editingField && row.some((field) => field.fieldKey === editingField.fieldKey) ? (
                                    <ResponsiveFormEditorSlot ref={editorRef} aria-label={editingField.label}>
                                      {renderEditor()}
                                    </ResponsiveFormEditorSlot>
                                  ) : null}
                                </ResponsiveFormRow>
                              ))}
                            </div>
                            {wideResponsiveLayout && childEditing && editingField ? (
                              <ResponsiveFormEditorSlot ref={editorRef} aria-label={editingField.label}>
                                {renderEditor()}
                              </ResponsiveFormEditorSlot>
                            ) : null}
                          </ResponsiveFormLayout>
                        ) : (
                          <div className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-100">
                            {child.fields.map((field) => (
                              <article key={field.fieldKey} id={fieldAnchor(field.fieldKey)} style={{ scrollMarginTop: "var(--case-object-scroll-margin, 11rem)" }} className={`scroll-mt-[11rem] px-3 py-3 sm:px-4 ${fieldIssue(field) ? "bg-amber-50/45" : "bg-white"}`}>
                                {renderField(field)}
                              </article>
                            ))}
                          </div>
                        )}
                      </section>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </main>

        {editingField && !editingApplicantField ? (
          <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/35 p-0 sm:p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeEditor(); }}>
            <div ref={editorRef} role="dialog" aria-modal="true" aria-label={editingField.label} className="h-full w-full max-w-xl overflow-y-auto bg-white p-4 shadow-2xl sm:rounded-2xl sm:p-6">
              {renderEditor()}
            </div>
          </div>
        ) : null}

        {confirmOpen ? (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/40 p-4" role="presentation">
            <div role="dialog" aria-modal="true" aria-labelledby="case-download-confirm-title" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
              <h2 id="case-download-confirm-title" className="text-lg font-black text-slate-950">{locale === "zh" ? "下载申请书" : locale === "ko" ? "신청서 다운로드" : "申込書をダウンロード"}</h2>
              <p className="mt-3 text-sm font-semibold leading-6 text-slate-700">{locale === "zh" ? "请确认当前案件信息将用于生成申请书。案件信息修改后，需要重新确认。" : locale === "ko" ? "현재 안건 정보로 신청서를 생성하는 것을 확인해 주세요. 안건 정보가 수정되면 다시 확인해야 합니다." : "現在の案件情報を申込書の作成に使用することを確認してください。案件情報を変更した場合は、もう一度確認が必要です。"}</p>
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={() => setConfirmOpen(false)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50">{locale === "zh" ? "返回检查" : locale === "ko" ? "확인으로 돌아가기" : "確認に戻る"}</button>
                <button type="button" onClick={() => { setConfirmedVersion(dataVersion); setConfirmOpen(false); if (downloadHref) window.location.assign(downloadHref); }} className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-black text-white hover:bg-slate-800">{locale === "zh" ? "确认并下载" : locale === "ko" ? "확인하고 다운로드" : "確認してダウンロード"}</button>
              </div>
            </div>
          </div>
        ) : null}
      </ObjectPageShell>
    </div>
  );
}
