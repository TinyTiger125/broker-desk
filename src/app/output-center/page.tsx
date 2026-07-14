import Link from "next/link";
import { generateOutputDocumentAction } from "@/app/actions";
import { FormDraftAssist } from "@/components/form-draft-assist";
import { PageFlashBanner } from "@/components/page-flash-banner";
import { getGuaranteeApplicationDraft, listBrokerageCases, listQuoteFormData, listQuotations } from "@/lib/data";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  buildGuaranteeApplicationReadiness,
  buildGuaranteeDraftReadiness,
  getGuaranteeCompanyTemplate,
  guaranteeCompanyTemplates,
  type GuaranteeReadinessStatus,
  type GuaranteeTemplateQualityStatus,
} from "@/lib/guarantee-application";
import { getCaseFieldDefinition, getCaseFieldInformation } from "@/lib/case-field-catalog";
import { listHubGeneratedOutputs, listHubParties } from "@/lib/hub";
import { t } from "@/lib/i18n";
import { getLocale, type Locale } from "@/lib/locale";
import { getOutputDocDescription, getOutputDocLabel, isOutputDocType, type OutputDocType } from "@/lib/output-doc";
import { requireTenantSession } from "@/lib/tenant-session";

export const dynamic = "force-dynamic";

const outputTypes: OutputDocType[] = ["property_overview", "proposal", "estimate_sheet", "funding_plan", "assumption_memo"];
const iconByType: Record<OutputDocType, string> = {
  property_overview: "home_work",
  proposal: "description",
  estimate_sheet: "receipt_long",
  funding_plan: "payments",
  assumption_memo: "fact_check",
};

const iconColorByType: Record<OutputDocType, string> = {
  property_overview: "bg-sky-50 text-sky-700",
  proposal: "bg-blue-50 text-blue-600",
  estimate_sheet: "bg-emerald-50 text-emerald-600",
  funding_plan: "bg-amber-50 text-amber-600",
  assumption_memo: "bg-[#003366] text-white",
};

const outputCenterCopy = {
  ja: {
    subtitle: "対象案件を選択し、出力テンプレートとプレビューへ進みます。",
    recentActivity: "最近の更新",
    newBatchOutput: "提案データを作成",
    selected: "選択中",
    selectTemplate: "保証会社を選ぶ",
    generationSettings: "生成チェック",
    targetQuote: "対象提案（見積・資金計画用）",
    targetProperty: "対象物件",
    targetParty: "対象関係者",
    outputFormat: "出力形式",
    language: "言語",
    generateDocument: "帳票を出力",
    recentOutputs: "出力履歴",
    templateHitTitle: "テンプレート利用状況",
    templateHitDesc: "現在の履歴条件で使われたテンプレート記録",
    withTemplateVersion: "記録あり",
    withoutTemplateVersion: "記録なし",
    topTemplateVersions: "よく使うテンプレート",
    viewAll: "すべて表示",
    allType: "すべての種別",
    allLang: "すべての言語",
    allFormat: "すべての形式",
    allTemplate: "すべてのテンプレート",
    templateUnbound: "テンプレート未記録",
    templateVersion: "使用テンプレート",
    filterApply: "適用",
    filterReset: "リセット",
    exportHitRate: "利用状況CSV",
    emptyFilteredOutputs: "現在のフィルタ条件に一致する出力履歴がありません。",
    previewMode: "PDFプレビュー",
    download: "ダウンロード",
    preparedFor: "提出先",
    dateIssued: "発行日",
    pageLabel: "ページ",
    propertyOption1: "スカイラインレジデンス - 1402号室",
    propertyOption2: "リバーサイドガーデンズ - ペントハウスB",
    partyOption1: "佐藤 健一（購入検討）",
    partyOption2: "ロドリゲス エレナ（投資家）",
    formatPdf: "PDF",
    formatDocx: "DOCX",
    langJa: "日本語 (JP)",
    langZh: "中国語 (CN)",
    langKo: "韓国語 (KR)",
    previewSubtitle: "前提条件および取引条件の説明",
    preparedForValue: "佐藤 健一 様",
    issuedDateValue: "2026年3月29日",
    section1Title: "1. 物件概要",
    fieldAddress: "所在地",
    fieldArea: "専有面積",
    fieldLayout: "間取り",
    valueAddress: "東京都港区赤坂9-7-1",
    valueArea: "85.42 m²",
    valueLayout: "2LDK",
    section2Title: "2. 取引条件",
    section2Desc: "本説明書は売買契約締結時に、対象物件の権利関係・法的規制・契約条件を説明するものです。",
    bullet1: "現況有姿での引渡しを原則とします。",
    bullet2: "売買代金の10%を手付金としてお支払いいただきます。",
    bullet3: "ローン特約期限は契約締結日から21日以内です。",
    section3Title: "3. 署名欄",
    sellerSign: "売主 署名",
    buyerSign: "買主 署名",
    docIdLabel: "文書ID",
    outputCenterTitle: "書類を出力",
    guaranteePrimaryEyebrow: "申込書作成",
    guaranteePrimaryTitle: "保証会社申込書",
    guaranteePrimaryPanelTitle: "確認してから出力",
    guaranteePrimaryDesc: "現在の案件を確認し、足りない項目だけ補って、選択した保証会社の申込書を出します。",
    guaranteeNextAction: "次にやること",
    guaranteeChecklist: "残りの確認項目",
    outputPathCase: "案件",
    outputPathTemplate: "保証会社",
    outputPathPreview: "プレビュー",
    caseReadyForPreview: "プレビュー可",
    caseMissingItems: "未完了",
    chooseThisCase: "この案件を選ぶ",
    caseCardUpdated: "更新",
    guaranteeDetailToggle: "詳細を表示",
    guaranteeBackstageToggle: "補助機能を表示",
    guaranteeCase: "対象案件",
    guaranteeNoCase: "確認済み案件がまだありません",
    guaranteeTemplate: "保証会社",
    guaranteeReadiness: "申込データ準備",
    guaranteeDraftReadiness: "会社別追加項目",
    guaranteeDraftEdit: "会社別項目を編集",
    guaranteeDraftReady: "追加項目入力済み",
    guaranteeDraftMissing: "追加項目未入力",
    guaranteeFillInWorkbench: "情報整理で入力",
    guaranteeFillInDraft: "会社別項目で入力",
    guaranteeReviewMissing: "不足項目を確認",
    guaranteeSelectCaseFirst: "先に対象案件を選択",
    guaranteeReady: "準備済み",
    guaranteeMissing: "未入力",
    guaranteeNeedsConfirmation: "要確認",
    guaranteeRequiredMissing: "必須項目が未完了",
    guaranteeExportBlocked: "この保証会社の申込書出力は次の対応予定です。まずは不足項目の確認までできます。",
    guaranteePdfPendingButton: "申込書出力は準備中",
    guaranteePreviewReady: "まずPDFをプレビューし、印字位置と入力内容を確認してからダウンロードします。",
    guaranteePreviewAction: "{company}申込書をプレビュー",
    guaranteePreviewNeedsCase: "案件を選択すると、確認済みデータを使って申込書を出せます。",
    guaranteeSourceConfirmed: "確認済み案件データ",
    guaranteeSourceDraft: "会社別追加項目",
    guaranteeSourceCandidate: "読取内容（確認が必要）",
    guaranteeSourceMissing: "未入力",
    guaranteeCaseLink: "案件を確認",
    guaranteeImportLink: "入力ファイルを取り込む",
    guaranteeLegacyTitle: "既存の出力",
    guaranteeLegacyDesc: "物件概要書や提案関連の既存出力は補助機能として残しています。",
  },
  zh: {
    subtitle: "选择目标案件和输出范本，然后进入预览或下载。",
    recentActivity: "最近动态",
    newBatchOutput: "创建提案数据",
    selected: "已选择",
    selectTemplate: "选择保证会社",
    generationSettings: "生成检查",
    targetQuote: "目标提案（用于费用/资金计划）",
    targetProperty: "目标物件",
    targetParty: "目标主体",
    outputFormat: "输出格式",
    language: "语言",
    generateDocument: "输出文书",
    recentOutputs: "输出历史",
    templateHitTitle: "范本使用情况",
    templateHitDesc: "查看已生成文件使用过哪些范本",
    withTemplateVersion: "有范本记录",
    withoutTemplateVersion: "未记录范本",
    topTemplateVersions: "常用范本",
    viewAll: "查看全部",
    allType: "全部类型",
    allLang: "全部语言",
    allFormat: "全部格式",
    allTemplate: "全部范本",
    templateUnbound: "未记录范本",
    templateVersion: "使用范本",
    filterApply: "应用",
    filterReset: "重置",
    exportHitRate: "使用情况 CSV",
    emptyFilteredOutputs: "当前筛选条件下暂无输出记录。",
    previewMode: "PDF 预览",
    download: "下载",
    preparedFor: "面向对象",
    dateIssued: "签发日期",
    pageLabel: "页",
    propertyOption1: "天际公寓 - 1402室",
    propertyOption2: "河畔花园 - 顶层B",
    partyOption1: "佐藤健一（意向客户）",
    partyOption2: "Elena Rodriguez（投资方）",
    formatPdf: "PDF",
    formatDocx: "DOCX",
    langJa: "日语 (JP)",
    langZh: "中文 (CN)",
    langKo: "韩语 (KR)",
    previewSubtitle: "前提条件与交易条款说明",
    preparedForValue: "佐藤健一 先生",
    issuedDateValue: "2026-03-29",
    section1Title: "1. 物件概要",
    fieldAddress: "地址",
    fieldArea: "专有面积",
    fieldLayout: "户型",
    valueAddress: "东京都港区赤坂9-7-1",
    valueArea: "85.42 m²",
    valueLayout: "2室1厅",
    section2Title: "2. 交易条件",
    section2Desc: "本说明用于在签约前说明目标物件的权利关系、法律限制及主要交易条件。",
    bullet1: "原则上按现状交付。",
    bullet2: "需支付成交价 10% 作为定金。",
    bullet3: "贷款特约期限为签约日起 21 日内。",
    section3Title: "3. 签署栏",
    sellerSign: "卖方签署",
    buyerSign: "买方签署",
    docIdLabel: "文档ID",
    outputCenterTitle: "输出文件",
    guaranteePrimaryEyebrow: "申请书创建",
    guaranteePrimaryTitle: "保证会社申请书",
    guaranteePrimaryPanelTitle: "确认后输出",
    guaranteePrimaryDesc: "确认当前案件，只补齐缺失项，然后输出所选保证会社申请书。",
    guaranteeNextAction: "下一步",
    guaranteeChecklist: "剩余确认项",
    outputPathCase: "案件",
    outputPathTemplate: "保证会社",
    outputPathPreview: "预览",
    caseReadyForPreview: "可预览",
    caseMissingItems: "未完成",
    chooseThisCase: "选择这个案件",
    caseCardUpdated: "更新",
    guaranteeDetailToggle: "显示详情",
    guaranteeBackstageToggle: "显示辅助功能",
    guaranteeCase: "目标案件",
    guaranteeNoCase: "暂无已确认案件",
    guaranteeTemplate: "保证会社",
    guaranteeReadiness: "申请数据准备度",
    guaranteeDraftReadiness: "会社别追加项目",
    guaranteeDraftEdit: "编辑会社别项目",
    guaranteeDraftReady: "追加项目已填写",
    guaranteeDraftMissing: "追加项目未填写",
    guaranteeFillInWorkbench: "到信息整理页填写",
    guaranteeFillInDraft: "到会社别项目填写",
    guaranteeReviewMissing: "查看缺失项",
    guaranteeSelectCaseFirst: "请先选择目标案件",
    guaranteeReady: "已就绪",
    guaranteeMissing: "未填写",
    guaranteeNeedsConfirmation: "需确认",
    guaranteeRequiredMissing: "必填项未完成",
    guaranteeExportBlocked: "该保证会社的申请书输出将在下一阶段支持。当前可先确认缺失项。",
    guaranteePdfPendingButton: "申请书输出准备中",
    guaranteePreviewReady: "先预览 PDF，确认印字位置和填写内容后再下载。",
    guaranteePreviewAction: "预览{company}申请书",
    guaranteePreviewNeedsCase: "选择案件后，可使用已确认数据输出申请书。",
    guaranteeSourceConfirmed: "已确认案件数据",
    guaranteeSourceDraft: "会社别追加项目",
    guaranteeSourceCandidate: "读取内容（需确认）",
    guaranteeSourceMissing: "未填写",
    guaranteeCaseLink: "查看案件",
    guaranteeImportLink: "导入输入文件",
    guaranteeLegacyTitle: "既有输出",
    guaranteeLegacyDesc: "物件概要书与提案相关既有输出保留为辅助功能。",
  },
  ko: {
    subtitle: "대상 안건을 선택하고 출력 템플릿과 미리보기로 이동합니다.",
    recentActivity: "최근 활동",
    newBatchOutput: "제안 데이터 작성",
    selected: "선택됨",
    selectTemplate: "보증회사 선택",
    generationSettings: "생성 점검",
    targetQuote: "대상 제안(비용/자금계획용)",
    targetProperty: "대상 매물",
    targetParty: "대상 관계자",
    outputFormat: "출력 형식",
    language: "언어",
    generateDocument: "문서 출력",
    recentOutputs: "출력 이력",
    templateHitTitle: "템플릿 사용 현황",
    templateHitDesc: "현재 이력 조건에서 사용된 템플릿 기록",
    withTemplateVersion: "기록 있음",
    withoutTemplateVersion: "기록 없음",
    topTemplateVersions: "자주 쓰는 템플릿",
    viewAll: "전체 보기",
    allType: "전체 유형",
    allLang: "전체 언어",
    allFormat: "전체 형식",
    allTemplate: "전체 템플릿",
    templateUnbound: "템플릿 미기록",
    templateVersion: "사용 템플릿",
    filterApply: "적용",
    filterReset: "초기화",
    exportHitRate: "사용 현황 CSV",
    emptyFilteredOutputs: "현재 필터 조건에 맞는 출력 이력이 없습니다.",
    previewMode: "PDF 미리보기",
    download: "다운로드",
    preparedFor: "제출 대상",
    dateIssued: "발행일",
    pageLabel: "페이지",
    propertyOption1: "스카이라인 레지던스 - 1402호",
    propertyOption2: "리버사이드 가든스 - 펜트하우스 B",
    partyOption1: "사토 켄이치(구매 검토)",
    partyOption2: "엘레나 로드리게스(투자자)",
    formatPdf: "PDF",
    formatDocx: "DOCX",
    langJa: "일본어 (JP)",
    langZh: "중국어 (CN)",
    langKo: "한국어 (KR)",
    previewSubtitle: "전제 조건 및 거래 조건 설명",
    preparedForValue: "사토 켄이치 님",
    issuedDateValue: "2026-03-29",
    section1Title: "1. 매물 개요",
    fieldAddress: "주소",
    fieldArea: "전용 면적",
    fieldLayout: "구조",
    valueAddress: "도쿄도 미나토구 아카사카 9-7-1",
    valueArea: "85.42 m²",
    valueLayout: "2LDK",
    section2Title: "2. 거래 조건",
    section2Desc: "본 설명서는 계약 체결 전 대상 매물의 권리관계, 법적 규제, 계약 조건을 안내합니다.",
    bullet1: "현 상태 기준 인도를 원칙으로 합니다.",
    bullet2: "매매대금의 10%를 계약금으로 납부합니다.",
    bullet3: "대출 특약 기한은 계약 체결일로부터 21일 이내입니다.",
    section3Title: "3. 서명란",
    sellerSign: "매도인 서명",
    buyerSign: "매수인 서명",
    docIdLabel: "문서ID",
    outputCenterTitle: "문서 출력",
    guaranteePrimaryEyebrow: "신청서 작성",
    guaranteePrimaryTitle: "보증회사 신청서",
    guaranteePrimaryPanelTitle: "확인 후 출력",
    guaranteePrimaryDesc: "현재 안건을 확인하고 부족한 항목만 보완한 뒤 선택한 보증회사 신청서를 출력합니다.",
    guaranteeNextAction: "다음 작업",
    guaranteeChecklist: "남은 확인 항목",
    outputPathCase: "안건",
    outputPathTemplate: "보증회사",
    outputPathPreview: "미리보기",
    caseReadyForPreview: "미리보기 가능",
    caseMissingItems: "미완료",
    chooseThisCase: "이 안건 선택",
    caseCardUpdated: "갱신",
    guaranteeDetailToggle: "상세 표시",
    guaranteeBackstageToggle: "보조 기능 표시",
    guaranteeCase: "대상 안건",
    guaranteeNoCase: "확인된 안건이 아직 없습니다",
    guaranteeTemplate: "보증회사",
    guaranteeReadiness: "신청 데이터 준비도",
    guaranteeDraftReadiness: "회사별 추가 항목",
    guaranteeDraftEdit: "회사별 항목 편집",
    guaranteeDraftReady: "추가 항목 입력됨",
    guaranteeDraftMissing: "추가 항목 미입력",
    guaranteeFillInWorkbench: "정보 정리에서 입력",
    guaranteeFillInDraft: "회사별 항목에서 입력",
    guaranteeReviewMissing: "부족 항목 확인",
    guaranteeSelectCaseFirst: "먼저 대상 안건 선택",
    guaranteeReady: "준비됨",
    guaranteeMissing: "미입력",
    guaranteeNeedsConfirmation: "확인 필요",
    guaranteeRequiredMissing: "필수 항목 미완료",
    guaranteeExportBlocked: "이 보증회사의 신청서 출력은 다음 단계에서 지원합니다. 지금은 부족 항목 확인까지 가능합니다.",
    guaranteePdfPendingButton: "신청서 출력 준비 중",
    guaranteePreviewReady: "먼저 PDF를 미리 보고 인쇄 위치와 입력 내용을 확인한 뒤 다운로드합니다.",
    guaranteePreviewAction: "{company} 신청서 미리보기",
    guaranteePreviewNeedsCase: "안건을 선택하면 확인된 데이터로 신청서를 출력할 수 있습니다.",
    guaranteeSourceConfirmed: "확인된 안건 데이터",
    guaranteeSourceDraft: "회사별 추가 항목",
    guaranteeSourceCandidate: "후보값(확인 필요)",
    guaranteeSourceMissing: "미입력",
    guaranteeCaseLink: "안건 확인",
    guaranteeImportLink: "자료 등록으로 이동",
    guaranteeLegacyTitle: "기존 출력",
    guaranteeLegacyDesc: "매물 개요서와 제안 관련 기존 출력은 보조 기능으로 유지합니다.",
  },
} as const;

type OutputCenterPageProps = {
  searchParams?: Promise<{
    type?: string;
    format?: string;
    lang?: string;
    zoom?: string;
    quoteId?: string;
    historyType?: string;
    historyLang?: string;
    historyFormat?: string;
    historyTemplate?: string;
    flash?: string;
    issues?: string;
    generatedOutputId?: string;
    targetProperty?: string;
    targetParty?: string;
    caseId?: string;
    guaranteeTemplate?: string;
  }>;
};

function readinessClass(status: GuaranteeReadinessStatus) {
  if (status === "available") return "bg-emerald-100 text-emerald-800";
  if (status === "needs_confirmation") return "bg-amber-100 text-amber-800";
  return "bg-rose-100 text-rose-800";
}

function templateQualityLabel(locale: Locale, status: GuaranteeTemplateQualityStatus) {
  const labels: Record<GuaranteeTemplateQualityStatus, Record<Locale, string>> = {
    verified: { ja: "出荷可", zh: "出厂可用", ko: "출고 가능" },
    needs_calibration: { ja: "要精校", zh: "需要精校", ko: "정밀 보정 필요" },
    source_quality_blocked: { ja: "原本差替え", zh: "源文件待换", ko: "원본 교체 필요" },
  };
  return labels[status][locale];
}

function templateQualityClass(status: GuaranteeTemplateQualityStatus) {
  if (status === "verified") return "bg-emerald-100 text-emerald-800";
  if (status === "source_quality_blocked") return "bg-rose-100 text-rose-800";
  return "bg-amber-100 text-amber-800";
}

function previewFieldId(fieldKey: string) {
  return `field-${fieldKey.replaceAll(".", "-")}`;
}

function isOutputSpecificGuaranteeField(fieldKey: string) {
  const definition = getCaseFieldDefinition(fieldKey);
  return fieldKey.startsWith("company_option.") || fieldKey.startsWith("guarantee.") || definition?.storageScope !== "case_fact";
}

function caseWorkbenchHrefForGuaranteeField(input: { caseId: string; templateId: string; fieldKey: string }) {
  const params = new URLSearchParams();
  params.set("guaranteeTemplate", input.templateId);
  const definition = getCaseFieldDefinition(input.fieldKey);
  if (definition?.storageScope === "case_fact") {
    params.set("node", getCaseFieldInformation(definition).treeNodeId);
  }
  return `/cases/${encodeURIComponent(input.caseId)}?${params.toString()}#case-main-editor`;
}

function previewHrefForGuaranteeField(input: { caseId: string; templateId: string; fieldKey?: string }) {
  const base = `/guarantee-applications/${encodeURIComponent(input.templateId)}/preview?caseId=${encodeURIComponent(input.caseId)}`;
  return input.fieldKey ? `${base}#${previewFieldId(input.fieldKey)}` : `${base}#company-draft-fields`;
}

export default async function OutputCenterPage({ searchParams }: OutputCenterPageProps) {
  const locale = await getLocale();
  const params = searchParams ? await searchParams : undefined;
  const copy = outputCenterCopy[locale];
  const session = await requireTenantSession({ permission: "output.preview" });
  const user = session.user;
  const tenantId = session.tenant.id;
  const hubContext = { userId: user.id, tenantId };
  const quoteDataPromise = listQuoteFormData(tenantId);
  const quotesPromise = listQuotations(100, tenantId);
  const partiesPromise = listHubParties(locale, hubContext);
  const outputsPromise = listHubGeneratedOutputs(locale, hubContext);
  const [{ properties }, quotes, parties, outputs] = await Promise.all([
    quoteDataPromise,
    quotesPromise,
    partiesPromise,
    outputsPromise,
  ]);
  const cases = await listBrokerageCases(user.id, 50, tenantId);
  const selectedCaseId = String(params?.caseId ?? "").trim();
  const selectedCase = selectedCaseId
    ? cases.find((item) => item.id === selectedCaseId)
    : undefined;
  const activeGuaranteeTemplates = guaranteeCompanyTemplates.filter((template) => template.outputStatus === "active");
  const defaultGuaranteeTemplateId =
    activeGuaranteeTemplates.find((template) => template.id === "friends_guarantee_individual_v1")?.id ??
    activeGuaranteeTemplates[0]?.id ??
    "friends_guarantee_individual_v1";
  const requestedGuaranteeTemplate = String(params?.guaranteeTemplate ?? "").trim() || defaultGuaranteeTemplateId;
  const selectedGuaranteeTemplate = getGuaranteeCompanyTemplate(requestedGuaranteeTemplate);
  const selectedGuaranteeTemplateNeedsCalibration = selectedGuaranteeTemplate.qualityStatus !== "verified";
  const guaranteeTemplateDrafts =
    selectedCase
      ? await Promise.all(
          activeGuaranteeTemplates.map((template) =>
            getGuaranteeApplicationDraft({
              userId: user.id,
              tenantId,
              caseId: selectedCase.id,
              templateId: template.id,
            }),
          ),
        )
      : [];
  const selectedGuaranteeDraft =
    guaranteeTemplateDrafts[activeGuaranteeTemplates.findIndex((template) => template.id === selectedGuaranteeTemplate.id)] ?? null;
  const selectedGuaranteeDraftReadiness = buildGuaranteeDraftReadiness(selectedGuaranteeDraft, selectedGuaranteeTemplate.id);
  const selectedPropertyForCandidate = properties[0];
  const selectedPartyForCandidate = parties[0];
  const guaranteeCandidateData: Record<string, unknown> = {
    "property.name": selectedPropertyForCandidate?.name,
    "lease.rent": selectedPropertyForCandidate?.listingPrice,
    "lease.commonFee": selectedPropertyForCandidate?.managementFee,
    "applicant.name": selectedPartyForCandidate?.name,
    "applicant.phone": selectedPartyForCandidate?.phone,
  };
  const guaranteeReadinessGroups = buildGuaranteeApplicationReadiness({
    brokerageCase: selectedCase,
    template: selectedGuaranteeTemplate,
    candidateData: guaranteeCandidateData,
    draft: selectedGuaranteeDraft,
  });
  const guaranteeBlockingCount = guaranteeReadinessGroups.find((group) => group.id === "unresolved")?.fields.length ?? 0;
  const guaranteeBlockingFields = guaranteeReadinessGroups.find((group) => group.id === "unresolved")?.fields ?? [];
  const caseSelectorCards = !selectedCase
    ? await Promise.all(
        cases.slice(0, 9).map(async (caseItem) => {
          const draft = await getGuaranteeApplicationDraft({
            userId: user.id,
            tenantId,
            caseId: caseItem.id,
            templateId: selectedGuaranteeTemplate.id,
          });
          const readinessGroups = buildGuaranteeApplicationReadiness({
            brokerageCase: caseItem,
            template: selectedGuaranteeTemplate,
            candidateData: guaranteeCandidateData,
            draft,
          });
          const unresolvedCount = readinessGroups.find((group) => group.id === "unresolved")?.fields.length ?? 0;
          const draftMissingCount = buildGuaranteeDraftReadiness(draft, selectedGuaranteeTemplate.id).requiredMissingCount;
          return {
            caseItem,
            missingCount: unresolvedCount + draftMissingCount,
          };
        }),
      )
    : [];
  const guaranteeTemplateCards = activeGuaranteeTemplates.map((template, index) => {
    const draft = guaranteeTemplateDrafts[index] ?? null;
    const readinessGroups = buildGuaranteeApplicationReadiness({
      brokerageCase: selectedCase,
      template,
      candidateData: guaranteeCandidateData,
      draft,
    });
    const unresolvedCount = readinessGroups.find((group) => group.id === "unresolved")?.fields.length ?? 0;
    const draftMissingCount = buildGuaranteeDraftReadiness(draft, template.id).requiredMissingCount;
    const missingCount = unresolvedCount + draftMissingCount;
    const previewHref = selectedCase
      ? `/guarantee-applications/${encodeURIComponent(template.id)}/preview?caseId=${encodeURIComponent(selectedCase.id)}`
      : "#guarantee-case-selector";
    const downloadHref = selectedCase
      ? `/api/guarantee-applications/${encodeURIComponent(template.id)}/download?caseId=${encodeURIComponent(selectedCase.id)}`
      : "#guarantee-case-selector";

    return {
      template,
      missingCount,
      previewHref,
      downloadHref,
      selected: template.id === selectedGuaranteeTemplate.id,
      downloadEnabled: Boolean(selectedCase && template.allowDirectDownload && missingCount === 0),
    };
  });
  const selectedGuaranteePreviewHref = selectedCase
    ? `/guarantee-applications/${encodeURIComponent(selectedGuaranteeTemplate.id)}/preview?caseId=${encodeURIComponent(selectedCase.id)}`
    : "#guarantee-case-selector";
  const selectedCaseWorkbenchHref = selectedCase
    ? `/cases/${selectedCase.id}?guaranteeTemplate=${encodeURIComponent(selectedGuaranteeTemplate.id)}`
    : "#guarantee-case-selector";
  const selectedCaseDraftHref = selectedCase
    ? previewHrefForGuaranteeField({ caseId: selectedCase.id, templateId: selectedGuaranteeTemplate.id })
    : "#guarantee-case-selector";
  const guaranteePreviewLabel = copy.guaranteePreviewAction.replace("{company}", selectedGuaranteeTemplate.companyDisplayName);
  const firstBlockingField = guaranteeBlockingFields[0];
  const outputNextHref = !selectedCase
    ? "#guarantee-case-selector"
    : firstBlockingField
      ? isOutputSpecificGuaranteeField(firstBlockingField.fieldKey)
        ? previewHrefForGuaranteeField({ caseId: selectedCase.id, templateId: selectedGuaranteeTemplate.id, fieldKey: firstBlockingField.fieldKey })
        : caseWorkbenchHrefForGuaranteeField({ caseId: selectedCase.id, templateId: selectedGuaranteeTemplate.id, fieldKey: firstBlockingField.fieldKey })
      : selectedGuaranteePreviewHref;
  const outputNextLabel = !selectedCase
    ? copy.guaranteeSelectCaseFirst
    : firstBlockingField
      ? copy.guaranteeReviewMissing
      : copy.guaranteePreviewAction.replace("{company}", selectedGuaranteeTemplate.companyDisplayName);
  const outputNextIcon = !selectedCase ? "folder_open" : firstBlockingField ? "fact_check" : "visibility";
  const outputPathItems = [
    {
      label: copy.outputPathCase,
      value: selectedCase?.caseTitle ?? copy.guaranteeSelectCaseFirst,
      ready: Boolean(selectedCase),
      icon: "folder_open",
    },
    {
      label: copy.outputPathTemplate,
      value: selectedGuaranteeTemplate.companyDisplayName,
      ready: Boolean(selectedCase),
      icon: "article",
    },
    {
      label: copy.outputPathPreview,
      value: !selectedCase
        ? copy.guaranteeSelectCaseFirst
        : guaranteeBlockingCount > 0
          ? `${copy.caseMissingItems}: ${guaranteeBlockingCount}`
          : copy.caseReadyForPreview,
      ready: Boolean(selectedCase && guaranteeBlockingCount === 0),
      icon: guaranteeBlockingCount > 0 ? "fact_check" : "visibility",
    },
  ];
  const legacySectionId = "existing-outputs";
  const historyType =
    params?.historyType && isOutputDocType(params.historyType) ? params.historyType : "all";
  const historyLang =
    params?.historyLang === "ja" || params?.historyLang === "zh" || params?.historyLang === "ko"
      ? params.historyLang
      : "all";
  const historyFormat = params?.historyFormat === "docx" || params?.historyFormat === "pdf" ? params.historyFormat : "all";
  const historyTemplate = String(params?.historyTemplate ?? "all").trim() || "all";
  const templateFilterOptions = (() => {
    const map = new Map<string, string>();
    outputs.forEach((item) => {
      if (!item.templateVersionId) return;
      if (!map.has(item.templateVersionId)) {
        map.set(item.templateVersionId, item.templateVersionLabel ?? item.templateVersionId);
      }
    });
    return [...map.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  })();
  const filteredOutputs = outputs.filter(
    (item) =>
      (historyType === "all" ? true : item.outputType === historyType) &&
      (historyLang === "all" ? true : item.language === historyLang) &&
      (historyFormat === "all" ? true : item.outputFormat === historyFormat) &&
      (historyTemplate === "all"
        ? true
        : historyTemplate === "unbound"
          ? !item.templateVersionId
          : item.templateVersionId === historyTemplate)
  );
  const templateBoundCount = filteredOutputs.filter((item) => Boolean(item.templateVersionId)).length;
  const templateHitRate = filteredOutputs.length > 0 ? Math.round((templateBoundCount / filteredOutputs.length) * 100) : 0;
  const unboundCount = Math.max(0, filteredOutputs.length - templateBoundCount);
  const templateVersionStats = filteredOutputs
    .filter((item) => Boolean(item.templateVersionId))
    .reduce<Map<string, { id: string; label: string; count: number }>>((acc, item) => {
      const key = item.templateVersionId as string;
      const existing = acc.get(key) ?? {
        id: key,
        label: item.templateVersionLabel ?? key,
        count: 0,
      };
      existing.count += 1;
      acc.set(key, existing);
      return acc;
    }, new Map());
  const topTemplateVersions = [...templateVersionStats.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);
  const latestOutputs = filteredOutputs.slice(0, 3);
  const requestedType = String(params?.type ?? "").trim();
  const requestedPropertyId = String(params?.targetProperty ?? "").trim();
  const requestedPartyId = String(params?.targetParty ?? "").trim();
  const selectedType: OutputDocType = isOutputDocType(requestedType)
    ? requestedType
    : requestedPropertyId
      ? "property_overview"
      : "assumption_memo";
  const isPropertyOverview = selectedType === "property_overview";
  const selectedFormat = params?.format === "docx" ? "docx" : "pdf";
  const selectedLanguage = params?.lang === "zh" || params?.lang === "ko" || params?.lang === "ja" ? params.lang : locale;
  const selectedZoom = params?.zoom === "75" || params?.zoom === "85" || params?.zoom === "100" ? params.zoom : "85";
  const requestedQuoteId = String(params?.quoteId ?? "").trim();
  const defaultQuoteId = isPropertyOverview ? requestedQuoteId : requestedQuoteId || latestOutputs[0]?.sourceQuoteId || quotes[0]?.id || "";
  const selectedQuote = isPropertyOverview ? undefined : quotes.find((quote) => quote.id === defaultQuoteId) ?? quotes[0];
  const previewQuoteId = selectedQuote?.id;
  const selectedProperty = isPropertyOverview
    ? properties.find((property) => property.id === requestedPropertyId)
    : properties.find((property) => property.id === requestedPropertyId) ??
      properties.find((property) => property.id === selectedQuote?.propertyId) ??
      properties[0];
  const selectedPropertyId = selectedProperty?.id ?? "";
  const needsPropertySelection = isPropertyOverview && !selectedPropertyId;
  const selectedParty =
    parties.find((party) => party.id === requestedPartyId) ??
    (isPropertyOverview ? undefined : parties.find((party) => party.id === selectedQuote?.clientId)) ??
    (isPropertyOverview ? undefined : parties[0]);
  const selectedPartyId = selectedParty?.id ?? "";
  const selectedGeneratedOutput = outputs.find(
    (item) => {
      const matchesTarget = isPropertyOverview ? item.propertyId === selectedPropertyId : item.sourceQuoteId === previewQuoteId;
      return matchesTarget && item.outputType === selectedType && item.outputFormat === selectedFormat && item.language === selectedLanguage;
    }
  );
  const selectedDownloadHref = selectedGeneratedOutput
    ? `/api/outputs/${selectedGeneratedOutput.id}/download?locale=${locale}`
    : previewQuoteId && !isPropertyOverview
      ? `/quotes/${previewQuoteId}/print?type=${selectedType}`
      : "#";
  const issuedDateValue = new Date().toLocaleDateString(
    locale === "zh" ? "zh-CN" : locale === "ko" ? "ko-KR" : "ja-JP"
  );
  const previewDocId = `BD-${selectedType.toUpperCase()}-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;
  const returnToCurrent = `/output-center?type=${selectedType}&format=${selectedFormat}&lang=${selectedLanguage}&quoteId=${isPropertyOverview ? "" : selectedQuote?.id ?? ""}&targetProperty=${selectedPropertyId}&targetParty=${selectedPartyId}&historyType=${historyType}&historyLang=${historyLang}&historyFormat=${historyFormat}&historyTemplate=${historyTemplate}`;
  const highlightOutputId = String(params?.generatedOutputId ?? "").trim();
  const highlightedOutput = highlightOutputId ? outputs.find((o) => o.id === highlightOutputId) : undefined;
  const isHighlightFiltered = highlightedOutput ? !filteredOutputs.some((o) => o.id === highlightOutputId) : false;
  const issueCodes = String(params?.issues ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const issueMessageMap: Record<string, { ja: string; zh: string; ko: string }> = {
    missing_listing_price: {
      ja: "提案の物件価格が未設定です。",
      zh: "提案中的物件价格未填写。",
      ko: "제안의 매물 가격이 비어 있습니다.",
    },
    missing_summary: {
      ja: "提案サマリーが未入力です。",
      zh: "提案摘要未填写。",
      ko: "제안 요약이 비어 있습니다.",
    },
    missing_target_property: {
      ja: "対象物件を選択してください。",
      zh: "请选择目标物件。",
      ko: "대상 매물을 선택해 주세요.",
    },
    missing_target_party: {
      ja: "対象関係者を選択してください。",
      zh: "请选择目标主体。",
      ko: "대상 관계자를 선택해 주세요.",
    },
    missing_estimate_breakdown: {
      ja: "費用見積明細書に必要な費用内訳が不足しています。",
      zh: "费用明细书所需费用项不足。",
      ko: "비용 명세서에 필요한 비용 항목이 부족합니다.",
    },
    missing_down_payment: {
      ja: "資金計画書の頭金が未設定です。",
      zh: "资金计划书所需首付款未填写。",
      ko: "자금 계획서의 계약금이 비어 있습니다.",
    },
    missing_loan_amount: {
      ja: "資金計画書の借入額が未設定です。",
      zh: "资金计划书所需贷款额未填写。",
      ko: "자금 계획서의 대출 금액이 비어 있습니다.",
    },
    missing_monthly_payment: {
      ja: "資金計画書の月々返済額が未設定です。",
      zh: "资金计划书所需月供未填写。",
      ko: "자금 계획서의 월 상환액이 비어 있습니다.",
    },
    missing_interest_rate: {
      ja: "資金計画書の金利が未設定です。",
      zh: "资金计划书所需利率未填写。",
      ko: "자금 계획서의 금리가 비어 있습니다.",
    },
    missing_loan_years: {
      ja: "資金計画書の返済年数が未設定です。",
      zh: "资金计划书所需贷款年限未填写。",
      ko: "자금 계획서의 상환 연수가 비어 있습니다.",
    },
  };
  const issueMessages = issueCodes.map((code) => issueMessageMap[code]?.[locale]).filter(Boolean) as string[];
  const needsQuoteFix = issueCodes.some((code) =>
    [
      "missing_listing_price",
      "missing_summary",
      "missing_estimate_breakdown",
      "missing_down_payment",
      "missing_loan_amount",
      "missing_monthly_payment",
      "missing_interest_rate",
      "missing_loan_years",
    ].includes(code)
  );
  const quickFixLinks: Array<{ id: string; href: string; label: string }> = [];
  if (needsQuoteFix && selectedQuote?.id) {
    quickFixLinks.push({
      id: "quote",
      href: "/quotes/" + selectedQuote.id,
      label: locale === "zh" ? "前往提案编辑" : locale === "ko" ? "제안 편집으로 이동" : "提案を編集",
    });
  }
  if (issueCodes.includes("missing_target_property")) {
    quickFixLinks.push({
      id: "property",
      href: "/properties",
      label: locale === "zh" ? "前往物件台账" : locale === "ko" ? "매물 대장으로 이동" : "物件台帳へ",
    });
  }
  if (issueCodes.includes("missing_target_party")) {
    quickFixLinks.push({
      id: "party",
      href: "/parties",
      label: locale === "zh" ? "前往主体台账" : locale === "ko" ? "관계자 대장으로 이동" : "関係者台帳へ",
    });
  }
  const flashMap = {
    output_generated: {
      ja: "帳票を出力しました。",
      zh: "文书已输出。",
      ko: "문서를 출력했습니다.",
    },
    output_validation_failed: {
      ja: "生成チェックで不足項目が見つかりました。",
      zh: "生成检查发现缺失项。",
      ko: "생성 점검에서 누락 항목이 발견되었습니다.",
    },
  } as const;
  const flashKey = String(params?.flash ?? "").trim() as keyof typeof flashMap;
  const flashMessage = flashMap[flashKey]?.[locale];
  const templateVersionQuery = historyTemplate !== "all" ? `&templateVersion=${encodeURIComponent(historyTemplate)}` : "";
  const outputsExportHref = `/api/hub/export?scope=outputs&locale=${locale}${historyType !== "all" ? `&type=${historyType}` : ""}${historyLang !== "all" ? `&lang=${historyLang}` : ""}${historyFormat !== "all" ? `&format=${historyFormat}` : ""}${templateVersionQuery}`;
  const outputsHitRateExportHref = `/api/hub/export?scope=outputs_hitrate&locale=${locale}${historyType !== "all" ? `&type=${historyType}` : ""}${historyLang !== "all" ? `&lang=${historyLang}` : ""}${historyFormat !== "all" ? `&format=${historyFormat}` : ""}${templateVersionQuery}`;

  return (
    <div className="space-y-6">
      <header className="border-b border-slate-950 pb-3">
        <h1 className="text-3xl font-black tracking-tight text-slate-950">{copy.outputCenterTitle}</h1>
        <p className="mt-2 text-sm font-semibold text-slate-600">{copy.subtitle}</p>
      </header>
      <PageFlashBanner message={flashMessage} />
      {issueMessages.length > 0 ? (
        <section className="rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-semibold">
            {locale === "zh"
              ? "请先补齐以下项目："
              : locale === "ko"
                ? "아래 항목을 먼저 보완해 주세요:"
                : "以下の項目を先に補完してください:"}
          </p>
          <ul className="mt-1 list-disc pl-5">
            {issueMessages.map((msg, index) => (
              <li key={`issue-${index}-${msg}`}>{msg}</li>
            ))}
          </ul>
          {quickFixLinks.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {quickFixLinks.map((link) => (
                <Link
                  key={link.id}
                  href={link.href}
                  className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                >
                  <span className="material-symbols-outlined text-[14px]">build</span>
                  {link.label}
                </Link>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="rounded border border-slate-300 bg-white p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-black text-[#002FA7]">
              {locale === "zh" ? "三步生成申请书" : locale === "ko" ? "3단계 신청서 작성" : "3ステップで申込書作成"}
            </p>
            <h2 className="text-xl font-black text-slate-950">{copy.guaranteePrimaryTitle}</h2>
            <p className="mt-1 text-sm text-slate-700">
              {copy.guaranteeCase}: <span className="font-semibold">{selectedCase?.caseTitle ?? copy.guaranteeNoCase}</span>
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded border border-slate-300 bg-slate-50 px-2 py-1 text-xs font-black text-slate-700">
                {selectedGuaranteeTemplate.companyDisplayName}
              </span>
              <span className={`rounded border px-2 py-1 text-xs font-black ${
                guaranteeBlockingCount > 0 ? "border-red-700 bg-red-50 text-red-700" : "border-emerald-700 bg-emerald-700 text-white"
              }`}>
                {guaranteeBlockingCount > 0 ? `${copy.guaranteeMissing}: ${guaranteeBlockingCount}` : copy.guaranteeReady}
              </span>
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-3">
              {outputPathItems.map((item, index) => (
                <div
                  key={item.label}
                  className={`rounded-lg border px-3 py-3 ${
                    item.ready ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-slate-50"
                  }`}
                >
                  <div className="flex items-center gap-2 text-[11px] font-black text-slate-500">
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-black ${
                      item.ready ? "bg-emerald-700 text-white" : "bg-slate-200 text-slate-700"
                    }`}>
                      {index + 1}
                    </span>
                    {item.label}
                  </div>
                  <p className={`mt-2 truncate text-sm font-black ${item.ready ? "text-emerald-800" : "text-slate-700"}`}>{item.value}</p>
                </div>
              ))}
            </div>
          </div>
          <Link href={outputNextHref} className="inline-flex min-w-[13rem] items-center justify-center gap-2 rounded bg-slate-950 px-4 py-3 text-sm font-black text-white hover:bg-slate-800">
            <span className="material-symbols-outlined text-[18px]">{outputNextIcon}</span>
            {outputNextLabel}
          </Link>
        </div>
      </section>

      {!selectedCase ? (
        <section id="guarantee-case-selector" className="scroll-mt-24 rounded border border-[#002FA7] bg-white">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-base font-black text-slate-950">{copy.guaranteeSelectCaseFirst}</h2>
            <p className="mt-1 text-sm font-semibold text-slate-600">{copy.guaranteeCase}</p>
          </div>
          {cases.length > 0 ? (
            <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
              {caseSelectorCards.map(({ caseItem, missingCount }) => (
                <Link
                  key={caseItem.id}
                  href={`/output-center?caseId=${encodeURIComponent(caseItem.id)}&guaranteeTemplate=${encodeURIComponent(selectedGuaranteeTemplate.id)}`}
                  className="min-h-32 rounded border border-slate-200 bg-white p-4 hover:border-[#002FA7] hover:bg-slate-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-xs font-black text-[#002FA7]">
                      {copy.caseCardUpdated}: {formatDate(caseItem.updatedAt, locale)}
                    </span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${
                      missingCount > 0 ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-800"
                    }`}>
                      {missingCount > 0 ? `${copy.caseMissingItems}: ${missingCount}` : copy.caseReadyForPreview}
                    </span>
                  </div>
                  <span className="mt-2 block truncate text-base font-black text-slate-950">{caseItem.caseTitle}</span>
                  <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-slate-600">
                    <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                    {copy.chooseThisCase}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="p-4">
              <p className="text-sm font-semibold text-slate-600">{copy.guaranteeNoCase}</p>
              <Link href="/import-center" className="mt-3 inline-flex rounded bg-slate-950 px-4 py-2 text-sm font-black text-white hover:bg-slate-800">
                {copy.guaranteeImportLink}
              </Link>
            </div>
          )}
        </section>
      ) : null}

      {selectedCase ? (
      <section className={`rounded border bg-white p-4 ${guaranteeBlockingFields.length > 0 ? "border-red-300 border-l-4 border-l-red-700" : "border-emerald-300 border-l-4 border-l-emerald-700"}`}>
        <h3 className={`flex items-center gap-2 text-base font-black ${guaranteeBlockingFields.length > 0 ? "text-red-700" : "text-emerald-700"}`}>
          <span className="material-symbols-outlined text-[20px]">{guaranteeBlockingFields.length > 0 ? "warning" : "check_circle"}</span>
          {copy.guaranteeChecklist}
        </h3>
        <div className="mt-3 space-y-2">
          {guaranteeBlockingFields.length > 0 ? (
            guaranteeBlockingFields.slice(0, 5).map((field) => (
              <Link
                key={`primary-missing-${field.fieldKey}`}
                href={
                  selectedCase
                    ? isOutputSpecificGuaranteeField(field.fieldKey)
                      ? previewHrefForGuaranteeField({ caseId: selectedCase.id, templateId: selectedGuaranteeTemplate.id, fieldKey: field.fieldKey })
                      : caseWorkbenchHrefForGuaranteeField({ caseId: selectedCase.id, templateId: selectedGuaranteeTemplate.id, fieldKey: field.fieldKey })
                    : "#guarantee-case-selector"
                }
                className="flex items-center gap-2 text-sm text-slate-800 hover:text-[#1960a3] hover:underline"
              >
                <span className="material-symbols-outlined text-[16px] text-red-700">error</span>
                {field.label}
              </Link>
            ))
          ) : (
            <p className="text-sm font-semibold text-emerald-800">{copy.guaranteeReady}</p>
          )}
        </div>
      </section>
      ) : null}

      {selectedCase ? (
      <section>
        <h2 className="mb-4 text-2xl font-black text-slate-950">{copy.selectTemplate}</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {guaranteeTemplateCards.map((card) => (
            <div
              key={card.template.id}
              className={`relative flex min-h-[16rem] flex-col rounded border bg-white ${
                card.selected ? "border-[#1960a3] ring-1 ring-[#1960a3]" : "border-slate-300"
              }`}
            >
              {card.selected ? <span className="absolute -right-2 -top-2 h-4 w-4 rounded-full bg-[#1960a3]" /> : null}
              <div className="flex items-center justify-between gap-3 border-b border-slate-300 bg-white p-4">
                <h3 className="truncate text-xl font-black text-slate-950">{card.template.companyDisplayName}</h3>
                <span className={`shrink-0 rounded border px-2 py-1 text-xs font-black ${
                  card.missingCount > 0 ? "border-red-700 bg-red-50 text-red-700" : "border-emerald-700 bg-emerald-700 text-white"
                }`}>
                  {card.missingCount > 0 ? `${copy.guaranteeMissing}: ${card.missingCount}` : copy.guaranteeReady}
                </span>
              </div>
              <div className="flex flex-1 flex-col justify-between gap-4 p-4">
                <p className="text-sm text-slate-600">{card.template.templateDisplayName}</p>
                <div className="space-y-3">
                  <Link href={card.previewHref} className="inline-flex w-full items-center justify-center gap-2 rounded border border-[#7db6ff] bg-[#d4e4fc] px-4 py-2 text-sm font-black text-slate-950 hover:bg-[#cfe0fb]">
                    <span className="material-symbols-outlined text-[18px]">visibility</span>
                    {copy.guaranteePreviewAction.replace("{company}", "").trim()}
                  </Link>
                  {card.downloadEnabled ? (
                    <Link href={card.downloadHref} className="inline-flex w-full items-center justify-center gap-2 rounded bg-slate-950 px-4 py-2 text-sm font-black text-white hover:bg-slate-800">
                      <span className="material-symbols-outlined text-[18px]">download</span>
                      {copy.download}
                    </Link>
                  ) : (
                    <button disabled className="inline-flex w-full cursor-not-allowed items-center justify-center gap-2 rounded bg-slate-200 px-4 py-2 text-sm font-black text-slate-400">
                      <span className="material-symbols-outlined text-[18px]">lock</span>
                      {card.missingCount > 0
                        ? copy.guaranteeReviewMissing
                        : locale === "zh"
                          ? "先预览校准"
                          : locale === "ko"
                            ? "먼저 미리보기 보정"
                            : "先にプレビュー校正"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
      ) : null}

      {selectedCase ? (
      <section className="rounded border border-slate-300 bg-white p-4">
        <details>
          <summary className="cursor-pointer text-sm font-bold text-slate-900">{copy.guaranteeDetailToggle}</summary>
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,360px)_1fr]">
          <aside className="space-y-4">
            <div id="guarantee-case-selector" className="scroll-mt-24 rounded-xl bg-indigo-50 p-4">
              <p className="text-xs font-bold text-indigo-900">{copy.guaranteeCase}</p>
              {cases.length > 0 ? (
                <div className="mt-2 space-y-2">
                  {cases.slice(0, 5).map((caseItem) => {
                    const selected = caseItem.id === selectedCase?.id;
                    return (
                      <Link
                        key={caseItem.id}
                        href={`/output-center?caseId=${encodeURIComponent(caseItem.id)}&guaranteeTemplate=${encodeURIComponent(selectedGuaranteeTemplate.id)}`}
                        className={
                          "block rounded-lg border px-3 py-2 text-sm transition " +
                          (selected ? "border-indigo-300 bg-white text-indigo-950 shadow-sm" : "border-transparent bg-indigo-100/60 text-slate-700 hover:bg-white")
                        }
                      >
                        <span className="block truncate font-bold">{caseItem.caseTitle}</span>
                        <span className="mt-0.5 block text-[11px] text-slate-500">{formatDate(caseItem.updatedAt, locale)}</span>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-2 rounded-lg border border-dashed border-indigo-200 bg-white p-3 text-sm text-slate-600">
                  <p>{copy.guaranteeNoCase}</p>
                  <Link href="/import-center" className="mt-2 inline-flex font-bold text-indigo-700 hover:underline">
                    {copy.guaranteeImportLink}
                  </Link>
                </div>
              )}
              {selectedCase ? (
                <Link href={selectedCaseWorkbenchHref} className="mt-3 inline-flex text-xs font-bold text-indigo-700 hover:underline">
                  {copy.guaranteeCaseLink}
                </Link>
              ) : null}
            </div>

            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs font-bold text-slate-900">{copy.guaranteeTemplate}</p>
              <div className="mt-2 grid gap-2">
                {activeGuaranteeTemplates.map((template) => {
                  const selected = template.id === selectedGuaranteeTemplate.id;
                  return (
                    <Link
                      key={template.id}
                      href={`/output-center?caseId=${encodeURIComponent(selectedCase?.id ?? "")}&guaranteeTemplate=${encodeURIComponent(template.id)}`}
                      className={
                        "rounded-lg border bg-white p-3 transition " +
                        (selected ? "border-[#001e40] ring-2 ring-[#001e40]/10" : "border-slate-200 hover:border-slate-300")
                      }
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-bold text-slate-950">{template.companyLegalName}</p>
                        {selected ? <span className="material-symbols-outlined text-[18px] text-emerald-600">check_circle</span> : null}
                      </div>
                      <p className="mt-1 text-[11px] text-slate-500">
                        {template.templateDisplayName}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {template.id === "zenhoren_individual_v1" ? (
                          <span className="rounded-full bg-slate-950 px-2 py-0.5 text-[10px] font-bold text-white">
                            {locale === "zh" ? "最高频" : locale === "ko" ? "최다 사용" : "最頻出"}
                          </span>
                        ) : null}
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${templateQualityClass(template.qualityStatus)}`}>
                          {templateQualityLabel(locale, template.qualityStatus)}
                        </span>
                        {!template.allowDirectDownload ? (
                          <span className="text-[11px] font-semibold text-amber-700">
                            {locale === "zh" ? "需预览校准后保存" : locale === "ko" ? "미리보기 보정 후 저장" : "プレビュー校正後に保存"}
                          </span>
                        ) : null}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>

            <div className={`rounded-xl border p-4 text-sm ${selectedGuaranteeTemplateNeedsCalibration ? "border-amber-200 bg-amber-50 text-amber-950" : "border-emerald-200 bg-emerald-50 text-emerald-950"}`}>
                <p className="font-bold">{guaranteePreviewLabel}</p>
                <p className="mt-1 text-xs leading-5">
                  {selectedGuaranteeTemplateNeedsCalibration
                    ? locale === "zh"
                      ? "这张模板目前不能直接当成成品下载。请先进入可编辑预览，确认印字位置、文本长度和格子拆分后再保存。"
                      : locale === "ko"
                        ? "이 템플릿은 아직 바로 완성본 다운로드로 취급하지 않습니다. 편집 가능한 미리보기에서 위치, 긴/짧은 텍스트, 칸 분리를 확인한 뒤 저장하세요."
                        : "このテンプレートはまだ直ダウンロード対象ではありません。編集可能プレビューで印字位置、長短テキスト、分割マスを確認してから保存します。"
                    : copy.guaranteePreviewReady}
                </p>
                {!selectedCase ? (
                  <div className="mt-3 rounded-lg border border-emerald-200 bg-white p-3 text-xs text-emerald-900">
                    {copy.guaranteePreviewNeedsCase}
                  </div>
                ) : null}
                {selectedCase ? (
                  <Link
                    href={selectedGuaranteePreviewHref}
                    className={`mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs font-bold text-white ${selectedGuaranteeTemplateNeedsCalibration ? "bg-slate-950 hover:bg-slate-800" : "bg-emerald-700 hover:bg-emerald-800"}`}
                  >
                    <span className="material-symbols-outlined text-[16px]">preview</span>
                    {guaranteePreviewLabel}
                  </Link>
                ) : (
                  <button disabled className="mt-3 inline-flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-lg bg-slate-400 px-4 py-2 text-xs font-bold text-white">
                    <span className="material-symbols-outlined text-[16px]">preview</span>
                    {guaranteePreviewLabel}
                  </button>
                )}
                {selectedCase ? (
                  <Link href={selectedCaseDraftHref} className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-300 bg-white px-4 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-50">
                    <span className="material-symbols-outlined text-[16px]">edit_note</span>
                    {copy.guaranteeDraftEdit}
                  </Link>
                ) : null}
              </div>
          </aside>

          <div className="space-y-4">
            {selectedGuaranteeDraftReadiness.fields.length > 0 ? (
              <section className="rounded-xl border border-emerald-200 bg-white">
                <div className="border-b border-emerald-100 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-emerald-950">{copy.guaranteeDraftReadiness}</h3>
                      <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
                        {locale === "zh" ? "项目保存" : locale === "ko" ? "항목 저장" : "項目保存"} {formatDate(selectedGuaranteeDraft?.lastReviewedAt ?? selectedGuaranteeDraft?.updatedAt, locale)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {selectedCase ? (
                        <Link
                          href={selectedCaseDraftHref}
                          className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-white px-2 py-1 text-[11px] font-bold text-emerald-800 hover:bg-emerald-50"
                        >
                          <span className="material-symbols-outlined text-[14px]">edit_note</span>
                          {copy.guaranteeFillInDraft}
                        </Link>
                      ) : null}
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${selectedGuaranteeDraftReadiness.status === "ready" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
                        {selectedGuaranteeDraftReadiness.status === "ready" ? copy.guaranteeDraftReady : copy.guaranteeDraftMissing}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="grid gap-2 p-4 md:grid-cols-2">
                  {selectedGuaranteeDraftReadiness.fields.map((field) => (
                    <div key={`draft-${field.fieldKey}`} className={`rounded-lg border p-3 ${field.status === "available" ? "border-slate-100 bg-slate-50" : "border-emerald-200 bg-emerald-50/40"}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {field.label}
                            {field.required ? <span className="ml-1 text-rose-600">*</span> : null}
                          </p>
                          <p className="mt-0.5 text-[11px] text-slate-500">{field.source === "draft" ? copy.guaranteeSourceDraft : copy.guaranteeSourceMissing}</p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${readinessClass(field.status)}`}>
                          {field.status === "available" ? copy.guaranteeReady : copy.guaranteeMissing}
                        </span>
                      </div>
                      <p className="mt-2 min-h-5 whitespace-pre-wrap text-xs font-medium text-slate-700">{field.value || "-"}</p>
                      {field.status !== "available" ? (
                        <Link
                          href={selectedCaseDraftHref}
                          className="mt-3 inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-white px-2 py-1 text-[11px] font-bold text-emerald-800 hover:bg-emerald-50"
                        >
                          <span className="material-symbols-outlined text-[14px]">edit_note</span>
                          {selectedCase ? copy.guaranteeFillInDraft : copy.guaranteeSelectCaseFirst}
                        </Link>
                      ) : null}
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-4 py-3">
              <h3 className="text-sm font-bold text-slate-950">{copy.guaranteeReadiness}</h3>
            </div>
            <div className="divide-y divide-slate-100">
              {guaranteeReadinessGroups.map((group) => (
                <section key={group.id} className={group.id === "unresolved" ? "bg-rose-50/50 px-4 py-4" : "px-4 py-4"}>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h4 className="text-sm font-bold text-slate-900">{group.label}</h4>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                      {group.fields.filter((field) => field.status === "available").length} / {group.fields.length}
                    </span>
                  </div>
                  {group.fields.length > 0 ? (
                    <div className="grid gap-2 md:grid-cols-2">
                      {group.fields.map((field) => {
                        const statusLabel =
                          field.status === "available"
                            ? copy.guaranteeReady
                            : field.status === "needs_confirmation"
                              ? copy.guaranteeNeedsConfirmation
                              : copy.guaranteeMissing;
                        const sourceLabel =
                          field.source === "confirmed_case"
                            ? copy.guaranteeSourceConfirmed
                            : field.source === "draft"
                              ? copy.guaranteeSourceDraft
                              : field.source === "candidate"
                              ? copy.guaranteeSourceCandidate
                              : copy.guaranteeSourceMissing;
                        return (
                          <div
                            key={`${group.id}-${field.fieldKey}`}
                            className={`rounded-lg border p-3 ${field.status === "available" ? "border-slate-100 bg-slate-50" : "border-indigo-200 bg-indigo-50/40"}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-sm font-semibold text-slate-900">{field.label}</p>
                                <p className="mt-0.5 text-[11px] text-slate-500">{sourceLabel}</p>
                              </div>
                              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${readinessClass(field.status)}`}>
                                {statusLabel}
                              </span>
                            </div>
                            <p className="mt-2 min-h-5 whitespace-pre-wrap text-xs font-medium text-slate-700">
                              {field.value || "-"}
                            </p>
                            {field.status !== "available" ? (
                              <Link
                                href={
                                  selectedCase
                                    ? isOutputSpecificGuaranteeField(field.fieldKey)
                                      ? selectedCaseDraftHref
                                      : caseWorkbenchHrefForGuaranteeField({ caseId: selectedCase.id, templateId: selectedGuaranteeTemplate.id, fieldKey: field.fieldKey })
                                    : "#guarantee-case-selector"
                                }
                                className="mt-3 inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-white px-2 py-1 text-[11px] font-bold text-indigo-800 hover:bg-indigo-50"
                              >
                                <span className="material-symbols-outlined text-[14px]">
                                  {isOutputSpecificGuaranteeField(field.fieldKey) ? "edit_note" : "fact_check"}
                                </span>
                                {selectedCase
                                  ? isOutputSpecificGuaranteeField(field.fieldKey)
                                    ? copy.guaranteeFillInDraft
                                    : copy.guaranteeFillInWorkbench
                                  : copy.guaranteeSelectCaseFirst}
                              </Link>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="rounded-lg bg-white p-3 text-xs text-slate-500">-</p>
                  )}
                </section>
              ))}
            </div>
            </section>
          </div>
        </div>
        </details>
      </section>
      ) : null}

      <details id={legacySectionId} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <summary className="cursor-pointer text-sm font-bold text-slate-900">{copy.guaranteeBackstageToggle}</summary>
        <div className="mt-4 space-y-5">
          <div className="flex flex-col justify-between gap-2 md:flex-row md:items-end">
            <div>
              <h2 className="text-lg font-bold text-slate-950">{copy.guaranteeLegacyTitle}</h2>
              <p className="mt-1 text-sm text-slate-600">{copy.guaranteeLegacyDesc}</p>
            </div>
            <Link href={`#${legacySectionId}`} className="text-xs font-bold text-slate-600">
              {copy.viewAll}
            </Link>
          </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">{copy.templateHitTitle}</h2>
            <p className="mt-0.5 text-xs text-slate-500">{copy.templateHitDesc}</p>
          </div>
          <p className="text-3xl font-black tabular-nums text-[#001e40]">{templateHitRate}%</p>
        </div>
        <div className="mt-2 flex justify-end">
          <Link href={outputsHitRateExportHref} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50">
            {copy.exportHitRate}
          </Link>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div className="rounded-lg bg-[#edf2fd] px-3 py-2">
            <p className="text-[11px] text-slate-500">{copy.withTemplateVersion}</p>
            <p className="text-xl font-black tabular-nums text-[#001e40]">{templateBoundCount}</p>
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-2">
            <p className="text-[11px] text-slate-500">{copy.withoutTemplateVersion}</p>
            <p className="text-xl font-black tabular-nums text-slate-700">{unboundCount}</p>
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-2">
            <p className="text-[11px] text-slate-500">{copy.recentOutputs}</p>
            <p className="text-xl font-black tabular-nums text-slate-700">{filteredOutputs.length}</p>
          </div>
        </div>
        <div className="mt-3">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-slate-500">{copy.topTemplateVersions}</p>
          {topTemplateVersions.length === 0 ? (
            <p className="text-xs text-slate-500">{copy.emptyFilteredOutputs}</p>
          ) : (
            <div className="space-y-2">
              {topTemplateVersions.map((version) => (
                <div key={`tpl-hit-${version.id}`} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-semibold text-slate-800">{version.label}</p>
                    <p className="text-xs font-bold tabular-nums text-[#001e40]">
                      {version.count} / {filteredOutputs.length}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-12">
        {outputTypes.map((type) => {
          const selected = type === selectedType;
          return (
            <article
              key={type}
              className={
                "group relative overflow-hidden rounded-xl bg-white p-6 shadow-sm ring-1 transition xl:col-span-3 " +
                (selected ? "ring-[#001e40]/20" : "ring-slate-200/30 hover:shadow-md")
              }
            >
              <div className="absolute right-4 top-4 opacity-5">
                <span className="material-symbols-outlined text-6xl">{iconByType[type]}</span>
              </div>
              <div className={`mb-6 flex h-12 w-12 items-center justify-center rounded-lg ${iconColorByType[type]}`}>
                <span className="material-symbols-outlined">{iconByType[type]}</span>
              </div>
              <h2 className="text-xl font-bold tracking-tight text-slate-900">{getOutputDocLabel(locale, type)}</h2>
              <p className="mt-1 min-h-12 text-xs leading-relaxed text-slate-500">{getOutputDocDescription(locale, type)}</p>
              {selected ? (
                <div className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#001e40] py-2 text-xs font-bold text-white">
                  <span className="material-symbols-outlined text-[16px]">check_circle</span>
                  {copy.selected}
                </div>
              ) : (
                <Link href={`/output-center?type=${type}&format=${selectedFormat}&lang=${selectedLanguage}&quoteId=${type === "property_overview" ? "" : selectedQuote?.id ?? quotes[0]?.id ?? ""}&targetProperty=${selectedPropertyId}&targetParty=${selectedPartyId}&historyType=${historyType}&historyLang=${historyLang}&historyFormat=${historyFormat}&historyTemplate=${historyTemplate}`} className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-[#edf2fd] py-2 text-xs font-bold text-slate-700 transition hover:bg-[#e1eafc]">
                  {copy.selectTemplate}
                </Link>
              )}
            </article>
          );
        })}
      </section>

      <section className="grid gap-8 xl:grid-cols-12">
        <div className="space-y-7 xl:col-span-5">
          <article className="rounded-xl bg-[#edf2fd] p-7">
            <h2 className="mb-6 text-xs font-black uppercase tracking-widest text-slate-700">{copy.generationSettings}</h2>
            <form id="output-generate-form" action={generateOutputDocumentAction} className="space-y-5">
              <input type="hidden" name="type" value={selectedType} />
              <input type="hidden" name="returnTo" value={returnToCurrent} />
              {isPropertyOverview ? (
                <input type="hidden" name="quoteId" value="" />
              ) : (
                <label className="block space-y-2">
                  <span className="text-xs font-bold text-slate-500">{copy.targetQuote}</span>
                  <div className="relative">
                    <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-slate-400">description</span>
                    <select
                      className="w-full rounded-lg border-none bg-white py-3 pl-10 pr-3 text-sm font-medium"
                      name="quoteId"
                      defaultValue={selectedQuote?.id ?? ""}
                    >
                      {quotes.map((quote) => (
                        <option key={quote.id} value={quote.id}>
                          {quote.quoteTitle} - {quote.client.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </label>
              )}
              <label className="block space-y-2">
                <span className="text-xs font-bold text-slate-500">{copy.targetProperty}</span>
                <div className="relative">
                  <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-slate-400">home</span>
                  <select
                    className="w-full rounded-lg border-none bg-white py-3 pl-10 pr-3 text-sm font-medium"
                    name="targetProperty"
                    defaultValue={selectedPropertyId}
                  >
                    {isPropertyOverview ? (
                      <option value="">
                        {locale === "zh" ? "请从物件台账选择" : locale === "ko" ? "매물 대장에서 선택" : "物件台帳から選択"}
                      </option>
                    ) : null}
                    {properties.map((property) => (
                      <option key={property.id} value={property.id}>
                        {property.name}
                      </option>
                    ))}
                  </select>
                </div>
              </label>
              {needsPropertySelection ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  <p className="font-bold">
                    {locale === "zh" ? "尚未选择目标物件" : locale === "ko" ? "대상 매물이 선택되지 않았습니다" : "対象物件が未選択です"}
                  </p>
                  <p className="mt-1">
                    {locale === "zh"
                        ? "请从物件台账的 PDF 入口进入，以确保输出记录绑定正确物件。"
                      : locale === "ko"
                        ? "출력 기록이 올바른 매물에 연결되도록 매물 대장의 PDF 입구에서 이동하세요."
                        : "出力記録を正しい物件に紐づけるため、物件台帳の PDF 入口から遷移してください。"}
                  </p>
                  <Link href="/properties" className="mt-2 inline-flex font-bold text-amber-900 underline">
                    {locale === "zh" ? "前往物件台账" : locale === "ko" ? "매물 대장으로 이동" : "物件台帳へ"}
                  </Link>
                </div>
              ) : null}

              <label className="block space-y-2">
                <span className="text-xs font-bold text-slate-500">{copy.targetParty}</span>
                <div className="relative">
                  <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-slate-400">person</span>
                  <select
                    className="w-full rounded-lg border-none bg-white py-3 pl-10 pr-3 text-sm font-medium"
                    name="targetParty"
                    defaultValue={selectedPartyId}
                  >
                    {isPropertyOverview ? (
                      <option value="">
                        {locale === "zh" ? "不指定主体" : locale === "ko" ? "관계자 미지정" : "関係者を指定しない"}
                      </option>
                    ) : null}
                    {parties.map((party) => (
                      <option key={party.id} value={party.id}>
                        {party.name}
                      </option>
                    ))}
                  </select>
                </div>
              </label>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-500">{copy.outputFormat}</span>
                  <div className="grid grid-cols-2 rounded-lg bg-white p-1">
                    <label
                      className={
                        "cursor-pointer rounded-md py-2 text-center text-xs font-bold " +
                        (selectedFormat === "pdf" ? "bg-white text-slate-900 shadow-sm" : "text-slate-400")
                      }
                    >
                      <input type="radio" name="outputFormat" value="pdf" defaultChecked={selectedFormat === "pdf"} className="sr-only" />
                      {copy.formatPdf}
                    </label>
                    <label
                      className={
                        "cursor-pointer rounded-md py-2 text-center text-xs font-bold " +
                        (selectedFormat === "docx" ? "bg-white text-slate-900 shadow-sm" : "text-slate-400")
                      }
                    >
                      <input type="radio" name="outputFormat" value="docx" defaultChecked={selectedFormat === "docx"} className="sr-only" />
                      {copy.formatDocx}
                    </label>
                  </div>
                </div>
                <label className="space-y-2">
                  <span className="text-xs font-bold text-slate-500">{copy.language}</span>
                  <select className="w-full rounded-lg border-none bg-white px-3 py-3 text-xs font-bold" name="language" defaultValue={selectedLanguage}>
                    <option value="ja">{copy.langJa}</option>
                    <option value="zh">{copy.langZh}</option>
                    <option value="ko">{copy.langKo}</option>
                  </select>
                </label>
              </div>

              <div className="rounded-lg border border-blue-100 bg-white p-3 text-xs text-slate-600">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-bold text-slate-800">
                    {locale === "zh" ? "生成前确认" : locale === "ko" ? "생성 전 확인" : "生成前確認"}
                  </p>
                  <Link href="/settings/output-templates" className="font-semibold text-[#001e40] hover:underline">
                    {locale === "zh" ? "调整模板" : locale === "ko" ? "템플릿 조정" : "テンプレート調整"}
                  </Link>
                </div>
                <div className="mt-2 grid gap-1.5">
                  {[
                    selectedProperty ? selectedProperty.name : t(locale, "common.notSet"),
                    ...(isPropertyOverview
                      ? []
                      : [selectedParty ? selectedParty.name : t(locale, "common.notSet")]),
                    getOutputDocLabel(locale, selectedType),
                    selectedFormat.toUpperCase(),
                  ].map((item, index) => (
                    <div key={`preflight-${index}-${item}`} className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[14px] text-emerald-600">check_circle</span>
                      <span className="truncate">{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              {previewQuoteId || (isPropertyOverview && selectedPropertyId) ? (
                <button
                  type="submit"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#001e40] py-4 text-sm font-black uppercase tracking-widest text-white shadow-[0_14px_24px_-14px_rgba(0,30,64,0.95)]"
                >
                  <span className="material-symbols-outlined text-[18px]">description</span>
                  {copy.generateDocument}
                </button>
              ) : (
                <button
                  disabled
                  className="inline-flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-lg bg-slate-400 py-4 text-sm font-black uppercase tracking-widest text-white"
                >
                  <span className="material-symbols-outlined text-[18px]">description</span>
                  {copy.generateDocument}
                </button>
              )}
            </form>
            <FormDraftAssist
              formId="output-generate-form"
              storageKey="draft:output-center:generate"
              fieldNames={["quoteId", "targetProperty", "targetParty", "outputFormat", "language"]}
              reuseKey="output-center:generate"
              locale={locale}
              className="mt-3"
            />
          </article>

          <article className="rounded-xl bg-white p-7 shadow-sm ring-1 ring-slate-200/35">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-700">{copy.recentOutputs}</h2>
              <Link
                href={outputsExportHref}
                className="text-[11px] font-bold text-[#001e40] hover:underline"
              >
                {copy.viewAll}
              </Link>
            </div>
            <form action="/output-center" method="get" className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-6">
              <input type="hidden" name="type" value={selectedType} />
              <input type="hidden" name="format" value={selectedFormat} />
              <input type="hidden" name="lang" value={selectedLanguage} />
              <input type="hidden" name="quoteId" value={isPropertyOverview ? "" : selectedQuote?.id ?? ""} />
              <input type="hidden" name="targetProperty" value={selectedPropertyId} />
              <input type="hidden" name="targetParty" value={selectedPartyId} />
              <select
                name="historyType"
                defaultValue={historyType}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-700"
              >
                <option value="all">{copy.allType}</option>
                {outputTypes.map((type) => (
                  <option key={type} value={type}>
                    {getOutputDocLabel(locale, type)}
                  </option>
                ))}
              </select>
              <select
                name="historyLang"
                defaultValue={historyLang}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-700"
              >
                <option value="all">{copy.allLang}</option>
                <option value="ja">JA</option>
                <option value="zh">ZH</option>
                <option value="ko">KO</option>
              </select>
              <select
                name="historyFormat"
                defaultValue={historyFormat}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-700"
              >
                <option value="all">{copy.allFormat}</option>
                <option value="pdf">PDF</option>
                <option value="docx">DOCX</option>
              </select>
              <select
                name="historyTemplate"
                defaultValue={historyTemplate}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-700"
              >
                <option value="all">{copy.allTemplate}</option>
                <option value="unbound">{copy.templateUnbound}</option>
                {templateFilterOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
              <button type="submit" className="rounded-lg border border-[#001e40] px-2 py-1.5 text-[11px] font-bold text-[#001e40] hover:bg-[#edf2fd]">
                {copy.filterApply}
              </button>
              <Link
                href={`/output-center?type=${selectedType}&format=${selectedFormat}&lang=${selectedLanguage}&quoteId=${isPropertyOverview ? "" : selectedQuote?.id ?? ""}&targetProperty=${selectedPropertyId}&targetParty=${selectedPartyId}`}
                className="inline-flex items-center justify-center rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50"
              >
                {copy.filterReset}
              </Link>
            </form>
            <div className="space-y-3">
              {isHighlightFiltered && highlightedOutput ? (
                <div>
                  <p className="mb-1 px-1 text-[10px] font-semibold text-[#001e40]">
                    {locale === "zh" ? "这是刚刚输出的文书" : locale === "ko" ? "방금 출력한 문서입니다" : "今出力した帳票です"}
                  </p>
                  <div className="group flex items-center gap-3 rounded-lg bg-[#edf2fd] p-3 ring-2 ring-[#001e40]">
                    <div className="flex h-10 w-10 items-center justify-center rounded bg-red-100 text-red-500">
                      <span className="material-symbols-outlined">picture_as_pdf</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-bold text-slate-900">{highlightedOutput.title}</p>
                      <p className="text-[11px] tabular-nums text-slate-400">
                        {formatDate(highlightedOutput.generatedAt, locale)} • {highlightedOutput.outputFormat.toUpperCase()} • {highlightedOutput.language.toUpperCase()}
                      </p>
                      <p className="truncate text-[10px] font-medium text-slate-500">{copy.docIdLabel}: {highlightedOutput.documentNumber}</p>
                      <p className="truncate text-[10px] text-slate-500">
                        {highlightedOutput.relatedProperty ?? "-"} / {highlightedOutput.relatedParty ?? "-"}
                      </p>
                    </div>
                    <Link href={`/api/outputs/${highlightedOutput.id}/download?locale=${locale}`} className="text-slate-300 transition group-hover:text-[#001e40]">
                      <span className="material-symbols-outlined text-[18px]">download</span>
                    </Link>
                  </div>
                </div>
              ) : null}
              {latestOutputs.map((output) => (
                <div key={output.id} className={`group flex items-center gap-3 rounded-lg p-3 transition hover:bg-[#edf2fd] ${highlightOutputId && output.id === highlightOutputId ? "ring-2 ring-[#001e40] bg-[#edf2fd]" : ""}`}>
                  <div className="flex h-10 w-10 items-center justify-center rounded bg-red-100 text-red-500">
                    <span className="material-symbols-outlined">picture_as_pdf</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-bold text-slate-900">{output.title}</p>
                    <p className="text-[11px] tabular-nums text-slate-400">
                      {formatDate(output.generatedAt, locale)} • {output.outputFormat.toUpperCase()} • {output.language.toUpperCase()}
                    </p>
                    <p className="truncate text-[10px] font-medium text-slate-500">{copy.docIdLabel}: {output.documentNumber}</p>
                    {output.templateVersionLabel ? (
                      <span className="inline-flex items-center gap-0.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                        <span className="material-symbols-outlined text-[11px]">layers</span>
                        {output.templateVersionLabel}
                      </span>
                    ) : null}
                    <p className="truncate text-[10px] text-slate-500">
                      {output.relatedProperty ?? "-"} / {output.relatedParty ?? "-"}
                    </p>
                  </div>
                  <Link href={`/api/outputs/${output.id}/download?locale=${locale}`} className="text-slate-300 transition group-hover:text-[#001e40]">
                    <span className="material-symbols-outlined text-[18px]">download</span>
                  </Link>
                </div>
              ))}
              {latestOutputs.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-xs font-medium text-slate-500">
                  {copy.emptyFilteredOutputs}
                </div>
              ) : null}
            </div>
          </article>
        </div>

        <div className="xl:col-span-7">
          <article className="flex min-h-[850px] flex-col rounded-xl bg-[#dce9ff] p-4">
            <div className="flex flex-1 flex-col overflow-hidden rounded-lg bg-white shadow-inner">
              <div className="flex items-center justify-between border-b border-slate-100 px-6 py-3">
                <div className="flex items-center gap-4">
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-400">{copy.previewMode}</span>
                  <div className="h-4 w-px bg-slate-200" />
                  <div className="flex items-center gap-2">
                    <Link href={`/output-center?type=${selectedType}&format=${selectedFormat}&lang=${selectedLanguage}&quoteId=${isPropertyOverview ? "" : selectedQuote?.id ?? ""}&targetProperty=${selectedPropertyId}&targetParty=${selectedPartyId}&historyType=${historyType}&historyLang=${historyLang}&historyFormat=${historyFormat}&historyTemplate=${historyTemplate}&zoom=75`} className="rounded p-1 text-slate-500 hover:bg-slate-100">
                      <span className="material-symbols-outlined text-[18px]">zoom_out</span>
                    </Link>
                    <span className="text-[11px] font-bold tabular-nums">{selectedZoom}%</span>
                    <Link href={`/output-center?type=${selectedType}&format=${selectedFormat}&lang=${selectedLanguage}&quoteId=${isPropertyOverview ? "" : selectedQuote?.id ?? ""}&targetProperty=${selectedPropertyId}&targetParty=${selectedPartyId}&historyType=${historyType}&historyLang=${historyLang}&historyFormat=${historyFormat}&historyTemplate=${historyTemplate}&zoom=100`} className="rounded p-1 text-slate-500 hover:bg-slate-100">
                      <span className="material-symbols-outlined text-[18px]">zoom_in</span>
                    </Link>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Link href={previewQuoteId && !isPropertyOverview ? `/quotes/${previewQuoteId}/print?type=${selectedType}` : `/output-center?type=${selectedType}&targetProperty=${selectedPropertyId}`} className="rounded-full p-2 text-slate-500 hover:bg-slate-100">
                    <span className="material-symbols-outlined text-[18px]">print</span>
                  </Link>
                  <Link href={previewQuoteId && !isPropertyOverview ? `/quotes/${previewQuoteId}` : `/properties?focus=${selectedPropertyId}`} className="rounded-full p-2 text-slate-500 hover:bg-slate-100">
                    <span className="material-symbols-outlined text-[18px]">share</span>
                  </Link>
                  {selectedGeneratedOutput || (previewQuoteId && !isPropertyOverview) ? (
                    <Link href={selectedDownloadHref} className="ml-1 rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-bold text-white">
                      {copy.download}
                    </Link>
                  ) : (
                    <button disabled className="ml-1 cursor-not-allowed rounded-lg bg-slate-400 px-4 py-1.5 text-xs font-bold text-white">
                      {copy.download}
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-1 justify-center overflow-y-auto bg-slate-100 p-10">
                <div className="relative flex h-[842px] w-[595px] flex-col overflow-hidden bg-white p-10 shadow-2xl">
                  <div className="absolute right-8 top-8 text-xl font-black uppercase tracking-tighter text-[#001e40]/20">BROKERDESK</div>
                  <div className="mb-10 border-b-4 border-[#001e40] pb-4">
                    <h3 className="text-4xl font-bold text-slate-900">{getOutputDocLabel(locale, selectedType)}</h3>
                    <p className="mt-1 text-[10px] uppercase tracking-widest text-slate-500">{copy.previewSubtitle}</p>
                  </div>
                  <div className="mb-10 grid grid-cols-2 gap-8">
                    <div>
                      <p className="text-[9px] font-bold uppercase text-slate-400">{copy.preparedFor}</p>
                      <p className="text-sm font-bold text-slate-900">
                        {isPropertyOverview ? selectedProperty?.name ?? "-" : selectedParty?.name ?? copy.preparedForValue}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] font-bold uppercase text-slate-400">{copy.dateIssued}</p>
                      <p className="text-sm font-bold tabular-nums text-slate-900">{issuedDateValue}</p>
                    </div>
                  </div>
                  <div className="space-y-7 text-[11px] text-slate-700">
                    <section>
                      <h4 className="mb-3 border-l-2 border-[#001e40] bg-slate-50 px-3 py-1 text-xs font-black">{copy.section1Title}</h4>
                      <div className="grid grid-cols-3 gap-y-2 tabular-nums">
                        <div className="text-slate-400">{copy.fieldAddress}</div>
                        <div className="col-span-2">{selectedProperty?.name ?? copy.valueAddress}</div>
                        <div className="text-slate-400">{copy.fieldArea}</div>
                        <div className="col-span-2">
                          {selectedProperty?.listingPrice ? formatCurrency(selectedProperty.listingPrice, locale) : copy.valueArea}
                        </div>
                        <div className="text-slate-400">{copy.fieldLayout}</div>
                        <div className="col-span-2">{selectedProperty?.name ?? copy.valueLayout}</div>
                      </div>
                    </section>
                    <section>
                      <h4 className="mb-3 border-l-2 border-[#001e40] bg-slate-50 px-3 py-1 text-xs font-black">{copy.section2Title}</h4>
                      <div className="space-y-3">
                        <div className="rounded bg-[#edf2fd] p-3 text-[10px] leading-relaxed text-slate-700">
                          {copy.section2Desc}
                        </div>
                        <ul className="list-disc space-y-1 pl-4 text-[10px] text-slate-600">
                          <li>{copy.bullet1}</li>
                          <li>{copy.bullet2}</li>
                          <li>{copy.bullet3}</li>
                        </ul>
                      </div>
                    </section>
                    <section>
                      <h4 className="mb-3 border-l-2 border-[#001e40] bg-slate-50 px-3 py-1 text-xs font-black">{copy.section3Title}</h4>
                      <div className="mt-10 grid grid-cols-2 gap-8">
                        <div className="border-b border-dotted border-slate-300 pb-1 pt-12 text-[10px] text-slate-400">{copy.sellerSign}</div>
                        <div className="border-b border-dotted border-slate-300 pb-1 pt-12 text-[10px] text-slate-400">{copy.buyerSign}</div>
                      </div>
                    </section>
                  </div>
                  <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-6">
                    <p className="text-[9px] tabular-nums text-slate-300">
                      {copy.docIdLabel}: {previewDocId}
                    </p>
                    <p className="text-[9px] text-slate-300">
                      {copy.pageLabel} 1 / 4
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </article>
        </div>
      </section>
        </div>
      </details>
    </div>
  );
}
