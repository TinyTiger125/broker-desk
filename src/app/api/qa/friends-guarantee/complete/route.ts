import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import {
  activeDataDriver,
  addAuditLog,
  getBrokerageCaseById,
  getDefaultUser,
  saveGuaranteeApplicationDraft,
  updateBrokerageCaseConfirmedData,
} from "@/lib/data";
import { getCaseFieldValue } from "@/lib/case-field-normalization";
import {
  buildGuaranteeDraftReadiness,
  getGuaranteeDraftFieldDefinitions,
  guaranteeCompanyTemplates,
} from "@/lib/guarantee-application";

export const dynamic = "force-dynamic";

const COMPLETE_CASE_FIELD_DEFAULTS: Record<string, string> = {
  "property.name": "港区グランドタワー",
  "property.roomNumber": "802",
  "property.address": "東京都港区芝公園 1-2-3",
  "lease.moveInDate": "2026年6月1日",
  "lease.rent": "120000",
  "lease.commonFee": "8000",
  "lease.parkingFee": "15000",
  "lease.monthlyRentTotal": "143000",
  "lease.deposit": "240000",
  "lease.keyMoney": "120000",
  "lease.insuranceFee": "20000",
  "lease.keyExchangeFee": "33000",
  "applicant.name": "山田 太郎",
  "applicant.furigana": "ヤマダ タロウ",
  "applicant.gender": "男",
  "applicant.spouse": "有",
  "applicant.birthDate": "1990年1月1日",
  "applicant.phone": "090-1234-5678",
  "applicant.currentAddress": "東京都品川区大崎4-5-6",
  "applicant.residenceYears": "3年",
  "applicant.housingType": "自己所有",
  "applicant.currentRent": "90000",
  "applicant.employerFurigana": "ヤマダショウジ",
  "applicant.employerName": "山田商事株式会社",
  "applicant.employerPhone": "03-1111-2222",
  "applicant.employerAddress": "東京都千代田区丸の内1-1-1",
  "applicant.occupation": "IT営業",
  "applicant.employmentType": "正社員",
  "applicant.annualIncome": "650",
  "applicant.payday": "25",
  "applicant.moveReason": "転勤",
  "guarantor.furigana": "タナカ イチロウ",
  "guarantor.name": "田中 一郎",
  "guarantor.gender": "男",
  "guarantor.spouse": "有",
  "guarantor.relationship": "叔父",
  "guarantor.birthDate": "1960年4月4日",
  "guarantor.address": "東京都練馬区豊玉北5-6-7",
  "guarantor.residenceYears": "20年",
  "guarantor.housingType": "自己所有",
  "guarantor.phone": "090-4444-5555",
  "guarantor.employerFurigana": "トウキョウセツビ",
  "guarantor.employerName": "東京設備株式会社",
  "guarantor.employerAddress": "東京都板橋区板橋1-2-3",
  "guarantor.occupation": "設備管理",
  "guarantor.employmentType": "正社員",
  "guarantor.annualIncome": "520",
  "guarantor.payday": "25",
  "emergencyContact.furigana": "ヤマダ ハナコ",
  "emergencyContact.name": "山田 花子",
  "emergencyContact.gender": "女",
  "emergencyContact.spouse": "無",
  "emergencyContact.relationship": "母",
  "emergencyContact.birthDate": "1965年5月5日",
  "emergencyContact.address": "東京都世田谷区三軒茶屋2-3-4",
  "emergencyContact.residenceYears": "10年",
  "emergencyContact.housingType": "家族所有",
  "emergencyContact.phone": "080-1234-5678",
  "emergencyContact.employerFurigana": "サクラカイゴ",
  "emergencyContact.employerName": "さくら介護株式会社",
  "emergencyContact.employerAddress": "東京都渋谷区代々木1-2-3",
  "emergencyContact.occupation": "介護",
  "emergencyContact.employmentType": "契約社員",
  "emergencyContact.annualIncome": "380",
  "emergencyContact.payday": "25",
  "coOccupants.0.furigana": "ヤマダ アイ",
  "coOccupants.0.name": "山田 愛",
  "coOccupants.0.relationship": "妻",
  "coOccupants.0.birthDate": "1992年2月2日",
  "coOccupants.0.phone": "080-2222-3333",
  "coOccupants.0.employerName": "青山デザイン株式会社",
  "coOccupants.1.furigana": "ヤマダ ソウタ",
  "coOccupants.1.name": "山田 蒼太",
  "coOccupants.1.relationship": "子",
  "coOccupants.1.birthDate": "2018年8月8日",
  "coOccupants.1.phone": "なし",
  "coOccupants.1.employerName": "港区立小学校",
  "coOccupants.2.furigana": "ヤマダ ミオ",
  "coOccupants.2.name": "山田 美緒",
  "coOccupants.2.relationship": "子",
  "coOccupants.2.birthDate": "2021年3月3日",
  "coOccupants.2.phone": "なし",
  "coOccupants.2.employerName": "保育園",
  "broker.companyName": "Cherry Investment株式会社",
  "broker.address": "東京都港区赤坂1-2-3",
  "broker.phone": "03-6234-5678",
  "broker.staffName": "田中 健一",
  "management.companyName": "港区グランド管理株式会社",
  "management.address": "東京都港区芝公園2-2-2",
  "management.phone": "03-5555-6666",
  "management.staffName": "佐藤 管理",
};

const COMPLETE_DRAFT_DEFAULTS: Record<string, string> = {
  "company_option.zenhoren_collection_service": "利用する",
  "company_option.zenhoren_initial_fee": "賃料50%",
  "company_option.nihon_safety_product": "プラス1（保証人あり）",
  "company_option.nihon_safety_payment_method": "月払い",
  "company_option.j_lease_product_plan": "住居用プラン",
  "company_option.j_lease_rent_transfer": "利用する",
  "company_option.insure_smart_support": "居住用50",
  "company_option.insure_single_person": "該当なし",
  "company_option.friends_plan_type": "住居用標準プラン",
  "company_option.friends_consent": "確認済み",
  "company_option.friends_collection_agency": "利用する",
  "company_option.friends_single_rider": "なし",
  "company_option.friends_notes": "QA 完成確認",
};

export async function POST(request: Request) {
  if (activeDataDriver !== "memory") {
    return NextResponse.json(
      { ok: false, error: "qa_complete_only_supports_memory_driver" },
      { status: 409 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    caseId?: string;
    caseFields?: Record<string, string>;
    draftFields?: Record<string, string>;
    overwrite?: boolean;
  };
  const user = await getDefaultUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "user_not_found" }, { status: 401 });
  }

  const caseId = String(body.caseId ?? "").trim();
  if (!caseId) {
    return NextResponse.json({ ok: false, error: "case_id_required" }, { status: 400 });
  }

  const brokerageCase = await getBrokerageCaseById({ userId: user.id, caseId });
  if (!brokerageCase) {
    return NextResponse.json({ ok: false, error: "case_not_found" }, { status: 404 });
  }

  const nextConfirmedData: Record<string, unknown> = { ...brokerageCase.confirmedDataJson };
  Object.entries({ ...COMPLETE_CASE_FIELD_DEFAULTS, ...(body.caseFields ?? {}) }).forEach(([fieldKey, value]) => {
    const nextValue = String(value ?? "").trim();
    if (!nextValue) return;
    if (body.overwrite || !getCaseFieldValue(nextConfirmedData, fieldKey)) {
      nextConfirmedData[fieldKey] = nextValue;
    }
  });

  const updatedCase = await updateBrokerageCaseConfirmedData({
    userId: user.id,
    caseId,
    confirmedDataJson: nextConfirmedData,
  });
  if (!updatedCase) {
    return NextResponse.json({ ok: false, error: "case_update_failed" }, { status: 500 });
  }

  const draftValues = { ...COMPLETE_DRAFT_DEFAULTS, ...(body.draftFields ?? {}) };
  const activeGuaranteeTemplates = guaranteeCompanyTemplates.filter((item) => item.outputStatus === "active");
  const drafts = [];
  for (const template of activeGuaranteeTemplates) {
    const fieldValuesJson: Record<string, unknown> = {};
    const fieldStatusesJson: Record<string, string> = {};
    getGuaranteeDraftFieldDefinitions(template.id).forEach((definition) => {
      const value = String(draftValues[definition.fieldKey] ?? "").trim();
      if (!value || value === "未確認" || value === "未定") return;
      fieldValuesJson[definition.fieldKey] = value;
      fieldStatusesJson[definition.fieldKey] = "confirmed";
    });

    const readiness = buildGuaranteeDraftReadiness({
      id: "qa_complete",
      userId: user.id,
      caseId,
      templateId: template.id,
      companyCode: template.companyCode,
      status: "draft",
      fieldValuesJson,
      fieldStatusesJson,
      createdAt: new Date(),
      updatedAt: new Date(),
    }, template.id);
    const draft = await saveGuaranteeApplicationDraft({
      userId: user.id,
      caseId,
      templateId: template.id,
      companyCode: template.companyCode,
      status: readiness.status,
      fieldValuesJson,
      fieldStatusesJson,
      lastReviewedAt: new Date(),
    });
    drafts.push({ draft, readiness });
  }
  const primaryDraft = drafts[0];

  await addAuditLog({
    userId: user.id,
    action: "qa_guarantee_applications_completed",
    targetType: "import_job",
    targetId: caseId,
    message: `QA 保証会社申込書の必須項目を補完しました: ${updatedCase.caseTitle}`,
    context: {
      caseId,
      draftId: primaryDraft?.draft.id,
      templateId: primaryDraft?.draft.templateId,
      draftStatus: primaryDraft?.draft.status,
      savedDraftCount: drafts.length,
    },
  });

  revalidatePath(`/cases/${caseId}`);
  revalidatePath("/output-center");
  activeGuaranteeTemplates.forEach((template) => {
    revalidatePath(`/guarantee-applications/${template.id}/preview`);
  });
  return NextResponse.json({
    ok: true,
    caseId,
    draftStatus: primaryDraft?.draft.status,
    draftReadyCount: primaryDraft?.readiness.readyCount ?? 0,
    draftMissingCount: primaryDraft?.readiness.missingCount ?? 0,
    savedDraftCount: drafts.length,
    previewUrl: `/guarantee-applications/${activeGuaranteeTemplates[0]?.id ?? "friends_guarantee_individual_v1"}/preview?caseId=${encodeURIComponent(caseId)}`,
    downloadUrl: `/api/guarantee-applications/${activeGuaranteeTemplates[0]?.id ?? "friends_guarantee_individual_v1"}/download?caseId=${encodeURIComponent(caseId)}`,
  });
}
