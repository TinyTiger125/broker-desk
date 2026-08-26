"use client";

import { useEffect, useRef, useState } from "react";
import { ClientForm } from "@/components/client-form";
import { FocusDialog } from "@/components/case-association-draft";
import { PropertyResponsiveForm } from "@/components/property-responsive-form";
import type { ClientFormActionState, PropertyFormActionState } from "@/app/actions";
import { CASE_PERSON_ROLES, getCasePersonRoleLabel, type CaseAssociationParty, type CasePersonRole } from "@/lib/case-associations";
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

const copy = {
  ja: {
    close: "閉じる",
    title: "関連資料",
    description: "同じ人物に複数の案件役割を設定できます。関連を解除しても人物や物件の主資料は削除されません。",
    addPerson: "人物を追加",
    people: "人物の関連",
    peopleEmpty: "関連付けられた人物はまだありません。",
    editRoles: "役割を編集",
    property: "主たる物件",
    changeProperty: "物件を変更",
    setProperty: "主たる物件を設定",
    removeProperty: "主たる物件を解除",
    propertyEmpty: "主たる物件はまだありません。",
    outputBlocker: "主たる申込人または主たる物件がない場合、保証会社申込書は生成できません。",
    save: "関連を保存",
    createPerson: "人物を作成",
    choosePerson: "人物を選択",
    createProperty: "物件を作成",
    chooseProperty: "主たる物件を選択",
    searchPerson: "氏名、電話番号、またはIDで検索",
    searchProperty: "物件名、所在地、またはIDで検索",
    quickCreate: "クイック作成",
    noCandidates: "関連付け可能な資料がありません。",
    select: "選択",
    associated: "関連済み",
    roles: "案件での役割",
    cancel: "キャンセル",
    saveRoles: "役割を保存",
    personRequired: "先に人物を選択してください。",
    roleRequired: "案件での役割を1つ以上選択してください。",
    primaryApplicantUnique: "主たる申込人は1案件につき1名までです。",
    removeLastRoleConfirm: "最後の役割を削除すると、この人物との関連が解除されます。続けますか？",
    replacePropertyConfirm: "この案件の主たる物件を変更しますか？",
    removePropertyConfirm: "主たる物件を解除すると、案件に主たる物件がない状態になります。続けますか？",
    quickCreateFeedback: "主資料を作成し、案件に追加しました。",
  },
  zh: {
    close: "关闭",
    title: "关联资料",
    description: "同一人物可以编辑多个案件角色；解除关联不会删除人物或物件主资料。",
    addPerson: "增加人物",
    people: "人物关联",
    peopleEmpty: "还没有关联人物。",
    editRoles: "编辑角色",
    property: "主要物件",
    changeProperty: "更换物件",
    setProperty: "设置主要物件",
    removeProperty: "解除主要物件",
    propertyEmpty: "还没有主要物件。",
    outputBlocker: "缺少主要申请人或主要物件时，保证公司申请书暂不可生成。",
    save: "保存关联",
    createPerson: "创建人物",
    choosePerson: "选择人物",
    createProperty: "创建物件",
    chooseProperty: "选择主要物件",
    searchPerson: "搜索姓名、电话或编号",
    searchProperty: "搜索物件名、地址或编号",
    quickCreate: "快速创建",
    noCandidates: "没有可建立关联的资料。",
    select: "选择",
    associated: "已关联",
    roles: "案件角色",
    cancel: "取消",
    saveRoles: "保存角色",
    personRequired: "请先选择人物。",
    roleRequired: "至少选择一个案件角色。",
    primaryApplicantUnique: "一个案件最多只能有一位主要申请人。",
    removeLastRoleConfirm: "删除最后一个角色后将解除关联，继续吗？",
    replacePropertyConfirm: "更换本案件的主要物件？",
    removePropertyConfirm: "解除主要物件后，案件暂时没有主要物件。继续吗？",
    quickCreateFeedback: "主资料已创建，并已加入案件。",
  },
  ko: {
    close: "닫기",
    title: "연결 자료",
    description: "같은 관계자에게 여러 안건 역할을 설정할 수 있습니다. 연결을 해제해도 관계자나 매물 기본 자료는 삭제되지 않습니다.",
    addPerson: "관계자 추가",
    people: "관계자 연결",
    peopleEmpty: "연결된 관계자가 없습니다.",
    editRoles: "역할 편집",
    property: "주요 매물",
    changeProperty: "매물 변경",
    setProperty: "주요 매물 설정",
    removeProperty: "주요 매물 해제",
    propertyEmpty: "주요 매물이 없습니다.",
    outputBlocker: "주요 신청인 또는 주요 매물이 없으면 보증회사 신청서를 생성할 수 없습니다.",
    save: "연결 저장",
    createPerson: "관계자 만들기",
    choosePerson: "관계자 선택",
    createProperty: "매물 만들기",
    chooseProperty: "주요 매물 선택",
    searchPerson: "이름, 전화번호 또는 ID 검색",
    searchProperty: "매물명, 주소 또는 ID 검색",
    quickCreate: "빠른 생성",
    noCandidates: "연결할 수 있는 자료가 없습니다.",
    select: "선택",
    associated: "연결됨",
    roles: "안건 역할",
    cancel: "취소",
    saveRoles: "역할 저장",
    personRequired: "먼저 관계자를 선택해 주세요.",
    roleRequired: "안건 역할을 하나 이상 선택해 주세요.",
    primaryApplicantUnique: "하나의 안건에는 주요 신청인을 한 명만 지정할 수 있습니다.",
    removeLastRoleConfirm: "마지막 역할을 삭제하면 이 관계자와의 연결이 해제됩니다. 계속할까요?",
    replacePropertyConfirm: "이 안건의 주요 매물을 변경할까요?",
    removePropertyConfirm: "주요 매물을 해제하면 안건에 주요 매물이 없는 상태가 됩니다. 계속할까요?",
    quickCreateFeedback: "기본 자료를 만들고 안건에 추가했습니다.",
  },
} as const;

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
  const text = copy[locale];
  const [parties, setParties] = useState(initialParties);
  const [candidates, setCandidates] = useState(initialCandidates);
  const [properties, setProperties] = useState(initialProperties);
  const [primaryPropertyId, setPrimaryPropertyId] = useState(initialPrimaryPropertyId);
  const [drawer, setDrawer] = useState<"person" | "property" | null>(null);
  const [drawerView, setDrawerView] = useState<"select" | "create">("select");
  const [selectedPersonId, setSelectedPersonId] = useState("");
  const [selectedRoles, setSelectedRoles] = useState<CasePersonRole[]>([]);
  const [query, setQuery] = useState("");
  const [selectionError, setSelectionError] = useState<string | undefined>();
  const [quickCreateFeedback, setQuickCreateFeedback] = useState<string | undefined>();
  const [autoSave, setAutoSave] = useState(false);
  const associationFormRef = useRef<HTMLFormElement>(null);

  const closeDrawer = () => {
    setDrawer(null);
    setDrawerView("select");
    setQuery("");
    setSelectedPersonId("");
    setSelectedRoles([]);
    setSelectionError(undefined);
  };
  const openPersonDrawer = () => {
    setDrawer("person");
    setDrawerView("select");
    setSelectionError(undefined);
  };
  const editPerson = (party: CaseAssociationParty) => {
    setSelectedPersonId(party.partyId);
    setSelectedRoles(party.roles);
    setDrawer("person");
    setDrawerView("select");
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
    const candidate = candidates.find((item) => item.id === selectedPersonId);
    if (!candidate) return;
    setParties((current) => [...current.filter((party) => party.partyId !== selectedPersonId), { partyId: selectedPersonId, name: candidate.name, roles: selectedRoles }]);
    closeDrawer();
  };
  const changeRole = (role: CasePersonRole, checked: boolean) => {
    if (!checked && selectedRoles.length === 1) {
      if (!window.confirm(text.removeLastRoleConfirm)) return;
      setParties((current) => current.filter((party) => party.partyId !== selectedPersonId));
      closeDrawer();
      return;
    }
    setSelectedRoles((current) => checked ? [...current, role] : current.filter((item) => item !== role));
  };
  const chooseProperty = (propertyId: string) => {
    if (primaryPropertyId && primaryPropertyId !== propertyId && !window.confirm(text.replacePropertyConfirm)) return;
    setPrimaryPropertyId(propertyId);
    closeDrawer();
  };
  const removeProperty = () => {
    if (!window.confirm(text.removePropertyConfirm)) return;
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
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="case-association-heading" className="text-base font-black text-slate-950">{text.title}</h2><p className="mt-1 text-xs font-semibold text-slate-500">{text.description}</p></div>{!readOnly ? <button type="button" onClick={openPersonDrawer} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0046ad]">{text.addPerson}</button> : null}</div>
      <div className="mt-4 grid gap-5 md:grid-cols-2">
        <div className="space-y-3"><h3 className="text-sm font-black text-slate-900">{text.people} ({parties.length})</h3>{parties.length === 0 ? <p className="rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-500">{text.peopleEmpty}</p> : <div className="space-y-2">{parties.map((party) => <div key={party.partyId} className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 px-3 py-3"><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900">{party.name}</p><div className="mt-1 flex flex-wrap gap-1.5">{party.roles.map((role) => <span key={role} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700">{getCasePersonRoleLabel(locale, role)}</span>)}</div></div>{!readOnly ? <button type="button" onClick={() => editPerson(party)} className="shrink-0 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-bold text-slate-700">{text.editRoles}</button> : null}</div>)}</div>}</div>
        <div className="space-y-3"><div className="flex items-center justify-between gap-2"><h3 className="text-sm font-black text-slate-900">{text.property} ({primaryPropertyId ? 1 : 0})</h3>{!readOnly ? <button type="button" onClick={() => { setDrawer("property"); setDrawerView("select"); setSelectionError(undefined); }} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-black text-slate-700">{primaryPropertyId ? text.changeProperty : text.setProperty}</button> : null}</div>{currentProperty ? <div className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 px-3 py-3"><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900">{currentProperty.name}</p>{currentProperty.address ? <p className="mt-1 truncate text-xs text-slate-500">{currentProperty.address}</p> : null}</div>{!readOnly ? <button type="button" onClick={removeProperty} className="shrink-0 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-bold text-slate-700">{text.removeProperty}</button> : null}</div> : <p className="rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-500">{text.propertyEmpty}</p>}</div>
      </div>
      <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">{text.outputBlocker}</p>
      {quickCreateFeedback ? <p role="status" className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900">{quickCreateFeedback}</p> : null}
      {!readOnly && saveAction ? <form ref={associationFormRef} action={saveAction} className="mt-4 flex justify-end border-t border-slate-200 pt-4"><input type="hidden" name="caseId" value={caseId} /><input type="hidden" name="associationDraftJson" value={draftJson} /><button type="submit" className="rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-black text-white hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0046ad]">{text.save}</button></form> : null}

      {drawer === "person" ? <FocusDialog title={drawerView === "create" ? text.createPerson : text.choosePerson} closeLabel={text.close} onClose={closeDrawer}>{drawerView === "create" && createPersonAction ? <ClientForm action={createPersonAction} mode="create" locale={locale} returnTo={`/cases/${caseId}`} onCreated={(record) => { setCandidates((current) => [...current, record]); setParties((current) => [...current, { partyId: record.id, name: record.name, roles: ["其他关联人"] }]); setAutoSave(true); setQuickCreateFeedback(text.quickCreateFeedback); closeDrawer(); }} /> : <div className="space-y-4"><div className="flex gap-2"><input autoFocus value={query} onChange={(event) => { setQuery(event.target.value); setSelectionError(undefined); }} placeholder={text.searchPerson} className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-sm" />{createPersonAction ? <button type="button" onClick={() => setDrawerView("create")} className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold">{text.quickCreate}</button> : null}</div><div className="space-y-2">{visibleCandidates.map((candidate) => <button type="button" key={candidate.id} onClick={() => { setSelectedPersonId(candidate.id); setSelectedRoles(parties.find((party) => party.partyId === candidate.id)?.roles ?? []); setSelectionError(undefined); }} className={`flex w-full items-center justify-between rounded-lg border px-3 py-3 text-left ${selectedPersonId === candidate.id ? "border-blue-700 bg-blue-50" : "border-slate-200"}`}><span className="truncate text-sm font-bold">{candidate.name}</span>{parties.some((party) => party.partyId === candidate.id) ? <span className="text-xs font-bold text-slate-600">{text.associated}</span> : <span className="text-xs font-bold text-[#0046ad]">{text.select}</span>}</button>)}</div>{visibleCandidates.length === 0 ? <p className="text-sm text-slate-500">{text.noCandidates}</p> : null}{selectionError ? <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-900">{selectionError}</p> : null}{selectedPersonId ? <div className="space-y-3 rounded-lg border border-slate-200 p-4"><h3 className="text-sm font-black">{text.roles}</h3><div className="grid gap-2 sm:grid-cols-2">{CASE_PERSON_ROLES.map((role) => <label key={role} className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={selectedRoles.includes(role)} onChange={(event) => changeRole(role, event.target.checked)} />{getCasePersonRoleLabel(locale, role)}</label>)}</div><div className="flex justify-end gap-3 border-t border-slate-200 pt-3"><button type="button" onClick={closeDrawer} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold">{text.cancel}</button><button type="button" onClick={applyPerson} className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-black text-white">{text.saveRoles}</button></div></div> : null}</div>}</FocusDialog> : null}
      {drawer === "property" ? <FocusDialog title={drawerView === "create" ? text.createProperty : text.chooseProperty} closeLabel={text.close} onClose={closeDrawer}>{drawerView === "create" && createPropertyAction ? <PropertyResponsiveForm action={createPropertyAction} locale={locale} initialValues={{ name: "", area: "", address: "", sizeSqm: "", listingPrice: "", managementFee: "", repairFee: "", notes: "" }} returnTo={`/cases/${caseId}`} onCreated={(record) => { setProperties((current) => [...current, record]); setPrimaryPropertyId(record.id); setAutoSave(true); setQuickCreateFeedback(text.quickCreateFeedback); closeDrawer(); }} /> : <div className="space-y-4"><div className="flex gap-2"><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={text.searchProperty} className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-sm" />{createPropertyAction ? <button type="button" onClick={() => setDrawerView("create")} className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold">{text.quickCreate}</button> : null}</div><div className="space-y-2">{visibleProperties.map((property) => <button type="button" key={property.id} onClick={() => chooseProperty(property.id)} className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-3 text-left"><span className="min-w-0"><span className="block truncate text-sm font-bold">{property.name}</span>{property.address ? <span className="mt-1 block truncate text-xs text-slate-500">{property.address}</span> : null}</span><span className="text-xs font-bold text-[#0046ad]">{text.select}</span></button>)}</div>{visibleProperties.length === 0 ? <p className="text-sm text-slate-500">{text.noCandidates}</p> : null}<div className="flex justify-end border-t border-slate-200 pt-3"><button type="button" onClick={closeDrawer} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold">{text.cancel}</button></div></div>}</FocusDialog> : null}
    </section>
  );
}
