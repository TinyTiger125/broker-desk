import Link from "next/link";
import { notFound } from "next/navigation";
import { rollbackCaseMergeAction, saveCaseWorkbenchAction } from "@/app/actions";
import { PageFlashBanner } from "@/components/page-flash-banner";
import { getBrokerageCaseById, getDefaultUser, getGuaranteeApplicationDraft, listExtractionReviewItems, listImportJobs } from "@/lib/data";
import type { ExtractionReviewItem, ExtractionReviewStatus } from "@/lib/data";
import { getCaseFieldAliases, getCaseFieldValue } from "@/lib/case-field-normalization";
import { getCaseMergeHistory, getLatestActiveCaseMerge } from "@/lib/case-merge";
import { formatDate } from "@/lib/format";
import {
  buildGuaranteeDraftReadiness,
  buildGuaranteeApplicationReadiness,
  guaranteeCompanyTemplates,
  type GuaranteeReadinessField,
  type GuaranteeTemplateQualityStatus,
} from "@/lib/guarantee-application";
import { getLocale, type Locale } from "@/lib/locale";

export const dynamic = "force-dynamic";

const WORKBENCH_FIELD_STATUS_KEY = "__workbenchFieldStatuses";

type CasePageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ flash?: string }>;
};

type WorkbenchTrustState =
  | "confirmed"
  | "edited"
  | "ai_suggested"
  | "needs_review"
  | "missing"
  | "conflict"
  | "rejected"
  | "unknown";

type WorkbenchField = {
  fieldKey: string;
  label: string;
  value: string;
  required: boolean;
  state: WorkbenchTrustState;
  sourceLabel: string;
};

const workbenchGroups = [
  {
    id: "property_lease",
    label: "物件・契約条件",
    fields: [
      ["property.name", "物件名"],
      ["property.roomNumber", "部屋番号"],
      ["property.address", "物件所在地"],
      ["lease.moveInDate", "入居予定日"],
      ["lease.rent", "賃料"],
      ["lease.commonFee", "共益費・管理費"],
      ["lease.parkingFee", "駐車場代"],
      ["lease.monthlyRentTotal", "賃料合計"],
      ["lease.deposit", "敷金"],
      ["lease.keyMoney", "礼金"],
      ["lease.insuranceFee", "保険料"],
      ["lease.keyExchangeFee", "鍵交換代"],
    ],
  },
  {
    id: "applicant",
    label: "申込者・賃借人",
    fields: [
      ["applicant.name", "氏名"],
      ["applicant.furigana", "フリガナ"],
      ["applicant.gender", "性別"],
      ["applicant.spouse", "配偶者"],
      ["applicant.birthDate", "生年月日"],
      ["applicant.phone", "携帯電話"],
      ["applicant.email", "メール"],
      ["applicant.currentAddress", "現住所"],
      ["applicant.nationality", "国籍"],
      ["applicant.residenceYears", "居住年数"],
      ["applicant.housingType", "自宅・賃貸"],
      ["applicant.currentRent", "現家賃"],
    ],
  },
  {
    id: "identity_document",
    label: "本人確認資料",
    fields: [
      ["applicant.identityDocumentType", "確認資料種別"],
      ["applicant.residenceStatus", "在留資格"],
      ["applicant.residencePeriod", "在留期間"],
      ["applicant.residenceCardExpiry", "在留カード有効期限"],
      ["applicant.residenceCardNumber", "在留カード番号"],
      ["applicant.workRestriction", "就労制限"],
      ["applicant.driverLicenseNumber", "免許証番号"],
      ["applicant.driverLicenseExpiry", "免許証有効期限"],
      ["applicant.driverLicenseConditions", "免許条件"],
    ],
  },
  {
    id: "employment_income",
    label: "勤務先・収入",
    fields: [
      ["applicant.employerName", "勤務先名"],
      ["applicant.employerFurigana", "勤務先フリガナ"],
      ["applicant.employerPhone", "勤務先電話"],
      ["applicant.employerAddress", "勤務先住所"],
      ["applicant.occupation", "職業"],
      ["applicant.employmentType", "雇用形態"],
      ["applicant.annualIncome", "年収"],
      ["applicant.yearsEmployed", "勤続年数"],
      ["applicant.payday", "給料日"],
      ["applicant.moveReason", "転居理由"],
    ],
  },
  {
    id: "contact_guarantor",
    label: "緊急連絡先・連帯保証人",
    fields: [
      ["guarantor.name", "連帯保証人1 氏名"],
      ["guarantor.furigana", "連帯保証人1 フリガナ"],
      ["guarantor.gender", "連帯保証人1 性別"],
      ["guarantor.spouse", "連帯保証人1 配偶者"],
      ["guarantor.relationship", "連帯保証人1 続柄"],
      ["guarantor.birthDate", "連帯保証人1 生年月日"],
      ["guarantor.phone", "連帯保証人1 電話番号"],
      ["guarantor.address", "連帯保証人1 住所"],
      ["guarantor.residenceYears", "連帯保証人1 居住年数"],
      ["guarantor.housingType", "連帯保証人1 自宅・賃貸"],
      ["guarantor.employerName", "連帯保証人1 勤務先名"],
      ["guarantor.employerFurigana", "連帯保証人1 勤務先フリガナ"],
      ["guarantor.employerAddress", "連帯保証人1 勤務先住所"],
      ["guarantor.occupation", "連帯保証人1 職業"],
      ["guarantor.employmentType", "連帯保証人1 雇用形態"],
      ["guarantor.annualIncome", "連帯保証人1 年収"],
      ["guarantor.payday", "連帯保証人1 給料日"],
      ["emergencyContact.name", "氏名"],
      ["emergencyContact.furigana", "フリガナ"],
      ["emergencyContact.gender", "性別"],
      ["emergencyContact.spouse", "配偶者"],
      ["emergencyContact.relationship", "続柄"],
      ["emergencyContact.birthDate", "生年月日"],
      ["emergencyContact.phone", "電話番号"],
      ["emergencyContact.address", "住所"],
      ["emergencyContact.residenceYears", "居住年数"],
      ["emergencyContact.housingType", "自宅・賃貸"],
      ["emergencyContact.employerName", "勤務先名"],
      ["emergencyContact.employerFurigana", "勤務先フリガナ"],
      ["emergencyContact.employerAddress", "勤務先住所"],
      ["emergencyContact.occupation", "職業"],
      ["emergencyContact.employmentType", "雇用形態"],
      ["emergencyContact.annualIncome", "年収"],
      ["emergencyContact.payday", "給料日"],
    ],
  },
  {
    id: "co_occupants",
    label: "同居人",
    fields: [
      ["coOccupants.0.furigana", "同居人1 フリガナ"],
      ["coOccupants.0.name", "同居人1 氏名"],
      ["coOccupants.0.relationship", "同居人1 続柄"],
      ["coOccupants.0.birthDate", "同居人1 生年月日"],
      ["coOccupants.0.phone", "同居人1 電話番号"],
      ["coOccupants.0.employerName", "同居人1 勤務先又は学校名"],
      ["coOccupants.1.furigana", "同居人2 フリガナ"],
      ["coOccupants.1.name", "同居人2 氏名"],
      ["coOccupants.1.relationship", "同居人2 続柄"],
      ["coOccupants.1.birthDate", "同居人2 生年月日"],
      ["coOccupants.1.phone", "同居人2 電話番号"],
      ["coOccupants.1.employerName", "同居人2 勤務先又は学校名"],
      ["coOccupants.2.furigana", "同居人3 フリガナ"],
      ["coOccupants.2.name", "同居人3 氏名"],
      ["coOccupants.2.relationship", "同居人3 続柄"],
      ["coOccupants.2.birthDate", "同居人3 生年月日"],
      ["coOccupants.2.phone", "同居人3 電話番号"],
      ["coOccupants.2.employerName", "同居人3 勤務先又は学校名"],
    ],
  },
  {
    id: "broker_management",
    label: "取扱店・管理会社",
    fields: [
      ["broker.companyName", "取扱店名"],
      ["broker.staffName", "担当者"],
      ["broker.address", "取扱店住所"],
      ["broker.phone", "取扱店電話"],
      ["management.companyName", "管理会社名"],
      ["management.address", "管理会社住所"],
      ["management.phone", "管理会社電話"],
      ["management.staffName", "管理会社担当者"],
    ],
  },
  {
    id: "guarantee_options",
    label: "保証プラン・会社別項目",
    fields: [
      ["guarantee.plan", "保証プラン"],
      ["guarantee.initialFee", "初回保証料"],
      ["guarantee.monthlyFee", "月額保証料"],
      ["guarantee.renewalFee", "更新保証料"],
    ],
  },
] as const;

function tr(locale: Locale, messages: Record<Locale, string>) {
  return messages[locale];
}

function getTemplateQualityLabel(locale: Locale, status: GuaranteeTemplateQualityStatus) {
  const labels: Record<GuaranteeTemplateQualityStatus, Record<Locale, string>> = {
    verified: { ja: "出荷可", zh: "出厂可用", ko: "출고 가능" },
    needs_calibration: { ja: "要精校", zh: "需要精校", ko: "정밀 보정 필요" },
    source_quality_blocked: { ja: "原本差替え", zh: "源文件待换", ko: "원본 교체 필요" },
  };
  return labels[status][locale];
}

function getTemplateQualityClass(status: GuaranteeTemplateQualityStatus) {
  if (status === "verified") return "bg-emerald-100 text-emerald-800";
  if (status === "source_quality_blocked") return "bg-rose-100 text-rose-800";
  return "bg-amber-100 text-amber-800";
}

function getReviewStatusLabel(locale: Locale, status: ExtractionReviewStatus) {
  const labels: Record<ExtractionReviewStatus, Record<Locale, string>> = {
    suggested: { ja: "確認が必要", zh: "需要确认", ko: "확인 필요" },
    accepted: { ja: "確認済み", zh: "已确认", ko: "확인됨" },
    edited: { ja: "修正済み", zh: "已修正", ko: "수정됨" },
    unknown: { ja: "不明", zh: "不明", ko: "불명" },
    rejected: { ja: "不採用", zh: "不采用", ko: "미채택" },
  };
  return labels[status][locale];
}

function getTrustStateLabel(locale: Locale, state: WorkbenchTrustState) {
  const labels: Record<WorkbenchTrustState, Record<Locale, string>> = {
    confirmed: { ja: "確認済み", zh: "已确认", ko: "확인됨" },
    edited: { ja: "修正済み", zh: "已修正", ko: "수정됨" },
    ai_suggested: { ja: "AI候補", zh: "AI 候选", ko: "AI 후보" },
    needs_review: { ja: "確認が必要", zh: "需要确认", ko: "확인 필요" },
    missing: { ja: "未入力", zh: "未填写", ko: "미입력" },
    conflict: { ja: "不一致", zh: "不一致", ko: "불일치" },
    rejected: { ja: "不採用", zh: "不采用", ko: "미채택" },
    unknown: { ja: "不明", zh: "不明", ko: "불명" },
  };
  return labels[state][locale];
}

function getTrustStateClass(state: WorkbenchTrustState) {
  if (state === "confirmed") return "bg-emerald-100 text-emerald-800";
  if (state === "edited") return "bg-blue-100 text-blue-800";
  if (state === "ai_suggested" || state === "needs_review") return "bg-amber-100 text-amber-800";
  if (state === "missing" || state === "conflict") return "bg-rose-100 text-rose-800";
  if (state === "rejected") return "bg-slate-200 text-slate-700";
  return "bg-slate-100 text-slate-700";
}

function getReviewStatusClass(status: ExtractionReviewStatus) {
  if (status === "accepted") return "bg-emerald-100 text-emerald-800";
  if (status === "edited") return "bg-blue-100 text-blue-800";
  if (status === "unknown") return "bg-slate-200 text-slate-700";
  if (status === "rejected") return "bg-rose-100 text-rose-800";
  return "bg-amber-100 text-amber-800";
}

function getPriorityFieldHint(locale: Locale, fieldKey: string) {
  if (fieldKey.startsWith("applicant.residence") || fieldKey.startsWith("applicant.driverLicense") || fieldKey === "applicant.identityDocumentType") {
    return tr(locale, {
      ja: "在留カードまたは運転免許証から確認できます。",
      zh: "可从在留卡或驾照资料确认。",
      ko: "재류카드 또는 운전면허증에서 확인할 수 있습니다.",
    });
  }
  if (fieldKey.startsWith("applicant.employer") || fieldKey === "applicant.annualIncome" || fieldKey === "applicant.employmentType") {
    return tr(locale, {
      ja: "審査で見られやすい勤務先情報です。",
      zh: "这是审查中容易被要求的勤務先信息。",
      ko: "심사에서 확인될 가능성이 높은 근무처 정보입니다.",
    });
  }
  if (fieldKey.startsWith("emergencyContact.") || fieldKey.startsWith("guarantor.")) {
    return tr(locale, {
      ja: "保証会社の必須欄になりやすい連絡先です。",
      zh: "这是保证会社经常要求的联系人信息。",
      ko: "보증회사가 자주 요구하는 연락처 정보입니다.",
    });
  }
  if (fieldKey.startsWith("property.") || fieldKey.startsWith("lease.")) {
    return tr(locale, {
      ja: "すべての申込書で使い回す物件・賃料情報です。",
      zh: "这是所有申请书都会复用的物件/租金信息。",
      ko: "모든 신청서에서 재사용되는 매물/임대료 정보입니다.",
    });
  }
  return tr(locale, {
    ja: "出力前に確認しておく項目です。",
    zh: "输出前需要确认的项目。",
    ko: "출력 전에 확인할 항목입니다.",
  });
}

function getSource(item: ExtractionReviewItem) {
  return item.sourceCell ?? item.sourceRange ?? "-";
}

function readText(data: Record<string, unknown>, key: string) {
  return getCaseFieldValue(data, key);
}

function readStatusMap(data: Record<string, unknown>) {
  const value = data[WORKBENCH_FIELD_STATUS_KEY];
  return value && typeof value === "object" ? (value as Record<string, string>) : {};
}

function workbenchAnchorForGuaranteeField(fieldKey: string) {
  if (fieldKey.startsWith("company_option.")) return "guarantee-template-drafts";
  if (fieldKey.startsWith("property.") || fieldKey.startsWith("lease.")) return "workbench-property_lease";
  if (
    fieldKey.startsWith("applicant.employer") ||
    fieldKey === "applicant.occupation" ||
    fieldKey === "applicant.employmentType" ||
    fieldKey === "applicant.annualIncome" ||
    fieldKey === "applicant.yearsEmployed"
  ) {
    return "workbench-employment_income";
  }
  if (
    fieldKey === "applicant.identityDocumentType" ||
    fieldKey === "applicant.nationality" ||
    fieldKey.startsWith("applicant.residence") ||
    fieldKey.startsWith("applicant.driverLicense") ||
    fieldKey === "applicant.workRestriction"
  ) {
    return "workbench-identity_document";
  }
  if (fieldKey.startsWith("applicant.")) return "workbench-applicant";
  if (fieldKey.startsWith("emergencyContact.")) return "workbench-contact_guarantor";
  if (fieldKey.startsWith("coOccupants.")) return "workbench-co_occupants";
  if (fieldKey.startsWith("broker.") || fieldKey.startsWith("management.")) return "workbench-broker_management";
  if (fieldKey.startsWith("guarantee.")) return "workbench-guarantee_options";
  return "workbench-unresolved";
}

function buildWorkbenchField(input: {
  fieldKey: string;
  label: string;
  requiredKeys: Set<string>;
  confirmedData: Record<string, unknown>;
  statusMap: Record<string, string>;
  reviewByFieldKey: Map<string, ExtractionReviewItem[]>;
}): WorkbenchField {
  const value = readText(input.confirmedData, input.fieldKey);
  const reviewItems = getCaseFieldAliases(input.fieldKey).flatMap((alias) => input.reviewByFieldKey.get(alias) ?? []);
  const latestReview = reviewItems[reviewItems.length - 1];
  const manualState = input.statusMap[input.fieldKey] as WorkbenchTrustState | undefined;
  let state: WorkbenchTrustState = value ? "confirmed" : input.requiredKeys.has(input.fieldKey) ? "missing" : "missing";
  if (manualState === "edited" || manualState === "unknown") state = manualState;
  else if (!value && latestReview?.reviewStatus === "suggested") state = "needs_review";
  else if (!value && latestReview?.reviewStatus === "rejected") state = "rejected";
  else if (!value && latestReview?.reviewStatus === "unknown") state = "unknown";
  else if (value && latestReview?.reviewStatus === "edited") state = "edited";
  else if (value && manualState === "confirmed") state = "confirmed";

  return {
    fieldKey: input.fieldKey,
    label: input.label,
    value,
    required: input.requiredKeys.has(input.fieldKey),
    state,
    sourceLabel: latestReview ? `${latestReview.sourceSheet} / ${getSource(latestReview)}` : "手入力・案件データ",
  };
}

export default async function CasePage({ params, searchParams }: CasePageProps) {
  const locale = await getLocale();
  const user = await getDefaultUser();
  if (!user) notFound();

  const [{ id }, query] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({} as { flash?: string }),
  ]);
  const activeGuaranteeTemplates = guaranteeCompanyTemplates.filter((template) => template.outputStatus === "active");
  const [brokerageCase, reviewItems, importJobs, ...guaranteeDrafts] = await Promise.all([
    getBrokerageCaseById({ userId: user.id, caseId: id }),
    listExtractionReviewItems({ userId: user.id, caseId: id }),
    listImportJobs(user.id, 200),
    ...activeGuaranteeTemplates.map((template) =>
      getGuaranteeApplicationDraft({ userId: user.id, caseId: id, templateId: template.id }),
    ),
  ]);
  if (!brokerageCase) notFound();

  const importJobMap = new Map(importJobs.map((job) => [job.id, job]));
  const sourceFiles = brokerageCase.sourceImportJobIds
    .map((jobId) => importJobMap.get(jobId)?.title ?? jobId)
    .filter(Boolean);
  const mergeHistory = getCaseMergeHistory(brokerageCase.confirmedDataJson);
  const latestActiveMerge = getLatestActiveCaseMerge(brokerageCase.confirmedDataJson);
  const reviewByFieldKey = reviewItems.reduce<Map<string, ExtractionReviewItem[]>>((acc, item) => {
    const list = acc.get(item.fieldKey) ?? [];
    list.push(item);
    acc.set(item.fieldKey, list);
    return acc;
  }, new Map());
  const statusMap = readStatusMap(brokerageCase.confirmedDataJson);
  const guaranteeTemplateSummaries = activeGuaranteeTemplates.map((template, index) => {
    const draft = guaranteeDrafts[index] ?? null;
    const readinessGroups = buildGuaranteeApplicationReadiness({ brokerageCase, template, draft });
    const draftReadiness = buildGuaranteeDraftReadiness(draft, template.id);
    return {
      template,
      draft,
      draftReadiness,
      unresolvedFields: readinessGroups.find((group) => group.id === "unresolved")?.fields ?? [],
    };
  });
  const requiredKeys = new Set(activeGuaranteeTemplates.flatMap((template) => template.requiredFieldKeys));
  const unresolvedFieldMap = new Map(
    guaranteeTemplateSummaries.flatMap((summary) => summary.unresolvedFields.map((field) => [field.fieldKey, field] as const)),
  );
  const unresolvedFields = Array.from(unresolvedFieldMap.values());
  const blockedTemplateCount = guaranteeTemplateSummaries.filter(
    (summary) => summary.unresolvedFields.length > 0 || summary.draftReadiness.requiredMissingCount > 0,
  ).length;
  const qualityBlockedTemplateCount = guaranteeTemplateSummaries.filter((summary) => summary.template.qualityStatus !== "verified").length;
  const outputReadyTemplateCount = guaranteeTemplateSummaries.filter(
    (summary) =>
      summary.unresolvedFields.length === 0 &&
      summary.draftReadiness.requiredMissingCount === 0 &&
      summary.template.allowDirectDownload &&
      summary.template.qualityStatus === "verified",
  ).length;
  const workbenchFieldGroups = workbenchGroups.map((group) => ({
    ...group,
    fields: group.fields.map(([fieldKey, label]) =>
      buildWorkbenchField({
        fieldKey,
        label,
        requiredKeys,
        confirmedData: brokerageCase.confirmedDataJson,
        statusMap,
        reviewByFieldKey,
      }),
    ),
  }));
  const attentionFields = workbenchFieldGroups.flatMap((group) =>
    group.fields
      .filter((field) => field.required && (field.state === "missing" || field.state === "needs_review" || field.state === "unknown" || field.state === "conflict"))
      .map((field) => ({ ...field, label: `${group.label} / ${field.label}` })),
  );
  const requiredWorkbenchFields = workbenchFieldGroups.flatMap((group) => group.fields.filter((field) => field.required));
  const completedRequiredCount = requiredWorkbenchFields.filter((field) => Boolean(field.value)).length;
  const requiredProgress = requiredWorkbenchFields.length > 0
    ? Math.round((completedRequiredCount / requiredWorkbenchFields.length) * 100)
    : 100;
  const priorityFields = attentionFields.slice(0, 8);
  const priorityFieldKeysJson = JSON.stringify(priorityFields.map((field) => field.fieldKey));
  const suggestedReviewCount = reviewItems.filter((item) => item.reviewStatus === "suggested" || item.reviewStatus === "unknown").length;
  const identityWorkbenchGroup = workbenchFieldGroups.find((group) => group.id === "identity_document");
  const identityFilledCount = identityWorkbenchGroup?.fields.filter((field) => Boolean(field.value)).length ?? 0;
  const identityNeedsUpload = identityFilledCount === 0;
  const nextActionLabel =
    priorityFields.length > 0
      ? tr(locale, { ja: "先に不足項目を補完", zh: "先补齐缺失项", ko: "먼저 부족 항목 보완" })
      : blockedTemplateCount > 0
        ? tr(locale, { ja: "会社別項目を確認", zh: "确认会社别项目", ko: "회사별 항목 확인" })
        : tr(locale, { ja: "申込書プレビューへ", zh: "进入申请书预览", ko: "신청서 미리보기로" });
  const outputHref = `/output-center?caseId=${encodeURIComponent(brokerageCase.id)}`;
  const canGoToOutput = blockedTemplateCount < activeGuaranteeTemplates.length;
  const flashMessage =
    query?.flash === "extraction_review_saved"
      ? tr(locale, {
          ja: "確認結果を案件に保存しました。ここで出力前の整理・補完ができます。",
          zh: "核对结果已保存到案件。可在此整理和补全输出前数据。",
          ko: "확인 결과를 안건에 저장했습니다. 여기에서 출력 전 정리와 보완을 할 수 있습니다.",
        })
        : query?.flash === "case_workbench_saved"
        ? tr(locale, {
            ja: "案件ワークベンチを保存しました。保証申込書の出力はこの確認済みデータを使います。",
            zh: "案件工作台已保存。保证申请书输出会使用这些已确认数据。",
            ko: "안건 워크벤치를 저장했습니다. 보증 신청서 출력은 이 확인 데이터를 사용합니다.",
          })
          : query?.flash === "case_source_merged"
            ? tr(locale, {
                ja: "資料を既存案件へ追加しました。合併履歴から確認・分離できます。",
                zh: "资料已追加到既有案件。可在合并历史中确认或拆分回退。",
                ko: "자료를 기존 안건에 추가했습니다. 합병 이력에서 확인하거나 분리할 수 있습니다.",
              })
            : query?.flash === "case_merge_rolled_back"
              ? tr(locale, {
                  ja: "最新の合併を分離して戻しました。分離した資料は別案件として残っています。",
                  zh: "已将最新合并拆分回退；拆出的资料已作为独立案件保留。",
                  ko: "최신 합병을 분리해 되돌렸습니다. 분리한 자료는 별도 안건으로 남아 있습니다.",
                })
              : undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
            {tr(locale, { ja: "案件ワークベンチ", zh: "案件工作台", ko: "안건 워크벤치" })}
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">{brokerageCase.caseTitle}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {tr(locale, { ja: "入力から得た確認済みデータを整理し、保証会社申込書に使う内容を編集します。", zh: "整理从输入得到的已确认数据，并编辑保证申请书使用的内容。", ko: "입력에서 얻은 확인 데이터를 정리하고 보증회사 신청서에 사용할 내용을 편집합니다." })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={canGoToOutput ? outputHref : "#workbench-unresolved"} className={`rounded-lg px-3 py-2 text-xs font-bold text-white ${canGoToOutput ? "bg-emerald-700 hover:bg-emerald-800" : "bg-slate-950 hover:bg-slate-800"}`}>
            {canGoToOutput
              ? tr(locale, { ja: "保証申込書へ", zh: "前往保证申请书", ko: "보증 신청서로" })
              : tr(locale, { ja: "不足項目を確認", zh: "确认缺失项", ko: "부족 항목 확인" })}
          </Link>
          <Link href="/import-center" className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
            {tr(locale, { ja: "資料を入れる", zh: "上传资料", ko: "자료를 넣기" })}
          </Link>
        </div>
      </div>
      <PageFlashBanner message={flashMessage} />

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div id="workbench-unresolved" className="scroll-mt-24 rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-indigo-700">
                  {tr(locale, { ja: "未入力・要確認", zh: "未填写・需确认", ko: "미입력・확인 필요" })}
                </p>
                <h2 className="mt-1 text-xl font-black text-slate-950">{nextActionLabel}</h2>
                <p className="mt-1 text-sm text-slate-600">
                  {tr(locale, {
                    ja: "申込書に影響する不足項目だけを先に出しています。ここで補完した内容は全テンプレートに再利用されます。",
                    zh: "这里只显示会影响申请书输出的缺失项。这里补齐的内容会被所有模板复用。",
                    ko: "신청서 출력에 영향을 주는 부족 항목만 먼저 표시합니다. 여기서 보완한 내용은 모든 템플릿에 재사용됩니다.",
                  })}
                </p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${priorityFields.length > 0 ? "bg-rose-100 text-rose-800" : "bg-emerald-100 text-emerald-800"}`}>
                {priorityFields.length > 0
                  ? `${priorityFields.length} ${tr(locale, { ja: "件を先に確認", zh: "项优先确认", ko: "건 우선 확인" })}`
                  : tr(locale, { ja: "共通必須は完了", zh: "共通必填已完成", ko: "공통 필수 완료" })}
              </span>
            </div>
          </div>

          {priorityFields.length > 0 ? (
            <form action={saveCaseWorkbenchAction} className="space-y-4 p-5">
              <input type="hidden" name="caseId" value={brokerageCase.id} />
              <input type="hidden" name="presentFieldKeysJson" value={priorityFieldKeysJson} />
              <input type="hidden" name="returnAnchor" value="workbench-unresolved" />
              <div className="grid gap-3 md:grid-cols-2">
                {priorityFields.map((field) => (
                  <label key={`priority-${field.fieldKey}`} className="block rounded-lg border border-rose-200 bg-rose-50 p-3">
                    <span className="flex items-start justify-between gap-2">
                      <span className="min-w-0">
                        <span className="block text-sm font-black text-slate-950">{field.label}</span>
                        <span className="mt-1 block text-[11px] font-semibold leading-5 text-slate-600">
                          {getPriorityFieldHint(locale, field.fieldKey)}
                        </span>
                      </span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${getTrustStateClass(field.state)}`}>
                        {getTrustStateLabel(locale, field.state)}
                      </span>
                    </span>
                    <input
                      name={`field:${field.fieldKey}`}
                      defaultValue={field.value}
                      placeholder={tr(locale, { ja: "ここに入力", zh: "在这里填写", ko: "여기에 입력" })}
                      className="mt-3 w-full rounded-md border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-slate-950 outline-none focus:border-slate-950 focus:ring-2 focus:ring-rose-100"
                    />
                    <span className="mt-2 block text-[11px] text-slate-500">{field.sourceLabel}</span>
                  </label>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                <p className="text-xs font-semibold text-slate-600">
                  {tr(locale, {
                    ja: "この保存は表示中の不足項目だけを更新します。ほかの案件データは保持されます。",
                    zh: "这次保存只更新上方显示的缺失项，不会清空其他案件数据。",
                    ko: "이 저장은 표시된 부족 항목만 업데이트합니다. 다른 안건 데이터는 유지됩니다.",
                  })}
                </p>
                <button type="submit" className="rounded-lg bg-slate-950 px-5 py-2 text-sm font-bold text-white hover:bg-slate-800">
                  {tr(locale, { ja: "不足項目だけ保存", zh: "只保存这些缺失项", ko: "부족 항목만 저장" })}
                </button>
              </div>
            </form>
          ) : (
            <div className="grid gap-3 p-5 md:grid-cols-2">
              <Link href={outputHref} className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-900 hover:bg-emerald-100">
                {tr(locale, { ja: "出力センターでテンプレートを選ぶ", zh: "到输出中心选择模板", ko: "출력 센터에서 템플릿 선택" })}
              </Link>
              <Link href={`/guarantee-applications/friends_guarantee_individual_v1/preview?caseId=${encodeURIComponent(brokerageCase.id)}`} className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-900 hover:bg-white">
                {tr(locale, { ja: "プレビュー上で印字位置を確認", zh: "在预览中确认印字位置", ko: "미리보기에서 인쇄 위치 확인" })}
              </Link>
            </div>
          )}
        </div>

        <aside className="space-y-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-slate-500">{tr(locale, { ja: "共通必須項目", zh: "共通必填项", ko: "공통 필수 항목" })}</p>
                <p className="mt-1 text-3xl font-black tabular-nums text-slate-950">{requiredProgress}%</p>
              </div>
              <p className="text-xs font-bold tabular-nums text-slate-500">
                {completedRequiredCount}/{requiredWorkbenchFields.length}
              </p>
            </div>
            <div className="mt-3 h-2 rounded-full bg-slate-100">
              <div className="h-2 rounded-full bg-slate-950" style={{ width: `${requiredProgress}%` }} />
            </div>
          </div>

          <div className={`rounded-xl border p-4 ${identityNeedsUpload ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
            <p className={`text-xs font-bold ${identityNeedsUpload ? "text-amber-800" : "text-emerald-800"}`}>
              {tr(locale, { ja: "本人確認資料", zh: "本人确认资料", ko: "본인 확인 자료" })}
            </p>
            <p className="mt-1 text-sm font-black text-slate-950">
              {identityNeedsUpload
                ? tr(locale, { ja: "在留カード/免許証から補完", zh: "用在留卡/驾照补全", ko: "재류카드/면허증으로 보완" })
                : tr(locale, { ja: `${identityFilledCount}項目を取得済み`, zh: `已取得 ${identityFilledCount} 项`, ko: `${identityFilledCount}개 항목 확보` })}
            </p>
            <Link href="/import-center" className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-bold text-slate-800 ring-1 ring-slate-200 hover:bg-slate-50">
              <span className="material-symbols-outlined text-[16px]">badge</span>
              {tr(locale, { ja: "本人資料を入れる", zh: "上传本人资料", ko: "본인 자료 넣기" })}
            </Link>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-bold text-slate-500">{tr(locale, { ja: "出力ブロック", zh: "输出阻塞", ko: "출력 차단" })}</p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-rose-50 p-3">
                <p className="text-[11px] font-bold text-rose-700">{tr(locale, { ja: "テンプレート", zh: "模板", ko: "템플릿" })}</p>
                <p className="mt-1 text-xl font-black text-rose-900">{blockedTemplateCount}</p>
              </div>
              <div className="rounded-lg bg-amber-50 p-3">
                <p className="text-[11px] font-bold text-amber-700">{tr(locale, { ja: "候補/不明", zh: "候选/不明", ko: "후보/불명" })}</p>
                <p className="mt-1 text-xl font-black text-amber-900">{suggestedReviewCount}</p>
              </div>
              <div className="rounded-lg bg-orange-50 p-3">
                <p className="text-[11px] font-bold text-orange-700">{tr(locale, { ja: "版式精校", zh: "版式精校", ko: "서식 보정" })}</p>
                <p className="mt-1 text-xl font-black text-orange-900">{qualityBlockedTemplateCount}</p>
              </div>
            </div>
            <p className="mt-3 text-[11px] leading-5 text-slate-500">
              {tr(locale, {
                ja: "未確認の候補は出力に使いません。必要なものだけ確認済みにします。",
                zh: "未确认候选不会用于输出，只把必要内容确认入库。",
                ko: "미확인 후보는 출력에 사용하지 않습니다. 필요한 항목만 확인합니다.",
              })}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-bold text-slate-500">{tr(locale, { ja: "保存日時", zh: "保存时间", ko: "저장 시간" })}</p>
            <p className="mt-1 text-sm font-bold text-slate-900">{formatDate(brokerageCase.updatedAt, locale)}</p>
          </div>
        </aside>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-950">{tr(locale, { ja: "申込書ごとの不足索引", zh: "按申请书查看缺失索引", ko: "신청서별 부족 항목 색인" })}</h2>
            <p className="mt-1 text-xs text-slate-600">
              {tr(locale, {
                ja: "どの会社の申込書が何で止まっているかを確認します。会社別項目はプレビュー上で編集します。",
                zh: "确认每家公司申请书被哪些字段卡住。会社别项目在预览页编辑。",
                ko: "각 회사 신청서가 어떤 항목 때문에 막히는지 확인합니다. 회사별 항목은 미리보기에서 편집합니다.",
              })}
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
            {unresolvedFields.length} {tr(locale, { ja: "件", zh: "项", ko: "건" })}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {unresolvedFields.length > 0 ? (
            unresolvedFields.map((field: GuaranteeReadinessField) => (
              <a key={`missing-${field.fieldKey}`} href={`#${workbenchAnchorForGuaranteeField(field.fieldKey)}`} className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-800 hover:bg-rose-100">
                {field.label}
              </a>
            ))
          ) : (
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
              {tr(locale, { ja: "必須項目は入力済みです", zh: "必填项已填写", ko: "필수 항목이 입력되었습니다" })}
            </span>
          )}
        </div>
      </section>

      <section id="guarantee-template-drafts" className="scroll-mt-24 rounded-xl border border-emerald-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-emerald-950">
              {tr(locale, { ja: "保証会社別 申込書", zh: "保证会社别申请书", ko: "보증회사별 신청서" })}
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              {tr(locale, {
                ja: "会社別のプラン・支払方法・同意項目は、各申込書のプレビュー上で確認します。",
                zh: "会社别的方案、支付方式、同意项，在各申请书预览中确认。",
                ko: "회사별 플랜, 지불 방법, 동의 항목은 각 신청서 미리보기에서 확인합니다.",
              })}
            </p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${outputReadyTemplateCount === activeGuaranteeTemplates.length ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
            {outputReadyTemplateCount === activeGuaranteeTemplates.length
              ? tr(locale, {
                  ja: `${activeGuaranteeTemplates.length}社出力可`,
                  zh: `${activeGuaranteeTemplates.length}家公司可输出`,
                  ko: `${activeGuaranteeTemplates.length}개 회사 출력 가능`,
                })
              : tr(locale, {
                  ja: `${outputReadyTemplateCount}/${activeGuaranteeTemplates.length}社が直出力可`,
                  zh: `${outputReadyTemplateCount}/${activeGuaranteeTemplates.length} 家可直接输出`,
                  ko: `${outputReadyTemplateCount}/${activeGuaranteeTemplates.length}개 회사 직접 출력 가능`,
                })}
          </span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {guaranteeTemplateSummaries.map((summary) => {
            const previewHref = `/guarantee-applications/${encodeURIComponent(summary.template.id)}/preview?caseId=${encodeURIComponent(brokerageCase.id)}`;
            const downloadHref = `/api/guarantee-applications/${encodeURIComponent(summary.template.id)}/download?caseId=${encodeURIComponent(brokerageCase.id)}`;
            const missingCount = summary.unresolvedFields.length;
            const draftMissingCount = summary.draftReadiness.requiredMissingCount;
            const dataReady = missingCount === 0 && draftMissingCount === 0;
            const directOutputReady = dataReady && summary.template.allowDirectDownload && summary.template.qualityStatus === "verified";
            const cardClass = directOutputReady
              ? "border-emerald-200 bg-emerald-50"
              : dataReady
                ? "border-amber-200 bg-amber-50"
                : "border-rose-200 bg-rose-50";

            return (
              <article key={summary.template.id} className={`rounded-lg border p-3 ${cardClass}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-black text-slate-950">{summary.template.companyDisplayName}</h3>
                    <p className="mt-0.5 text-[11px] font-semibold text-slate-500">{summary.template.templateDisplayName}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${directOutputReady ? "bg-emerald-100 text-emerald-800" : dataReady ? "bg-amber-100 text-amber-800" : "bg-rose-100 text-rose-800"}`}>
                    {directOutputReady
                      ? tr(locale, { ja: "直出力可", zh: "可直接输出", ko: "직접 출력 가능" })
                      : dataReady
                        ? tr(locale, { ja: "先に精校", zh: "先精校", ko: "먼저 보정" })
                        : tr(locale, { ja: "要確認", zh: "需确认", ko: "확인 필요" })}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${getTemplateQualityClass(summary.template.qualityStatus)}`}>
                    {getTemplateQualityLabel(locale, summary.template.qualityStatus)}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-500">
                    {summary.template.coordinateMappingVersion}
                  </span>
                </div>
                {summary.template.qualityStatus !== "verified" ? (
                  <p className="mt-2 text-[11px] leading-5 text-amber-900">
                    {tr(locale, {
                      ja: "データ入力は進められますが、PDFはプレビュー上で位置確認・微調整してから保存してください。",
                      zh: "可以继续补数据，但 PDF 必须先进预览做位置确认和微调，不能直接当成成品下载。",
                      ko: "데이터 입력은 계속할 수 있지만 PDF는 미리보기에서 위치 확인과 조정을 거친 뒤 저장해야 합니다.",
                    })}
                  </p>
                ) : null}
                <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                  <div className="rounded-md bg-white px-2 py-2">
                    <p className="text-[10px] font-bold text-slate-500">{tr(locale, { ja: "共通不足", zh: "共通缺失", ko: "공통 부족" })}</p>
                    <p className="mt-1 text-lg font-black text-slate-950">{missingCount}</p>
                  </div>
                  <div className="rounded-md bg-white px-2 py-2">
                    <p className="text-[10px] font-bold text-slate-500">{tr(locale, { ja: "会社別不足", zh: "会社别缺失", ko: "회사별 부족" })}</p>
                    <p className="mt-1 text-lg font-black text-slate-950">{draftMissingCount}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link href={previewHref} className="inline-flex items-center gap-1 rounded-md bg-slate-950 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800">
                    <span className="material-symbols-outlined text-[14px]">edit_note</span>
                    {tr(locale, { ja: "申込書を確認", zh: "确认申请书", ko: "신청서 확인" })}
                  </Link>
                  {directOutputReady ? (
                    <Link href={downloadHref} className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-white px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-50">
                      <span className="material-symbols-outlined text-[14px]">download</span>
                      PDF
                    </Link>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="rounded-xl border border-indigo-100 bg-white p-4">
        <h2 className="text-sm font-bold text-indigo-950">{tr(locale, { ja: "状態ラベル", zh: "状态标签", ko: "상태 라벨" })}</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {(["confirmed", "edited", "ai_suggested", "needs_review", "missing", "conflict", "rejected", "unknown"] as WorkbenchTrustState[]).map((state) => (
            <span key={state} className={`rounded-full px-3 py-1 text-xs font-bold ${getTrustStateClass(state)}`}>
              {getTrustStateLabel(locale, state)}
            </span>
          ))}
        </div>
      </section>

      <form action={saveCaseWorkbenchAction} className="space-y-4">
        <input type="hidden" name="caseId" value={brokerageCase.id} />
        <div className="flex justify-end">
          <button type="submit" className="rounded-lg bg-slate-950 px-5 py-2 text-sm font-bold text-white hover:bg-slate-800">
            {tr(locale, { ja: "ワークベンチを保存", zh: "保存工作台", ko: "워크벤치 저장" })}
          </button>
        </div>
        {workbenchFieldGroups.map((group) => (
          <section key={group.id} id={`workbench-${group.id}`} className="scroll-mt-24 rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 className="text-sm font-bold text-slate-950">{group.label}</h2>
            </div>
            <div className="grid gap-3 p-4 md:grid-cols-2">
              {group.fields.map((field) => (
                <label key={field.fieldKey} className={`block rounded-lg border p-3 ${field.required && !field.value ? "border-rose-200 bg-rose-50" : "border-slate-100 bg-slate-50"}`}>
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-slate-900">
                      {field.label}
                      {field.required ? <span className="ml-1 text-rose-600">*</span> : null}
                    </span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${getTrustStateClass(field.state)}`}>
                      {getTrustStateLabel(locale, field.state)}
                    </span>
                  </span>
                  <input
                    name={`field:${field.fieldKey}`}
                    defaultValue={field.value}
                    className="mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                  />
                  <span className="mt-1 block text-[11px] text-slate-500">{field.sourceLabel}</span>
                </label>
              ))}
            </div>
          </section>
        ))}
      </form>

      {mergeHistory.length > 0 ? (
        <section className="rounded-xl border border-emerald-200 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-emerald-950">
                {tr(locale, { ja: "資料合併履歴", zh: "资料合并历史", ko: "자료 합병 이력" })}
              </h2>
              <p className="mt-1 text-xs text-slate-600">
                {tr(locale, {
                  ja: "既存案件へ追加した資料、照合理由、差分、分離可否を残します。",
                  zh: "保留追加到既有案件的资料、匹配理由、差异和可拆分状态。",
                  ko: "기존 안건에 추가한 자료, 대조 이유, 차이, 분리 가능 상태를 남깁니다.",
                })}
              </p>
            </div>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
              {mergeHistory.filter((item) => item.status === "active").length} active
            </span>
          </div>
          <div className="mt-3 space-y-3">
            {mergeHistory
              .slice()
              .reverse()
              .map((item) => {
                const canRollback = latestActiveMerge?.id === item.id;
                return (
                  <article key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-slate-900">{item.sourceImportJobTitle}</p>
                        <p className="mt-1 text-xs text-slate-600">
                          {formatDate(new Date(item.mergedAt), locale)} / {tr(locale, { ja: "照合確度", zh: "匹配可信度", ko: "대조 신뢰도" })} {item.confidenceScore}%
                        </p>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${item.status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}>
                        {item.status === "active"
                          ? tr(locale, { ja: "合併中", zh: "已合并", ko: "합병 중" })
                          : tr(locale, { ja: "分離済み", zh: "已拆分", ko: "분리됨" })}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-600">
                      {item.matchReasons.map((reason) => (
                        <span key={reason} className="rounded bg-white px-2 py-1 font-semibold text-slate-700">
                          {reason}
                        </span>
                      ))}
                      <span className="rounded bg-white px-2 py-1 font-semibold text-slate-700">
                        {tr(locale, { ja: "追加", zh: "新增", ko: "추가" })}: {item.addedFields.length}
                      </span>
                      <span className="rounded bg-white px-2 py-1 font-semibold text-slate-700">
                        {tr(locale, { ja: "差分", zh: "差异", ko: "차이" })}: {item.conflictFields.length}
                      </span>
                    </div>
                    {item.conflictDetails?.length > 0 ? (
                      <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900">
                        <p className="font-bold">{tr(locale, { ja: "差分内容", zh: "差异内容", ko: "차이 내용" })}</p>
                        {item.conflictDetails.map((detail) => (
                          <p key={detail.fieldKey} className="mt-1">
                            {detail.fieldKey}: {detail.existingValue} / {detail.incomingValue}
                          </p>
                        ))}
                      </div>
                    ) : null}
                    {canRollback ? (
                      <form action={rollbackCaseMergeAction} className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                        <input type="hidden" name="caseId" value={brokerageCase.id} />
                        <input type="hidden" name="mergeId" value={item.id} />
                        <label className="flex items-start gap-2 text-xs text-amber-900">
                          <input type="checkbox" name="rollbackConfirm" required className="mt-0.5" />
                          <span>
                            {tr(locale, {
                              ja: "この資料を別案件へ分離し、現在の案件を合併前の状態へ戻すことを確認します。",
                              zh: "确认将这份资料拆成独立案件，并把当前案件恢复到合并前状态。",
                              ko: "이 자료를 별도 안건으로 분리하고 현재 안건을 합병 전 상태로 되돌리는 것을 확인합니다.",
                            })}
                          </span>
                        </label>
                        <button type="submit" className="mt-2 rounded-lg bg-amber-700 px-3 py-2 text-xs font-bold text-white hover:bg-amber-800">
                          {tr(locale, { ja: "この合併を分離して戻す", zh: "拆分并回退这次合并", ko: "이 합병을 분리해 되돌리기" })}
                        </button>
                      </form>
                    ) : null}
                  </article>
                );
              })}
          </div>
        </section>
      ) : null}

      <details className="rounded-xl border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-bold text-slate-900">
          {tr(locale, { ja: "入力ファイル・出典を表示", zh: "显示输入文件与来源", ko: "입력 파일과 출처 표시" })}
        </summary>

      <section className="mt-4 rounded-xl border border-indigo-100 bg-white p-4">
        <h2 className="text-sm font-bold text-indigo-950">{tr(locale, { ja: "入力ファイル・出典", zh: "输入文件 / 来源", ko: "입력 파일 / 출처" })}</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {sourceFiles.length > 0 ? (
            sourceFiles.map((fileName) => (
              <span key={fileName} className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-800">
                {fileName}
              </span>
            ))
          ) : (
            <span className="text-sm text-slate-500">-</span>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-bold text-slate-950">{tr(locale, { ja: "確認状態と根拠", zh: "核对状态与来源证据", ko: "검토 상태와 출처 증거" })}</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {reviewItems.length > 0 ? (
            reviewItems.map((item) => (
              <article key={item.id} className="grid gap-3 px-4 py-3 lg:grid-cols-[180px_1fr_220px]">
                <div>
                  <p className="text-sm font-bold text-slate-900">{item.label}</p>
                  <span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${getReviewStatusClass(item.reviewStatus)}`}>
                    {getReviewStatusLabel(locale, item.reviewStatus)}
                  </span>
                </div>
                <div className="text-sm text-slate-700">
                  <p className="whitespace-pre-wrap">{item.finalValue ?? item.editedValue ?? item.normalizedValue ?? item.extractedValue ?? "-"}</p>
                  {item.reviewStatus === "unknown" || item.reviewStatus === "rejected" || item.reviewStatus === "suggested" ? (
                    <p className="mt-1 text-xs text-slate-500">{tr(locale, { ja: "出力に使う確認済みデータとしては扱いません。", zh: "不会作为输出使用的已确认数据。", ko: "출력에 사용하는 확인 데이터로 취급하지 않습니다." })}</p>
                  ) : null}
                </div>
                <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                  <p className="font-semibold text-slate-800">{item.sourceSheet}</p>
                  <p className="font-mono text-[11px]">{getSource(item)}</p>
                  <p className="mt-1 tabular-nums">{Math.round(item.confidence * 100)}% / {item.method}</p>
                </div>
              </article>
            ))
          ) : (
            <p className="px-4 py-4 text-sm text-slate-500">{tr(locale, { ja: "保存済みの出典レビューはまだありません。", zh: "暂无已保存的来源核对记录。", ko: "저장된 출처 검토 기록이 아직 없습니다." })}</p>
          )}
        </div>
      </section>
      </details>
    </div>
  );
}
