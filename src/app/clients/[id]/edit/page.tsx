import Link from "next/link";
import { notFound } from "next/navigation";
import { refreshObjectImportReviewAction, updateClientProfileAction } from "@/app/actions";
import { reviewObjectImportAction, retryObjectImportAction, uploadObjectImportAction } from "@/app/object-import-actions";
import { ClientForm, type ClientFormDefaults } from "@/components/client-form";
import { PageFlashBanner } from "@/components/page-flash-banner";
import { ObjectAttachmentSection } from "@/components/object-attachment-section";
import { getClientDetailForContext } from "@/lib/data";
import { getLocale, type Locale } from "@/lib/locale";
import { getTenantCapability, requireTenantSession } from "@/lib/tenant-session";
import { capabilityHasTenantPermission } from "@/lib/tenant-permissions";
import { createRequestContext } from "@/lib/visibility-resolver";
import { extractFreeformPartyNote, extractPartyProfileFromNotes } from "@/lib/party-profile";
import { listObjectArchiveAttachments } from "@/lib/object-attachments";
import { listObjectImportCandidates, listObjectImportTargets, resolveClientVisibilityForContext } from "@/lib/data";
import { ClientIdentityImportSection } from "@/components/client-identity-import-section";
import { buildObjectVersionFingerprint } from "@/lib/object-import-contract";
import { buildEntryDraftKey } from "@/lib/entry-draft-key";

export const dynamic = "force-dynamic";

type EditClientPageProps = { params: Promise<{ id: string }>; searchParams?: Promise<{ returnTo?: string; flash?: string; createAuditWarning?: string; entryApplied?: string }> };

const copy = {
  ja: { title: "顧客編集", desc: "顧客の基本情報、希望条件と管理情報を更新します。", back: "戻る", relationTree: "関係を確認", attachments: "資料", updated: "顧客情報を保存しました。", attachmentUploaded: "添付資料を追加しました。", queued: "資料の読み取りを受け付けました。", reviewInvalid: "入力値を確認してください。候補は保存されていません。", reviewConflict: "顧客情報が更新されています。現在の候補を再確認してください。", reviewAlready: "この候補はすでに確認済みです。", reviewed: "候補を確認して保存しました。", rebased: "現在の顧客情報に再同期しました。候補を続けて確認できます。", retryQueued: "資料の再読み取りを受け付けました。", retryRejected: "資料の再読み取りを開始できませんでした。", uploadFailed: "資料の読み取りアップロードに失敗しました。顧客は作成済みです。資料を追加でアップロードしてください。", uploadSaveFailed: "資料の保存に失敗しました。顧客は作成済みです。資料を追加でアップロードしてください。" },
  zh: { title: "编辑客户", desc: "更新客户的基本信息、需求条件和管理信息。", back: "返回", relationTree: "查看关系", attachments: "资料", updated: "客户信息已保存。", attachmentUploaded: "附件已添加。", queued: "已受理资料读取。", reviewInvalid: "请检查输入值；候选内容未保存。", reviewConflict: "客户信息已更新，请重新核对当前候选。", reviewAlready: "此候选已确认。", reviewed: "候选已确认并保存。", rebased: "已与当前客户信息重新同步；可以继续确认候选。", retryQueued: "已受理重新读取资料。", retryRejected: "无法开始重新读取资料。", uploadFailed: "资料读取上传失败。客户已创建，请补传资料。", uploadSaveFailed: "资料保存失败。客户已创建，请补传资料。" },
  ko: { title: "고객 편집", desc: "고객의 기본 정보, 희망 조건과 관리 정보를 업데이트합니다.", back: "돌아가기", relationTree: "관계 확인", attachments: "자료", updated: "고객 정보를 저장했습니다.", attachmentUploaded: "첨부 자료를 추가했습니다.", queued: "자료 읽기를 접수했습니다.", reviewInvalid: "입력값을 확인해 주세요. 후보는 저장되지 않았습니다.", reviewConflict: "고객 정보가 변경되었습니다. 현재 후보를 다시 확인해 주세요.", reviewAlready: "이 후보는 이미 확인되었습니다.", reviewed: "후보를 확인하고 저장했습니다.", rebased: "현재 고객 정보와 다시 동기화했습니다. 후보를 계속 확인할 수 있습니다.", retryQueued: "자료 재읽기를 접수했습니다.", retryRejected: "자료 재읽기를 시작할 수 없습니다.", uploadFailed: "자료 읽기 업로드에 실패했습니다. 고객은 생성되었으니 자료를 다시 올려 주세요.", uploadSaveFailed: "자료 저장에 실패했습니다. 고객은 생성되었으니 자료를 다시 올려 주세요." },
} as const;

function parseEntryApplied(value: string | undefined): string[] {
  if (!value) return [];
  let decoded = value;
  try { decoded = decodeURIComponent(value); } catch { /* use the raw query value */ }
  try {
    const parsed = JSON.parse(decoded);
    if (Array.isArray(parsed)) return parsed.filter((field): field is string => typeof field === "string");
  } catch { /* comma-separated values are the compact form */ }
  return decoded.split(",").map((field) => field.trim()).filter(Boolean);
}

function normalizeReturnTo(value: string | undefined, clientId: string): string {
  const fallback = `/clients/${encodeURIComponent(clientId)}`;
  const path = (value ?? "").trim();
  if (!path || !path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return fallback;
  const rawPathname = path.split(/[?#]/, 1)[0];
  let decoded = rawPathname;
  try { decoded = decodeURIComponent(rawPathname); } catch { return fallback; }
  if (decoded.includes("\\") || decoded.split("/").some((segment) => segment === "." || segment === "..")) return fallback;
  let parsed: URL;
  try { parsed = new URL(path, "http://broker-desk.local"); } catch { return fallback; }
  if (parsed.origin !== "http://broker-desk.local") return fallback;
  const keys = [...new Set([...parsed.searchParams.keys()])];
  if (parsed.pathname === "/clients") {
    if (keys.some((key) => !["q", "stage", "purpose", "temperature", "sort", "page"].includes(key))) return fallback;
    return `${parsed.pathname}${parsed.search}`;
  }
  if (parsed.pathname === "/organize-center" && ["client", "party"].includes(parsed.searchParams.get("type") ?? "")) {
    if (keys.some((key) => !["type", "q", "lifecycle", "page"].includes(key))) return fallback;
    return `${parsed.pathname}${parsed.search}`;
  }
  if (parsed.pathname === "/import-center" && keys.length === 0) return parsed.pathname;
  if (parsed.pathname === `/clients/${encodeURIComponent(clientId)}` && keys.length === 0) return parsed.pathname;
  return fallback;
}

export default async function EditClientPage({ params, searchParams }: EditClientPageProps) {
  const [locale, session] = await Promise.all([getLocale(), requireTenantSession({ permission: "record.read" })]);
  const text = copy[locale];
  const { id } = await params;
  const visible = await getClientDetailForContext({ context: createRequestContext(session), clientId: id });
  if (!visible.detail || !visible.resolution.canRead) notFound();
  const client = visible.detail;
  const profileVersionRecord = await resolveClientVisibilityForContext({ context: createRequestContext(session), clientId: client.id });
  const clientProfileVersion = profileVersionRecord.record ? buildObjectVersionFingerprint(profileVersionRecord.record as unknown as Record<string, unknown>) : buildObjectVersionFingerprint(client);
  const query = (await searchParams) ?? {};
  const returnTo = normalizeReturnTo(query.returnTo, client.id);
  const entryAppliedFields = parseEntryApplied(query.entryApplied);
  const entryDraftKey = buildEntryDraftKey({ tenantId: session.tenant.id, userId: session.user.id, objectType: "client", objectId: client.id });
  const flashMessage = query.flash === "entry_preview_audit_failed"
    ? locale === "zh" ? "档案和已归档原件已保留，但部分候选核对记录未保存。请勿重新创建或重复上传下方已列出的原件。" : locale === "ko" ? "기록과 보관된 원본은 유지되지만 일부 후보 확인 이력을 저장하지 못했습니다. 기록을 다시 만들거나 아래 원본을 중복 업로드하지 마세요." : "記録と保管済み原本は保持されていますが、一部の候補確認履歴を保存できませんでした。記録の再作成や下に表示されている原本の再送は不要です。"
    : query.flash === "client_updated" ? text.updated
    : query.flash === "object_attachment_uploaded" ? text.attachmentUploaded
      : query.flash === "object_import_upload_failed" ? text.uploadFailed
        : query.flash === "object_import_upload_save_failed" || query.flash === "save_failed" ? text.uploadSaveFailed
      : query.flash === "object_import_review_invalid_value" ? text.reviewInvalid
        : query.flash === "object_import_review_conflict" ? text.reviewConflict
          : query.flash === "object_import_review_already_reviewed" ? text.reviewAlready
              : query.flash === "object_import_reviewed" ? text.reviewed
                : query.flash === "object_import_review_rebased" ? text.rebased
                : query.flash === "input_extraction_queued" ? text.queued
                  : query.flash === "object_import_retry_queued" ? text.retryQueued
                : query.flash === "object_import_retry_rejected" ? text.retryRejected
                  : undefined;
  const capabilityCanWrite = session.membership.status === "active"
    && capabilityHasTenantPermission(getTenantCapability(session.membership), "record.update");
  const canEdit = visible.resolution.canWrite && capabilityCanWrite;
  const profile = extractPartyProfileFromNotes(client.notes);
  const attachments = await listObjectArchiveAttachments({ tenantId: session.tenant.id, userId: session.user.id, targetType: "party", targetId: client.id });
  const identityTargets = (await listObjectImportTargets({ tenantId: session.tenant.id, userId: session.user.id, targetType: "party", targetId: client.id }))
    .filter((target) => !target.caseId);
  const identityViews = await Promise.all(identityTargets.map(async (target) => ({ target, fields: await listObjectImportCandidates({ tenantId: session.tenant.id, userId: session.user.id, targetId: target.id }) })));
  const defaults: ClientFormDefaults = {
    clientId: client.id,
    name: client.name,
    phone: client.phone,
    lineId: client.lineId,
    email: client.email,
    partyType: profile.type,
    furigana: client.furigana,
    birthDate: client.birthDate,
    gender: client.gender,
    currentPostalCode: client.currentPostalCode,
    currentAddress: client.currentAddress,
    employerName: client.employerName,
    employerAddress: client.employerAddress,
    employerPhone: client.employerPhone,
    annualIncome: client.annualIncome,
    annualIncomeAsOf: client.annualIncomeAsOf,
    annualIncomeSource: client.annualIncomeSource,
    budgetMin: client.budgetMin,
    budgetMax: client.budgetMax,
    budgetType: client.budgetType,
    preferredArea: client.preferredArea,
    firstChoiceArea: client.firstChoiceArea,
    secondChoiceArea: client.secondChoiceArea,
    purpose: client.purpose,
    loanPreApprovalStatus: client.loanPreApprovalStatus,
    desiredMoveInPeriod: client.desiredMoveInPeriod,
    stage: client.stage,
    temperature: client.temperature,
    brokerageContractType: client.brokerageContractType,
    brokerageContractSignedAt: client.brokerageContractSignedAt,
    brokerageContractExpiresAt: client.brokerageContractExpiresAt,
    importantMattersExplainedAt: client.importantMattersExplainedAt,
    contractDocumentDeliveredAt: client.contractDocumentDeliveredAt,
    personalInfoConsentAt: client.personalInfoConsentAt,
    amlCheckStatus: client.amlCheckStatus,
    nextFollowUpAt: client.nextFollowUpAt,
    notes: extractFreeformPartyNote(client.notes),
  };
  if (!canEdit) {
    const readOnlyReason = visible.resolution.outcome === "company_read" ? "company_read" : "owner_read_only";
    return (
      <div className="mx-auto max-w-5xl space-y-6 pb-12">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5"><div className="min-w-0"><div className="flex flex-wrap items-center gap-3"><h1 className="text-3xl font-bold tracking-tight text-slate-950">{client.name}</h1></div><p className="mt-2 text-sm font-medium text-slate-600">{readOnlyReason === "company_read" ? locale === "zh" ? "公司成员可见／只读" : locale === "ko" ? "회사 구성원 공개 / 읽기 전용" : "会社メンバーに公開／読み取り専用" : locale === "zh" ? "当前账号仅可查看。" : locale === "ko" ? "현재 계정은 보기 전용입니다." : "現在のアカウントは閲覧のみです。"}</p></div><div className="flex flex-wrap items-center gap-2"><Link href={`/relationship-tree?type=client&id=${encodeURIComponent(client.id)}`} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">{text.relationTree}</Link><Link href={returnTo} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">{text.back}</Link></div></header>
        {profile.type === "corporate" ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs font-semibold leading-5 text-amber-900">{locale === "zh" ? "法人客户不支持个人身份证件读取。请通过公司资料流程维护公司信息。" : locale === "ko" ? "법인 고객에는 개인 신분증 읽기를 사용할 수 없습니다. 회사 자료 절차를 사용하세요." : "法人顧客には個人本人確認資料の読み取りを使用できません。会社資料の手順を利用してください。"}</p> : <ClientIdentityImportSection locale={locale} clientId={client.id} views={identityViews} objectPage returnTo={`/clients/${encodeURIComponent(client.id)}/edit`} />}
        <ClientForm action={updateClientProfileAction} mode="edit" defaults={defaults} locale={locale} returnTo={returnTo} partyMeta={{ type: profile.type }} readOnly hideActions />
        <ObjectAttachmentSection locale={locale as Locale} targetType="party" targetId={client.id} items={attachments} canWrite={false} />
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5"><div className="min-w-0"><div className="flex flex-wrap items-center gap-3"><h1 className="text-3xl font-bold tracking-tight text-slate-950">{text.title}</h1></div><p className="mt-2 text-sm font-medium text-slate-600">{client.name} · {text.desc}</p></div><div className="flex flex-wrap items-center gap-2"><Link href={`/relationship-tree?type=client&id=${encodeURIComponent(client.id)}`} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">{text.relationTree}</Link><Link href={returnTo} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0046ad]">{text.back}</Link></div></header>
      <PageFlashBanner message={flashMessage} />
      {query.createAuditWarning === "1" ? <PageFlashBanner tone="info" message={locale === "zh" ? "档案已创建，但创建事件记录未能保存。请在此继续，不要重复新建。" : locale === "ko" ? "기록은 생성되었지만 생성 이력을 저장하지 못했습니다. 여기에서 계속하고 새로 만들지 마세요." : "記録は作成済みですが、作成履歴を保存できませんでした。この画面で続けてください。再作成は不要です。"} /> : null}
      {profile.type === "corporate" ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs font-semibold leading-5 text-amber-900">{locale === "zh" ? "法人客户不支持个人身份证件读取。请通过公司资料流程维护公司信息。" : locale === "ko" ? "법인 고객에는 개인 신분증 읽기를 사용할 수 없습니다. 회사 자료 절차를 이용하세요." : "法人顧客には個人本人確認資料の読み取りを使用できません。会社資料の手順を利用してください。"}</p> : <ClientIdentityImportSection locale={locale} clientId={client.id} views={identityViews} objectPage uploadAction={canEdit ? uploadObjectImportAction : undefined} reviewAction={canEdit ? reviewObjectImportAction : undefined} retryAction={canEdit ? retryObjectImportAction : undefined} refreshAction={canEdit ? refreshObjectImportReviewAction : undefined} observedVersion={clientProfileVersion} returnTo={`/clients/${encodeURIComponent(client.id)}/edit`} />}
      <ClientForm action={updateClientProfileAction} mode="edit" defaults={defaults} locale={locale} returnTo={returnTo} partyMeta={{ type: profile.type }} entryDraftKey={entryDraftKey} entryAppliedFields={entryAppliedFields} />
      <ObjectAttachmentSection locale={locale as Locale} targetType="party" targetId={client.id} items={attachments} canWrite={canEdit} />
    </div>
  );
}
