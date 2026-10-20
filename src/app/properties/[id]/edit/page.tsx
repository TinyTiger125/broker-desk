import Link from "next/link";
import { notFound } from "next/navigation";
import { updatePropertyProfileAction, type PropertyFormValues } from "@/app/actions";
import { PropertyProfileReadOnly } from "@/components/property-profile-read-only";
import { PropertyResponsiveForm } from "@/components/property-responsive-form";
import { PageFlashBanner } from "@/components/page-flash-banner";
import { ObjectAttachmentSection } from "@/components/object-attachment-section";
import { PropertyObjectImportSection } from "@/components/property-object-import-section";
import { getObjectImportFeatureReadiness, getPropertyDetailForContext, listObjectImportCandidates, listObjectImportTargets } from "@/lib/data";
import { getLocale } from "@/lib/locale";
import { capabilityHasTenantPermission } from "@/lib/tenant-permissions";
import { getTenantCapability, requireTenantSession } from "@/lib/tenant-session";
import { createRequestContext } from "@/lib/visibility-resolver";
import { listObjectArchiveAttachments } from "@/lib/object-attachments";
import { retryObjectImportAction, reviewObjectImportAction, uploadObjectImportAction } from "@/app/object-import-actions";
import { refreshObjectImportReviewAction } from "@/app/actions";
import type { ObjectImportCandidateRecord, ObjectImportTargetRecord } from "@/lib/object-import-repository";
import { buildObjectVersionFingerprint } from "@/lib/object-import-contract";
import { buildEntryDraftKey } from "@/lib/entry-draft-key";

export const dynamic = "force-dynamic";

type EditPropertyPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ flash?: string; returnTo?: string; objectImportJob?: string; createAuditWarning?: string; entryApplied?: string }>;
};

const copy = {
  ja: {
    title: "物件を編集",
    desc: "物件の基本情報と価格・費用を更新します。",
    viewTitle: "物件を表示",
    viewDesc: "この物件は読み取り専用です。",
    back: "物件一覧へ戻る",
    relationTree: "関係を確認",
    updated: "物件を更新しました。",
    created: "物件を作成しました。内容を確認してください。",
    attachmentUploaded: "添付資料を追加しました。",
    importQueued: "資料を受け付けました。読み取り待ちです。主資料はまだ更新されていません。",
    importReviewed: "資料候補を確認して保存しました。現在の物件プロフィールを再確認できます。",
    importConflict: "資料候補の基準が変わりました。現在の物件プロフィールを確認して再確認してください。",
    importAlreadyReviewed: "この資料候補はすでに処理済みです。保存済みの値を表示しています。",
    importInvalidValue: "入力値を確認してください。今回の変更は保存されていません。候補を修正して再確認できます。",
    importRebased: "現在の物件プロフィールを基準に再確認できる状態へ更新しました。",
    importRetryQueued: "資料を再読み取り待ちに戻しました。元資料と過去の結果は保持されています。",
    importRetryRejected: "この資料は現在再読み取りできません。物件の編集権限、資料の出典、処理状態を確認してください。",
    companyRead: "会社メンバーに公開／読み取り専用",
    ownerReadOnly: "現在のアカウントは閲覧のみです。",
    uploadFailed: "資料の読み取りアップロードに失敗しました。物件は作成済みです。資料を追加でアップロードしてください。",
    uploadSaveFailed: "資料の保存に失敗しました。物件は作成済みです。資料を追加でアップロードしてください。",
  },
  zh: {
    title: "编辑物件",
    desc: "更新物件的基本信息、价格和费用。",
    viewTitle: "查看物件",
    viewDesc: "此物件为只读。",
    back: "返回物件列表",
    relationTree: "查看关系",
    updated: "物件已更新。",
    created: "物件已创建，请确认内容。",
    attachmentUploaded: "附件已添加。",
    importQueued: "资料已接收，正在等待读取。主资料尚未更新。",
    importReviewed: "资料候选已确认保存，可重新核对当前物件档案。",
    importConflict: "资料候选基准已变化，请核对当前物件档案后重新确认。",
    importAlreadyReviewed: "该资料候选已处理，当前显示已保存值。",
    importInvalidValue: "请检查输入值。本次修改未保存；修正候选后可以再次确认。",
    importRebased: "已按当前物件档案刷新核对基准。",
    importRetryQueued: "资料已重新放入读取队列。原文件和历史结果均已保留。",
    importRetryRejected: "当前不能重新读取该资料。请检查物件编辑权限、资料来源和处理状态。",
    companyRead: "公司成员可见／只读",
    ownerReadOnly: "当前账号仅可查看。",
    uploadFailed: "资料读取上传失败。物件已创建，请补传资料。",
    uploadSaveFailed: "资料保存失败。物件已创建，请补传资料。",
  },
  ko: {
    title: "매물 편집",
    desc: "매물의 기본 정보와 가격·비용을 업데이트합니다.",
    viewTitle: "매물 보기",
    viewDesc: "이 매물은 읽기 전용입니다.",
    back: "매물 목록으로",
    relationTree: "관계 확인",
    updated: "매물을 업데이트했습니다.",
    created: "매물을 생성했습니다. 내용을 확인해 주세요.",
    importQueued: "자료를 접수했습니다. 읽기를 기다리는 중이며 원본 매물은 아직 변경되지 않았습니다.",
    importReviewed: "자료 후보를 확인해 저장했습니다. 현재 매물 프로필을 다시 확인할 수 있습니다.",
    importConflict: "자료 후보 기준이 변경되었습니다. 현재 매물 프로필을 확인한 뒤 다시 확인해 주세요.",
    importAlreadyReviewed: "이 자료 후보는 이미 처리되었습니다. 저장된 값을 표시합니다.",
    importInvalidValue: "입력값을 확인해 주세요. 이번 변경 사항은 저장되지 않았으며 후보를 수정한 뒤 다시 확인할 수 있습니다.",
    importRebased: "현재 매물 프로필 기준으로 다시 확인할 수 있도록 갱신했습니다.",
    importRetryQueued: "자료를 다시 읽기 대기열로 돌렸습니다. 원본과 이전 결과는 보존됩니다.",
    importRetryRejected: "이 자료는 지금 다시 읽을 수 없습니다. 매물 편집 권한, 출처, 처리 상태를 확인해 주세요.",
    attachmentUploaded: "첨부 자료를 추가했습니다.",
    companyRead: "회사 구성원 공개 / 읽기 전용",
    ownerReadOnly: "현재 계정은 보기 전용입니다.",
    uploadFailed: "자료 읽기 업로드에 실패했습니다. 매물은 생성되었으니 자료를 다시 올려 주세요.",
    uploadSaveFailed: "자료 저장에 실패했습니다. 매물은 생성되었으니 자료를 다시 올려 주세요.",
  },
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

function normalizeReturnTo(value: string | undefined): string {
  const fallback = "/properties";
  const path = (value ?? "").trim();
  if (!path || !path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\") || path.includes("\\")) return fallback;
  const rawPathname = path.split(/[?#]/, 1)[0];
  let decodedPathname = rawPathname;
  try {
    decodedPathname = decodeURIComponent(rawPathname);
  } catch {
    return fallback;
  }
  if (decodedPathname.split("/").some((segment) => segment === "." || segment === "..")) return fallback;
  let parsed: URL;
  try {
    parsed = new URL(path, "http://broker-desk.local");
  } catch {
    return fallback;
  }
  if (parsed.origin !== "http://broker-desk.local") return fallback;
  const keys = [...new Set([...parsed.searchParams.keys()])];
  if (parsed.pathname === "/properties") {
    if (keys.some((key) => !["q", "lifecycle", "sort", "page"].includes(key))) return fallback;
    return `${parsed.pathname}${parsed.search}`;
  }
  if (parsed.pathname === "/organize-center") {
    if (keys.some((key) => !["type", "q", "lifecycle", "page"].includes(key)) || parsed.searchParams.get("type") !== "property") return fallback;
    return `${parsed.pathname}${parsed.search}`;
  }
  if (parsed.pathname === "/import-center") {
    const allowed = ["flow", "targetCaseId", "job", "xlsxJob", "intake", "advanced", "flash", "panel"];
    if (keys.some((key) => !allowed.includes(key))) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  }
  return fallback;
}

export default async function EditPropertyPage({ params, searchParams }: EditPropertyPageProps) {
  const [locale, session] = await Promise.all([
    getLocale(),
    requireTenantSession({ permission: "record.read" }),
  ]);
  const { id } = await params;
  const context = createRequestContext(session);
  const visible = await getPropertyDetailForContext({ context, propertyId: id });
  if (!visible.property || !visible.resolution.canRead) notFound();
  const capability = getTenantCapability(session.membership);
  const canEdit = visible.resolution.canWrite
    && session.membership.status === "active"
    && capabilityHasTenantPermission(capability, "record.update");
  const readOnlyReason = visible.resolution.outcome === "company_read" ? "company_read" : "owner_read_only";
  const property = visible.property;
  const propertyVersion = buildObjectVersionFingerprint(property as unknown as Record<string, unknown>);

  const query = (await searchParams) ?? {};
  const returnTo = normalizeReturnTo(query.returnTo);
  const entryAppliedFields = parseEntryApplied(query.entryApplied);
  const entryDraftKey = buildEntryDraftKey({ tenantId: session.tenant.id, userId: session.user.id, objectType: "property", objectId: property.id });
  const text = copy[locale];
  const [attachments, objectImportReadiness] = await Promise.all([
    listObjectArchiveAttachments({ tenantId: session.tenant.id, userId: session.user.id, targetType: "property", targetId: property.id }),
    getObjectImportFeatureReadiness(),
  ]);
  let objectImportViews: Array<{ target: ObjectImportTargetRecord; fields: ObjectImportCandidateRecord[] }> = [];
  if (objectImportReadiness.ready) {
    const propertyTargets = await listObjectImportTargets({ tenantId: session.tenant.id, userId: session.user.id, targetType: "property", targetId: property.id });
    objectImportViews = await Promise.all(propertyTargets.map(async (target) => ({
      target,
      fields: await listObjectImportCandidates({ tenantId: session.tenant.id, userId: session.user.id, targetId: target.id }),
    })));
  }
  const importView = query.objectImportJob
    ? objectImportViews.find((view) => view.target.importJobId === query.objectImportJob)
    : undefined;
  const flashMessage = query.flash === "entry_preview_audit_failed"
    ? locale === "zh" ? "档案和已归档原件已保留，但部分候选核对记录未保存。请勿重新创建或重复上传下方已列出的原件。" : locale === "ko" ? "기록과 보관된 원본은 유지되지만 일부 후보 확인 이력을 저장하지 못했습니다. 기록을 다시 만들거나 아래 원본을 중복 업로드하지 마세요." : "記録と保管済み原本は保持されていますが、一部の候補確認履歴を保存できませんでした。記録の再作成や下に表示されている原本の再送は不要です。"
    : query.flash === "property_updated"
    ? text.updated
    : query.flash === "property_created"
      ? text.created
      : query.flash === "object_attachment_uploaded"
        ? text.attachmentUploaded
        : query.flash === "object_import_upload_failed"
          ? text.uploadFailed
          : query.flash === "object_import_upload_save_failed" || query.flash === "save_failed"
            ? text.uploadSaveFailed
        : query.flash === "input_extraction_queued"
          ? text.importQueued
          : query.flash === "object_import_reviewed"
            ? text.importReviewed
            : query.flash === "object_import_review_conflict"
              ? text.importConflict
              : query.flash === "object_import_review_already_reviewed"
                ? text.importAlreadyReviewed
                : query.flash === "object_import_review_invalid_value"
                  ? text.importInvalidValue
                    : query.flash === "object_import_retry_queued"
                      ? text.importRetryQueued
                      : query.flash === "object_import_retry_rejected"
                        ? text.importRetryRejected
                  : query.flash === "object_import_review_rebased"
                    ? text.importRebased
                  : importView?.target.status === "queued"
                    ? text.importQueued
                    : undefined;
  const importCanWrite = Boolean(canEdit && objectImportReadiness.ready);
  const initialValues: PropertyFormValues = {
    name: property.name,
    area: property.area ?? "",
    address: property.address ?? "",
    furigana: property.furigana ?? "",
    roomNumber: property.roomNumber ?? "",
    postalCode: property.postalCode ?? "",
    usage: property.usage ?? "",
    sizeSqm: property.sizeSqm == null ? "" : String(property.sizeSqm),
    listingPrice: property.listingPrice > 0 ? String(property.listingPrice) : "",
    listingRent: property.listingRent == null ? "" : String(property.listingRent),
    listingCommonFee: property.listingCommonFee == null ? "" : String(property.listingCommonFee),
    managementFee: property.managementFee == null ? "" : String(property.managementFee),
    repairFee: property.repairFee == null ? "" : String(property.repairFee),
    notes: property.notes ?? "",
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">{canEdit ? text.title : text.viewTitle}</h1>
          <p className="mt-2 text-sm font-medium text-slate-600">{property.name} · {canEdit ? text.desc : text.viewDesc}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canEdit ? (
            <Link href={`/relationship-tree?type=property&id=${encodeURIComponent(property.id)}`} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0046ad]">
              {text.relationTree}
            </Link>
          ) : null}
          <Link href={returnTo} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0046ad]">
            {text.back}
          </Link>
        </div>
      </header>
      <PageFlashBanner message={flashMessage} />
      {query.createAuditWarning === "1" ? <PageFlashBanner tone="info" message={locale === "zh" ? "档案已创建，但创建事件记录未能保存。请在此继续，不要重复新建。" : locale === "ko" ? "기록은 생성되었지만 생성 이력을 저장하지 못했습니다. 여기에서 계속하고 새로 만들지 마세요." : "記録は作成済みですが、作成履歴を保存できませんでした。この画面で続けてください。再作成は不要です。"} /> : null}
      <PropertyObjectImportSection
        locale={locale}
        propertyId={property.id}
        objectPage
        views={objectImportViews}
        uploadAction={importCanWrite ? uploadObjectImportAction : undefined}
        reviewAction={importCanWrite ? reviewObjectImportAction : undefined}
        retryAction={importCanWrite ? retryObjectImportAction : undefined}
        refreshAction={importCanWrite ? refreshObjectImportReviewAction : undefined}
        observedVersion={propertyVersion}
        unavailable={!objectImportReadiness.ready}
      />
      {canEdit ? (
        <PropertyResponsiveForm action={updatePropertyProfileAction} locale={locale} initialValues={initialValues} returnTo={returnTo} propertyId={property.id} entryDraftKey={entryDraftKey} entryAppliedFields={entryAppliedFields} />
      ) : (
        <PropertyProfileReadOnly locale={locale} reason={readOnlyReason} property={{
          name: property.name,
          furigana: property.furigana,
          area: property.area,
          address: property.address,
          roomNumber: property.roomNumber,
          postalCode: property.postalCode,
          usage: property.usage,
          sizeSqm: property.sizeSqm,
          listingPrice: property.listingPrice,
          listingRent: property.listingRent,
          listingCommonFee: property.listingCommonFee,
          managementFee: property.managementFee,
          repairFee: property.repairFee,
          notes: property.notes,
        }} />
      )}
      <ObjectAttachmentSection locale={locale} targetType="property" targetId={property.id} items={attachments} canWrite={canEdit} />
    </div>
  );
}
