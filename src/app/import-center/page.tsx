import Link from "next/link";
import {
  autoMapImportJobAction,
  createImportJobAction,
  executePropertyImportAction,
  registerAttachmentAction,
  resolveImportValidationAction,
  updateImportJobMappingAction,
  uploadAndParseExcelAction,
} from "@/app/actions";
import { FormDraftAssist } from "@/components/form-draft-assist";
import { PageFlashBanner } from "@/components/page-flash-banner";
import { formatDate } from "@/lib/format";
import { t } from "@/lib/i18n";
import { getLocale, type Locale } from "@/lib/locale";
import { listHubAttachments, listHubImportJobs, type HubImportJobItem } from "@/lib/hub";

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
      pageTitle: "取込センター",
      pageDesc: "既存の Excel・PDF・スキャン資料を低コストで取り込み、物件・関係者・契約・対応依頼へマッピングします。",
      cardExcelTitle: "Excel 一括取込",
      cardExcelSubtitle: "台帳データを優先対応",
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
      wizardTitle: "取込マッピングウィザード",
      wizardSubtitle: "自動候補 + 手動調整",
      stepSelect: "選択",
      stepMap: "マッピング",
      stepValidate: "検証",
      stepComplete: "完了",
      schemaMappingTitle: "手順 2: スキーママッピング",
      schemaMappingDesc: "取込元の列を Broker Desk 台帳項目に対応付けます。",
      saveDraft: "下書き保存",
      continueValidation: "検証へ進む",
      sourceColumn: "元列",
      targetField: "対象フィールド",
      autoMapCol: "自動判定",
      sampleValue: "プレビュー値",
      unmapped: "-- 未割当 --",
      recentImportHistory: "最近の取込履歴",
      viewArchive: "アーカイブ表示",
      readinessTitle: "取込準備度",
      mapped: "マッピング済",
      alerts: "アラート",
      validationLog: "検証ログ",
      noFurtherAlerts: "追加アラートはありません",
      validationUnmappedRequired: "必須項目が未マッピング",
      validationFormatMismatch: "データ形式の不一致",
      validationSchemaSuggestion: "スキーマ候補の提案",
      validationUnmappedMsg: "台帳必須項目の紐づけが不足しています。",
      validationFormatMsg: "取込元データに形式の揺れがあります。",
      validationSchemaMsg: "高確度のマッピング候補があります。",
      actionResolveNow: "今すぐ修正",
      actionAutoFix: "自動補正",
      actionApplyMapping: "候補を適用",
      exportValidationReport: "検証レポートを出力",
      proTipTitle: "操作ヒント",
      proTipDesc:
        "マッピング行はドラッグで優先順を並べ替えできます。自動照合は Ctrl+M で実行できます。",
      noJobs: "先に取込ジョブを1件作成してください。",
      wizardStep1: "1. 自動候補を作成",
      wizardStep2: "2. 手動で微調整",
      labelTargetJob: "対象ジョブ",
      labelTargetEntity: "取込対象",
      labelSourceColumns: "元列（カンマ区切り）",
      labelTargetFields: "マッピング先（カンマ区切り）",
      btnAutoMap: "標準候補で自動マッピング",
      btnSaveMap: "マッピングを検証して保存",
      phSourceCols: "例: 物件名,所在地,エリア,価格",
      phMapMemo: "例: 自動候補の初回生成",
      phSaveMemo: "例: 価格列は税抜",
      fieldDefTitle: "取込対象フィールド定義",
      fieldDefSubtitle: "必須項目を優先してマッピング",
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
      pageTitle: "导入中心",
      pageDesc: "以低成本导入既有 Excel、PDF、扫描资料，并映射到物件、主体、合同、服务请求。",
      cardExcelTitle: "Excel 批量导入",
      cardExcelSubtitle: "优先处理台账数据",
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
      wizardTitle: "导入映射向导",
      wizardSubtitle: "自动候选 + 手动调整",
      stepSelect: "选择",
      stepMap: "映射",
      stepValidate: "校验",
      stepComplete: "完成",
      schemaMappingTitle: "步骤 2：结构映射",
      schemaMappingDesc: "将源列与 Broker Desk 台账字段进行对应。",
      saveDraft: "保存草稿",
      continueValidation: "进入校验",
      sourceColumn: "源列",
      targetField: "目标字段",
      autoMapCol: "自动匹配",
      sampleValue: "预览值",
      unmapped: "-- 未映射 --",
      recentImportHistory: "最近导入历史",
      viewArchive: "查看归档",
      readinessTitle: "导入就绪度",
      mapped: "已映射",
      alerts: "告警",
      validationLog: "校验日志",
      noFurtherAlerts: "暂无更多告警",
      validationUnmappedRequired: "存在未映射必填项",
      validationFormatMismatch: "数据格式不一致",
      validationSchemaSuggestion: "结构映射建议",
      validationUnmappedMsg: "台账必填字段仍有未映射项。",
      validationFormatMsg: "源数据包含格式不一致内容。",
      validationSchemaMsg: "检测到高置信度映射候选。",
      actionResolveNow: "立即处理",
      actionAutoFix: "自动修复",
      actionApplyMapping: "应用映射",
      exportValidationReport: "导出校验报告",
      proTipTitle: "操作提示",
      proTipDesc: "可拖拽映射行调整优先级。按 Ctrl+M 可触发自动匹配。",
      noJobs: "请先创建至少 1 个导入任务。",
      wizardStep1: "1. 生成自动候选",
      wizardStep2: "2. 手动微调",
      labelTargetJob: "目标任务",
      labelTargetEntity: "导入目标",
      labelSourceColumns: "源列（逗号分隔）",
      labelTargetFields: "映射目标字段（逗号分隔）",
      btnAutoMap: "按标准规则自动映射",
      btnSaveMap: "校验并保存映射",
      phSourceCols: "例：物件名称,地址,区域,价格",
      phMapMemo: "例：首次生成自动候选",
      phSaveMemo: "例：价格列为不含税",
      fieldDefTitle: "导入目标字段定义",
      fieldDefSubtitle: "优先覆盖必填项",
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
      pageTitle: "가져오기 센터",
      pageDesc: "기존 Excel/PDF/스캔 자료를 저비용으로 가져와 매물·관계자·계약·서비스 요청으로 매핑합니다.",
      cardExcelTitle: "Excel 일괄 가져오기",
      cardExcelSubtitle: "대장 데이터를 우선 처리",
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
      wizardTitle: "가져오기 매핑 마법사",
      wizardSubtitle: "자동 후보 + 수동 조정",
      stepSelect: "선택",
      stepMap: "매핑",
      stepValidate: "검증",
      stepComplete: "완료",
      schemaMappingTitle: "2단계: 스키마 매핑",
      schemaMappingDesc: "원본 컬럼을 Broker Desk 원장 필드에 연결합니다.",
      saveDraft: "초안 저장",
      continueValidation: "검증으로 이동",
      sourceColumn: "원본 컬럼",
      targetField: "대상 필드",
      autoMapCol: "자동 매핑",
      sampleValue: "미리보기 값",
      unmapped: "-- 미매핑 --",
      recentImportHistory: "최근 가져오기 이력",
      viewArchive: "보관 이력 보기",
      readinessTitle: "가져오기 준비도",
      mapped: "매핑 완료",
      alerts: "알림",
      validationLog: "검증 로그",
      noFurtherAlerts: "추가 알림이 없습니다",
      validationUnmappedRequired: "필수 필드 미매핑",
      validationFormatMismatch: "데이터 형식 불일치",
      validationSchemaSuggestion: "스키마 매핑 제안",
      validationUnmappedMsg: "원장 필수 항목 연결이 부족합니다.",
      validationFormatMsg: "원본 데이터 형식이 일치하지 않습니다.",
      validationSchemaMsg: "신뢰도 높은 매핑 후보가 있습니다.",
      actionResolveNow: "지금 수정",
      actionAutoFix: "자동 보정",
      actionApplyMapping: "매핑 적용",
      exportValidationReport: "검증 리포트 내보내기",
      proTipTitle: "사용 팁",
      proTipDesc: "매핑 행은 드래그로 우선순위를 조정할 수 있습니다. Ctrl+M으로 자동 매칭을 실행합니다.",
      noJobs: "먼저 가져오기 작업을 1건 이상 생성하세요.",
      wizardStep1: "1. 자동 후보 생성",
      wizardStep2: "2. 수동 미세 조정",
      labelTargetJob: "대상 작업",
      labelTargetEntity: "가져오기 대상",
      labelSourceColumns: "원본 컬럼(쉼표 구분)",
      labelTargetFields: "매핑 대상 필드(쉼표 구분)",
      btnAutoMap: "표준 후보로 자동 매핑",
      btnSaveMap: "매핑 검증 후 저장",
      phSourceCols: "예: 매물명,소재지,지역,가격",
      phMapMemo: "예: 자동 후보 1차 생성",
      phSaveMemo: "예: 가격 컬럼은 세전",
      fieldDefTitle: "가져오기 대상 필드 정의",
      fieldDefSubtitle: "필수 항목 우선 매핑",
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
  headers: string[];
  autoMapping: Record<string, string>;
  rows: Record<string, unknown>[];
  originalFilename: string;
  totalRows: number;
};

type ExcelImportResult = {
  successCount: number;
  skipped: { row: number; reason: string }[];
};

type ImportCenterPageProps = {
  searchParams?: Promise<{ job?: string; flash?: string; xlsxJob?: string }>;
};

export default async function ImportCenterPage({ searchParams }: ImportCenterPageProps) {
  const locale = await getLocale();
  const copy = getCopy(locale);
  const params = searchParams ? await searchParams : undefined;
  const [jobs, attachments] = await Promise.all([listHubImportJobs(), listHubAttachments(locale, 30)]);

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
  const defaultJob = jobs.find((job) => job.id === focusJobId) ?? jobs[0];
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
  const validationItems = jobs
    .filter((job) => Boolean(job.validationMessage) || job.status !== "completed")
    .slice(0, 4)
    .map((job, index) => ({
      id: job.id,
      level: index === 0 ? "critical" : index === 1 ? "warning" : "info",
      title:
        index === 0
          ? copy.validationUnmappedRequired
          : index === 1
            ? copy.validationFormatMismatch
            : copy.validationSchemaSuggestion,
      message:
        job.validationMessage ??
        (index === 0
          ? copy.validationUnmappedMsg
          : index === 1
            ? copy.validationFormatMsg
            : copy.validationSchemaMsg),
      action:
        index === 0 ? copy.actionResolveNow : index === 1 ? copy.actionAutoFix : copy.actionApplyMapping,
    }));
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
      ja: "マッピングを保存しました。",
      zh: "映射已保存。",
      ko: "매핑을 저장했습니다.",
    },
    import_mapping_autofilled: {
      ja: "自動マッピング候補を適用しました。",
      zh: "已应用自动映射候选。",
      ko: "자동 매핑 후보를 적용했습니다.",
    },
    import_validation_resolved: {
      ja: "検証ログを更新しました。",
      zh: "校验日志已更新。",
      ko: "검증 로그를 업데이트했습니다.",
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
  if (xlsxJob?.status === "completed" && xlsxJob.validationMessage) {
    try {
      xlsxResult = JSON.parse(xlsxJob.validationMessage) as ExcelImportResult;
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

      {/* ── Excel 物件一括取込 ─────────────────────────────────────── */}
      <section className="rounded-2xl border border-blue-200 bg-blue-50 p-6 space-y-5">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-blue-700">table_view</span>
          <h2 className="text-base font-bold text-blue-900">
            {locale === "zh" ? "Excel 物件批量导入" : locale === "ko" ? "Excel 매물 일괄 가져오기" : "Excel 物件一括取込"}
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
                ? "第一行必须为列名，支持中/日/英列名自动识别。"
                : locale === "ko"
                  ? "첫 번째 행은 열 이름이어야 합니다. 한국어/일본어/영어 자동 인식 지원."
                  : "1行目が列名である必要があります。日本語・中国語・英語の列名を自動認識します。"}
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
              {locale === "zh" ? "解析列名" : locale === "ko" ? "열 이름 분석" : "列名を解析"}
            </button>
          </form>
        )}

        {/* Step 2: Mapping confirmation */}
        {xlsxJob && xlsxPayload && xlsxJob.status !== "completed" && (
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
                    {xlsxPayload.headers.map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-semibold text-blue-800">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {xlsxPayload.rows.slice(0, 3).map((row, i) => (
                    <tr key={i} className="border-t border-blue-100">
                      {xlsxPayload!.headers.map((h) => (
                        <td key={h} className="px-3 py-1.5 text-slate-700">{String(row[h] ?? "")}</td>
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
            <form action={executePropertyImportAction} className="space-y-3">
              <input type="hidden" name="jobId" value={xlsxJob.id} />
              <p className="text-xs font-semibold text-blue-800">
                {locale === "zh" ? "列名映射（* 为必填）" : locale === "ko" ? "열 이름 매핑 (* 필수)" : "列名マッピング（* は必須）"}
              </p>
              <div className="space-y-2">
                {xlsxPayload.headers.map((header) => (
                  <div key={header} className="flex items-center gap-3">
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
                {xlsxResult.skipped.map((s) => (
                  <li key={s.row} className="text-xs text-amber-800">
                    {locale === "zh" ? `第 ${s.row} 行` : locale === "ko" ? `${s.row}행` : `${s.row} 行目`}: {s.reason}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-3">
              <a
                href="/properties"
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700"
              >
                {locale === "zh" ? "前往物件列表" : locale === "ko" ? "매물 목록으로" : "物件一覧へ"}
              </a>
              <a href="/import-center" className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                {locale === "zh" ? "继续导入" : locale === "ko" ? "계속 가져오기" : "続けて取り込む"}
              </a>
            </div>
          </div>
        )}
      </section>

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
                  <form action={resolveImportValidationAction}>
                    <input type="hidden" name="jobId" value={item.id} />
                    <input
                      type="hidden"
                      name="operation"
                      value={item.level === "critical" ? "resolve_now" : item.level === "warning" ? "auto_fix" : "apply_mapping"}
                    />
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
                      {item.action}
                    </button>
                  </form>
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
    </div>
  );
}
