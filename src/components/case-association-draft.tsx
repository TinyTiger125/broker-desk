"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import type {
  CaseCreationActionState,
  ClientFormActionState,
  PropertyFormActionState,
} from "@/app/actions";
import { ClientForm } from "@/components/client-form";
import { PropertyResponsiveForm } from "@/components/property-responsive-form";
import type { Locale } from "@/lib/locale";
import { CASE_PERSON_ROLES, type CaseAssociationParty, type CasePersonRole } from "@/lib/case-associations";

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

const initialCaseState: CaseCreationActionState = { status: "idle" };

function addOrReplaceParty(parties: CaseAssociationParty[], partyId: string, roles: CasePersonRole[]) {
  const next = parties.filter((party) => party.partyId !== partyId);
  return roles.length > 0 ? [...next, { partyId, roles }] : next;
}

export function FocusDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const focusable = dialog?.querySelector<HTMLElement>("button, input, select, textarea, a[href], [tabindex]:not([tabindex='-1'])");
    focusable?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const elements = [...dialog.querySelectorAll<HTMLElement>("button, input, select, textarea, a[href], [tabindex]:not([tabindex='-1'])")]
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
      returnFocusRef.current?.focus();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end bg-slate-950/40 p-0 sm:p-4" role="presentation">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="case-association-dialog-title" className="flex h-full w-full max-w-2xl flex-col overflow-hidden bg-white shadow-2xl sm:rounded-xl">
        <header className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3 sm:px-6">
          <h2 id="case-association-dialog-title" className="text-base font-black text-slate-950">{title}</h2>
          <button type="button" onClick={onClose} aria-label="关闭" className="rounded-lg px-3 py-2 text-xl leading-none text-slate-600 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0046ad]">×</button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">{children}</div>
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
  const [caseState, caseFormAction, pending] = useActionState(createCaseAction, initialCaseState);

  const closeDrawer = () => {
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
      setSelectionError("请先选择人物。");
      return;
    }
    if (selectedRoles.length === 0) {
      setSelectionError("至少选择一个案件角色。");
      return;
    }
    if (selectedRoles.includes("主要申请人") && parties.some((party) => party.partyId !== selectedPersonId && party.roles.includes("主要申请人"))) {
      setSelectionError("一个案件最多只能有一位主要申请人。");
      return;
    }
    setParties((current) => addOrReplaceParty(current, selectedPersonId, selectedRoles));
    closeDrawer();
  };
  const applyProperty = (id: string) => {
    if (primaryPropertyId && primaryPropertyId !== id && !window.confirm("更换本次案件草稿中的主要物件？")) return;
    setPrimaryPropertyId(id);
    closeDrawer();
  };
  const confirmLeave = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (hasIndependentCreatedMaster && !window.confirm("取消案件？已创建的主资料仍会保留。")) event.preventDefault();
  };
  const removeParty = (partyId: string) => setParties((current) => current.filter((party) => party.partyId !== partyId));
  const filteredCandidates = candidates.filter((candidate) => `${candidate.name} ${candidate.id} ${candidate.searchText ?? ""}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const filteredProperties = properties.filter((property) => `${property.name} ${property.address ?? ""}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const draftJson = JSON.stringify({ parties, primaryPropertyId });

  return (
    <div className="space-y-5 pb-20">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-950">新建案件</h1>
          <p className="mt-2 text-sm font-semibold text-slate-600">资料先加入本次案件草稿，创建后正式关联。</p>
        </div>
        <a href={backHref} onClick={confirmLeave} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-black text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0046ad]">{backLabel}</a>
      </header>

      <form action={caseFormAction} className="space-y-5 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <input type="hidden" name="associationDraftJson" value={draftJson} />
        <section className="space-y-3">
          <h2 className="text-base font-black text-slate-950">案件信息</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm font-semibold text-slate-700"><span>案件类型</span><select name="workflowType" value={workflowType} onChange={(event) => setWorkflowType(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-[#0046ad] focus:ring-2 focus:ring-blue-100">{workflowOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <label className="space-y-1 text-sm font-semibold text-slate-700"><span>案件名</span><input name="caseTitle" value={caseTitle} onChange={(event) => setCaseTitle(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 focus:border-[#0046ad] focus:ring-2 focus:ring-blue-100" /></label>
          </div>
        </section>

        <section className="space-y-3" aria-labelledby="case-draft-heading">
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="case-draft-heading" className="text-base font-black text-slate-950">案件草稿</h2><span className="text-xs font-semibold text-slate-500">创建案件前不会写入正式关联</span></div>
          <div className="grid gap-4 rounded-lg border border-slate-200 p-4 md:grid-cols-2">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-black text-slate-900">人物草稿 ({parties.length})</h3><button type="button" onClick={openPersonDrawer} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0046ad]">选择已有人物</button></div>
              {parties.length === 0 ? <p className="text-sm text-slate-500">还没有加入人物草稿。</p> : <div className="space-y-2">{parties.map((party) => <div key={party.partyId} className="flex items-start justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2"><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900">{candidates.find((candidate) => candidate.id === party.partyId)?.name ?? party.partyId}</p><p className="mt-1 text-xs text-slate-600">{party.roles.join("、")}</p></div><button type="button" onClick={() => removeParty(party.partyId)} className="shrink-0 rounded px-2 py-1 text-xs font-bold text-slate-600 hover:bg-white">移除草稿</button></div>)}</div>}
              <button type="button" onClick={() => { openPersonDrawer(); setDrawerView("create"); }} className="text-xs font-bold text-[#0046ad] underline underline-offset-2">快速创建人物</button>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-black text-slate-900">主要物件草稿 ({primaryPropertyId ? 1 : 0})</h3><button type="button" onClick={openPropertyDrawer} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0046ad]">选择已有物件</button></div>
              {primaryPropertyId ? <div className="flex items-start justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2"><p className="min-w-0 truncate text-sm font-bold text-slate-900">{properties.find((property) => property.id === primaryPropertyId)?.name ?? primaryPropertyId}</p><button type="button" onClick={() => setPrimaryPropertyId(undefined)} className="shrink-0 rounded px-2 py-1 text-xs font-bold text-slate-600 hover:bg-white">移除草稿</button></div> : <p className="text-sm text-slate-500">还没有加入主要物件草稿。</p>}
              <button type="button" onClick={() => { openPropertyDrawer(); setDrawerView("create"); }} className="text-xs font-bold text-[#0046ad] underline underline-offset-2">快速创建物件</button>
            </div>
          </div>
        </section>

        {quickCreateFeedback ? <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">{quickCreateFeedback}</div> : null}
        {caseState.status === "error" ? <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900">{caseState.message ?? "案件保存失败，当前案件草稿仍保留，请修正后重试。"}</div> : null}
        <div className="sticky bottom-0 z-10 -mx-4 flex justify-end gap-3 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:-mx-5 sm:px-5"><a href={backHref} onClick={confirmLeave} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0046ad]">取消</a><button type="submit" disabled={pending} className="rounded-lg bg-slate-950 px-5 py-2.5 text-sm font-black text-white hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0046ad]">{pending ? "创建中…" : "创建案件"}</button></div>
      </form>

      {drawer === "person" ? <FocusDialog title={drawerView === "create" ? "创建人物" : "选择已有人物"} onClose={closeDrawer}>
        {drawerView === "create" ? <ClientForm action={createPersonAction} mode="create" locale={locale} returnTo="/cases/new" onCreated={(record) => { setCandidates((current) => [...current, record]); setParties((current) => addOrReplaceParty(current, record.id, ["其他关联人"])); setHasIndependentCreatedMaster(true); setQuickCreateFeedback("主资料已创建，并已加入本次案件草稿；创建案件后正式关联。"); closeDrawer(); }} /> : <div className="space-y-5">
          <div className="flex gap-2"><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索姓名、电话或编号" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-[#0046ad] focus:ring-2 focus:ring-blue-100" /><button type="button" onClick={() => setDrawerView("create")} className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700">快速创建</button></div>
          <div className="space-y-2">{filteredCandidates.map((candidate) => <button type="button" key={candidate.id} onClick={() => selectPerson(candidate.id)} className={`flex w-full items-center justify-between rounded-lg border px-3 py-3 text-left ${selectedPersonId === candidate.id ? "border-blue-700 bg-blue-50" : "border-slate-200 hover:bg-slate-50"}`}><span className="min-w-0 truncate text-sm font-bold text-slate-900">{candidate.name}</span>{parties.some((party) => party.partyId === candidate.id) ? <span className="ml-3 shrink-0 text-xs font-bold text-slate-600">已在本次草稿</span> : <span className="ml-3 shrink-0 text-xs font-bold text-[#0046ad]">选择</span>}</button>)}{filteredCandidates.length === 0 ? <p className="text-sm text-slate-500">没有可建立关联的资料。</p> : null}</div>
          {selectedPersonId ? <div className="space-y-3 rounded-lg border border-slate-200 p-4"><h3 className="text-sm font-black text-slate-900">案件角色</h3><div className="grid gap-2 sm:grid-cols-2">{CASE_PERSON_ROLES.map((role) => <label key={role} className="flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={selectedRoles.includes(role)} onChange={(event) => setSelectedRoles((current) => event.target.checked ? [...current, role] : current.filter((item) => item !== role))} />{role}</label>)}</div>{selectionError ? <p role="alert" className="text-xs font-bold text-rose-700">{selectionError}</p> : null}</div> : null}
          <div className="flex justify-end gap-3 border-t border-slate-200 pt-4"><button type="button" onClick={closeDrawer} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700">取消</button><button type="button" onClick={applyPerson} className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-black text-white">加入草稿</button></div>
        </div>}
      </FocusDialog> : null}

      {drawer === "property" ? <FocusDialog title={drawerView === "create" ? "创建物件" : "选择主要物件"} onClose={closeDrawer}>
        {drawerView === "create" ? <PropertyResponsiveForm action={createPropertyAction} locale={locale} initialValues={{ name: "", area: "", address: "", sizeSqm: "", listingPrice: "", managementFee: "", repairFee: "", notes: "" }} returnTo="/cases/new" onCreated={(record) => { setProperties((current) => [...current, record]); setPrimaryPropertyId(record.id); setHasIndependentCreatedMaster(true); setQuickCreateFeedback("主资料已创建，并已加入本次案件草稿；创建案件后正式关联。"); closeDrawer(); }} /> : <div className="space-y-5"><div className="flex gap-2"><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索物件名、地址或编号" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-[#0046ad] focus:ring-2 focus:ring-blue-100" /><button type="button" onClick={() => setDrawerView("create")} className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700">快速创建</button></div><div className="space-y-2">{filteredProperties.map((property) => <button type="button" key={property.id} onClick={() => applyProperty(property.id)} className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-3 text-left hover:bg-slate-50"><span className="min-w-0"><span className="block truncate text-sm font-bold text-slate-900">{property.name}</span>{property.address ? <span className="mt-1 block truncate text-xs text-slate-500">{property.address}</span> : null}</span><span className="ml-3 shrink-0 text-xs font-bold text-[#0046ad]">选择</span></button>)}{filteredProperties.length === 0 ? <p className="text-sm text-slate-500">没有可建立关联的资料。</p> : null}</div><div className="flex justify-end border-t border-slate-200 pt-4"><button type="button" onClick={closeDrawer} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700">取消</button></div></div>}
      </FocusDialog> : null}
    </div>
  );
}
