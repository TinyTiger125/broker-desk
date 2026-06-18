import Link from "next/link";
import {
  autoMapImportJobAction,
  createImportJobAction,
  executePropertyImportAction,
  registerAttachmentAction,
  retryImportJobAction,
  resolveImportValidationAction,
  updateImportJobMappingAction,
  uploadAndParseIdentityDocumentAction,
  uploadAndParseExcelAction,
} from "@/app/actions";
import { FormDraftAssist } from "@/components/form-draft-assist";
import { InputExtractionReview } from "@/components/input-extraction-review";
import { PageFlashBanner } from "@/components/page-flash-banner";
import { listBrokerageCases } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { InputFileExtractionResult } from "@/lib/input-file-extractor";
import { buildRawExtractionCaseData, evaluateCaseMergeCandidates } from "@/lib/case-merge";
import {
  parseImportValidationPayload,
  type ImportValidationIssueAction,
  type ImportValidationIssueLevel,
} from "@/lib/import-mapping";
import { getLocale, type Locale } from "@/lib/locale";
import { listHubAttachments, listHubImportJobs, type HubImportJobItem } from "@/lib/hub";
import { requireTenantSession } from "@/lib/tenant-session";

export const dynamic = "force-dynamic";

const mappingPlaceholders = {
  properties: "name,address,area,listing_price",
  parties: "name,phone,email,party_type",
  contracts: "contract_number,contract_type,property_id,party_id,signed_at",
  service_requests: "title,property_id,party_id,occurred_at,status",
} as const;

const targetFieldOptions: Record<string, string[]> = {
  properties: ["name", "address", "area", "listing_price"],
  parties: ["name", "phone", "email", "party_type"],
  contracts: ["contract_number", "contract_type", "property_id", "party_id", "signed_at"],
  service_requests: ["title", "property_id", "party_id", "occurred_at", "status"],
};

const sourceColumnExamplesByLocale: Record<
  Locale,
  {
    properties: string;
    parties: string;
    contracts: string;
    service_requests: string;
  }
> = {
  ja: {
    properties: "物件名,所在地,エリア,価格,管理費,修繕積立金",
    parties: "氏名,電話番号,メール,関係者種別,役割,備考",
    contracts: "契約番号,契約種別,物件ID,関係者ID,署名日,状態",
    service_requests: "件名,物件ID,関係者ID,内容,発生日,状態,費用",
  },
  zh: {
    properties: "物件名称,地址,区域,价格,管理费,修缮基金",
    parties: "主体名称,电话号码,邮箱,主体类型,角色,备注",
    contracts: "合同编号,合同类型,物件ID,主体ID,签署日期,状态",
    service_requests: "标题,物件ID,主体ID,内容,发生日期,状态,费用",
  },
  ko: {
    properties: "매물명,소재지,지역,가격,관리비,수선적립금",
    parties: "관계자명,전화번호,이메일,관계자유형,역할,비고",
    contracts: "계약번호,계약유형,매물ID,관계자ID,서명일,상태",
    service_requests: "제목,매물ID,관계자ID,내용,발생일,상태,비용",
  },
};

function getCopy(locale: Locale) {
  const copyByLocale = {
    ja: {
      pageTitle: "資料を入れる",
      pageDesc: "保証会社申込書に使う資料をアップロードします。確認できた内容は情報整理へ送り、足りない項目だけ補完します。",
      cardExcelTitle: "Excel 一括取込",
      cardExcelSubtitle: "物件台帳化を優先",
      cardPdfTitle: "PDF / スキャン登録",
      cardPdfSubtitle: "旧契約・書面を保管",
      cardManualTitle: "手入力取込",
      cardManualSubtitle: "不足情報の補完",
      labelJobName: "ジョブ名",
      labelMemo: "メモ（任意）",
      btnCreateExcelJob: "Excel取込ジョブを作成",
      btnCreatePdfJob: "PDF取込ジョブを作成",
      btnCreateManualJob: "手入力ジョブを作成",
      phExcelJob: "例: 物件台帳_2026Q2.xlsx",
      phPdfJob: "例: 旧契約書一括取込（10件）",
      phManualJob: "例: 修繕履歴_管理物件A",
      phMemoExcel: "例: 31件、ヘッダ確認済",
      phMemoPdf: "例: 契約種別確認待ち",
      phMemoManual: "例: 先に発生日だけ入力",
      historyTitle: "取込ジョブ履歴",
      historySubtitle: "最新順",
      colJob: "ジョブ",
      colSource: "入力種別",
      colTarget: "対象",
      colCreatedAt: "作成日",
      colStatus: "状態",
      wizardTitle: "資料整理アシスト",
      wizardSubtitle: "自動整理 + 目視確認",
      stepSelect: "選択",
      stepMap: "整理確認",
      stepValidate: "検証",
      stepComplete: "完了",
      schemaMappingTitle: "手順 2: 読み取った列を確認",
      schemaMappingDesc: "資料の列を、案件で使う項目として保存する前に確認します。",
      saveDraft: "途中保存",
      continueValidation: "検証へ進む",
      sourceColumn: "資料の列",
      targetField: "保存先の項目",
      autoMapCol: "自動候補",
      sampleValue: "プレビュー値",
      unmapped: "-- 未設定 --",
      recentImportHistory: "最近の取込履歴",
      viewArchive: "アーカイブ表示",
      readinessTitle: "取込準備度",
      issueStatsTitle: "問題コード集計",
      issueStatsDesc: "直近ジョブの検証結果をコード単位で集計",
      issueTrendTitle: "問題コード推移（7日）",
      issueTrendDesc: "日別の検証件数（Critical / Warning / Info）",
      mapped: "整理済",
      alerts: "アラート",
      validationLog: "検証ログ",
      noFurtherAlerts: "追加アラートはありません",
      validationUnmappedRequired: "必須項目の保存先が未設定",
      validationFormatMismatch: "データ形式の不一致",
      validationSchemaSuggestion: "保存先候補の提案",
      validationUnmappedMsg: "案件に保存する必須項目がまだ選ばれていません。",
      validationFormatMsg: "取込元データに形式の揺れがあります。",
      validationSchemaMsg: "信頼度の高い保存先候補があります。",
      actionResolveNow: "今すぐ修正",
      actionAutoFix: "自動補正",
      actionApplyMapping: "候補を使う",
      exportValidationReport: "検証レポートを出力",
      proTipTitle: "操作ヒント",
      proTipDesc:
        "自動候補はそのまま使えます。違う行だけ保存先を直してから確認へ進んでください。",
      noJobs: "先に取込ジョブを1件作成してください。",
      wizardStep1: "1. 保存先候補を作成",
      wizardStep2: "2. 違うところだけ直す",
      labelTargetJob: "対象ジョブ",
      labelTargetEntity: "保存先",
      labelSourceColumns: "資料の列（カンマ区切り）",
      labelTargetFields: "保存先の項目（カンマ区切り）",
      btnAutoMap: "標準ルールで候補作成",
      btnSaveMap: "確認して保存",
      phSourceCols: "例: 物件名,所在地,エリア,価格",
      phMapMemo: "例: 保存先候補の初回生成",
      phSaveMemo: "例: 価格列は税抜",
      fieldDefTitle: "保存先項目",
      fieldDefSubtitle: "申込書に必要な項目を優先して確認",
      attachmentTitle: "添付登録",
      attachmentSubtitle: "実ファイル保存対応",
      labelAttachmentTargetType: "対象種別",
      labelAttachmentTargetId: "対象ID",
      labelUpload: "ファイルアップロード（推奨）",
      labelFileName: "ファイル名（任意）",
      labelExternalUrl: "外部保存先URL（任意）",
      labelMime: "MIME（任意）",
      labelFileSize: "サイズ(Bytes・任意)",
      btnRegisterAttachment: "添付を登録",
      attachmentHint: "直接アップロードまたは外部保存先URLのいずれかを指定してください（後続でS3/Supabase連携へ拡張可能）。",
      phTargetId: "例: import_002 / prop_shibuya",
      phFileName: "アップロードしない場合のみ入力",
      phExternalUrl: "例: https://storage.example.com/docs/a.pdf",
      phMime: "例: application/pdf",
      latestAttachmentTitle: "最新添付履歴",
      latestAttachmentSubtitle: "最新30件",
      noAttachments: "添付はまだありません。",
      typeUnset: "type未設定",
      uploadDatePrefix: "登録日",
      openStorage: "保存ファイルを開く",
      optionImportJob: "取込ジョブ",
      optionProperty: "物件",
      optionContract: "契約",
      optionServiceRequest: "対応依頼",
      optionQuote: "提案",
      optionParty: "関係者",
    },
    zh: {
      pageTitle: "上传资料",
      pageDesc: "上传保证会社申请书所需资料。可确认的内容会进入信息整理页，只补齐缺失项。",
      cardExcelTitle: "Excel 批量导入",
      cardExcelSubtitle: "优先整理物件台账",
      cardPdfTitle: "PDF / 扫描登记",
      cardPdfSubtitle: "归档旧合同与文件",
      cardManualTitle: "手动导入",
      cardManualSubtitle: "补齐缺失信息",
      labelJobName: "任务名称",
      labelMemo: "备注（可选）",
      btnCreateExcelJob: "创建 Excel 导入任务",
      btnCreatePdfJob: "创建 PDF 导入任务",
      btnCreateManualJob: "创建手动导入任务",
      phExcelJob: "例：物件台账_2026Q2.xlsx",
      phPdfJob: "例：旧合同批量导入（10条）",
      phManualJob: "例：维修履历_管理物件A",
      phMemoExcel: "例：31条，表头已确认",
      phMemoPdf: "例：待确认合同类型",
      phMemoManual: "例：先录入发生日期",
      historyTitle: "导入任务历史",
      historySubtitle: "按最新排序",
      colJob: "任务",
      colSource: "来源类型",
      colTarget: "目标",
      colCreatedAt: "创建日期",
      colStatus: "状态",
      wizardTitle: "资料整理助手",
      wizardSubtitle: "自动整理 + 人工确认",
      stepSelect: "选择",
      stepMap: "整理确认",
      stepValidate: "校验",
      stepComplete: "完成",
      schemaMappingTitle: "步骤 2：确认读取到的列",
      schemaMappingDesc: "把资料里的列确认成案件会使用的保存项目。",
      saveDraft: "暂存",
      continueValidation: "进入校验",
      sourceColumn: "资料列",
      targetField: "保存项目",
      autoMapCol: "自动候选",
      sampleValue: "预览值",
      unmapped: "-- 未设置 --",
      recentImportHistory: "最近导入历史",
      viewArchive: "查看归档",
      readinessTitle: "导入就绪度",
      issueStatsTitle: "问题码聚合",
      issueStatsDesc: "按问题码统计最近任务的校验结果",
      issueTrendTitle: "问题码趋势（7天）",
      issueTrendDesc: "按天统计校验条目（Critical / Warning / Info）",
      mapped: "已整理",
      alerts: "告警",
      validationLog: "校验日志",
      noFurtherAlerts: "暂无更多告警",
      validationUnmappedRequired: "必填项还没有保存位置",
      validationFormatMismatch: "数据格式不一致",
      validationSchemaSuggestion: "保存项目建议",
      validationUnmappedMsg: "案件必填项还没有选择保存位置。",
      validationFormatMsg: "源数据包含格式不一致内容。",
      validationSchemaMsg: "检测到高可信保存项目候选。",
      actionResolveNow: "立即处理",
      actionAutoFix: "自动修复",
      actionApplyMapping: "使用候选",
      exportValidationReport: "导出校验报告",
      proTipTitle: "操作提示",
      proTipDesc: "自动候选可直接使用，只需要修正不对的行再进入确认。",
      noJobs: "请先创建至少 1 个导入任务。",
      wizardStep1: "1. 生成保存项目候选",
      wizardStep2: "2. 只修正不对的地方",
      labelTargetJob: "目标任务",
      labelTargetEntity: "保存到",
      labelSourceColumns: "资料列（逗号分隔）",
      labelTargetFields: "保存项目（逗号分隔）",
      btnAutoMap: "按标准规则生成候选",
      btnSaveMap: "确认并保存",
      phSourceCols: "例：物件名称,地址,区域,价格",
      phMapMemo: "例：首次生成保存项目候选",
      phSaveMemo: "例：价格列为不含税",
      fieldDefTitle: "可保存项目",
      fieldDefSubtitle: "优先确认申请书需要的项目",
      attachmentTitle: "附件登记",
      attachmentSubtitle: "支持实际文件保存",
      labelAttachmentTargetType: "目标类型",
      labelAttachmentTargetId: "目标ID",
      labelUpload: "上传文件（推荐）",
      labelFileName: "文件名（可选）",
      labelExternalUrl: "外部存储URL（可选）",
      labelMime: "MIME（可选）",
      labelFileSize: "大小（Bytes，可选）",
      btnRegisterAttachment: "登记附件",
      attachmentHint: "请在“直接上传”与“外部存储 URL”中二选一（后续可扩展 S3 / Supabase）。",
      phTargetId: "例：import_002 / prop_shibuya",
      phFileName: "仅在不上传时填写",
      phExternalUrl: "例：https://storage.example.com/docs/a.pdf",
      phMime: "例：application/pdf",
      latestAttachmentTitle: "最近附件记录",
      latestAttachmentSubtitle: "最近30条",
      noAttachments: "暂无附件记录。",
      typeUnset: "类型未设置",
      uploadDatePrefix: "登记日",
      openStorage: "打开已保存文件",
      optionImportJob: "导入任务",
      optionProperty: "物件",
      optionContract: "合同",
      optionServiceRequest: "服务请求",
      optionQuote: "提案",
      optionParty: "主体",
    },
    ko: {
      pageTitle: "자료를 넣기",
      pageDesc: "보증회사 신청서에 쓸 자료를 업로드합니다. 확인 가능한 내용은 정보 정리 화면으로 보내고 부족 항목만 보완합니다.",
      cardExcelTitle: "Excel 일괄 가져오기",
      cardExcelSubtitle: "매물 대장 구조화 우선",
      cardPdfTitle: "PDF / 스캔 등록",
      cardPdfSubtitle: "구 계약/문서 보관",
      cardManualTitle: "수기 가져오기",
      cardManualSubtitle: "누락 정보 보완",
      labelJobName: "작업명",
      labelMemo: "메모(선택)",
      btnCreateExcelJob: "Excel 가져오기 작업 생성",
      btnCreatePdfJob: "PDF 가져오기 작업 생성",
      btnCreateManualJob: "수기 작업 생성",
      phExcelJob: "예: 매물대장_2026Q2.xlsx",
      phPdfJob: "예: 구 계약서 일괄 가져오기(10건)",
      phManualJob: "예: 수선 이력_관리매물A",
      phMemoExcel: "예: 31건, 헤더 확인 완료",
      phMemoPdf: "예: 계약 유형 확인 대기",
      phMemoManual: "예: 먼저 발생일만 입력",
      historyTitle: "가져오기 작업 이력",
      historySubtitle: "최신순",
      colJob: "작업",
      colSource: "입력 유형",
      colTarget: "대상",
      colCreatedAt: "생성일",
      colStatus: "상태",
      wizardTitle: "자료 정리 도우미",
      wizardSubtitle: "자동 정리 + 육안 확인",
      stepSelect: "선택",
      stepMap: "정리 확인",
      stepValidate: "검증",
      stepComplete: "완료",
      schemaMappingTitle: "2단계: 읽은 열 확인",
      schemaMappingDesc: "자료의 열을 안건에서 사용할 저장 항목으로 확인합니다.",
      saveDraft: "임시 저장",
      continueValidation: "검증으로 이동",
      sourceColumn: "자료 열",
      targetField: "저장 항목",
      autoMapCol: "자동 후보",
      sampleValue: "미리보기 값",
      unmapped: "-- 미설정 --",
      recentImportHistory: "최근 가져오기 이력",
      viewArchive: "보관 이력 보기",
      readinessTitle: "가져오기 준비도",
      issueStatsTitle: "문제 코드 집계",
      issueStatsDesc: "최근 작업의 검증 결과를 코드별로 집계",
      issueTrendTitle: "문제 코드 추이 (7일)",
      issueTrendDesc: "일자별 검증 건수 (Critical / Warning / Info)",
      mapped: "정리됨",
      alerts: "알림",
      validationLog: "검증 로그",
      noFurtherAlerts: "추가 알림이 없습니다",
      validationUnmappedRequired: "필수 항목의 저장 위치 미설정",
      validationFormatMismatch: "데이터 형식 불일치",
      validationSchemaSuggestion: "저장 항목 후보 제안",
      validationUnmappedMsg: "안건 필수 항목의 저장 위치가 아직 선택되지 않았습니다.",
      validationFormatMsg: "원본 데이터 형식이 일치하지 않습니다.",
      validationSchemaMsg: "신뢰도 높은 저장 항목 후보가 있습니다.",
      actionResolveNow: "지금 수정",
      actionAutoFix: "자동 보정",
      actionApplyMapping: "후보 사용",
      exportValidationReport: "검증 리포트 내보내기",
      proTipTitle: "사용 팁",
      proTipDesc: "자동 후보는 그대로 사용할 수 있습니다. 다른 행만 저장 항목을 고친 뒤 확인으로 진행하세요.",
      noJobs: "먼저 가져오기 작업을 1건 이상 생성하세요.",
      wizardStep1: "1. 저장 항목 후보 생성",
      wizardStep2: "2. 다른 곳만 수정",
      labelTargetJob: "대상 작업",
      labelTargetEntity: "저장 위치",
      labelSourceColumns: "자료 열(쉼표 구분)",
      labelTargetFields: "저장 항목(쉼표 구분)",
      btnAutoMap: "표준 규칙으로 후보 생성",
      btnSaveMap: "확인 후 저장",
      phSourceCols: "예: 매물명,소재지,지역,가격",
      phMapMemo: "예: 저장 항목 후보 초기 생성",
      phSaveMemo: "예: 가격 컬럼은 세전",
      fieldDefTitle: "저장 항목",
      fieldDefSubtitle: "신청서에 필요한 항목 우선 확인",
      attachmentTitle: "첨부 등록",
      attachmentSubtitle: "실파일 저장 지원",
      labelAttachmentTargetType: "대상 유형",
      labelAttachmentTargetId: "대상 ID",
      labelUpload: "파일 업로드(권장)",
      labelFileName: "파일명(선택)",
      labelExternalUrl: "외부 저장 URL(선택)",
      labelMime: "MIME(선택)",
      labelFileSize: "크기(Bytes, 선택)",
      btnRegisterAttachment: "첨부 등록",
      attachmentHint: "직접 업로드 또는 외부 저장 URL 중 하나를 지정하세요(추후 S3/Supabase 연동 확장 가능).",
      phTargetId: "예: import_002 / prop_shibuya",
      phFileName: "업로드하지 않을 때만 입력",
      phExternalUrl: "예: https://storage.example.com/docs/a.pdf",
      phMime: "예: application/pdf",
      latestAttachmentTitle: "최신 첨부 이력",
      latestAttachmentSubtitle: "최근 30건",
      noAttachments: "첨부가 아직 없습니다.",
      typeUnset: "유형 미설정",
      uploadDatePrefix: "등록일",
      openStorage: "저장 파일 열기",
      optionImportJob: "가져오기 작업",
      optionProperty: "매물",
      optionContract: "계약",
      optionServiceRequest: "서비스 요청",
      optionQuote: "제안",
      optionParty: "관계자",
    },
  } as const;

  return copyByLocale[locale];
}

type ExcelImportPayload = {
  kind?: "property_row_import" | "input_file_extraction";
  headers: string[];
  autoMapping: Record<string, string>;
  rows: Record<string, unknown>[];
  originalFilename: string;
  totalRows: number;
  inputExtraction?: InputFileExtractionResult;
};

type ExcelImportResult = {
  successCount: number;
  skipped: { row: number; reason: string }[];
};

type ImportCenterPageProps = {
  searchParams?: Promise<{ job?: string; flash?: string; xlsxJob?: string; advanced?: string }>;
};

function isInputFileExtractionJob(job: HubImportJobItem) {
  if (!job.notes) return false;
  try {
    const payload = JSON.parse(job.notes) as Pick<ExcelImportPayload, "kind">;
    return payload.kind === "input_file_extraction";
  } catch {
    return false;
  }
}

export default async function ImportCenterPage({ searchParams }: ImportCenterPageProps) {
  const [locale, session] = await Promise.all([
    getLocale(),
    requireTenantSession({ permission: "source.read" }),
  ]);
  const copy = getCopy(locale);
  const params = searchParams ? await searchParams : undefined;
  const showAdvanced = params?.advanced === "1";
  const user = session.user;
  const tenantId = session.tenant.id;
  const hubContext = { userId: user.id, tenantId };
  const [jobs, attachments, cases] = await Promise.all([
    listHubImportJobs(hubContext),
    listHubAttachments(locale, 30, hubContext),
    listBrokerageCases(user.id, 20, tenantId),
  ]);
  const currentCase =
    cases.find((item) => item.id === "case_fixture_friends_guarantee_pdf") ??
    cases.find((item) => item.status === "reviewed") ??
    cases[0];
  const reviewHref = currentCase ? `/cases/${currentCase.id}#workbench-unresolved` : "/output-center";
  const outputHref = currentCase ? `/output-center?caseId=${encodeURIComponent(currentCase.id)}` : "/output-center";

  const sourceLabel: Record<HubImportJobItem["sourceType"], string> = {
    excel: t(locale, "import.source.excel"),
    pdf: t(locale, "import.source.pdf"),
    scan: t(locale, "import.source.scan"),
    manual: t(locale, "import.source.manual"),
  };

  const statusLabel: Record<HubImportJobItem["status"], string> = {
    queued: t(locale, "import.status.queued"),
    mapped: t(locale, "import.status.mapped"),
    completed: t(locale, "import.status.completed"),
  };

  const targetLabel: Record<HubImportJobItem["targetEntity"], string> = {
    properties: t(locale, "import.target.properties"),
    parties: t(locale, "import.target.parties"),
    contracts: t(locale, "import.target.contracts"),
    service_requests: t(locale, "import.target.service_requests"),
  };

  const attachmentTargetOptions = [
    { value: "import_job", label: copy.optionImportJob },
    { value: "property", label: copy.optionProperty },
    { value: "contract", label: copy.optionContract },
    { value: "service_request", label: copy.optionServiceRequest },
    { value: "quote", label: copy.optionQuote },
    { value: "party", label: copy.optionParty },
  ] as const;

  const sourceColumnExamples = sourceColumnExamplesByLocale[locale];
  const focusJobId = String(params?.job ?? "").trim();
  const mappingJobs = jobs.filter((job) => !isInputFileExtractionJob(job));
  const defaultJob = mappingJobs.find((job) => job.id === focusJobId) ?? mappingJobs[0];
  const hasDefaultJob = Boolean(defaultJob);
  const defaultTarget = defaultJob?.targetEntity ?? "properties";
  const defaultSourceColumns =
    defaultJob?.mappingJson && Object.keys(defaultJob.mappingJson).length > 0
      ? Object.keys(defaultJob.mappingJson).join(",")
      : sourceColumnExamples[defaultTarget];
  const defaultTargetFields =
    defaultJob?.mappingJson && Object.values(defaultJob.mappingJson).length > 0
      ? Object.values(defaultJob.mappingJson).join(",")
      : mappingPlaceholders[defaultTarget];
  const mappedJobCount = jobs.filter((job) => job.status === "mapped").length;
  const completedJobCount = jobs.filter((job) => job.status === "completed").length;
  const previewSourceColumns = defaultSourceColumns
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 6);
  const previewTargetFields = defaultTargetFields
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 6);
  const previewRows = previewSourceColumns.map((source, index) => ({
    source,
    target: previewTargetFields[index],
  }));
  const previewValues = previewRows.map((row) => (row.target ? `${row.source} -> ${row.target}` : t(locale, "common.notSet")));
  const actionLabelByOperation: Record<ImportValidationIssueAction, string> = {
    resolve_now: copy.actionResolveNow,
    auto_fix: copy.actionAutoFix,
    apply_mapping: copy.actionApplyMapping,
    retry: locale === "zh" ? "重试任务" : locale === "ko" ? "재시도" : "再試行",
  };
  const codeTitleMap: Record<string, string> = {
    missing_required_mapping: copy.validationUnmappedRequired,
    unknown_target_fields: copy.validationFormatMismatch,
    mapping_ready: copy.validationSchemaSuggestion,
    import_zero_success: locale === "zh" ? "导入结果为 0" : locale === "ko" ? "가져오기 성공 0건" : "取込成功 0 件",
    import_row_missing_name:
      locale === "zh" ? "存在空名称行" : locale === "ko" ? "매물명 누락 행 있음" : "物件名未入力行あり",
    import_row_invalid_listing_price:
      locale === "zh" ? "价格格式异常" : locale === "ko" ? "가격 형식 오류" : "価格フィールド異常",
    import_row_unknown_error:
      locale === "zh" ? "导入处理异常" : locale === "ko" ? "가져오기 처리 오류" : "取込処理エラー",
    import_partial_completed:
      locale === "zh" ? "已部分完成导入" : locale === "ko" ? "부분 가져오기 완료" : "一部取込完了",
    import_completed:
      locale === "zh" ? "导入完成" : locale === "ko" ? "가져오기 완료" : "取込完了",
    validation_resolved:
      locale === "zh" ? "校验已处理" : locale === "ko" ? "검증 조치 완료" : "検証対応済み",
    retry_queued:
      locale === "zh" ? "已进入重试队列" : locale === "ko" ? "재시도 대기열 등록" : "再試行キュー登録済み",
  };
  const validationItems: Array<{
    id: string;
    jobId: string;
    level: ImportValidationIssueLevel;
    title: string;
    message: string;
    operation: ImportValidationIssueAction;
    actionLabel: string;
  }> = jobs
    .filter((job) => Boolean(job.validationMessage) || job.status !== "completed")
    .flatMap((job) => {
      const payload = parseImportValidationPayload(job.validationMessage);
      if (!payload || payload.issues.length === 0) {
        return [
          {
            id: `${job.id}-fallback`,
            jobId: job.id,
            level: job.status === "queued" ? ("critical" as const) : ("warning" as const),
            title: job.status === "queued" ? copy.validationUnmappedRequired : copy.validationFormatMismatch,
            message: job.validationMessage ?? copy.validationSchemaMsg,
            operation: (job.status === "queued" ? "resolve_now" : "auto_fix") as ImportValidationIssueAction,
            actionLabel: job.status === "queued" ? copy.actionResolveNow : copy.actionAutoFix,
          },
        ];
      }
      return payload.issues.map((issue, issueIndex) => {
        const suffix = typeof issue.count === "number" ? ` (${issue.count})` : "";
        return {
          id: `${job.id}-${issue.code}-${issueIndex}`,
          jobId: job.id,
          level: issue.level,
          title: `${codeTitleMap[issue.code] ?? copy.validationSchemaSuggestion}${suffix}`,
          message: issue.message || payload.summary,
          operation: issue.action,
          actionLabel: actionLabelByOperation[issue.action] ?? copy.actionResolveNow,
        };
      });
    })
    .slice(0, 8);
  const issueCodeStats = (() => {
    const map = new Map<string, { code: string; label: string; total: number; critical: number; warning: number; info: number }>();
    jobs.forEach((job) => {
      const payload = parseImportValidationPayload(job.validationMessage);
      if (!payload) return;
      payload.issues.forEach((issue) => {
        const existing = map.get(issue.code) ?? {
          code: issue.code,
          label: codeTitleMap[issue.code] ?? issue.code,
          total: 0,
          critical: 0,
          warning: 0,
          info: 0,
        };
        const count = typeof issue.count === "number" && issue.count > 0 ? issue.count : 1;
        existing.total += count;
        if (issue.level === "critical") existing.critical += count;
        if (issue.level === "warning") existing.warning += count;
        if (issue.level === "info") existing.info += count;
        map.set(issue.code, existing);
      });
    });
    return [...map.values()]
      .sort((a, b) => {
        const scoreA = a.critical * 10000 + a.warning * 100 + a.total;
        const scoreB = b.critical * 10000 + b.warning * 100 + b.total;
        return scoreB - scoreA;
      })
      .slice(0, 5);
  })();
  const issueTrendDays = (() => {
    const today = new Date();
    const dayList = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(today);
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - (6 - index));
      const key = date.toISOString().slice(0, 10);
      return {
        key,
        label: new Intl.DateTimeFormat(
          locale === "zh" ? "zh-CN" : locale === "ko" ? "ko-KR" : "ja-JP",
          { month: "numeric", day: "numeric" }
        ).format(date),
        critical: 0,
        warning: 0,
        info: 0,
        total: 0,
      };
    });
    const byDay = new Map(dayList.map((item) => [item.key, item]));
    jobs.forEach((job) => {
      const payload = parseImportValidationPayload(job.validationMessage);
      if (!payload) return;
      const rawDate = payload.updatedAt || job.createdAt.toISOString();
      const date = new Date(rawDate);
      if (Number.isNaN(date.getTime())) return;
      const key = date.toISOString().slice(0, 10);
      const bucket = byDay.get(key);
      if (!bucket) return;
      payload.issues.forEach((issue) => {
        const count = typeof issue.count === "number" && issue.count > 0 ? issue.count : 1;
        bucket.total += count;
        if (issue.level === "critical") bucket.critical += count;
        if (issue.level === "warning") bucket.warning += count;
        if (issue.level === "info") bucket.info += count;
      });
    });
    return dayList;
  })();
  const maxIssueTrendTotal = Math.max(1, ...issueTrendDays.map((item) => item.total));
  const flashMap = {
    excel_imported: {
      ja: "物件を取り込みました。",
      zh: "物件已导入。",
      ko: "매물을 가져왔습니다.",
    },
    import_job_created: {
      ja: "取込ジョブを作成しました。",
      zh: "导入任务已创建。",
      ko: "가져오기 작업을 생성했습니다.",
    },
    import_mapping_saved: {
      ja: "資料の保存先を確認しました。",
      zh: "资料保存项目已确认。",
      ko: "자료 저장 항목을 확인했습니다.",
    },
    import_mapping_autofilled: {
      ja: "自動整理候補を適用しました。",
      zh: "已使用自动整理候选。",
      ko: "자동 정리 후보를 적용했습니다.",
    },
    import_validation_resolved: {
      ja: "検証ログを更新しました。",
      zh: "校验日志已更新。",
      ko: "검증 로그를 업데이트했습니다.",
    },
    import_job_retried: {
      ja: "取込ジョブを再試行キューへ戻しました。",
      zh: "导入任务已退回重试队列。",
      ko: "가져오기 작업을 재시도 큐로 되돌렸습니다.",
    },
    input_extraction_ready: {
      ja: "業務ファイルの抽出候補を自動識別しました。",
      zh: "已自动识别业务文件抽取候选。",
      ko: "업무 파일 추출 후보를 자동 식별했습니다.",
    },
    identity_extraction_ready: {
      ja: "本人確認資料の抽出候補を自動識別しました。",
      zh: "已自动识别身份资料抽取候选。",
      ko: "본인 확인 자료 추출 후보를 자동 식별했습니다.",
    },
    extraction_review_saved: {
      ja: "確認結果を案件として保存しました。",
      zh: "核对结果已保存为案件。",
      ko: "확인 결과를 안건으로 저장했습니다.",
    },
    attachment_registered: {
      ja: "添付を登録しました。",
      zh: "附件已登记。",
      ko: "첨부를 등록했습니다.",
    },
  } as const;
  const flashKey = String(params?.flash ?? "").trim() as keyof typeof flashMap;
  const flashMessage = flashMap[flashKey]?.[locale];

  // ── Excel 物件取込 state ──────────────────────────────────────────
  const xlsxJobId = String(params?.xlsxJob ?? "").trim();
  const xlsxJob = xlsxJobId ? jobs.find((j) => j.id === xlsxJobId) : undefined;

  let xlsxPayload: ExcelImportPayload | null = null;
  let xlsxResult: ExcelImportResult | null = null;

  if (xlsxJob?.notes) {
    try {
      xlsxPayload = JSON.parse(xlsxJob.notes) as ExcelImportPayload;
    } catch {
      xlsxPayload = null;
    }
  }
  const inputExtractionPreview = xlsxPayload?.inputExtraction;
  const isInputExtractionOnly = xlsxPayload?.kind === "input_file_extraction";
  const isIdentityExtractionOnly =
    isInputExtractionOnly &&
    (xlsxJob?.sourceType === "scan" || Boolean(inputExtractionPreview?.documentType.startsWith("identity_")));
  const mergeCandidates =
    xlsxJob && inputExtractionPreview
      ? evaluateCaseMergeCandidates({
          incomingData: buildRawExtractionCaseData(inputExtractionPreview),
          cases,
          currentImportJobId: xlsxJob.id,
        }).slice(0, 3)
      : [];
  if (xlsxJob?.status === "completed" && xlsxJob.validationMessage) {
    try {
      const payload = parseImportValidationPayload(xlsxJob.validationMessage);
      if (payload) {
        const successCount = Number(payload.metrics?.successCount ?? 0);
        const skippedRows = Array.isArray(payload.details?.skippedRows)
          ? (payload.details?.skippedRows as Array<{ row: number; reason: string }>)
          : [];
        xlsxResult = {
          successCount,
          skipped: skippedRows,
        };
      } else {
        xlsxResult = JSON.parse(xlsxJob.validationMessage) as ExcelImportResult;
      }
    } catch {
      xlsxResult = null;
    }
  }

  const xlsxTargetFieldOptions = [
    { value: "", label: locale === "zh" ? "-- 跳过 --" : locale === "ko" ? "-- 건너뜀 --" : "-- スキップ --" },
    { value: "name", label: locale === "zh" ? "物件名称 *" : locale === "ko" ? "매물명 *" : "物件名 *" },
    { value: "address", label: locale === "zh" ? "地址" : locale === "ko" ? "소재지" : "所在地" },
    { value: "area", label: locale === "zh" ? "区域" : locale === "ko" ? "지역" : "エリア" },
    { value: "listing_price", label: locale === "zh" ? "挂牌价格 *" : locale === "ko" ? "매도호가 *" : "売出価格 *" },
    { value: "management_fee", label: locale === "zh" ? "管理费" : locale === "ko" ? "관리비" : "管理費" },
    { value: "repair_fee", label: locale === "zh" ? "修缮基金" : locale === "ko" ? "수선적립금" : "修繕積立金" },
    { value: "notes", label: locale === "zh" ? "备注" : locale === "ko" ? "비고" : "備考" },
  ];

  return (
    <div className="space-y-7">
      <section>
        <h1 className="text-4xl font-bold tracking-tight text-slate-900">{copy.pageTitle}</h1>
        <p className="mt-1 text-sm text-slate-600">{copy.pageDesc}</p>
      </section>
      <PageFlashBanner message={flashMessage} />

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <p className="text-xs font-bold text-indigo-700">
              {locale === "zh" ? "申请书工作流" : locale === "ko" ? "신청서 작업 흐름" : "申込書ワークフロー"}
            </p>
            <h2 className="mt-1 text-xl font-black text-slate-950">
              {locale === "zh" ? "资料进来以后，只确认会影响输出的项目" : locale === "ko" ? "자료가 들어오면 출력에 영향을 주는 항목만 확인" : "資料が入ったら、出力に影響する項目だけ確認"}
            </h2>
          </div>
          <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[560px]">
            {[
              {
                step: "1",
                title: locale === "zh" ? "上传资料" : locale === "ko" ? "자료 업로드" : "資料を入れる",
                desc: locale === "zh" ? "Excel / 在留卡 / 驾照" : locale === "ko" ? "Excel / 재류카드 / 면허증" : "Excel / 在留カード / 免許証",
              },
              {
                step: "2",
                title: locale === "zh" ? "补齐缺失" : locale === "ko" ? "부족 항목 보완" : "不足項目を補完",
                desc: currentCase ? currentCase.caseTitle : locale === "zh" ? "创建案件后进入" : locale === "ko" ? "안건 생성 후 이동" : "案件作成後に確認",
              },
              {
                step: "3",
                title: locale === "zh" ? "输出申请书" : locale === "ko" ? "신청서 출력" : "申込書を出す",
                desc: locale === "zh" ? "预览、微调、下载" : locale === "ko" ? "미리보기, 조정, 다운로드" : "プレビュー・微調整・PDF",
              },
            ].map((item) => (
              <div key={item.step} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] font-black text-slate-400">{item.step}</p>
                <p className="mt-1 text-sm font-black text-slate-950">{item.title}</p>
                <p className="mt-1 truncate text-[11px] font-semibold text-slate-500">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href={reviewHref} className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800">
            <span className="material-symbols-outlined text-[16px]">rule</span>
            {locale === "zh" ? "进入缺项确认" : locale === "ko" ? "부족 항목 확인으로" : "不足項目の確認へ"}
          </Link>
          <Link href={outputHref} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
            <span className="material-symbols-outlined text-[16px]">picture_as_pdf</span>
            {locale === "zh" ? "进入申请书输出" : locale === "ko" ? "신청서 출력으로" : "申込書出力へ"}
          </Link>
        </div>
      </section>

      <section className="rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="material-symbols-outlined text-emerald-700">badge</span>
              <h2 className="text-base font-bold text-slate-950">
                {locale === "zh" ? "本人确认资料" : locale === "ko" ? "본인 확인 자료" : "本人確認資料"}
              </h2>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                {locale === "zh" ? "在留卡 / 驾照二选一" : locale === "ko" ? "재류카드 / 운전면허증 중 하나" : "在留カード / 運転免許証のどちらか"}
              </span>
            </div>
            <p className="mt-2 max-w-2xl text-xs leading-6 text-slate-600">
              {locale === "zh"
                ? "上传在留卡或驾照扫描件，系统先抽取申请人的姓名、生日、地址、证件号码等候选项；确认前不会覆盖案件资料。"
                : locale === "ko"
                  ? "재류카드 또는 운전면허증 스캔본을 올리면 신청자의 이름, 생년월일, 주소, 증명서 번호 등을 후보로 추출합니다. 확인 전에는 안건 데이터를 덮어쓰지 않습니다."
                  : "在留カードまたは運転免許証のスキャンを入れると、氏名・生年月日・住所・証明書番号などを候補化します。確認前に案件データは上書きしません。"}
            </p>
          </div>
          {!isIdentityExtractionOnly ? (
            <form action={uploadAndParseIdentityDocumentAction} className="w-full space-y-3 rounded-xl border border-emerald-100 bg-emerald-50 p-4 lg:max-w-md">
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-emerald-900">
                  {locale === "zh" ? "选择 PDF 或图片" : locale === "ko" ? "PDF 또는 이미지 선택" : "PDF または画像を選択"}
                </span>
                <input
                  name="identityDocumentFile"
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,image/*,application/pdf"
                  required
                  className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm"
                />
              </label>
              <button type="submit" className="w-full rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800">
                {locale === "zh" ? "识别本人资料" : locale === "ko" ? "본인 자료 인식" : "本人資料を識別"}
              </button>
            </form>
          ) : (
            <a href="/import-center" className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
              {locale === "zh" ? "重新上传" : locale === "ko" ? "다시 업로드" : "再アップロード"}
            </a>
          )}
        </div>

        {xlsxJob && xlsxPayload && inputExtractionPreview && isIdentityExtractionOnly ? (
          <div className="mt-5 space-y-4 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-bold text-emerald-950">
                    {locale === "zh" ? "身份资料抽取结果核对" : locale === "ko" ? "신분 자료 추출 결과 확인" : "本人確認資料の抽出結果確認"}
                  </h3>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                    {inputExtractionPreview.extractionStatus === "recognized"
                      ? locale === "zh" ? "已识别为支持证件" : locale === "ko" ? "지원 증명서로 인식" : "対応資料として識別"
                      : locale === "zh" ? "需手动确认" : locale === "ko" ? "수동 확인 필요" : "手動確認が必要"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  {locale === "zh"
                    ? "请只采用确认无误的字段。系统允许只上传在留卡或只上传驾照，不要求两份都齐。"
                    : locale === "ko"
                      ? "확실한 항목만 채택하세요. 재류카드 또는 운전면허증 중 하나만 업로드해도 됩니다."
                      : "正しい項目だけ採用してください。在留カードまたは運転免許証の片方だけで進められます。"}
                </p>
              </div>
              <span className="rounded-full bg-white px-3 py-1 text-[11px] font-bold text-slate-700">
                {inputExtractionPreview.documentTypeLabel}
              </span>
            </div>
            <InputExtractionReview
              extraction={inputExtractionPreview}
              locale={locale}
              importJobId={xlsxJob.id}
              mergeCandidates={mergeCandidates}
            />
          </div>
        ) : null}
      </section>

      {/* ── Excel 物件一括取込 ─────────────────────────────────────── */}
      <section className="rounded-2xl border border-blue-200 bg-blue-50 p-6 space-y-5">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-blue-700">table_view</span>
          <h2 className="text-base font-bold text-blue-900">
            {locale === "zh" ? "上传申请资料" : locale === "ko" ? "신청 자료 업로드" : "申込資料をアップロード"}
          </h2>
          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-600">
            {locale === "zh" ? "仅支持 .xlsx" : locale === "ko" ? ".xlsx 전용" : ".xlsx 専用"}
          </span>
        </div>

        {/* Step 1: Upload */}
        {!xlsxJob && (
          <form action={uploadAndParseExcelAction} className="space-y-3">
            <p className="text-xs text-blue-700">
              {locale === "zh"
                ? "普通物件台账会读取第一行表头；已知业务书式会先自动识别抽取候选。"
                : locale === "ko"
                  ? "일반 매물 대장은 첫 행의 열 이름을 읽고, 알려진 업무 서식은 추출 후보를 먼저 자동 식별합니다."
                  : "通常の物件台帳は1行目の見出しを読み取り、既知の業務書式は抽出候補を先に自動識別します。"}
            </p>
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-blue-800">
                {locale === "zh" ? "选择 .xlsx 文件" : locale === "ko" ? ".xlsx 파일 선택" : ".xlsx ファイルを選択"}
              </span>
              <input
                name="excelFile"
                type="file"
                accept=".xlsx"
                required
                className="w-full rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm"
              />
            </label>
            <button
              type="submit"
              className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white hover:bg-blue-800"
            >
              {locale === "zh" ? "解析文件" : locale === "ko" ? "파일 분석" : "ファイルを解析"}
            </button>
          </form>
        )}

        {/* Known business file extraction preview */}
        {xlsxJob && xlsxPayload && inputExtractionPreview && !isIdentityExtractionOnly && (
          <div className="space-y-4 rounded-xl border border-indigo-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-bold text-indigo-950">
                    {locale === "zh" ? "业务文件抽取结果核对" : locale === "ko" ? "업무 파일 추출 결과 확인" : "業務ファイル抽出結果の確認"}
                  </h3>
                  <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                    {inputExtractionPreview.extractionStatus === "recognized"
                      ? locale === "zh" ? "已自动识别" : locale === "ko" ? "자동 식별 완료" : "自動識別済み"
                      : locale === "zh" ? "未识别" : locale === "ko" ? "미식별" : "未識別"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  {locale === "zh"
                    ? "系统已把可识别内容整理为抽取候选。请逐项核对、修正或标为不明；未确认前不会自动写入正式物件、客户或报价。"
                    : locale === "ko"
                      ? "시스템이 식별 가능한 내용을 추출 후보로 정리했습니다. 항목별로 확인, 수정 또는 불명 표시를 해 주세요. 확인 전에는 정식 매물, 고객, 견적에 자동 반영되지 않습니다."
                      : "識別できた内容を抽出候補として整理しました。項目ごとに確認・修正・不明の判断をしてください。未確認の内容は正式な物件・顧客・見積へ自動登録されません。"}
                </p>
              </div>
              <a href="/import-center" className="text-xs font-semibold text-indigo-700 hover:underline">
                {locale === "zh" ? "重新上传" : locale === "ko" ? "다시 업로드" : "再アップロード"}
              </a>
            </div>

            <details className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-3">
              <summary className="cursor-pointer text-xs font-bold text-indigo-900">
                {locale === "zh" ? "识别详情" : locale === "ko" ? "식별 상세" : "識別の詳細"}
              </summary>
            <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg bg-indigo-50 p-3">
                <dt className="font-semibold text-indigo-900">{locale === "zh" ? "识别状态" : locale === "ko" ? "식별 상태" : "識別状態"}</dt>
                <dd className="mt-1 text-slate-700">
                  {inputExtractionPreview.extractionStatus === "recognized"
                    ? locale === "zh" ? "已识别" : locale === "ko" ? "식별됨" : "識別済み"
                    : "unknown"}
                </dd>
              </div>
              <div className="rounded-lg bg-indigo-50 p-3">
                <dt className="font-semibold text-indigo-900">{locale === "zh" ? "文件类型" : locale === "ko" ? "문서 유형" : "文書タイプ"}</dt>
                <dd className="mt-1 text-slate-700">{inputExtractionPreview.documentTypeLabel}</dd>
              </div>
              <div className="rounded-lg bg-indigo-50 p-3">
                <dt className="font-semibold text-indigo-900">{locale === "zh" ? "主要来源" : locale === "ko" ? "주요 출처" : "主な確認元"}</dt>
                <dd className="mt-1 truncate text-slate-700">{inputExtractionPreview.detectedSheet ?? "-"}</dd>
              </div>
              <div className="rounded-lg bg-indigo-50 p-3">
                <dt className="font-semibold text-indigo-900">{locale === "zh" ? "候选项目数" : locale === "ko" ? "후보 항목 수" : "候補項目数"}</dt>
                <dd className="mt-1 text-slate-700">{inputExtractionPreview.fields.length}</dd>
              </div>
              <div className="rounded-lg bg-indigo-50 p-3">
                <dt className="font-semibold text-indigo-900">{locale === "zh" ? "识别规则" : locale === "ko" ? "식별 규칙" : "識別ルール"}</dt>
                <dd className="mt-1 break-all font-mono text-[11px] text-slate-700">{inputExtractionPreview.templateVersion}</dd>
              </div>
              <div className="rounded-lg bg-indigo-50 p-3">
                <dt className="font-semibold text-indigo-900">{locale === "zh" ? "文件照合ID" : locale === "ko" ? "파일 대조 ID" : "ファイル照合ID"}</dt>
                <dd className="mt-1 font-mono text-[11px] text-slate-700">
                  {inputExtractionPreview.sourceFileHash ? `${inputExtractionPreview.sourceFileHash.slice(0, 12)}...` : "-"}
                </dd>
              </div>
              <div className="rounded-lg bg-indigo-50 p-3">
                <dt className="font-semibold text-indigo-900">{locale === "zh" ? "自动识别置信度" : locale === "ko" ? "자동 식별 신뢰도" : "自動識別の確度"}</dt>
                <dd className="mt-1 tabular-nums text-slate-700">{Math.round(inputExtractionPreview.fingerprintConfidence * 100)}%</dd>
              </div>
            </dl>
            </details>

            {inputExtractionPreview.fields.length > 0 ? (
              <InputExtractionReview
                extraction={inputExtractionPreview}
                locale={locale}
                importJobId={xlsxJob.id}
                mergeCandidates={mergeCandidates}
              />
            ) : (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                {locale === "zh"
                  ? "未识别为已知业务文件。如这是普通物件台账，可继续使用下方表格导入。"
                  : locale === "ko"
                    ? "알려진 업무 파일로 식별되지 않았습니다. 일반 매물 대장이라면 아래 표 가져오기를 계속 사용할 수 있습니다."
                    : "既知の業務ファイルとして識別できませんでした。通常の物件台帳の場合は下の表取込を続行できます。"}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Mapping confirmation */}
        {xlsxJob && xlsxPayload && xlsxJob.status !== "completed" && !isInputExtractionOnly && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-blue-900">
                {xlsxPayload.originalFilename} &mdash; {xlsxPayload.totalRows}{" "}
                {locale === "zh" ? "行数据" : locale === "ko" ? "행 데이터" : "行のデータ"}
              </p>
              <a href="/import-center" className="text-xs text-blue-600 hover:underline">
                {locale === "zh" ? "重新上传" : locale === "ko" ? "다시 업로드" : "再アップロード"}
              </a>
            </div>

            {/* Preview table */}
            <div className="overflow-x-auto rounded-lg border border-blue-200 bg-white">
              <table className="min-w-full text-xs">
                <thead className="bg-blue-100">
                  <tr>
                    {xlsxPayload.headers.map((h, hIndex) => (
                      <th key={`preview-head-${hIndex}-${h}`} className="px-3 py-2 text-left font-semibold text-blue-800">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {xlsxPayload.rows.slice(0, 3).map((row, i) => (
                    <tr key={`preview-row-${i}`} className="border-t border-blue-100">
                      {xlsxPayload!.headers.map((h, hIndex) => (
                        <td key={`preview-cell-${i}-${hIndex}-${h}`} className="px-3 py-1.5 text-slate-700">{String(row[h] ?? "")}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {xlsxPayload.totalRows > 3 && (
                <p className="px-3 py-1.5 text-[11px] text-slate-400">
                  {locale === "zh" ? `…还有 ${xlsxPayload.totalRows - 3} 行` : locale === "ko" ? `…${xlsxPayload.totalRows - 3}행 더` : `…他 ${xlsxPayload.totalRows - 3} 行`}
                </p>
              )}
            </div>

            {/* Mapping form */}
            <details className="rounded-lg border border-blue-200 bg-white p-3">
              <summary className="cursor-pointer text-xs font-bold text-blue-900">
                {locale === "zh" ? "普通物件台账导入设置" : locale === "ko" ? "일반 매물 대장 가져오기 설정" : "通常の物件台帳取込設定"}
              </summary>
            <form action={executePropertyImportAction} className="mt-3 space-y-3">
              <input type="hidden" name="jobId" value={xlsxJob.id} />
              <p className="text-xs font-semibold text-blue-800">
                {locale === "zh" ? "读取到的列（* 为必填）" : locale === "ko" ? "읽은 열 (* 필수)" : "読み取った列（* は必須）"}
              </p>
              <div className="space-y-2">
                {xlsxPayload.headers.map((header, headerIndex) => (
                  <div key={`mapping-${headerIndex}-${header}`} className="flex items-center gap-3">
                    <span className="w-36 truncate rounded bg-blue-100 px-2 py-1 text-xs font-mono text-blue-900">{header}</span>
                    <span className="text-xs text-slate-400">→</span>
                    <input type="hidden" name="sourceCol" value={header} />
                    <select
                      name="targetField"
                      defaultValue={xlsxPayload!.autoMapping[header] ?? ""}
                      className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
                    >
                      {xlsxTargetFieldOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              <button
                type="submit"
                className="rounded-lg bg-blue-700 px-5 py-2 text-sm font-bold text-white hover:bg-blue-800"
              >
                {locale === "zh" ? "执行导入" : locale === "ko" ? "가져오기 실행" : "取込を実行"}
              </button>
            </form>
            </details>
          </div>
        )}

        {/* Step 3: Result */}
        {xlsxJob && xlsxJob.status === "completed" && xlsxResult && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-green-600">check_circle</span>
              <p className="text-sm font-bold text-slate-800">
                {locale === "zh"
                  ? `登录成功 ${xlsxResult.successCount} 件 / 跳过 ${xlsxResult.skipped.length} 件`
                  : locale === "ko"
                    ? `등록 성공 ${xlsxResult.successCount}건 / 건너뜀 ${xlsxResult.skipped.length}건`
                    : `登録成功 ${xlsxResult.successCount} 件 / スキップ ${xlsxResult.skipped.length} 件`}
              </p>
            </div>
            {xlsxResult.skipped.length > 0 && (
              <ul className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3">
                {xlsxResult.skipped.map((s, index) => (
                  <li key={`skip-${s.row}-${index}`} className="text-xs text-amber-800">
                    {locale === "zh" ? `第 ${s.row} 行` : locale === "ko" ? `${s.row}행` : `${s.row} 行目`}: {s.reason}
                  </li>
                ))}
              </ul>
            )}
            <div className="rounded-lg border border-blue-200 bg-white p-3">
              <p className="text-xs font-bold text-blue-900">
                {locale === "zh" ? "下一步" : locale === "ko" ? "다음 단계" : "次のステップ"}
              </p>
              <p className="mt-1 text-xs text-slate-600">
                {locale === "zh"
                  ? "先进入信息整理页，只确认缺失或需要人工判断的项目；确认后再输出保证会社申请书。"
                  : locale === "ko"
                    ? "먼저 정보 정리 화면에서 부족하거나 사람이 판단해야 할 항목만 확인한 뒤 보증회사 신청서를 출력하세요."
                    : "まず情報整理で、足りない項目と人の判断が必要な項目だけ確認します。その後、保証会社申込書を出します。"}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <a
                href={reviewHref}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700"
              >
                {locale === "zh" ? "确认缺失项" : locale === "ko" ? "부족 항목 확인" : "不足項目を確認"}
              </a>
              <a
                href={outputHref}
                className="rounded-lg border border-blue-300 bg-white px-4 py-2 text-sm font-bold text-blue-800 hover:bg-blue-50"
              >
                {locale === "zh" ? "进入申请书输出" : locale === "ko" ? "신청서 출력으로" : "申込書出力へ"}
              </a>
              <a href="/import-center" className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                {locale === "zh" ? "继续导入" : locale === "ko" ? "계속 가져오기" : "続けて取り込む"}
              </a>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <h2 className="text-base font-bold text-slate-950">
              {locale === "zh" ? "最近上传的资料" : locale === "ko" ? "최근 업로드 자료" : "最近入れた資料"}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {locale === "zh"
                ? "上传后请进入信息整理页，只确认缺失或需确认的项目。"
                : locale === "ko"
                  ? "업로드 후 정보 정리 화면에서 부족하거나 확인이 필요한 항목만 봅니다."
                  : "アップロード後は情報整理で、足りない項目と確認が必要な項目だけ見ます。"}
            </p>
          </div>
          <Link href={reviewHref} className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800">
            <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            {locale === "zh" ? "下一步" : locale === "ko" ? "다음 단계" : "次のステップ"}
          </Link>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-3">
          {jobs.slice(0, 3).map((job) => (
            <Link key={`simple-import-${job.id}`} href={reviewHref} className="rounded-lg border border-slate-200 bg-slate-50 p-3 hover:bg-white">
              <p className="truncate text-sm font-bold text-slate-900">{job.title}</p>
              <p className="mt-1 text-xs text-slate-500">
                {formatDate(job.createdAt, locale)} / {statusLabel[job.status]}
              </p>
              <p className="mt-2 text-[11px] font-bold text-slate-700">
                {locale === "zh" ? "去确认缺失项" : locale === "ko" ? "부족 항목 확인" : "不足項目を確認"}
              </p>
            </Link>
          ))}
          {jobs.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 p-3 text-sm text-slate-500">
              {locale === "zh" ? "还没有上传记录。" : locale === "ko" ? "아직 업로드 기록이 없습니다." : "まだアップロード履歴はありません。"}
            </p>
          ) : null}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              {locale === "zh" ? "普通台账导入 / 详细设置" : locale === "ko" ? "일반 대장 가져오기 / 상세 설정" : "通常の台帳取込・詳細設定"}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {locale === "zh"
                ? "这里保留批量导入、校验日志和附件登记等后台能力，日常创建申请书不需要打开。"
                : locale === "ko"
                  ? "일괄 가져오기, 검증 로그, 첨부 등록 등 보조 기능입니다. 일반 신청서 작성에는 필요하지 않습니다."
                  : "一括取込、検証ログ、添付登録などの補助機能です。通常の申込書作成では開く必要はありません。"}
            </p>
          </div>
          {!showAdvanced ? (
            <Link href="/import-center?advanced=1" className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
              {locale === "zh" ? "打开详细设置" : locale === "ko" ? "상세 설정 열기" : "詳細設定を開く"}
            </Link>
          ) : (
            <Link href="/import-center" className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
              {locale === "zh" ? "收起详细设置" : locale === "ko" ? "상세 설정 닫기" : "詳細設定を閉じる"}
            </Link>
          )}
        </div>
        {showAdvanced ? (
        <div className="mt-5 space-y-6">
      <section className="grid gap-4 lg:grid-cols-3">
        <article className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200/40">
          <h2 className="text-base font-bold text-[#001e40]">{copy.cardExcelTitle}</h2>
          <p className="mb-4 text-xs text-slate-500">{copy.cardExcelSubtitle}</p>
          <form id="import-job-excel-form" action={createImportJobAction} className="space-y-2.5">
            <input type="hidden" name="sourceType" value="excel" />
            <input type="hidden" name="targetEntity" value="properties" />
            <input
              name="title"
              placeholder={copy.phExcelJob}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
              required
            />
            <input
              name="notes"
              placeholder={copy.phMemoExcel}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
            />
            <button className="w-full rounded-lg bg-[#001e40] py-2 text-xs font-bold text-white">{copy.btnCreateExcelJob}</button>
          </form>
          <FormDraftAssist
            formId="import-job-excel-form"
            storageKey="draft:import-center:create-job:excel"
            fieldNames={["title", "notes"]}
            reuseKey="import-center:create-job"
            reuseFields={["title", "notes"]}
            locale={locale}
            className="mt-2"
          />
        </article>

        <article className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200/40">
          <h2 className="text-base font-bold text-[#001e40]">{copy.cardPdfTitle}</h2>
          <p className="mb-4 text-xs text-slate-500">{copy.cardPdfSubtitle}</p>
          <form id="import-job-pdf-form" action={createImportJobAction} className="space-y-2.5">
            <input type="hidden" name="sourceType" value="pdf" />
            <input type="hidden" name="targetEntity" value="contracts" />
            <input
              name="title"
              placeholder={copy.phPdfJob}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
              required
            />
            <input
              name="notes"
              placeholder={copy.phMemoPdf}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
            />
            <button className="w-full rounded-lg bg-[#001e40] py-2 text-xs font-bold text-white">{copy.btnCreatePdfJob}</button>
          </form>
          <FormDraftAssist
            formId="import-job-pdf-form"
            storageKey="draft:import-center:create-job:pdf"
            fieldNames={["title", "notes"]}
            reuseKey="import-center:create-job"
            reuseFields={["title", "notes"]}
            locale={locale}
            className="mt-2"
          />
        </article>

        <article className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200/40">
          <h2 className="text-base font-bold text-[#001e40]">{copy.cardManualTitle}</h2>
          <p className="mb-4 text-xs text-slate-500">{copy.cardManualSubtitle}</p>
          <form id="import-job-manual-form" action={createImportJobAction} className="space-y-2.5">
            <input type="hidden" name="sourceType" value="manual" />
            <input type="hidden" name="targetEntity" value="service_requests" />
            <input
              name="title"
              placeholder={copy.phManualJob}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
              required
            />
            <input
              name="notes"
              placeholder={copy.phMemoManual}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
            />
            <button className="w-full rounded-lg bg-[#001e40] py-2 text-xs font-bold text-white">{copy.btnCreateManualJob}</button>
          </form>
          <FormDraftAssist
            formId="import-job-manual-form"
            storageKey="draft:import-center:create-job:manual"
            fieldNames={["title", "notes"]}
            reuseKey="import-center:create-job"
            reuseFields={["title", "notes"]}
            locale={locale}
            className="mt-2"
          />
        </article>
      </section>

      {!isInputExtractionOnly && (
      <section className="grid gap-6 xl:grid-cols-12">
        <div className="space-y-6 xl:col-span-8">
          <article className="rounded-xl bg-[#e6eeff] p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-1 items-center gap-2">
                {[
                  { label: copy.stepSelect, done: true },
                  { label: copy.stepMap, done: true },
                  { label: copy.stepValidate, done: false },
                  { label: copy.stepComplete, done: false },
                ].map((step, index) => (
                  <div key={step.label} className="flex flex-1 items-center gap-2">
                    <div className={"flex h-10 w-10 items-center justify-center rounded-full text-sm " + (step.done ? "bg-[#001e40] text-white" : "border-2 border-slate-200 bg-white text-slate-400")}>
                      <span className="material-symbols-outlined text-[16px]">{step.done ? (index === 0 ? "check" : "map") : index === 2 ? "verified" : "check_circle"}</span>
                    </div>
                    <span className={"text-xs font-bold " + (step.done ? "text-[#001e40]" : "text-slate-400")}>{step.label}</span>
                    {index < 3 ? <span className={"h-[2px] flex-1 " + (step.done ? "bg-[#c8d8f6]" : "bg-slate-300")} /> : null}
                  </div>
                ))}
              </div>
            </div>
          </article>

          <article className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200/30">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-6 py-5">
              <div>
                <h2 className="text-lg font-bold text-[#001e40]">{copy.schemaMappingTitle}</h2>
                <p className="text-xs text-slate-500">{copy.schemaMappingDesc}</p>
              </div>
              <div className="flex gap-2">
                <form action={autoMapImportJobAction}>
                  <input type="hidden" name="jobId" value={defaultJob?.id} />
                  <input type="hidden" name="targetEntity" value={defaultTarget} />
                  <input type="hidden" name="sourceColumns" value={defaultSourceColumns} />
                  <button
                    disabled={!hasDefaultJob}
                    className="rounded-lg px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {copy.saveDraft}
                  </button>
                </form>
                <button
                  type="submit"
                  form="mapping-form"
                  disabled={!hasDefaultJob}
                  className="rounded-lg bg-gradient-to-br from-[#001e40] to-[#003366] px-5 py-2 text-xs font-bold text-white shadow-md disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {copy.continueValidation}
                </button>
              </div>
            </div>
            {!hasDefaultJob ? <p className="px-6 py-3 text-sm text-amber-700">{copy.noJobs}</p> : null}

            <form id="mapping-form" action={updateImportJobMappingAction}>
              <input type="hidden" name="jobId" value={defaultJob?.id} />
              <input type="hidden" name="targetEntity" value={defaultTarget} />
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] border-collapse text-left">
                  <thead>
                    <tr className="bg-[#edf2fd]">
                      <th className="px-6 py-4 text-[11px] font-black uppercase tracking-widest text-[#1f477b]">{copy.sourceColumn}</th>
                      <th className="px-6 py-4 text-[11px] font-black uppercase tracking-widest text-[#1f477b]">{copy.targetField}</th>
                      <th className="px-6 py-4 text-center text-[11px] font-black uppercase tracking-widest text-[#1f477b]">{copy.autoMapCol}</th>
                      <th className="px-6 py-4 text-[11px] font-black uppercase tracking-widest text-[#1f477b]">{copy.sampleValue}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {previewRows.map((row, index) => {
                      const mapped = Boolean(row.target);
                      return (
                        <tr key={row.source + index} className="transition hover:bg-slate-50/70">
                          <td className="px-6 py-4 text-sm font-medium text-slate-900">{row.source}</td>
                          <td className="px-6 py-4">
                            <input type="hidden" name="sourceColumn" value={row.source} />
                            <select
                              name="targetField"
                              defaultValue={row.target ?? ""}
                              className={"w-full rounded-lg border px-3 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#001e40] " + (mapped ? "border-[#001e40] bg-[#edf2fd] text-[#001e40]" : "border-red-300 bg-red-50 text-red-600")}
                            >
                              <option value="">{copy.unmapped}</option>
                              {(targetFieldOptions[defaultTarget] ?? []).map((field) => (
                                <option key={field} value={field}>{field}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className={"material-symbols-outlined text-[18px] " + (mapped ? "text-emerald-600" : "text-slate-300")}>{mapped ? "check_circle" : "close"}</span>
                          </td>
                          <td className="px-6 py-4 text-xs tabular-nums text-slate-400">
                            {previewValues[index] ?? t(locale, "common.notSet")}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </form>
          </article>

          <article className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#001e40]">{copy.recentImportHistory}</h3>
              <Link href="/import-center?panel=history" className="inline-flex items-center gap-1 text-[11px] font-bold text-[#001e40]">
                {copy.viewArchive}
                <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
              </Link>
            </div>
            <div className="space-y-2">
              {jobs.slice(0, 3).map((job, index) => (
                <div key={job.id} className="group flex items-center gap-5 rounded-xl bg-[#edf2fd] p-4 transition hover:bg-[#e4edff]">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-[#003366]">
                    <span className="material-symbols-outlined">{index % 2 === 0 ? "table_chart" : "cloud_upload"}</span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-900">{job.title}</p>
                    <p className="truncate text-[11px] uppercase tracking-tight text-slate-500">
                      {sourceLabel[job.sourceType]} • {targetLabel[job.targetEntity]} • {formatDate(job.createdAt, locale)}
                    </p>
                  </div>
                  <span className={"rounded-full px-3 py-1 text-[10px] font-bold uppercase " + (job.status === "completed" ? "bg-emerald-100 text-emerald-700" : "bg-[#ffdbca] text-[#723610]")}>
                    {statusLabel[job.status]}
                  </span>
                  <Link href={`/import-center?job=${job.id}`} className="text-slate-400 transition group-hover:text-slate-700">
                    <span className="material-symbols-outlined">more_vert</span>
                  </Link>
                </div>
              ))}
            </div>
          </article>
        </div>

        <aside className="space-y-5 xl:col-span-4">
          <article className="relative overflow-hidden rounded-xl bg-[#001e40] p-6 text-white">
            <div className="relative z-10">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-widest text-blue-200">{copy.readinessTitle}</p>
                <p className="text-3xl font-black tabular-nums">
                  {Math.min(100, Math.round(((mappedJobCount + completedJobCount) / Math.max(1, jobs.length)) * 100))}%
                </p>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#003366]">
                <div className="h-full bg-blue-400" style={{ width: `${Math.min(100, Math.round(((mappedJobCount + completedJobCount) / Math.max(1, jobs.length)) * 100))}%` }} />
              </div>
              <div className="mt-6 grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-white/10 p-3">
                  <p className="text-[10px] uppercase text-blue-200">{copy.mapped}</p>
                  <p className="text-2xl font-black">{mappedJobCount}</p>
                </div>
                <div className="rounded-lg bg-white/10 p-3">
                  <p className="text-[10px] uppercase text-blue-200">{copy.alerts}</p>
                  <p className="text-2xl font-black text-[#ffdbca]">{validationItems.length}</p>
                </div>
              </div>
            </div>
            <div className="absolute -bottom-12 -right-12 h-40 w-40 rounded-full bg-white/5 blur-3xl" />
          </article>

          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-xs font-black uppercase tracking-widest text-[#1f477b]">{copy.issueStatsTitle}</h3>
            <p className="mt-1 text-[11px] text-slate-500">{copy.issueStatsDesc}</p>
            <div className="mt-3 space-y-2">
              {issueCodeStats.length === 0 ? <p className="text-xs text-slate-500">{copy.noFurtherAlerts}</p> : null}
              {issueCodeStats.map((item) => (
                <div key={`issue-stat-${item.code}`} className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-semibold text-slate-800">{item.label}</p>
                    <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-slate-700">
                      {item.total}
                    </span>
                  </div>
                  <div className="mt-1.5 flex gap-1.5 text-[10px]">
                    <span className="rounded bg-red-50 px-1.5 py-0.5 font-semibold text-red-600">C {item.critical}</span>
                    <span className="rounded bg-amber-50 px-1.5 py-0.5 font-semibold text-amber-700">W {item.warning}</span>
                    <span className="rounded bg-blue-50 px-1.5 py-0.5 font-semibold text-blue-700">I {item.info}</span>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-xs font-black uppercase tracking-widest text-[#1f477b]">{copy.issueTrendTitle}</h3>
            <p className="mt-1 text-[11px] text-slate-500">{copy.issueTrendDesc}</p>
            <div className="mt-3 space-y-2">
              {issueTrendDays.map((day) => (
                <div key={`issue-trend-${day.key}`} className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold text-slate-700">{day.label}</p>
                    <p className="text-[11px] font-bold tabular-nums text-slate-800">{day.total}</p>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
                    <div className="h-full bg-blue-500" style={{ width: `${Math.round((day.total / maxIssueTrendTotal) * 100)}%` }} />
                  </div>
                  <div className="mt-1.5 flex gap-1.5 text-[10px]">
                    <span className="rounded bg-red-50 px-1.5 py-0.5 font-semibold text-red-600">C {day.critical}</span>
                    <span className="rounded bg-amber-50 px-1.5 py-0.5 font-semibold text-amber-700">W {day.warning}</span>
                    <span className="rounded bg-blue-50 px-1.5 py-0.5 font-semibold text-blue-700">I {day.info}</span>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="flex flex-col overflow-hidden rounded-xl bg-[#e6eeff]">
            <div className="flex items-center justify-between border-b border-slate-200/50 px-5 py-4">
              <h3 className="text-xs font-black uppercase tracking-widest text-[#1f477b]">{copy.validationLog}</h3>
              <span className="material-symbols-outlined text-slate-400">filter_list</span>
            </div>
            <div className="max-h-[440px] flex-1 space-y-2 overflow-y-auto p-2">
              {validationItems.length === 0 ? <p className="px-3 py-8 text-center text-xs text-slate-500">{copy.noFurtherAlerts}</p> : null}
              {validationItems.map((item) => (
                <div
                  key={item.id}
                  className={
                    "rounded-lg bg-white p-4 shadow-sm " +
                    (item.level === "critical" ? "border-l-4 border-red-500" : item.level === "warning" ? "border-l-4 border-[#d8885c]" : "border-l-4 border-blue-400")
                  }
                >
                  <p className="text-xs font-bold text-slate-900">{item.title}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{item.message}</p>
                  {item.operation !== "retry" ? (
                    <form action={resolveImportValidationAction}>
                      <input type="hidden" name="jobId" value={item.jobId} />
                      <input type="hidden" name="operation" value={item.operation} />
                      <button
                        className={
                          "mt-3 rounded-md px-3 py-1.5 text-[10px] font-bold " +
                          (item.level === "critical"
                            ? "bg-red-600 text-white"
                            : item.level === "warning"
                              ? "bg-[#592300] text-white"
                              : "text-[#001e40] hover:underline")
                        }
                      >
                        {item.actionLabel}
                      </button>
                    </form>
                  ) : null}
                  {item.operation === "retry" || item.level === "critical" ? (
                    <form action={retryImportJobAction} className="mt-2">
                      <input type="hidden" name="jobId" value={item.jobId} />
                      <button className="rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] font-bold text-slate-700 hover:bg-slate-100">
                        {locale === "zh" ? "重试任务" : locale === "ko" ? "재시도" : "再試行"}
                      </button>
                    </form>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="border-t border-slate-200/50 bg-[#edf2fd] p-4">
              <Link
                href={`/api/hub/export?scope=import_jobs&locale=${locale}`}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white py-3 text-xs font-black uppercase tracking-widest text-[#001e40] hover:bg-slate-50"
              >
                <span className="material-symbols-outlined text-[14px]">download</span>
                {copy.exportValidationReport}
              </Link>
            </div>
          </article>

          <article className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200/30">
            <h4 className="mb-2 text-xs font-black uppercase tracking-widest text-slate-600">{copy.attachmentTitle}</h4>
            <p className="mb-3 text-[11px] leading-relaxed text-slate-500">{copy.attachmentHint}</p>
            <form id="import-attachment-form" action={registerAttachmentAction} className="space-y-2.5">
              <label className="block space-y-1">
                <span className="text-[11px] font-semibold text-slate-600">{copy.labelAttachmentTargetType}</span>
              <select name="targetType" defaultValue="import_job" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                {attachmentTargetOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              </label>
              <label className="block space-y-1">
                <span className="text-[11px] font-semibold text-slate-600">{copy.labelAttachmentTargetId}</span>
                <input name="targetId" placeholder={copy.phTargetId} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm" required />
              </label>
              <label className="block space-y-1">
                <span className="text-[11px] font-semibold text-slate-600">{copy.labelUpload}</span>
                <input name="uploadFile" type="file" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
              </label>
              <label className="block space-y-1">
                <span className="text-[11px] font-semibold text-slate-600">{copy.labelFileName}</span>
                <input name="fileName" placeholder={copy.phFileName} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
              </label>
              <label className="block space-y-1">
                <span className="text-[11px] font-semibold text-slate-600">{copy.labelExternalUrl}</span>
                <input
                  name="externalStoragePath"
                  placeholder={copy.phExternalUrl}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block space-y-1">
                  <span className="text-[11px] font-semibold text-slate-600">{copy.labelMime}</span>
                  <input name="fileType" placeholder={copy.phMime} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
                </label>
                <label className="block space-y-1">
                  <span className="text-[11px] font-semibold text-slate-600">{copy.labelFileSize}</span>
                  <input name="fileSizeBytes" type="number" min={0} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
                </label>
              </div>
              <button type="submit" className="w-full rounded-lg bg-[#001e40] py-2 text-xs font-bold text-white">
                {copy.btnRegisterAttachment}
              </button>
            </form>
            <FormDraftAssist
              formId="import-attachment-form"
              storageKey="draft:import-center:attachment"
              fieldNames={["targetType", "targetId", "fileName", "externalStoragePath", "fileType", "fileSizeBytes"]}
              reuseKey="import-center:attachment"
              locale={locale}
              className="mt-2"
            />
          </article>

          <article className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200/30">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-xs font-black uppercase tracking-widest text-slate-600">{copy.latestAttachmentTitle}</h4>
              <span className="text-[11px] text-slate-400">{copy.latestAttachmentSubtitle}</span>
            </div>
            {attachments.length === 0 ? (
              <p className="text-sm text-slate-500">{copy.noAttachments}</p>
            ) : (
              <div className="space-y-2">
                {attachments.slice(0, 8).map((att) => (
                  <div key={att.id} className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                    <p className="truncate text-xs font-semibold text-slate-900">{att.fileName}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {att.targetLabel} / {att.targetId}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {copy.uploadDatePrefix}: {formatDate(att.uploadedAt, locale)}
                    </p>
                    {att.storagePath ? (
                      <a href={att.storagePath} target="_blank" rel="noreferrer" className="mt-1 inline-flex text-[10px] font-bold text-[#001e40] hover:underline">
                        {copy.openStorage}
                      </a>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </article>

          <article className="rounded-xl bg-[#d6e3fe] p-5">
            <h4 className="mb-2 flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-[#58657c]">
              <span className="material-symbols-outlined text-[14px]">lightbulb</span>
              {copy.proTipTitle}
            </h4>
            <p className="text-[13px] leading-relaxed text-[#58657c]">{copy.proTipDesc}</p>
          </article>
        </aside>
      </section>
      )}
        </div>
        ) : null}
      </section>
    </div>
  );
}
