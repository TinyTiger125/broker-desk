import { notFound } from "next/navigation";
import { updatePartyProfileAction } from "@/app/actions";
import {
  ObjectWorkbenchShell,
  WorkbenchFieldCard,
  WorkbenchProgressCard,
  WorkbenchProgressNav,
  workbenchInputClass,
} from "@/components/object-workbench-shell";
import { PageFlashBanner } from "@/components/page-flash-banner";
import { getClientById } from "@/lib/data";
import { getLocale, type Locale } from "@/lib/locale";
import {
  extractFreeformPartyNote,
  extractPartyProfileFromNotes,
  getPartyProfileRoleOptions,
  getPartyProfileTypeOptions,
} from "@/lib/party-profile";
import { requireTenantSession } from "@/lib/tenant-session";

export const dynamic = "force-dynamic";

type EditPartyPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ flash?: string }>;
};

const copy = {
  ja: {
    eyebrow: "情報を整理する",
    back: "整理情報へ戻る",
    relationTree: "関係を確認",
    created: "関係者を保存しました。",
    updated: "関係者を更新しました。",
    progressLabel: "確認状況",
    progressTitle: "関係者情報",
    basic: "基本情報",
    contact: "連絡先",
    relation: "業務関係",
    note: "備考",
    name: "氏名 / 会社名",
    type: "種別",
    role: "役割",
    phone: "電話番号",
    email: "メールアドレス",
    lineId: "LINE ID",
    relationHint: "関連物件・案件メモ",
    noteField: "備考",
    save: "保存",
    overall: "全体",
    remaining: "残り",
    complete: "確認済み",
    pending: "未確認",
    filled: "確認済み",
    optional: "任意",
    missing: "未入力",
  },
  zh: {
    eyebrow: "整理信息",
    back: "返回整理信息",
    relationTree: "查看关系",
    created: "主体已保存。",
    updated: "主体已更新。",
    progressLabel: "核对进度",
    progressTitle: "主体资料",
    basic: "基本信息",
    contact: "联系方式",
    relation: "业务关系",
    note: "备注",
    name: "姓名 / 公司名",
    type: "主体类型",
    role: "主体角色",
    phone: "电话号码",
    email: "邮箱地址",
    lineId: "LINE ID",
    relationHint: "关联物件 / 案件备注",
    noteField: "备注",
    save: "保存",
    overall: "整体",
    remaining: "还差",
    complete: "已确认",
    pending: "待补充",
    filled: "已确认",
    optional: "选填",
    missing: "未填写",
  },
  ko: {
    eyebrow: "정보 정리",
    back: "정보 정리로 돌아가기",
    relationTree: "관계 확인",
    created: "관계자를 저장했습니다.",
    updated: "관계자를 업데이트했습니다.",
    progressLabel: "확인 상태",
    progressTitle: "관계자 정보",
    basic: "기본 정보",
    contact: "연락처",
    relation: "업무 관계",
    note: "메모",
    name: "이름 / 회사명",
    type: "관계자 유형",
    role: "역할",
    phone: "전화번호",
    email: "이메일",
    lineId: "LINE ID",
    relationHint: "연결 매물 / 안건 메모",
    noteField: "메모",
    save: "저장",
    overall: "전체",
    remaining: "남음",
    complete: "확인됨",
    pending: "확인 필요",
    filled: "확인됨",
    optional: "선택",
    missing: "미입력",
  },
} as const;

function getLabels(locale: Locale) {
  const text = copy[locale];
  return {
    progress: { overall: text.overall, remaining: text.remaining },
    nav: { complete: text.complete, pending: text.pending, optional: text.optional },
    field: { complete: text.filled, optional: text.optional, missing: text.missing },
  };
}

export default async function EditPartyPage({ params, searchParams }: EditPartyPageProps) {
  const [locale, session] = await Promise.all([
    getLocale(),
    requireTenantSession({ permission: "record.update" }),
  ]);
  const text = copy[locale];
  const { id } = await params;
  const client = await getClientById(id, session.tenant.id);
  if (!client) {
    notFound();
  }

  const meta = extractPartyProfileFromNotes(client.notes);
  const note = extractFreeformPartyNote(client.notes);
  const typeValue = meta.type ?? "individual";
  const roleValue = meta.role ?? "applicant";
  const hasContact = Boolean(client.phone || client.email || client.lineId);
  const basicCompleted = [Boolean(client.name), Boolean(typeValue), Boolean(roleValue)].filter(Boolean).length;
  const basicComplete = basicCompleted >= 3;
  const completed = [Boolean(client.name), Boolean(typeValue), Boolean(roleValue), hasContact].filter(Boolean).length;
  const total = 4;
  const labels = getLabels(locale);
  const query = (await searchParams) ?? {};
  const flashMessage =
    query.flash === "party_created" ? text.created : query.flash === "party_updated" ? text.updated : undefined;

  return (
    <ObjectWorkbenchShell
      eyebrow={text.eyebrow}
      title={client.name}
      actions={[
        { href: `/organize-center?type=party&focus=${encodeURIComponent(client.id)}`, label: text.back },
        { href: `/relationship-tree?type=party&id=${encodeURIComponent(client.id)}`, label: text.relationTree, tone: "blue" },
      ]}
      flash={<PageFlashBanner message={flashMessage} />}
      left={
        <>
          <WorkbenchProgressCard
            label={text.progressLabel}
            title={text.progressTitle}
            completed={completed}
            total={total}
            labels={labels.progress}
          />
          <WorkbenchProgressNav
            labels={labels.nav}
            items={[
              { label: text.basic, completed: basicCompleted, total: 3, href: "#party-basic" },
              { label: text.contact, completed: hasContact ? 1 : 0, total: 1, href: "#party-contact" },
              { label: text.relation, completed: 0, total: 0, href: "#party-relation" },
              { label: text.note, completed: 0, total: 0, href: "#party-note" },
            ]}
          />
        </>
      }
      right={
        <form action={updatePartyProfileAction} className="space-y-4">
          <input type="hidden" name="partyId" value={client.id} />
          <input type="hidden" name="afterSave" value="edit" />
          <WorkbenchFieldCard
            id="party-basic"
            title={text.basic}
            status={basicComplete ? "complete" : "missing"}
            labels={labels.field}
          >
            <div className="grid gap-3 md:grid-cols-3">
              <label className="space-y-1 md:col-span-3">
                <span className="text-xs font-bold text-slate-600">{text.name}</span>
                <input name="name" required defaultValue={client.name} className={workbenchInputClass} />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-bold text-slate-600">{text.type}</span>
                <select name="partyType" defaultValue={typeValue} className={workbenchInputClass}>
                  {getPartyProfileTypeOptions(locale).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 md:col-span-2">
                <span className="text-xs font-bold text-slate-600">{text.role}</span>
                <select name="partyRole" defaultValue={roleValue} className={workbenchInputClass}>
                  {getPartyProfileRoleOptions(locale).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </WorkbenchFieldCard>

          <WorkbenchFieldCard
            id="party-contact"
            title={text.contact}
            status={hasContact ? "complete" : "missing"}
            labels={labels.field}
          >
            <div className="grid gap-3 md:grid-cols-3">
              <label className="space-y-1">
                <span className="text-xs font-bold text-slate-600">{text.phone}</span>
                <input name="phone" defaultValue={client.phone} className={workbenchInputClass} />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-bold text-slate-600">{text.email}</span>
                <input name="email" type="email" defaultValue={client.email ?? ""} className={workbenchInputClass} />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-bold text-slate-600">{text.lineId}</span>
                <input name="lineId" defaultValue={client.lineId ?? ""} className={workbenchInputClass} />
              </label>
            </div>
          </WorkbenchFieldCard>

          <WorkbenchFieldCard
            id="party-relation"
            title={text.relation}
            status="optional"
            labels={labels.field}
          >
            <label className="space-y-1">
              <span className="text-xs font-bold text-slate-600">{text.relationHint}</span>
              <input name="relationHint" defaultValue={client.preferredArea ?? ""} className={workbenchInputClass} />
            </label>
          </WorkbenchFieldCard>

          <WorkbenchFieldCard
            id="party-note"
            title={text.note}
            status="optional"
            labels={labels.field}
          >
            <label className="space-y-1">
              <span className="text-xs font-bold text-slate-600">{text.noteField}</span>
              <textarea name="note" defaultValue={note} rows={4} className={`${workbenchInputClass} resize-y`} />
            </label>
          </WorkbenchFieldCard>

          <div className="sticky bottom-4 z-10 flex justify-end">
            <button type="submit" className="rounded-lg bg-slate-950 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-slate-900/10 hover:bg-slate-800">
              {text.save}
            </button>
          </div>
        </form>
      }
    />
  );
}
