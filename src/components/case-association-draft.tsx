"use client";

import { useActionState, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type {
  CaseCreationActionState,
  ClientFormActionState,
  PropertyFormActionState,
} from "@/app/actions";
import { ClientForm } from "@/components/client-form";
import { PropertyResponsiveForm } from "@/components/property-responsive-form";
import { handleFocusDialogEscape, requestFocusDialogClose } from "@/components/focus-dialog-guards";
import { ActionBar, FormSection, PageFrame, PageHeader, ResponsiveFormShell, StateSurface } from "@/components/layout-system";
import layoutStyles from "@/components/layout-system/layout-system.module.css";
import { Button } from "@/components/ui-foundation";
import type { Locale } from "@/lib/locale";
import { CASE_PERSON_ROLES, getCasePersonRoleLabel, localizeCaseAssociationError, type CaseAssociationParty, type CasePersonRole } from "@/lib/case-associations";

type Candidate = { id: string; name: string; address?: string; searchText?: string };
type CreateAction<State> = (previousState: State, formData: FormData) => Promise<State>;

type CaseAssociationDraftProps = {
  locale: Locale;
  backHref: string;
  backLabel: string;
  candidates: Candidate[];
  properties: Candidate[];
  workflowOptions: Array<{ value: string; label: string }>;
  createCaseAction: CreateAction<CaseCreationActionState>;
  createPersonAction: CreateAction<ClientFormActionState>;
  createPropertyAction: CreateAction<PropertyFormActionState>;
};

type Drawer = "person" | "property" | null;
type DrawerView = "select" | "create";

const copy = {
  ja: {
    close: "閉じる",
    title: "案件を新規作成",
    description: "資料をこの案件の草稿に追加し、案件作成後に正式に関連付けます。",
    caseInfo: "案件情報",
    workflowType: "案件種別",
    caseTitle: "案件名",
    draft: "案件草稿",
    draftSummary: "現在の案件草稿の概要",
    draftSessionOnly: "この概要と草稿は現在のページセッション内のみ保持され、ページを再読み込みすると引き継がれません。",
    draftNote: "案件作成前は正式な関連付けを保存しません",
    draftPeopleCount: "人物草稿",
    draftRoles: "役割の概要",
    draftPrimaryApplicant: "主たる申込人",
    draftPrimaryProperty: "主たる物件",
    draftUnset: "未設定",
    draftSet: "設定済み",
    guaranteeRequirementsMissing: "保証申請の出力には、主たる申込人と主たる物件の両方が必要です。案件の作成自体は妨げません。",
    guaranteeRequirementsReady: "保証申請の出力に必要な主たる申込人と主たる物件が設定されています。",
    outputEligibilityNote: "主たる申込人または主たる物件が未設定でも案件は作成できます。保証申請の出力には、両方の設定が必要です。",
    peopleDraft: "人物草稿",
    selectPerson: "既存の人物を選択",
    peopleEmpty: "人物はまだ草稿に追加されていません。",
    removeDraft: "草稿から外す",
    quickCreatePerson: "人物をクイック作成",
    propertyDraft: "主たる物件草稿",
    selectProperty: "既存の物件を選択",
    propertyEmpty: "主たる物件はまだ草稿に追加されていません。",
    quickCreateProperty: "物件をクイック作成",
    cancel: "キャンセル",
    create: "案件を作成",
    creating: "作成中…",
    caseSaveError: "案件を保存できませんでした。現在の草稿を残したまま、もう一度お試しください。",
    createPerson: "人物を作成",
    choosePerson: "既存の人物を選択",
    createProperty: "物件を作成",
    chooseProperty: "主たる物件を選択",
    searchPerson: "氏名、電話番号、またはIDで検索",
    searchProperty: "物件名、所在地、またはIDで検索",
    quickCreate: "クイック作成",
    noCandidates: "関連付け可能な資料がありません。",
    select: "選択",
    alreadyInDraft: "この草稿に追加済み",
    roles: "案件での役割",
    addToDraft: "草稿に追加",
    personRequired: "先に人物を選択してください。",
    roleRequired: "案件での役割を1つ以上選択してください。",
    primaryApplicantUnique: "主たる申込人は1案件につき1名までです。",
    replacePropertyConfirm: "この案件草稿の主たる物件を変更しますか？",
    cancelCaseConfirm: "案件作成をキャンセルしますか？作成済みの主資料は残ります。",
    quickCreateFeedback: "主資料を作成し、この案件草稿に追加しました。案件作成後に正式に関連付けられます。",
  },
  zh: {
    close: "关闭",
    title: "新建案件",
    description: "先将资料加入本次案件草稿，创建案件后再正式关联。",
    caseInfo: "案件信息",
    workflowType: "案件类型",
    caseTitle: "案件名",
    draft: "案件草稿",
    draftSummary: "当前案件草稿摘要",
    draftSessionOnly: "此摘要和草稿仅在当前页面会话内保留，刷新页面后不会继续保留。",
    draftNote: "创建案件前不会保存正式关联",
    draftPeopleCount: "人物草稿",
    draftRoles: "角色概况",
    draftPrimaryApplicant: "主要申请人",
    draftPrimaryProperty: "主要物件",
    draftUnset: "未设置",
    draftSet: "已设置",
    guaranteeRequirementsMissing: "生成保证申请输出需要同时设置主要申请人和主要物件；这不会阻止创建案件。",
    guaranteeRequirementsReady: "生成保证申请输出所需的主要申请人和主要物件均已设置。",
    outputEligibilityNote: "即使未设置主要申请人或主要物件，也可以创建案件；生成保证申请输出时需要二者齐备。",
    peopleDraft: "人物草稿",
    selectPerson: "选择已有的人物",
    peopleEmpty: "还没有加入人物草稿。",
    removeDraft: "移除草稿",
    quickCreatePerson: "快速创建人物",
    propertyDraft: "主要物件草稿",
    selectProperty: "选择已有的物件",
    propertyEmpty: "还没有加入主要物件草稿。",
    quickCreateProperty: "快速创建物件",
    cancel: "取消",
    create: "创建案件",
    creating: "创建中…",
    caseSaveError: "案件保存失败，请保留当前草稿后重试。",
    createPerson: "创建人物",
    choosePerson: "选择已有的人物",
    createProperty: "创建物件",
    chooseProperty: "选择主要物件",
    searchPerson: "搜索姓名、电话或编号",
    searchProperty: "搜索物件名、地址或编号",
    quickCreate: "快速创建",
    noCandidates: "没有可建立关联的资料。",
    select: "选择",
    alreadyInDraft: "已在本次草稿",
    roles: "案件角色",
    addToDraft: "加入草稿",
    personRequired: "请先选择人物。",
    roleRequired: "至少选择一个案件角色。",
    primaryApplicantUnique: "一个案件最多只能有一位主要申请人。",
    replacePropertyConfirm: "更换本次案件草稿中的主要物件？",
    cancelCaseConfirm: "取消案件？已创建的主资料仍会保留。",
    quickCreateFeedback: "主资料已创建，并已加入本次案件草稿；创建案件后正式关联。",
  },
  ko: {
    close: "닫기",
    title: "안건 새로 만들기",
    description: "자료를 이 안건의 초안에 추가하고, 안건을 만든 뒤 정식으로 연결합니다.",
    caseInfo: "안건 정보",
    workflowType: "안건 유형",
    caseTitle: "안건명",
    draft: "안건 초안",
    draftSummary: "현재 안건 초안 요약",
    draftSessionOnly: "이 요약과 초안은 현재 페이지 세션에서만 유지되며 페이지를 새로 고치면 이어지지 않습니다.",
    draftNote: "안건을 만들기 전에는 정식 연결을 저장하지 않습니다",
    draftPeopleCount: "관계자 초안",
    draftRoles: "역할 요약",
    draftPrimaryApplicant: "주요 신청인",
    draftPrimaryProperty: "주요 매물",
    draftUnset: "설정되지 않음",
    draftSet: "설정됨",
    guaranteeRequirementsMissing: "보증 신청 출력에는 주요 신청인과 주요 매물이 모두 필요합니다. 안건 생성 자체는 막지 않습니다.",
    guaranteeRequirementsReady: "보증 신청 출력에 필요한 주요 신청인과 주요 매물이 모두 설정되었습니다.",
    outputEligibilityNote: "주요 신청인 또는 주요 매물을 설정하지 않아도 안건을 만들 수 있습니다. 보증 신청 출력에는 두 항목이 모두 필요합니다.",
    peopleDraft: "관계자 초안",
    selectPerson: "기존 관계자 선택",
    peopleEmpty: "아직 관계자가 안건 초안에 추가되지 않았습니다.",
    removeDraft: "초안에서 제거",
    quickCreatePerson: "관계자 빠른 생성",
    propertyDraft: "주요 매물 초안",
    selectProperty: "기존 매물 선택",
    propertyEmpty: "아직 주요 매물이 안건 초안에 추가되지 않았습니다.",
    quickCreateProperty: "매물 빠른 생성",
    cancel: "취소",
    create: "안건 만들기",
    creating: "만드는 중…",
    caseSaveError: "안건을 저장하지 못했습니다. 현재 초안을 유지한 채 다시 시도해 주세요.",
    createPerson: "관계자 만들기",
    choosePerson: "기존 관계자 선택",
    createProperty: "매물 만들기",
    chooseProperty: "주요 매물 선택",
    searchPerson: "이름, 전화번호 또는 ID 검색",
    searchProperty: "매물명, 주소 또는 ID 검색",
    quickCreate: "빠른 생성",
    noCandidates: "연결할 수 있는 자료가 없습니다.",
    select: "선택",
    alreadyInDraft: "이 안건 초안에 이미 추가됨",
    roles: "안건 역할",
    addToDraft: "초안에 추가",
    personRequired: "먼저 관계자를 선택해 주세요.",
    roleRequired: "안건 역할을 하나 이상 선택해 주세요.",
    primaryApplicantUnique: "하나의 안건에는 주요 신청인을 한 명만 지정할 수 있습니다.",
    replacePropertyConfirm: "이 안건 초안의 주요 매물을 변경할까요?",
    cancelCaseConfirm: "안건 만들기를 취소할까요? 이미 만든 기본 자료는 남습니다.",
    quickCreateFeedback: "기본 자료를 만들고 이 안건 초안에 추가했습니다. 안건을 만든 뒤 정식으로 연결됩니다.",
  },
} as const;

const initialCaseState: CaseCreationActionState = { status: "idle" };

function addOrReplaceParty(parties: CaseAssociationParty[], partyId: string, roles: CasePersonRole[]) {
  const next = parties.filter((party) => party.partyId !== partyId);
  return roles.length > 0 ? [...next, { partyId, roles }] : next;
}

type FocusDialogProps = {
  title: string;
  closeLabel: string;
  onClose: () => void;
  returnFocusRef?: { current: HTMLElement | null };
  closeDisabledRef?: { current: boolean };
  children: ReactNode;
  footer?: ReactNode;
  closeDisabled?: boolean;
};

export function FocusDialog({ title, closeLabel, onClose, returnFocusRef, closeDisabledRef, children, footer, closeDisabled = false }: FocusDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const focusOriginRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const fallbackCloseDisabledRef = useRef(closeDisabled);
  const activeCloseDisabledRef = closeDisabledRef ?? fallbackCloseDisabledRef;

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!closeDisabledRef) fallbackCloseDisabledRef.current = closeDisabled;
  }, [closeDisabled, closeDisabledRef]);

  useEffect(() => {
    const explicitReturnTarget = returnFocusRef?.current;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    focusOriginRef.current = explicitReturnTarget ?? document.querySelector<HTMLElement>("[data-case-association-focus-target]:focus") ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const dialog = dialogRef.current;
    const focusable = dialog?.querySelector<HTMLElement>("button, input:not([type='hidden']), select, textarea, a[href], [tabindex]:not([tabindex='-1'])");
    focusable?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (handleFocusDialogEscape(event, closeDisabledRef ?? fallbackCloseDisabledRef, onCloseRef.current)) return;
      if (event.key !== "Tab" || !dialog) return;
      const elements = [...dialog.querySelectorAll<HTMLElement>("button, input:not([type='hidden']), select, textarea, a[href], [tabindex]:not([tabindex='-1'])")]
        .filter((element) => !element.hasAttribute("disabled") && element.offsetParent !== null);
      if (elements.length === 0) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      const target = explicitReturnTarget ?? focusOriginRef.current;
      if (target?.isConnected && !target.hasAttribute("disabled")) {
        target.focus();
      } else {
        document.querySelector<HTMLElement>("[data-case-association-focus-target]:not([disabled])")?.focus();
      }
    };
  }, [closeDisabledRef, returnFocusRef]);
  const requestClose = () => {
    requestFocusDialogClose(activeCloseDisabledRef, onCloseRef.current);
  };

  return (
    <div className={layoutStyles.dialogOverlay} role="presentation">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="case-association-dialog-title" className={layoutStyles.dialogSurface}>
        <header className={layoutStyles.dialogHeader}>
          <h2 id="case-association-dialog-title" className="text-base font-black text-slate-950">{title}</h2>
          <button type="button" onClick={requestClose} disabled={closeDisabled} aria-disabled={closeDisabled || undefined} aria-label={closeLabel} className={layoutStyles.dialogClose}>×</button>
        </header>
        <div className={layoutStyles.dialogBody}>{children}</div>
        {footer ? <div className={layoutStyles.dialogFooter}>{footer}</div> : null}
      </div>
    </div>
  );
}

export function CaseAssociationDraft({
  locale,
  backHref,
  backLabel,
  candidates: initialCandidates,
  properties: initialProperties,
  workflowOptions,
  createCaseAction,
  createPersonAction,
  createPropertyAction,
}: CaseAssociationDraftProps) {
  const text = copy[locale];
  const [candidates, setCandidates] = useState(initialCandidates);
  const [properties, setProperties] = useState(initialProperties);
  const [caseTitle, setCaseTitle] = useState("");
  const [workflowType, setWorkflowType] = useState(workflowOptions[0]?.value ?? "rental_application");
  const [parties, setParties] = useState<CaseAssociationParty[]>([]);
  const [primaryPropertyId, setPrimaryPropertyId] = useState<string | undefined>();
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [drawerView, setDrawerView] = useState<DrawerView>("select");
  const [query, setQuery] = useState("");
  const [selectedPersonId, setSelectedPersonId] = useState("");
  const [selectedRoles, setSelectedRoles] = useState<CasePersonRole[]>([]);
  const [selectionError, setSelectionError] = useState<string | undefined>();
  const [quickCreateFeedback, setQuickCreateFeedback] = useState<string | undefined>();
  const [hasIndependentCreatedMaster, setHasIndependentCreatedMaster] = useState(false);
  const [personCreatePending, setPersonCreatePending] = useState(false);
  const [propertyCreatePending, setPropertyCreatePending] = useState(false);
  const focusReturnRef = useRef<HTMLElement | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const personCreatePendingRef = useRef(false);
  const propertyCreatePendingRef = useRef(false);
  const [caseState, caseFormAction, pending] = useActionState(createCaseAction, initialCaseState);
  const caseError = caseState.status === "error" ? localizeCaseAssociationError(locale, caseState.message, text.caseSaveError) : undefined;

  const updatePersonCreatePending = useCallback((next: boolean) => {
    personCreatePendingRef.current = next;
    setPersonCreatePending(next);
  }, []);
  const startPersonCreate = useCallback(() => updatePersonCreatePending(true), [updatePersonCreatePending]);
  const updatePropertyCreatePending = useCallback((next: boolean) => {
    propertyCreatePendingRef.current = next;
    setPropertyCreatePending(next);
  }, []);
  const startPropertyCreate = useCallback(() => updatePropertyCreatePending(true), [updatePropertyCreatePending]);

  useEffect(() => {
    const actionError = caseState.status === "error" ? localizeCaseAssociationError(locale, caseState.message, text.caseSaveError) : undefined;
    if (!actionError) return;
    const frame = window.requestAnimationFrame(() => {
      const error = errorRef.current;
      error?.scrollIntoView({ block: "start", behavior: "smooth" });
      error?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [caseState, locale, text.caseSaveError]);

  const closeDrawer = (force = false) => {
    if (!force && ((drawer === "person" && drawerView === "create" && personCreatePendingRef.current) || (drawer === "property" && drawerView === "create" && propertyCreatePendingRef.current))) return;
    setDrawer(null);
    setDrawerView("select");
    setQuery("");
    setSelectionError(undefined);
  };
  const openPersonDrawer = () => {
    setDrawer("person");
    setDrawerView("select");
    setSelectedPersonId("");
    setSelectedRoles([]);
    setSelectionError(undefined);
  };
  const openPropertyDrawer = () => {
    setDrawer("property");
    setDrawerView("select");
    setSelectionError(undefined);
  };
  const selectPerson = (id: string) => {
    setSelectedPersonId(id);
    setSelectedRoles(parties.find((party) => party.partyId === id)?.roles ?? []);
    setSelectionError(undefined);
  };
  const applyPerson = () => {
    if (!selectedPersonId) {
      setSelectionError(text.personRequired);
      return;
    }
    if (selectedRoles.length === 0) {
      setSelectionError(text.roleRequired);
      return;
    }
    if (selectedRoles.includes("主要申请人") && parties.some((party) => party.partyId !== selectedPersonId && party.roles.includes("主要申请人"))) {
      setSelectionError(text.primaryApplicantUnique);
      return;
    }
    setParties((current) => addOrReplaceParty(current, selectedPersonId, selectedRoles));
    closeDrawer();
  };
  const applyProperty = (id: string) => {
    if (primaryPropertyId && primaryPropertyId !== id && !window.confirm(text.replacePropertyConfirm)) return;
    setPrimaryPropertyId(id);
    closeDrawer();
  };
  const confirmLeave = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (hasIndependentCreatedMaster && !window.confirm(text.cancelCaseConfirm)) event.preventDefault();
  };
  const removeParty = (partyId: string) => setParties((current) => current.filter((party) => party.partyId !== partyId));
  const filteredCandidates = candidates.filter((candidate) => `${candidate.name} ${candidate.id} ${candidate.searchText ?? ""}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const filteredProperties = properties.filter((property) => `${property.name} ${property.address ?? ""}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const draftJson = JSON.stringify({ parties, primaryPropertyId });
  const primaryApplicantAssigned = parties.some((party) => party.roles.includes("主要申请人"));
  const guaranteeRequirementsMissing = !primaryApplicantAssigned || !primaryPropertyId;
  const draftPeopleCount = parties.length;
  const roleSummary = parties.length === 0
    ? text.draftUnset
    : parties.map((party) => {
      const name = candidates.find((candidate) => candidate.id === party.partyId)?.name ?? party.partyId;
      return `${name}: ${party.roles.map((role) => getCasePersonRoleLabel(locale, role)).join("、")}`;
    }).join("；");

  return (
    <PageFrame className="space-y-5">
      <PageHeader title={text.title} description={text.description} backHref={backHref} backLabel={backLabel} onBackClick={confirmLeave} />
      {caseError ? <div ref={errorRef} data-case-association-case-error role="alert" aria-live="assertive" tabIndex={-1} className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900">{caseError}</div> : null}

      <ResponsiveFormShell action={caseFormAction}>
        <input type="hidden" name="associationDraftJson" value={draftJson} />
        <FormSection className="space-y-3">
          <h2 className="text-base font-black text-slate-950">{text.caseInfo}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm font-semibold text-slate-700"><span>{text.workflowType}</span><select name="workflowType" value={workflowType} onChange={(event) => setWorkflowType(event.target.value)} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 focus:border-[#0046ad] focus:ring-2 focus:ring-blue-100 sm:text-sm">{workflowOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <label className="space-y-1 text-sm font-semibold text-slate-700"><span>{text.caseTitle}</span><input name="caseTitle" value={caseTitle} onChange={(event) => setCaseTitle(event.target.value)} className="min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base text-slate-900 focus:border-[#0046ad] focus:ring-2 focus:ring-blue-100 sm:text-sm" /></label>
          </div>
        </FormSection>

        <FormSection className="space-y-3" aria-labelledby="case-draft-heading">
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="case-draft-heading" className="text-base font-black text-slate-950">{text.draft}</h2><span className="text-xs font-semibold text-slate-500">{text.draftNote}</span></div>
          <details className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3" open>
            <summary className="cursor-pointer text-sm font-bold text-slate-900">{text.draftSummary}</summary>
            <div className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
              <p><span className="font-semibold">{text.draftPeopleCount}：</span>{draftPeopleCount}</p>
              <p><span className="font-semibold">{text.draftRoles}：</span>{roleSummary}</p>
              <p><span className="font-semibold">{text.draftPrimaryApplicant}：</span>{primaryApplicantAssigned ? text.draftSet : text.draftUnset}</p>
              <p><span className="font-semibold">{text.draftPrimaryProperty}：</span>{primaryPropertyId ? text.draftSet : text.draftUnset}</p>
            </div>
            <p role={guaranteeRequirementsMissing ? "status" : undefined} className={`mt-3 text-sm ${guaranteeRequirementsMissing ? "text-slate-600" : "text-emerald-700"}`}>
              {guaranteeRequirementsMissing ? text.guaranteeRequirementsMissing : text.guaranteeRequirementsReady}
            </p>
          </details>
          <p className="text-sm text-slate-500">{text.draftSessionOnly}</p>
          <div className="grid gap-4 border-t border-slate-200 pt-4 lg:grid-cols-2">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-black text-slate-900">{text.peopleDraft} ({parties.length})</h3><button type="button" data-case-association-focus-target onClick={(event) => { focusReturnRef.current = event.currentTarget; openPersonDrawer(); }} className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm font-black text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0046ad]">{text.selectPerson}</button></div>
              {parties.length === 0 ? <p className="text-sm text-slate-500">{text.peopleEmpty}</p> : <div className="space-y-2">{parties.map((party) => <div key={party.partyId} className="flex items-start justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2"><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900">{candidates.find((candidate) => candidate.id === party.partyId)?.name ?? party.partyId}</p><p className="mt-1 text-xs text-slate-600">{party.roles.map((role) => getCasePersonRoleLabel(locale, role)).join("、")}</p></div><button type="button" onClick={() => removeParty(party.partyId)} className="shrink-0 min-h-11 rounded px-2 py-1 text-sm font-bold text-slate-600 hover:bg-white">{text.removeDraft}</button></div>)}</div>}
              <button type="button" data-case-association-focus-target onClick={(event) => { focusReturnRef.current = event.currentTarget; openPersonDrawer(); setDrawerView("create"); }} className="inline-flex min-h-11 items-center text-sm font-bold text-[#0046ad] underline underline-offset-2">{text.quickCreatePerson}</button>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-black text-slate-900">{text.propertyDraft} ({primaryPropertyId ? 1 : 0})</h3><button type="button" data-case-association-focus-target onClick={(event) => { focusReturnRef.current = event.currentTarget; openPropertyDrawer(); }} className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm font-black text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0046ad]">{text.selectProperty}</button></div>
              {primaryPropertyId ? <div className="flex items-start justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2"><p className="min-w-0 truncate text-sm font-bold text-slate-900">{properties.find((property) => property.id === primaryPropertyId)?.name ?? primaryPropertyId}</p><button type="button" onClick={() => setPrimaryPropertyId(undefined)} className="shrink-0 min-h-11 rounded px-2 py-1 text-sm font-bold text-slate-600 hover:bg-white">{text.removeDraft}</button></div> : <p className="text-sm text-slate-500">{text.propertyEmpty}</p>}
              <button type="button" data-case-association-focus-target onClick={(event) => { focusReturnRef.current = event.currentTarget; openPropertyDrawer(); setDrawerView("create"); }} className="inline-flex min-h-11 items-center text-sm font-bold text-[#0046ad] underline underline-offset-2">{text.quickCreateProperty}</button>
            </div>
          </div>
          <p className="text-sm text-slate-500">{text.outputEligibilityNote}</p>
        </FormSection>

        {quickCreateFeedback ? <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">{quickCreateFeedback}</div> : null}
        <ActionBar mobileFixed>
          <a href={backHref} data-page-action-cancel onClick={confirmLeave} className={`${layoutStyles.pageActionCancel} inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0046ad]`}>{text.cancel}</a>
          <Button type="submit" disabled={pending} loading={pending} controlSize="touch">{pending ? text.creating : text.create}</Button>
        </ActionBar>
      </ResponsiveFormShell>

      {drawer === "person" ? <FocusDialog title={drawerView === "create" ? text.createPerson : text.choosePerson} closeLabel={text.close} closeDisabled={drawerView === "create" && personCreatePending} closeDisabledRef={personCreatePendingRef} onClose={closeDrawer} returnFocusRef={focusReturnRef} footer={drawerView === "create" ? <div className="flex justify-end gap-3"><button type="button" onClick={() => closeDrawer()} disabled={personCreatePending} className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 disabled:cursor-wait disabled:opacity-60">{text.cancel}</button><button type="submit" form="case-association-person-create" disabled={personCreatePending} aria-busy={personCreatePending || undefined} className="min-h-11 rounded-lg bg-slate-950 px-4 py-2 text-sm font-black text-white disabled:cursor-wait disabled:opacity-60">{personCreatePending ? text.creating : text.createPerson}</button></div> : <div className="flex justify-end gap-3"><button type="button" onClick={() => closeDrawer()} className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700">{text.cancel}</button><button type="button" onClick={applyPerson} className="min-h-11 rounded-lg bg-slate-950 px-4 py-2 text-sm font-black text-white">{text.addToDraft}</button></div>}>
        {drawerView === "create" ? <ClientForm action={createPersonAction} mode="create" locale={locale} returnTo="/cases/new" formId="case-association-person-create" hideActions onSubmitStart={startPersonCreate} onPendingChange={updatePersonCreatePending} onCreated={(record) => { setCandidates((current) => [...current, record]); setParties((current) => addOrReplaceParty(current, record.id, ["其他关联人"])); setHasIndependentCreatedMaster(true); setQuickCreateFeedback(text.quickCreateFeedback); closeDrawer(true); }} /> : <div className="space-y-5">
          <div className="flex gap-2"><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={text.searchPerson} className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-base sm:text-sm focus:border-[#0046ad] focus:ring-2 focus:ring-blue-100" /><button type="button" onClick={() => setDrawerView("create")} className="shrink-0 min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700">{text.quickCreate}</button></div>
          <div className="space-y-2">{filteredCandidates.map((candidate) => <button type="button" key={candidate.id} onClick={() => selectPerson(candidate.id)} className={`flex min-h-11 w-full items-center justify-between rounded-lg border px-3 py-3 text-left ${selectedPersonId === candidate.id ? "border-blue-700 bg-blue-50" : "border-slate-200 hover:bg-slate-50"}`}><span className="min-w-0 truncate text-sm font-bold text-slate-900">{candidate.name}</span>{parties.some((party) => party.partyId === candidate.id) ? <span className="ml-3 shrink-0 text-xs font-bold text-slate-600">{text.alreadyInDraft}</span> : <span className="ml-3 shrink-0 text-xs font-bold text-[#0046ad]">{text.select}</span>}</button>)}{filteredCandidates.length === 0 ? <StateSurface tone="empty">{text.noCandidates}</StateSurface> : null}</div>
          {selectedPersonId ? <div className="space-y-3 rounded-lg border border-slate-200 p-4"><h3 className="text-sm font-black text-slate-900">{text.roles}</h3><div className="grid gap-2 sm:grid-cols-2">{CASE_PERSON_ROLES.map((role) => <label key={role} className="flex min-h-11 items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={selectedRoles.includes(role)} onChange={(event) => setSelectedRoles((current) => event.target.checked ? [...current, role] : current.filter((item) => item !== role))} />{getCasePersonRoleLabel(locale, role)}</label>)}</div>{selectionError ? <p role="alert" className="text-xs font-bold text-rose-700">{selectionError}</p> : null}</div> : null}
        </div>}
      </FocusDialog> : null}

      {drawer === "property" ? <FocusDialog title={drawerView === "create" ? text.createProperty : text.chooseProperty} closeLabel={text.close} closeDisabled={drawerView === "create" && propertyCreatePending} closeDisabledRef={propertyCreatePendingRef} onClose={closeDrawer} returnFocusRef={focusReturnRef} footer={drawerView === "create" ? <div className="flex justify-end gap-3"><button type="button" onClick={() => closeDrawer()} disabled={propertyCreatePending} className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 disabled:cursor-wait disabled:opacity-60">{text.cancel}</button><button type="submit" form="case-association-property-create" disabled={propertyCreatePending} aria-busy={propertyCreatePending || undefined} className="min-h-11 rounded-lg bg-slate-950 px-4 py-2 text-sm font-black text-white disabled:cursor-wait disabled:opacity-60">{propertyCreatePending ? text.creating : text.createProperty}</button></div> : <div className="flex justify-end"><button type="button" onClick={() => closeDrawer()} className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700">{text.cancel}</button></div>}>
        {drawerView === "create" ? <PropertyResponsiveForm action={createPropertyAction} locale={locale} initialValues={{ name: "", area: "", address: "", sizeSqm: "", listingPrice: "", managementFee: "", repairFee: "", notes: "" }} returnTo="/cases/new" formId="case-association-property-create" hideActions onSubmitStart={startPropertyCreate} onPendingChange={updatePropertyCreatePending} onCreated={(record) => { setProperties((current) => [...current, record]); setPrimaryPropertyId(record.id); setHasIndependentCreatedMaster(true); setQuickCreateFeedback(text.quickCreateFeedback); closeDrawer(true); }} /> : <div className="space-y-5"><div className="flex gap-2"><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={text.searchProperty} className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-base sm:text-sm focus:border-[#0046ad] focus:ring-2 focus:ring-blue-100" /><button type="button" onClick={() => setDrawerView("create")} className="shrink-0 min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700">{text.quickCreate}</button></div><div className="space-y-2">{filteredProperties.map((property) => <button type="button" key={property.id} onClick={() => applyProperty(property.id)} className="flex min-h-11 w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-3 text-left hover:bg-slate-50"><span className="min-w-0"><span className="block truncate text-sm font-bold text-slate-900">{property.name}</span>{property.address ? <span className="mt-1 block truncate text-xs text-slate-500">{property.address}</span> : null}</span><span className="ml-3 shrink-0 text-xs font-bold text-[#0046ad]">{text.select}</span></button>)}{filteredProperties.length === 0 ? <StateSurface tone="empty">{text.noCandidates}</StateSurface> : null}</div></div>}
      </FocusDialog> : null}
    </PageFrame>
  );
}
