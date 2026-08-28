import Link from "next/link";
import { generateOutputDocumentAction } from "@/app/actions";
import { FormDraftAssist } from "@/components/form-draft-assist";
import { GuaranteeTemplateSelector } from "@/components/guarantee-template-selector";
import { PageFrame, PageHeader, StateSurface, WorklistShell } from "@/components/layout-system";
import { PageFlashBanner } from "@/components/page-flash-banner";
import { OutputNavigationFeedback } from "@/components/output-navigation-feedback";
import { listBrokerageCasesForContext, listGuaranteeApplicationDrafts, listPropertiesForContext, listQuotationsForContext, listTenantGuaranteeTemplateInstalls } from "@/lib/data";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  buildGuaranteeApplicationReadiness,
  buildGuaranteeDraftReadiness,
  getGuaranteeCompanyTemplate,
  guaranteeCompanyTemplates,
  type GuaranteeReadinessStatus,
} from "@/lib/guarantee-application";
import { getCaseFieldDefinition, getCaseFieldInformation } from "@/lib/case-field-catalog";
import { listHubGeneratedOutputs, listHubParties } from "@/lib/hub";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import { getOutputDocLabel, isOutputDocType, type OutputDocType } from "@/lib/output-doc";
import { requireTenantSession } from "@/lib/tenant-session";
import { createRequestContext } from "@/lib/visibility-resolver";

export const dynamic = "force-dynamic";

const outputTypes: OutputDocType[] = ["property_overview", "proposal", "estimate_sheet", "funding_plan", "assumption_memo"];
const outputCenterCopy = {
  ja: {
    subtitle: "出力する文書を選び、必要な確認やプレビューへ進みます。公式原本はそのまま閲覧できます。",
    taskCategory: "出力タスク",
    chooseTaskTitle: "出力する文書を選択してください",
    chooseTaskDescription: "タスク一覧から文書を選ぶと、必要な確認と次の操作が表示されます。",
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
    viewAll: "すべて表示",
    allType: "すべての種別",
    allLang: "すべての言語",
    allFormat: "すべての形式",
    allTemplate: "すべてのテンプレート",
    templateUnbound: "テンプレート未記録",
    templateVersion: "使用テンプレート",
    filterApply: "適用",
    filterReset: "リセット",
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
    outputCenterTitle: "文書出力",
    guaranteePrimaryEyebrow: "保証会社申込書作成",
    guaranteePrimaryTitle: "出力",
    guaranteePrimaryPanelTitle: "確認",
    guaranteePrimaryDesc: "案件を選び、不足項目を確認してから申込書を出します。",
    guaranteeNextAction: "次にやること",
    guaranteeChecklist: "確認が必要な項目",
    outputPathCase: "案件",
    outputPathTemplate: "保証会社",
    outputPathPreview: "プレビュー",
    caseReadyForPreview: "プレビュー可",
    caseMissingItems: "未完了",
    chooseThisCase: "この案件を選ぶ",
    caseCardUpdated: "更新",
    guaranteeDetailToggle: "詳細を表示",
    guaranteeCase: "対象案件",
    guaranteeNoCase: "案件がまだありません",
    guaranteeCreateCase: "案件を作成",
    guaranteeTemplate: "保証会社",
    guaranteeReadiness: "申込データ準備",
    guaranteeDraftReadiness: "申込書追加情報",
    guaranteeDraftEdit: "追加情報を編集",
    guaranteeDraftReady: "追加項目入力済み",
    guaranteeDraftMissing: "追加項目未入力",
    guaranteeFillInWorkbench: "情報整理で入力",
    guaranteeFillInDraft: "追加情報を入力",
    guaranteeReviewMissing: "不足項目を確認",
    guaranteeSelectCaseFirst: "先に対象案件を選択",
    guaranteeReady: "準備済み",
    guaranteeMissing: "未入力",
    guaranteeNeedsConfirmation: "要確認",
    guaranteeRequiredMissing: "必須項目が未完了",
    guaranteeExportBlocked: "この保証会社の申込書出力は次の対応予定です。まずは不足項目の確認までできます。",
    guaranteePdfPendingButton: "出力準備中（未入力あり）",
    guaranteePreviewReady: "プレビューで内容と位置を確認します。",
    guaranteePreviewAction: "{company}申込書をプレビュー",
    guaranteePreviewNeedsCase: "案件を選択すると、確認済みデータを使って申込書を出せます。",
    guaranteeSourceConfirmed: "確認済み案件データ",
    guaranteeSourceDraft: "申込書追加情報",
    guaranteeSourceCandidate: "読取内容（確認が必要）",
    guaranteeSourceMissing: "未入力",
    guaranteeCaseLink: "案件を確認",
    guaranteeImportLink: "資料を読み取る",
    guaranteeLibraryRequired: "このワークスペースには利用できる保証会社申込書テンプレートがありません。テンプレートライブラリから追加してください。",
    guaranteeLibraryAction: "テンプレートライブラリを開く",
    guaranteeLegacyTitle: "他の文書",
    guaranteeLegacyDesc: "物件概要書、提案書、費用明細などを確認できます。",
  },
  zh: {
    subtitle: "选择要处理的文书，查看所需确认并进入预览；官方原件可直接打开。",
    taskCategory: "输出任务",
    chooseTaskTitle: "请选择需要输出的文书",
    chooseTaskDescription: "从任务列表选择文书后，这里会显示所需确认和下一步操作。",
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
    viewAll: "查看全部",
    allType: "全部类型",
    allLang: "全部语言",
    allFormat: "全部格式",
    allTemplate: "全部范本",
    templateUnbound: "未记录范本",
    templateVersion: "使用范本",
    filterApply: "应用",
    filterReset: "重置",
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
    guaranteeCase: "目标案件",
    guaranteeNoCase: "还没有案件",
    guaranteeCreateCase: "新建案件",
    guaranteeTemplate: "保证会社",
    guaranteeReadiness: "申请数据准备度",
    guaranteeDraftReadiness: "申请书补充信息",
    guaranteeDraftEdit: "编辑补充信息",
    guaranteeDraftReady: "补充信息已填写",
    guaranteeDraftMissing: "补充信息未填写",
    guaranteeFillInWorkbench: "到信息整理页填写",
    guaranteeFillInDraft: "填写补充信息",
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
    guaranteeSourceDraft: "申请书补充信息",
    guaranteeSourceCandidate: "读取内容（需确认）",
    guaranteeSourceMissing: "未填写",
    guaranteeCaseLink: "查看案件",
    guaranteeImportLink: "读取资料",
    guaranteeLibraryRequired: "当前工作区还没有可用的保证会社申请书模板。请先从模板库中添加。",
    guaranteeLibraryAction: "打开模板库",
    guaranteeLegacyTitle: "其他文书",
    guaranteeLegacyDesc: "可继续查看物件概要书、提案书、费用明细等文书。",
  },
  ko: {
    subtitle: "처리할 문서를 선택해 필요한 확인과 미리보기로 이동합니다. 공식 원본은 바로 열 수 있습니다.",
    taskCategory: "출력 작업",
    chooseTaskTitle: "출력할 문서를 선택해 주세요",
    chooseTaskDescription: "작업 목록에서 문서를 선택하면 필요한 확인과 다음 작업이 표시됩니다.",
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
    viewAll: "전체 보기",
    allType: "전체 유형",
    allLang: "전체 언어",
    allFormat: "전체 형식",
    allTemplate: "전체 템플릿",
    templateUnbound: "템플릿 미기록",
    templateVersion: "사용 템플릿",
    filterApply: "적용",
    filterReset: "초기화",
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
    guaranteeCase: "대상 안건",
    guaranteeNoCase: "아직 안건이 없습니다",
    guaranteeCreateCase: "안건 만들기",
    guaranteeTemplate: "보증회사",
    guaranteeReadiness: "신청 데이터 준비도",
    guaranteeDraftReadiness: "회사별 추가 항목",
    guaranteeDraftEdit: "추가 정보 편집",
    guaranteeDraftReady: "추가 정보 입력됨",
    guaranteeDraftMissing: "추가 정보 미입력",
    guaranteeFillInWorkbench: "정보 정리에서 입력",
    guaranteeFillInDraft: "추가 정보 입력",
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
    guaranteeSourceDraft: "신청서 추가 정보",
    guaranteeSourceCandidate: "후보값(확인 필요)",
    guaranteeSourceMissing: "미입력",
    guaranteeCaseLink: "안건 확인",
    guaranteeImportLink: "자료 읽기",
    guaranteeLibraryRequired: "현재 워크스페이스에는 사용할 수 있는 보증회사 신청서 템플릿이 없습니다. 템플릿 라이브러리에서 먼저 추가하세요.",
    guaranteeLibraryAction: "템플릿 라이브러리 열기",
    guaranteeLegacyTitle: "다른 문서",
    guaranteeLegacyDesc: "매물 개요서, 제안서, 비용 명세 등 다른 문서를 확인할 수 있습니다.",
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
    docGroup?: string;
    doc?: string;
  }>;
};

function readinessClass(status: GuaranteeReadinessStatus) {
  if (status === "available") return "bg-emerald-100 text-emerald-800";
  if (status === "needs_confirmation") return "bg-amber-100 text-amber-800";
  return "bg-rose-100 text-rose-800";
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
  const [locale, params, session] = await Promise.all([
    getLocale(),
    searchParams ? searchParams : Promise.resolve(undefined),
    requireTenantSession({ permission: "output.preview" }),
  ]);
  const copy = outputCenterCopy[locale];
  const user = session.user;
  const tenantId = session.tenant.id;
  const requestContext = createRequestContext(session);
  const hubContext = { requestContext };
  const shouldShowLegacyOutputFlow = false;
  const propertiesPromise = listPropertiesForContext({ context: requestContext, lifecycleStatus: "active" });
  const quotesPromise = shouldShowLegacyOutputFlow
    ? listQuotationsForContext({ context: requestContext, limit: 100 })
    : Promise.resolve([]);
  const partiesPromise = listHubParties(locale, hubContext);
  const outputsPromise = shouldShowLegacyOutputFlow
    ? listHubGeneratedOutputs(locale, hubContext)
    : Promise.resolve([]);
  const installedGuaranteeTemplatesPromise = listTenantGuaranteeTemplateInstalls({ tenantId });
  const casesPromise = listBrokerageCasesForContext({ context: requestContext, limit: 50 });
  const [visibleProperties, quotes, parties, outputs, installedGuaranteeTemplates, visibleCases] = await Promise.all([
    propertiesPromise,
    quotesPromise,
    partiesPromise,
    outputsPromise,
    installedGuaranteeTemplatesPromise,
    casesPromise,
  ]);
  const properties = visibleProperties.filter((item) => item.resolution.canWrite).map((item) => item.property);
  const writableParties = parties.filter((item) => item.canWrite);
  const writableQuotes = quotes.filter((quote) => quote.client.currentOwnerUserId === user.id && (!quote.property || quote.property.currentOwnerUserId === user.id));
  // Generation is owner-only even though the history list itself is parent-read scoped.
  const cases = visibleCases.flatMap((item) => (item.brokerageCase && item.resolution.canWrite ? [item.brokerageCase] : []));
  const selectedCaseId = String(params?.caseId ?? "").trim();
  const selectedCase = selectedCaseId
    ? cases.find((item) => item.id === selectedCaseId)
    : undefined;
  const installedGuaranteeTemplateIds = new Set(installedGuaranteeTemplates.map((item) => item.templateId));
  const activeGuaranteeTemplates = guaranteeCompanyTemplates.filter(
    (template) => template.outputStatus === "active" && installedGuaranteeTemplateIds.has(template.id),
  );
  const hasInstalledGuaranteeTemplates = activeGuaranteeTemplates.length > 0;
  const fallbackGuaranteeTemplate = guaranteeCompanyTemplates.find((template) => template.outputStatus === "active");
  const defaultGuaranteeTemplateId =
    activeGuaranteeTemplates.find((template) => template.id === "friends_guarantee_individual_v1")?.id ??
    activeGuaranteeTemplates[0]?.id ??
    fallbackGuaranteeTemplate?.id ??
    "friends_guarantee_individual_v1";
  const requestedGuaranteeTemplateCandidate = String(params?.guaranteeTemplate ?? "").trim();
  const requestedGuaranteeTemplate = activeGuaranteeTemplates.some((template) => template.id === requestedGuaranteeTemplateCandidate)
    ? requestedGuaranteeTemplateCandidate
    : defaultGuaranteeTemplateId;
  const selectedGuaranteeTemplate = getGuaranteeCompanyTemplate(requestedGuaranteeTemplate);
  const candidateCaseIds = selectedCase ? [selectedCase.id] : cases.slice(0, 9).map((caseItem) => caseItem.id);
  const draftRows = await listGuaranteeApplicationDrafts({
    userId: user.id,
    tenantId,
    caseIds: candidateCaseIds,
    templateIds: activeGuaranteeTemplates.map((template) => template.id),
  });
  const draftMap = new Map(draftRows.map((draft) => [`${draft.caseId}:${draft.templateId}`, draft]));
  const guaranteeTemplateDrafts = selectedCase
    ? activeGuaranteeTemplates.map((template) => draftMap.get(`${selectedCase.id}:${template.id}`) ?? null)
    : [];
  const selectedGuaranteeDraft =
    guaranteeTemplateDrafts[activeGuaranteeTemplates.findIndex((template) => template.id === selectedGuaranteeTemplate.id)] ?? null;
  const selectedGuaranteeDraftReadiness = buildGuaranteeDraftReadiness(selectedGuaranteeDraft, selectedGuaranteeTemplate.id);
  const selectedPropertyForCandidate = properties[0];
  const selectedPartyForCandidate = writableParties[0];
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
  const selectedGuaranteeDraftMissingFields = selectedGuaranteeDraftReadiness.fields.filter(
    (field) => field.required && field.status !== "available",
  );
  const selectedGuaranteeMissingCount = guaranteeBlockingCount + selectedGuaranteeDraftReadiness.requiredMissingCount;
  const caseSelectorCards = !selectedCase
    ? cases.slice(0, 9).map((caseItem) => {
          const draft = draftMap.get(`${caseItem.id}:${selectedGuaranteeTemplate.id}`) ?? null;
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
        })
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

    return {
      template,
      missingCount,
    };
  });
  const selectedGuaranteePreviewHref = selectedCase
    ? `/guarantee-applications/${encodeURIComponent(selectedGuaranteeTemplate.id)}/preview?caseId=${encodeURIComponent(selectedCase.id)}`
    : "#guarantee-case-selector";
  const selectedCaseDraftHref = selectedCase
    ? previewHrefForGuaranteeField({ caseId: selectedCase.id, templateId: selectedGuaranteeTemplate.id })
    : "#guarantee-case-selector";
  const selectedGuaranteeDownloadHref = selectedCase
    ? `/api/guarantee-applications/${encodeURIComponent(selectedGuaranteeTemplate.id)}/download?caseId=${encodeURIComponent(selectedCase.id)}`
    : "#guarantee-case-selector";
  const selectedGuaranteeCanDownload = Boolean(
    selectedCase && selectedGuaranteeTemplate.allowDirectDownload && selectedGuaranteeMissingCount === 0,
  );
  const firstBlockingField = guaranteeBlockingFields[0];
  const hasAvailableCases = cases.length > 0;
  const outputNextHref = !selectedCase
    ? hasAvailableCases
      ? "#guarantee-case-selector"
      : "/cases/new?from=output"
    : firstBlockingField
      ? isOutputSpecificGuaranteeField(firstBlockingField.fieldKey)
        ? previewHrefForGuaranteeField({ caseId: selectedCase.id, templateId: selectedGuaranteeTemplate.id, fieldKey: firstBlockingField.fieldKey })
        : caseWorkbenchHrefForGuaranteeField({ caseId: selectedCase.id, templateId: selectedGuaranteeTemplate.id, fieldKey: firstBlockingField.fieldKey })
      : selectedGuaranteeDraftReadiness.requiredMissingCount > 0
        ? selectedCaseDraftHref
      : selectedGuaranteePreviewHref;
  const outputNextLabel = !selectedCase
    ? hasAvailableCases
      ? copy.guaranteeSelectCaseFirst
      : copy.guaranteeCreateCase
    : firstBlockingField
      ? copy.guaranteeReviewMissing
      : selectedGuaranteeDraftReadiness.requiredMissingCount > 0
        ? copy.guaranteeFillInDraft
      : copy.guaranteePreviewAction.replace("{company}", selectedGuaranteeTemplate.companyDisplayName);
  const outputNextIcon = !selectedCase
    ? hasAvailableCases
      ? "folder_open"
      : "add_business"
    : firstBlockingField
      ? "fact_check"
      : selectedGuaranteeDraftReadiness.requiredMissingCount > 0
        ? "edit_note"
        : "visibility";
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
  const missingQuoteClientLabel = locale === "zh" ? "客户未确认" : locale === "ko" ? "고객 미확인" : "顧客未確認";
  const quoteOptionLabel = (quote: (typeof writableQuotes)[number]) => `${quote.quoteTitle} - ${quote.client?.name ?? missingQuoteClientLabel}`;
  const requestedQuoteId = String(params?.quoteId ?? "").trim();
  const defaultQuoteId = isPropertyOverview ? requestedQuoteId : requestedQuoteId || latestOutputs[0]?.sourceQuoteId || writableQuotes[0]?.id || "";
  const selectedQuote = isPropertyOverview ? undefined : writableQuotes.find((quote) => quote.id === defaultQuoteId) ?? writableQuotes[0];
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
  const selectedLegacyDocumentGroup = isPropertyOverview ? "property" : "proposal";
  const outputSelectionBaseHref = `/output-center?docGroup=${selectedLegacyDocumentGroup}&type=${selectedType}&format=${selectedFormat}&lang=${selectedLanguage}&quoteId=${isPropertyOverview ? "" : selectedQuote?.id ?? ""}&targetProperty=${selectedPropertyId}&targetParty=${selectedPartyId}`;
  const returnToCurrent = `${outputSelectionBaseHref}&historyType=${historyType}&historyLang=${historyLang}&historyFormat=${historyFormat}&historyTemplate=${historyTemplate}`;
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
  const documentTreeGroupIds = ["application", "official"] as const;
  type DocumentTreeGroupId = (typeof documentTreeGroupIds)[number];
  type DocumentTreeItem = {
    id: string;
    label: string;
    description?: string;
    href?: string;
    selected?: boolean;
    status: string;
    disabled?: boolean;
    external?: boolean;
  };

  const documentTreeCopy = {
    title: locale === "zh" ? "选择要输出的文书" : locale === "ko" ? "출력할 문서 선택" : "出力する文書を選択",
    application: locale === "zh" ? "保证会社申请" : locale === "ko" ? "보증회사 신청" : "保証会社申込",
    official: locale === "zh" ? "国土交通省官方原件" : locale === "ko" ? "국토교통성 공식 원본" : "国土交通省の公式原本",
    officialDesc: locale === "zh"
      ? "当前模板仅供查看和下载，完成配置确认后才可用于自动生成。"
      : locale === "ko"
        ? "열람 및 다운로드용입니다. 필요한 설정 확인 전에는 자동 생성 서식으로 사용하지 않습니다."
        : "閲覧・ダウンロード用です。必要な設定が確認されるまでは自動作成に使用しません。",
    taskCategory: copy.taskCategory,
    officialSource: locale === "zh" ? "官方原件" : locale === "ko" ? "공식 원본" : "公式原本",
    externalHint: locale === "zh" ? "在新标签页打开" : locale === "ko" ? "새 탭에서 열기" : "新しいタブで開く",
    templateLibrary: locale === "zh" ? "先添加模板" : locale === "ko" ? "템플릿 추가 필요" : "テンプレートを追加",
    templateMissing: locale === "zh" ? "模板未设置" : locale === "ko" ? "템플릿 미설정" : "テンプレート未設定",
    templateRequired: locale === "zh" ? "需要先设置模板" : locale === "ko" ? "템플릿 설정이 필요합니다" : "テンプレートが必要です",
    chooseCase: locale === "zh" ? "先选案件" : locale === "ko" ? "안건 선택" : "案件選択",
    readyToPreview: locale === "zh" ? "可预览" : locale === "ko" ? "미리보기 가능" : "プレビュー可",
    needsInput: locale === "zh" ? "项待补齐" : locale === "ko" ? "항목 보완 필요" : "項目不足",
    guaranteeApplication: locale === "zh" ? "保证会社申请书" : locale === "ko" ? "보증회사 신청서" : "保証会社申込書",
  };
  const requestedDocumentTreeGroupId = String(params?.docGroup ?? "").trim();
  const selectedDocumentId = String(params?.doc ?? "").trim();
  const requestedDocumentTreeGroup = documentTreeGroupIds.includes(requestedDocumentTreeGroupId as DocumentTreeGroupId)
    ? (requestedDocumentTreeGroupId as DocumentTreeGroupId)
    : null;
  const inferredDocumentTreeGroup: DocumentTreeGroupId | null = selectedCaseId || String(params?.guaranteeTemplate ?? "").trim()
    ? "application"
    : null;
  const selectedDocumentTreeGroupId = requestedDocumentTreeGroup ?? inferredDocumentTreeGroup;
  const isGuaranteeDocumentSelected = selectedDocumentTreeGroupId === "application" && (
    selectedDocumentId === "guarantee_application" ||
    Boolean(selectedCaseId || String(params?.guaranteeTemplate ?? "").trim())
  );
  const shouldShowGuaranteeFlow = isGuaranteeDocumentSelected && hasInstalledGuaranteeTemplates;
  const guaranteeDocumentStatus = !hasInstalledGuaranteeTemplates
    ? documentTreeCopy.templateMissing
    : !selectedCase
    ? documentTreeCopy.chooseCase
    : selectedGuaranteeMissingCount > 0
      ? `${selectedGuaranteeMissingCount} ${documentTreeCopy.needsInput}`
      : documentTreeCopy.readyToPreview;
  const documentTreeGroups: Array<{
    id: DocumentTreeGroupId;
    icon: string;
    title: string;
    description: string;
    status: string;
    items: DocumentTreeItem[];
  }> = [
    {
      id: "application",
      icon: "verified_user",
      title: documentTreeCopy.application,
      description: "",
      status: documentTreeCopy.taskCategory,
      items: [
        {
          id: "guarantee_application",
          label: documentTreeCopy.guaranteeApplication,
          description: hasInstalledGuaranteeTemplates
            ? selectedCase ? `${selectedGuaranteeTemplate.companyDisplayName} · ${selectedCase.caseTitle}` : undefined
            : copy.guaranteeLibraryRequired,
          href: hasInstalledGuaranteeTemplates
            ? selectedCase
              ? `/output-center?docGroup=application&doc=guarantee_application&caseId=${encodeURIComponent(selectedCase.id)}&guaranteeTemplate=${encodeURIComponent(selectedGuaranteeTemplate.id)}`
              : "/output-center?docGroup=application&doc=guarantee_application#guarantee-case-selector"
            : "/output-center?docGroup=application&doc=guarantee_application",
          selected: isGuaranteeDocumentSelected,
          status: guaranteeDocumentStatus,
        },
      ],
    },
    {
      id: "official",
      icon: "verified",
      title: documentTreeCopy.official,
      description: documentTreeCopy.officialDesc,
      status: documentTreeCopy.officialSource,
      items: [
        {
          id: "important_matters_sale_exchange",
          label: locale === "zh" ? "重要事项说明书（买卖·交换）记载例" : locale === "ko" ? "중요사항 설명서(매매·교환) 기재 예시" : "重要事項説明書（売買・交換）記載例",
          description: locale === "zh" ? "国土交通省 · 2026年4月1日现行记载例" : locale === "ko" ? "국토교통성 · 2026년 4월 1일 현행 기재 예시" : "国土交通省 · 2026年4月1日現行記載例",
          href: "/official-forms/mlit-important-matters-example-2026-04-01.pdf",
          status: documentTreeCopy.officialSource,
          external: true,
        },
        {
          id: "rental_management_important_matters",
          label: locale === "zh" ? "租赁住宅管理委托契约 重要事项说明书记载例" : locale === "ko" ? "임대주택 관리위탁계약 중요사항 설명서 기재 예시" : "賃貸住宅管理受託契約 重要事項説明書 記載例",
          description: locale === "zh" ? "国土交通省 · 管理委托契约签订前说明用" : locale === "ko" ? "국토교통성 · 관리위탁계약 체결 전 설명용" : "国土交通省 · 管理受託契約締結前の説明用",
          href: "/official-forms/mlit-rental-management-important-matters-2021-04-23.pdf",
          status: documentTreeCopy.officialSource,
          external: true,
        },
        {
          id: "standard_brokerage_agreement_terms",
          label: locale === "zh" ? "标准媒介契约约款" : locale === "ko" ? "표준 중개계약 약관" : "標準媒介契約約款",
          description: locale === "zh" ? "国土交通省告示标准条款 · 2024年4月1日施行版" : locale === "ko" ? "국토교통성 고시 표준 약관 · 2024년 4월 1일 시행판" : "国土交通省告示の標準約款 · 2024年4月1日施行版",
          href: "/official-forms/mlit-standard-brokerage-agreement-terms-2024-04-01.pdf",
          status: documentTreeCopy.officialSource,
          external: true,
        },
        {
          id: "standard_rental_management_agreement",
          label: locale === "zh" ? "租赁住宅标准管理委托契约书" : locale === "ko" ? "임대주택 표준 관리위탁계약서" : "賃貸住宅標準管理受託契約書",
          description: locale === "zh" ? "国土交通省标准合同 · 管理业者与出租人使用" : locale === "ko" ? "국토교통성 표준 계약서 · 관리업자와 임대인용" : "国土交通省標準契約書 · 管理業者と賃貸人向け",
          href: "/official-forms/mlit-standard-rental-management-agreement-2021-04-23.pdf",
          status: documentTreeCopy.officialSource,
          external: true,
        },
        {
          id: "standard_residential_lease_joint_guarantor",
          label: locale === "zh" ? "租赁住宅标准契约书（连带保证人型）" : locale === "ko" ? "임대주택 표준계약서(연대보증인형)" : "賃貸住宅標準契約書（連帯保証人型）",
          description: locale === "zh" ? "国土交通省示范合同 · 非强制使用" : locale === "ko" ? "국토교통성 모델 계약서 · 의무 사용 아님" : "国土交通省のモデル契約書 · 使用義務なし",
          href: "/official-forms/mlit-standard-residential-lease-joint-guarantor-2018.pdf",
          status: documentTreeCopy.officialSource,
          external: true,
        },
        {
          id: "standard_residential_lease_rent_guarantee",
          label: locale === "zh" ? "租赁住宅标准契约书（租金债务保证业者型）" : locale === "ko" ? "임대주택 표준계약서(임대료 채무보증업자형)" : "賃貸住宅標準契約書（家賃債務保証業者型）",
          description: locale === "zh" ? "国土交通省示范合同 · 非强制使用" : locale === "ko" ? "국토교통성 모델 계약서 · 의무 사용 아님" : "国土交通省のモデル契約書 · 使用義務なし",
          href: "/official-forms/mlit-standard-residential-lease-rent-guarantee-2018.pdf",
          status: documentTreeCopy.officialSource,
          external: true,
        },
      ],
    },
  ];
  const activeDocumentTreeGroup = selectedDocumentTreeGroupId
    ? documentTreeGroups.find((group) => group.id === selectedDocumentTreeGroupId)
    : undefined;
  const documentTreeGroupHref = (groupId: DocumentTreeGroupId) => {
    const nextParams = new URLSearchParams();
    nextParams.set("docGroup", groupId);
    nextParams.set("format", selectedFormat);
    nextParams.set("lang", selectedLanguage);
    return `/output-center?${nextParams.toString()}`;
  };

  return (
    <PageFrame className="bd-page bd-output-page space-y-6">
      <PageHeader title={copy.outputCenterTitle} description={copy.subtitle} />
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
                  className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 focus-visible:outline focus-visible:outline-[length:var(--bd-focus-ring-width)] focus-visible:outline-[color:var(--bd-focus-ring-color)] focus-visible:outline-offset-[var(--bd-focus-ring-offset)]"
                >
                  <span className="material-symbols-outlined text-[14px]">build</span>
                  {link.label}
                </Link>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <WorklistShell
        aria-labelledby="output-task-heading"
        controls={<h2 id="output-task-heading" className="text-base font-black text-slate-950">{documentTreeCopy.title}</h2>}
        items={(
          <section className="min-w-0">
            <div className="grid min-w-0">
          <nav aria-label={documentTreeCopy.title} className="border-b border-slate-200 p-4">
            <div className="grid gap-2">
              {documentTreeGroups.map((group) => {
                const selected = group.id === selectedDocumentTreeGroupId;
                const groupOwnsCurrent = selected && !group.items.some((item) => item.selected);
                return (
                  <Link
                    key={`document-tree-nav-${group.id}`}
                    href={documentTreeGroupHref(group.id)}
                    aria-current={groupOwnsCurrent ? "page" : undefined}
                    className={`relative flex min-h-11 flex-wrap items-start justify-between gap-3 rounded-lg border px-3 py-3 transition focus-visible:outline focus-visible:outline-[length:var(--bd-focus-ring-width)] focus-visible:outline-[color:var(--bd-focus-ring-color)] focus-visible:outline-offset-[var(--bd-focus-ring-offset)] ${
                      selected ? "border-blue-200 bg-blue-50/50 text-slate-950" : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-slate-50"
                    }`}
                  >
                    <OutputNavigationFeedback pendingLabel={locale === "zh" ? "正在打开文书分类" : locale === "ko" ? "문서 분류를 여는 중" : "文書分類を開いています"}>
                      <span className="flex min-w-0 flex-1 items-start gap-2">
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${selected ? "bg-blue-100 text-[#002FA7]" : "bg-slate-100 text-[#002FA7]"}`}>
                          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">{group.icon}</span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block break-words text-sm font-black leading-5 [overflow-wrap:anywhere]">{group.title}</span>
                          <span className="mt-0.5 block text-[11px] font-semibold text-slate-500">{group.items.length}</span>
                        </span>
                      </span>
                      <span className={`max-w-full break-words rounded-full px-2 py-0.5 text-xs font-black leading-4 [overflow-wrap:anywhere] ${selected ? "bg-blue-100 text-[#002FA7]" : "bg-slate-100 text-slate-600"}`}>
                        {group.status}
                      </span>
                    </OutputNavigationFeedback>
                  </Link>
                );
              })}
            </div>
          </nav>
          <div className="min-w-0 space-y-5 p-4">
            {activeDocumentTreeGroup ? (
              <section key={`document-tree-group-${activeDocumentTreeGroup.id}`} id={`document-tree-${activeDocumentTreeGroup.id}`} className="scroll-mt-24">
                <div className="flex flex-col gap-1 border-b border-slate-100 pb-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h3 className="text-sm font-black text-slate-950">{activeDocumentTreeGroup.title}</h3>
                  </div>
                  <span className="mt-1 w-fit rounded-full bg-slate-100 px-2 py-0.5 text-xs font-black text-slate-600">
                    {activeDocumentTreeGroup.status}
                  </span>
                </div>
                <div className="relative mt-3 grid gap-2 pl-5">
                  <span aria-hidden="true" className="absolute bottom-4 left-[7px] top-4 w-px bg-slate-200" />
                  {activeDocumentTreeGroup.items.map((item) => {
                    const itemClass = `relative block rounded-lg border px-3 py-3 transition focus-visible:outline focus-visible:outline-[length:var(--bd-focus-ring-width)] focus-visible:outline-[color:var(--bd-focus-ring-color)] focus-visible:outline-offset-[var(--bd-focus-ring-offset)] ${
                      item.selected
                        ? "border-[#002FA7] bg-blue-50 shadow-sm"
                        : item.disabled
                          ? "border-slate-200 bg-slate-50 text-slate-500"
                          : "border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40"
                    }`;
                    const markerClass = `absolute -left-[18px] top-5 h-3 w-3 rounded-full border-2 ${
                      item.selected ? "border-[#002FA7] bg-[#002FA7]" : item.disabled ? "border-slate-300 bg-white" : "border-blue-200 bg-white"
                    }`;
                    const statusClass = item.disabled
                      ? "bg-slate-100 text-slate-500"
                      : item.status === documentTreeCopy.officialSource || item.status === documentTreeCopy.readyToPreview
                        ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
                        : item.status.includes(documentTreeCopy.needsInput)
                          ? "bg-rose-50 text-rose-700 ring-1 ring-rose-100"
                          : "bg-blue-50 text-[#002FA7] ring-1 ring-blue-100";
                    const itemBody = (
                      <>
                        <span aria-hidden="true" className={markerClass} />
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-[1_1_12rem]">
                            <p className="break-words text-sm font-black leading-5 text-slate-950 [overflow-wrap:anywhere]">{item.label}</p>
                            {item.description ? (
                              <p className="mt-1 break-words text-xs font-semibold leading-5 text-slate-500 [overflow-wrap:anywhere]">{item.description}</p>
                            ) : null}
                          </div>
                          <span className="flex max-w-full flex-col items-end gap-1.5 sm:items-start">
                            <span className={`max-w-full break-words rounded-full px-2 py-0.5 text-xs font-black leading-4 [overflow-wrap:anywhere] ${statusClass}`}>
                              {item.status}
                            </span>
                            {item.external ? (
                              <span className="inline-flex items-center gap-1 break-words text-xs font-semibold leading-4 text-slate-600 [overflow-wrap:anywhere]">
                                {documentTreeCopy.externalHint}
                                <span aria-hidden="true" className="material-symbols-outlined text-[16px]">open_in_new</span>
                              </span>
                            ) : null}
                          </span>
                        </div>
                      </>
                    );
                    return item.href && !item.disabled && item.external ? (
                      <a key={item.id} href={item.href} target="_blank" rel="noreferrer" className={itemClass}>
                        {itemBody}
                      </a>
                    ) : item.href && !item.disabled ? (
                      <Link key={item.id} href={item.href} className={itemClass} aria-current={item.selected ? "page" : undefined}>
                        <OutputNavigationFeedback pendingLabel={locale === "zh" ? "正在打开文书" : locale === "ko" ? "문서를 여는 중" : "文書を開いています"}>
                          {itemBody}
                        </OutputNavigationFeedback>
                      </Link>
                    ) : (
                      <div key={item.id} className={itemClass} aria-disabled="true">
                        {itemBody}
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : null}
          </div>
            </div>
          </section>
        )}
        detail={(
          <div className="space-y-6">
            {!isGuaranteeDocumentSelected ? (
              <StateSurface
                tone="empty"
                title={copy.chooseTaskTitle}
                description={copy.chooseTaskDescription}
              />
            ) : null}

      {isGuaranteeDocumentSelected && !hasInstalledGuaranteeTemplates ? (
        <StateSurface
          tone="empty"
          title={documentTreeCopy.templateRequired}
          description={copy.guaranteeLibraryRequired}
          action={(
            <Link href="/templates" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded bg-slate-950 px-4 py-2 text-sm font-black text-white hover:bg-slate-800 focus-visible:outline focus-visible:outline-[length:var(--bd-focus-ring-width)] focus-visible:outline-[color:var(--bd-focus-ring-color)] focus-visible:outline-offset-[var(--bd-focus-ring-offset)]">
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">library_books</span>
              {copy.guaranteeLibraryAction}
            </Link>
          )}
        />
      ) : null}

      {shouldShowGuaranteeFlow ? (
      <section className="rounded border border-slate-300 bg-white p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-black text-[#002FA7]">{copy.guaranteeCase}</p>
            <h2 className="mt-1 break-words text-xl font-black leading-7 text-slate-950 [overflow-wrap:anywhere]">
              {selectedCase?.caseTitle ?? (hasAvailableCases ? copy.guaranteeSelectCaseFirst : copy.guaranteeNoCase)}
            </h2>
            {selectedCase ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className={`rounded border px-2 py-1 text-xs font-black ${
                selectedGuaranteeMissingCount > 0 ? "border-red-700 bg-red-50 text-red-700" : "border-emerald-700 bg-emerald-700 text-white"
              }`}>
                {selectedGuaranteeMissingCount > 0 ? `${copy.guaranteeMissing}: ${selectedGuaranteeMissingCount}` : copy.guaranteeReady}
              </span>
              </div>
            ) : null}
          </div>
          <div className="grid gap-2 lg:min-w-[13rem]">
            {selectedCase ? (
              <Link href={outputNextHref} className="inline-flex items-center justify-center gap-2 rounded bg-slate-950 px-4 py-3 text-sm font-black text-white hover:bg-slate-800 focus-visible:outline focus-visible:outline-[length:var(--bd-focus-ring-width)] focus-visible:outline-[color:var(--bd-focus-ring-color)] focus-visible:outline-offset-[var(--bd-focus-ring-offset)]">
                <span className="material-symbols-outlined text-[18px]">{outputNextIcon}</span>
                {outputNextLabel}
              </Link>
            ) : null}
            {selectedGuaranteeCanDownload ? (
              <Link href={selectedGuaranteeDownloadHref} className="inline-flex items-center justify-center gap-2 rounded border border-slate-300 bg-white px-4 py-2 text-sm font-black text-slate-900 hover:bg-slate-50 focus-visible:outline focus-visible:outline-[length:var(--bd-focus-ring-width)] focus-visible:outline-[color:var(--bd-focus-ring-color)] focus-visible:outline-offset-[var(--bd-focus-ring-offset)]">
                <span className="material-symbols-outlined text-[18px]">download</span>
                {copy.download}
              </Link>
            ) : null}
          </div>
        </div>
      </section>
      ) : null}

      {shouldShowGuaranteeFlow && !selectedCase ? (
        <section id="guarantee-case-selector" className="scroll-mt-24 rounded border border-[#002FA7] bg-white">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-base font-black text-slate-950">{copy.guaranteeSelectCaseFirst}</h2>
            <p className="mt-1 text-sm font-semibold text-slate-600">{copy.guaranteeCase}</p>
          </div>
          {hasAvailableCases ? (
            <div className="grid gap-3 p-4 xl:grid-cols-2 2xl:grid-cols-3">
              {caseSelectorCards.map(({ caseItem, missingCount }) => (
                <Link
                  key={caseItem.id}
                  href={`/output-center?caseId=${encodeURIComponent(caseItem.id)}&guaranteeTemplate=${encodeURIComponent(selectedGuaranteeTemplate.id)}`}
                  className="min-h-32 rounded border border-slate-200 bg-white p-4 hover:border-[#002FA7] hover:bg-slate-50 focus-visible:outline focus-visible:outline-[length:var(--bd-focus-ring-width)] focus-visible:outline-[color:var(--bd-focus-ring-color)] focus-visible:outline-offset-[var(--bd-focus-ring-offset)]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <span className="min-w-0 flex-[1_1_12rem] break-words text-xs font-black leading-5 text-[#002FA7] [overflow-wrap:anywhere]">
                      {copy.caseCardUpdated}: {formatDate(caseItem.updatedAt, locale)}
                    </span>
                    <span className={`max-w-full break-words rounded-full px-2 py-0.5 text-xs font-black leading-4 [overflow-wrap:anywhere] ${
                      missingCount > 0 ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-800"
                    }`}>
                      {missingCount > 0 ? `${copy.caseMissingItems}: ${missingCount}` : copy.caseReadyForPreview}
                    </span>
                  </div>
                  <span className="mt-2 block break-words text-base font-black leading-6 text-slate-950 [overflow-wrap:anywhere]">{caseItem.caseTitle}</span>
                  <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-slate-600">
                    <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                    {copy.chooseThisCase}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <StateSurface
              tone="empty"
              title={copy.guaranteeNoCase}
              description={copy.guaranteeSelectCaseFirst}
              action={(
                <Link href={outputNextHref} className="inline-flex min-h-11 items-center justify-center rounded bg-slate-950 px-4 py-2 text-sm font-black text-white hover:bg-slate-800 focus-visible:outline focus-visible:outline-[length:var(--bd-focus-ring-width)] focus-visible:outline-[color:var(--bd-focus-ring-color)] focus-visible:outline-offset-[var(--bd-focus-ring-offset)]">
                  {copy.guaranteeCreateCase}
                </Link>
              )}
            />
          )}
        </section>
      ) : null}

      {shouldShowGuaranteeFlow && selectedCase ? (
      <section className="rounded border border-slate-300 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-lg font-black text-slate-950">{copy.selectTemplate}</h2>
        </div>
        <GuaranteeTemplateSelector
          caseId={selectedCase.id}
          initialTemplateId={selectedGuaranteeTemplate.id}
          templates={guaranteeTemplateCards.map((card) => ({
            id: card.template.id,
            companyDisplayName: card.template.companyDisplayName,
            companyLegalName: card.template.companyLegalName,
            missingCount: card.missingCount,
          }))}
          labels={{
            preview: copy.previewMode,
            loading: locale === "zh" ? "正在加载预览" : locale === "ko" ? "미리보기를 불러오는 중" : "プレビューを読み込んでいます",
            failed: locale === "zh" ? "PDF 预览加载失败，请刷新后重试。" : locale === "ko" ? "PDF 미리보기를 불러오지 못했습니다. 새로고침 후 다시 시도하세요." : "PDFプレビューの読み込みに失敗しました。更新して再試行してください。",
            retry: locale === "zh" ? "刷新预览" : locale === "ko" ? "미리보기 새로고침" : "プレビューを更新",
            ready: copy.guaranteeReady,
            missing: copy.guaranteeMissing,
          }}
        />
      </section>
      ) : null}

      {shouldShowGuaranteeFlow && selectedCase ? (
      <section className={`rounded border bg-white p-4 ${selectedGuaranteeMissingCount > 0 ? "border-red-300 border-l-4 border-l-red-700" : "border-emerald-300 border-l-4 border-l-emerald-700"}`}>
        <h3 className={`flex items-center gap-2 text-base font-black ${selectedGuaranteeMissingCount > 0 ? "text-red-700" : "text-emerald-700"}`}>
          <span className="material-symbols-outlined text-[20px]">{selectedGuaranteeMissingCount > 0 ? "warning" : "check_circle"}</span>
          {copy.guaranteeChecklist}
        </h3>
        <div className="mt-3 space-y-2">
          {guaranteeBlockingFields.length > 0 ? (
            guaranteeBlockingFields.slice(0, 5).map((field) => (
              <Link
                key={`primary-missing-${field.fieldKey}`}
                href={
                  isOutputSpecificGuaranteeField(field.fieldKey)
                    ? previewHrefForGuaranteeField({ caseId: selectedCase.id, templateId: selectedGuaranteeTemplate.id, fieldKey: field.fieldKey })
                    : caseWorkbenchHrefForGuaranteeField({ caseId: selectedCase.id, templateId: selectedGuaranteeTemplate.id, fieldKey: field.fieldKey })
                }
                className="flex items-center gap-2 text-sm text-slate-800 hover:text-[#1960a3] hover:underline focus-visible:outline focus-visible:outline-[length:var(--bd-focus-ring-width)] focus-visible:outline-[color:var(--bd-focus-ring-color)] focus-visible:outline-offset-[var(--bd-focus-ring-offset)]"
              >
                <span className="material-symbols-outlined text-[16px] text-red-700">error</span>
                {field.label}
              </Link>
            ))
          ) : selectedGuaranteeDraftMissingFields.length > 0 ? (
            selectedGuaranteeDraftMissingFields.slice(0, 5).map((field) => (
              <Link
                key={`primary-draft-missing-${field.fieldKey}`}
                href={selectedCaseDraftHref}
                className="flex items-center gap-2 text-sm text-slate-800 hover:text-[#1960a3] hover:underline focus-visible:outline focus-visible:outline-[length:var(--bd-focus-ring-width)] focus-visible:outline-[color:var(--bd-focus-ring-color)] focus-visible:outline-offset-[var(--bd-focus-ring-offset)]"
              >
                <span className="material-symbols-outlined text-[16px] text-red-700">edit_note</span>
                {field.label}
              </Link>
            ))
          ) : (
            <p className="text-sm font-semibold text-emerald-800">{copy.guaranteeReady}</p>
          )}
        </div>
      </section>
      ) : null}

      {shouldShowGuaranteeFlow && selectedCase ? (
      <section className="rounded border border-slate-300 bg-white p-4">
        <details className="group">
          <summary className="inline-flex min-h-11 w-full cursor-pointer items-center gap-2 rounded px-3 py-2 text-sm font-bold leading-5 text-slate-900 [overflow-wrap:anywhere] focus-visible:outline focus-visible:outline-[length:var(--bd-focus-ring-width)] focus-visible:outline-[color:var(--bd-focus-ring-color)] focus-visible:outline-offset-[var(--bd-focus-ring-offset)]">
            <span aria-hidden="true" className="material-symbols-outlined text-[18px] transition-transform group-open:rotate-180 motion-reduce:transition-none">expand_more</span>
            <span className="min-w-0 break-words">{copy.guaranteeDetailToggle}</span>
          </summary>
        <div className="mt-4 min-w-0 space-y-4">
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
                          className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-white px-2 py-1 text-[11px] font-bold text-emerald-800 hover:bg-emerald-50 focus-visible:outline focus-visible:outline-[length:var(--bd-focus-ring-width)] focus-visible:outline-[color:var(--bd-focus-ring-color)] focus-visible:outline-offset-[var(--bd-focus-ring-offset)]"
                        >
                          <span className="material-symbols-outlined text-[14px]">edit_note</span>
                          {copy.guaranteeFillInDraft}
                        </Link>
                      ) : null}
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${selectedGuaranteeDraftReadiness.status === "ready" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
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
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${readinessClass(field.status)}`}>
                          {field.status === "available" ? copy.guaranteeReady : copy.guaranteeMissing}
                        </span>
                      </div>
                      <p className="mt-2 min-h-5 whitespace-pre-wrap text-xs font-medium text-slate-700">{field.value || "-"}</p>
                      {field.status !== "available" ? (
                        <Link
                          href={selectedCaseDraftHref}
                          className="mt-3 inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-white px-2 py-1 text-[11px] font-bold text-emerald-800 hover:bg-emerald-50 focus-visible:outline focus-visible:outline-[length:var(--bd-focus-ring-width)] focus-visible:outline-[color:var(--bd-focus-ring-color)] focus-visible:outline-offset-[var(--bd-focus-ring-offset)]"
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
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
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
                              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${readinessClass(field.status)}`}>
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
                                className="mt-3 inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-white px-2 py-1 text-[11px] font-bold text-indigo-800 hover:bg-indigo-50 focus-visible:outline focus-visible:outline-[length:var(--bd-focus-ring-width)] focus-visible:outline-[color:var(--bd-focus-ring-color)] focus-visible:outline-offset-[var(--bd-focus-ring-offset)]"
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
        </details>
      </section>
      ) : null}

          </div>
        )}
      />

      {shouldShowLegacyOutputFlow ? (
      <section id={legacySectionId} className="grid gap-8 2xl:grid-cols-12">
        <div className="space-y-7 2xl:col-span-4">
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
                      {writableQuotes.map((quote) => (
                        <option key={quote.id} value={quote.id}>
                          {quoteOptionLabel(quote)}
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
            </div>
            <form action="/output-center" method="get" className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-6">
              <input type="hidden" name="docGroup" value={selectedLegacyDocumentGroup} />
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
                href={outputSelectionBaseHref}
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

        <div className="2xl:col-span-8">
          <article className="flex min-h-[70vh] flex-col rounded-xl bg-[#dce9ff] p-3 sm:p-4">
            <div className="flex flex-1 flex-col overflow-hidden rounded-lg bg-white shadow-inner">
              <div className="flex items-center justify-between border-b border-slate-100 px-6 py-3">
                <div className="flex items-center gap-4">
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-400">{copy.previewMode}</span>
                  <div className="h-4 w-px bg-slate-200" />
                  <div className="flex items-center gap-2">
                    <Link href={`${returnToCurrent}&zoom=75`} className="rounded p-1 text-slate-500 hover:bg-slate-100">
                      <span className="material-symbols-outlined text-[18px]">zoom_out</span>
                    </Link>
                    <span className="text-[11px] font-bold tabular-nums">{selectedZoom}%</span>
                    <Link href={`${returnToCurrent}&zoom=100`} className="rounded p-1 text-slate-500 hover:bg-slate-100">
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

              <div className="flex flex-1 overflow-auto bg-slate-100 p-4 sm:p-6 lg:p-10">
                <div className="mx-auto min-w-[520px] shrink-0">
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
            </div>
          </article>
        </div>
      </section>
      ) : null}
    </PageFrame>
  );
}
