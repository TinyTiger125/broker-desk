"use client";

import { useEffect, useRef, useState } from "react";
import { ClientForm } from "@/components/client-form";
import { FocusDialog } from "@/components/case-association-draft";
import { PropertyResponsiveForm } from "@/components/property-responsive-form";
import type { ClientFormActionState, PropertyFormActionState } from "@/app/actions";
import { CASE_PERSON_ROLES, type CaseAssociationParty, type CasePersonRole } from "@/lib/case-associations";
import type { Locale } from "@/lib/locale";

type Candidate = { id: string; name: string; address?: string; searchText?: string };
type CreateAction<State> = (previousState: State, formData: FormData) => Promise<State>;
type SaveAction = (formData: FormData) => Promise<void>;

type CaseAssociationManagerProps = {
  locale: Locale;
  caseId: string;
  readOnly?: boolean;
  initialParties: Array<CaseAssociationParty & { name: string }>;
  initialPrimaryPropertyId?: string;
  candidates: Candidate[];
  properties: Candidate[];
  saveAction?: SaveAction;
  createPersonAction?: CreateAction<ClientFormActionState>;
  createPropertyAction?: CreateAction<PropertyFormActionState>;
};

export function CaseAssociationManager({
  locale,
  caseId,
  readOnly = false,
  initialParties,
  initialPrimaryPropertyId,
  candidates: initialCandidates,
  properties: initialProperties,
  saveAction,
  createPersonAction,
  createPropertyAction,
}: CaseAssociationManagerProps) {
  const [parties, setParties] = useState(initialParties);
  const [candidates, setCandidates] = useState(initialCandidates);
  const [properties, setProperties] = useState(initialProperties);
  const [primaryPropertyId, setPrimaryPropertyId] = useState(initialPrimaryPropertyId);
  const [drawer, setDrawer] = useState<"person" | "property" | null>(null);
  const [drawerView, setDrawerView] = useState<"select" | "create">("select");
  const [selectedPersonId, setSelectedPersonId] = useState("");
  const [selectedRoles, setSelectedRoles] = useState<CasePersonRole[]>([]);
  const [query, setQuery] = useState("");
  const [autoSave, setAutoSave] = useState(false);
  const associationFormRef = useRef<HTMLFormElement>(null);

  const closeDrawer = () => {
    setDrawer(null);
    setDrawerView("select");
    setQuery("");
    setSelectedPersonId("");
    setSelectedRoles([]);
  };
  const openPersonDrawer = () => setDrawer("person");
  const editPerson = (party: CaseAssociationParty) => {
    setSelectedPersonId(party.partyId);
    setSelectedRoles(party.roles);
    setDrawer("person");
  };
  const applyPerson = () => {
    if (!selectedPersonId || selectedRoles.length === 0) return;
    if (selectedRoles.includes("主要申请人") && parties.some((party) => party.partyId !== selectedPersonId && party.roles.includes("主要申请人"))) return;
    const candidate = candidates.find((item) => item.id === selectedPersonId);
    if (!candidate) return;
    setParties((current) => [...current.filter((party) => party.partyId !== selectedPersonId), { partyId: selectedPersonId, name: candidate.name, roles: selectedRoles }]);
    closeDrawer();
  };
  const changeRole = (role: CasePersonRole, checked: boolean) => {
    if (!checked && selectedRoles.length === 1) {
      if (!window.confirm("删除最后一个角色后将解除关联，继续吗？")) return;
      setParties((current) => current.filter((party) => party.partyId !== selectedPersonId));
      closeDrawer();
      return;
    }
    setSelectedRoles((current) => checked ? [...current, role] : current.filter((item) => item !== role));
  };
  const chooseProperty = (propertyId: string) => {
    if (primaryPropertyId && primaryPropertyId !== propertyId && !window.confirm("更换本案件的主要物件？")) return;
    setPrimaryPropertyId(propertyId);
    closeDrawer();
  };
  const removeProperty = () => {
    if (!window.confirm("解除主要物件后，案件暂时没有主要物件。继续吗？")) return;
    setPrimaryPropertyId(undefined);
  };
  const draftJson = JSON.stringify({ parties: parties.map(({ partyId, roles }) => ({ partyId, roles })), primaryPropertyId });
  useEffect(() => {
    if (!autoSave || !saveAction) return;
    const timer = window.setTimeout(() => {
      associationFormRef.current?.requestSubmit();
      setAutoSave(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [autoSave, draftJson, saveAction]);
  const currentProperty = properties.find((property) => property.id === primaryPropertyId);
  const visibleCandidates = candidates.filter((candidate) => `${candidate.name} ${candidate.id} ${candidate.searchText ?? ""}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const visibleProperties = properties.filter((property) => `${property.name} ${property.address ?? ""}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5" aria-labelledby="case-association-heading">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="case-association-heading" className="text-base font-black text-slate-950">关联资料</h2><p className="mt-1 text-xs font-semibold text-slate-500">同一人物可以编辑多个案件角色；解除关联不会删除人物或物件主资料。</p></div>{!readOnly ? <button type="button" onClick={openPersonDrawer} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0046ad]">增加人物</button> : null}</div>
      <div className="mt-4 grid gap-5 md:grid-cols-2">
        <div className="space-y-3"><h3 className="text-sm font-black text-slate-900">人物关联 ({parties.length})</h3>{parties.length === 0 ? <p className="rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-500">还没有关联人物。</p> : <div className="space-y-2">{parties.map((party) => <div key={party.partyId} className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 px-3 py-3"><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900">{party.name}</p><div className="mt-1 flex flex-wrap gap-1.5">{party.roles.map((role) => <span key={role} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700">{role}</span>)}</div></div>{!readOnly ? <button type="button" onClick={() => editPerson(party)} className="shrink-0 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-bold text-slate-700">编辑角色</button> : null}</div>)}</div>}</div>
        <div className="space-y-3"><div className="flex items-center justify-between gap-2"><h3 className="text-sm font-black text-slate-900">主要物件 ({primaryPropertyId ? 1 : 0})</h3>{!readOnly ? <button type="button" onClick={() => { setDrawer("property"); setDrawerView("select"); }} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-black text-slate-700">{primaryPropertyId ? "更换物件" : "设置主要物件"}</button> : null}</div>{currentProperty ? <div className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 px-3 py-3"><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900">{currentProperty.name}</p>{currentProperty.address ? <p className="mt-1 truncate text-xs text-slate-500">{currentProperty.address}</p> : null}</div>{!readOnly ? <button type="button" onClick={removeProperty} className="shrink-0 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-bold text-slate-700">解除主要物件</button> : null}</div> : <p className="rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-500">还没有主要物件。</p>}</div>
      </div>
      <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">缺少主要申请人或主要物件时，保证公司申请书暂不可生成。</p>
      {!readOnly && saveAction ? <form ref={associationFormRef} action={saveAction} className="mt-4 flex justify-end border-t border-slate-200 pt-4"><input type="hidden" name="caseId" value={caseId} /><input type="hidden" name="associationDraftJson" value={draftJson} /><button type="submit" className="rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-black text-white hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0046ad]">保存关联</button></form> : null}

      {drawer === "person" ? <FocusDialog title={drawerView === "create" ? "创建人物" : "选择人物"} onClose={closeDrawer}>{drawerView === "create" && createPersonAction ? <ClientForm action={createPersonAction} mode="create" locale={locale} returnTo={`/cases/${caseId}`} onCreated={(record) => { setCandidates((current) => [...current, record]); setParties((current) => [...current, { partyId: record.id, name: record.name, roles: ["其他关联人"] }]); setAutoSave(true); closeDrawer(); }} /> : <div className="space-y-4"><div className="flex gap-2"><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索姓名、电话或编号" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-sm" />{createPersonAction ? <button type="button" onClick={() => setDrawerView("create")} className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold">快速创建</button> : null}</div><div className="space-y-2">{visibleCandidates.map((candidate) => <button type="button" key={candidate.id} onClick={() => { setSelectedPersonId(candidate.id); setSelectedRoles(parties.find((party) => party.partyId === candidate.id)?.roles ?? []); }} className={`flex w-full items-center justify-between rounded-lg border px-3 py-3 text-left ${selectedPersonId === candidate.id ? "border-blue-700 bg-blue-50" : "border-slate-200"}`}><span className="truncate text-sm font-bold">{candidate.name}</span>{parties.some((party) => party.partyId === candidate.id) ? <span className="text-xs font-bold text-slate-600">已关联</span> : <span className="text-xs font-bold text-[#0046ad]">选择</span>}</button>)}</div>{selectedPersonId ? <div className="space-y-3 rounded-lg border border-slate-200 p-4"><h3 className="text-sm font-black">案件角色</h3><div className="grid gap-2 sm:grid-cols-2">{CASE_PERSON_ROLES.map((role) => <label key={role} className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={selectedRoles.includes(role)} onChange={(event) => changeRole(role, event.target.checked)} />{role}</label>)}</div><div className="flex justify-end gap-3 border-t border-slate-200 pt-3"><button type="button" onClick={closeDrawer} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold">取消</button><button type="button" onClick={applyPerson} className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-black text-white">保存角色</button></div></div> : null}</div>}</FocusDialog> : null}
      {drawer === "property" ? <FocusDialog title={drawerView === "create" ? "创建物件" : "选择主要物件"} onClose={closeDrawer}>{drawerView === "create" && createPropertyAction ? <PropertyResponsiveForm action={createPropertyAction} locale={locale} initialValues={{ name: "", area: "", address: "", sizeSqm: "", listingPrice: "", managementFee: "", repairFee: "", notes: "" }} returnTo={`/cases/${caseId}`} onCreated={(record) => { setProperties((current) => [...current, record]); setPrimaryPropertyId(record.id); setAutoSave(true); closeDrawer(); }} /> : <div className="space-y-4"><div className="flex gap-2"><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索物件名、地址或编号" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-sm" />{createPropertyAction ? <button type="button" onClick={() => setDrawerView("create")} className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold">快速创建</button> : null}</div><div className="space-y-2">{visibleProperties.map((property) => <button type="button" key={property.id} onClick={() => chooseProperty(property.id)} className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-3 text-left"><span className="min-w-0"><span className="block truncate text-sm font-bold">{property.name}</span>{property.address ? <span className="mt-1 block truncate text-xs text-slate-500">{property.address}</span> : null}</span><span className="text-xs font-bold text-[#0046ad]">选择</span></button>)}</div><div className="flex justify-end border-t border-slate-200 pt-3"><button type="button" onClick={closeDrawer} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold">取消</button></div></div>}</FocusDialog> : null}
    </section>
  );
}
