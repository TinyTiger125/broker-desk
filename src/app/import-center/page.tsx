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
import { ExcelDocumentUploadForm } from "@/components/excel-document-upload-form";
import { ExcelImportQueueProcessor } from "@/components/excel-import-queue-processor";
import { IdentityDocumentUploadForm } from "@/components/identity-document-upload-form";
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

const targetFieldCopy: Record<
  string,
  {
    label: Record<Locale, string>;
    helper: Record<Locale, string>;
  }
> = {
  name: {
    label: { ja: "物件名", zh: "物件名称", ko: "매물명" },
    helper: { ja: "物件台帳の名称として保存", zh: "保存到物件资料的名称", ko: "매물 정보의 이름으로 저장" },
  },
  address: {
    label: { ja: "所在地", zh: "地址", ko: "소재지" },
    helper: { ja: "物件の住所として保存", zh: "保存到物件地址", ko: "매물 주소로 저장" },
  },
  area: {
    label: { ja: "エリア", zh: "区域", ko: "지역" },
    helper: { ja: "検索や分類用のエリア", zh: "用于搜索和归类的位置区域", ko: "검색과 분류에 쓰는 지역" },
  },
  listing_price: {
    label: { ja: "売出価格", zh: "挂牌价格", ko: "매도호가" },
    helper: { ja: "売買・提案で使う価格", zh: "用于买卖或提案的价格", ko: "매매와 제안에 쓰는 가격" },
  },
  phone: {
    label: { ja: "電話番号", zh: "电话", ko: "전화번호" },
    helper: { ja: "顧客・関係者の連絡先", zh: "客户或关系人的联系方式", ko: "고객/관계자 연락처" },
  },
  email: {
    label: { ja: "メール", zh: "邮箱", ko: "이메일" },
    helper: { ja: "顧客・関係者のメール", zh: "客户或关系人的邮箱", ko: "고객/관계자 이메일" },
  },
  party_type: {
    label: { ja: "個人 / 法人", zh: "个人 / 公司", ko: "개인 / 법인" },
    helper: { ja: "相手が個人か法人か", zh: "判断对方是个人还是公司", ko: "상대가 개인인지 법인인지" },
  },
  contract_number: {
    label: { ja: "契約番号", zh: "合同编号", ko: "계약번호" },
    helper: { ja: "契約や申込の管理番号", zh: "合同或申请资料的管理编号", ko: "계약/신청 관리번호" },
  },
  contract_type: {
    label: { ja: "契約種別", zh: "合同类型", ko: "계약 유형" },
    helper: { ja: "賃貸、売買、保証などの種別", zh: "租赁、买卖、保证等业务类型", ko: "임대, 매매, 보증 등 유형" },
  },
  property_id: {
    label: { ja: "関連物件", zh: "关联物件", ko: "연결 매물" },
    helper: { ja: "どの物件の資料かを紐付け", zh: "确认这份资料属于哪个物件", ko: "어느 매물의 자료인지 연결" },
  },
  party_id: {
    label: { ja: "関連者", zh: "关联客户/关系人", ko: "연결 관계자" },
    helper: { ja: "顧客、貸主、借主などへ紐付け", zh: "关联到客户、业主、租户等对象", ko: "고객, 소유자, 임차인 등에 연결" },
  },
  signed_at: {
    label: { ja: "契約日", zh: "签约日期", ko: "계약일" },
    helper: { ja: "契約書に記載された日付", zh: "合同或申请书里的签署日期", ko: "계약서에 적힌 날짜" },
  },
  title: {
    label: { ja: "件名", zh: "事项名称", ko: "제목" },
    helper: { ja: "対応履歴や作業の名前", zh: "处理事项或待办工作的名称", ko: "후속 기록이나 작업 이름" },
  },
  occurred_at: {
    label: { ja: "発生日", zh: "发生日期", ko: "발생일" },
    helper: { ja: "問い合わせや対応が発生した日", zh: "事项发生或接到资料的日期", ko: "문의나 처리가 발생한 날짜" },
  },
  status: {
    label: { ja: "対応状態", zh: "处理状态", ko: "처리 상태" },
    helper: { ja: "未対応、対応中、完了など", zh: "待处理、处理中、已完成等状态", ko: "대기, 처리 중, 완료 등 상태" },
  },
  "property.name": {
    label: { ja: "物件名", zh: "物件名称", ko: "매물명" },
    helper: { ja: "申込・契約内の物件名", zh: "申请或合同里的物件名称", ko: "신청/계약 안의 매물명" },
  },
  "applicant.name": {
    label: { ja: "申込者名", zh: "申请人姓名", ko: "신청자명" },
    helper: { ja: "申込者または顧客の名前", zh: "申请人或客户的姓名", ko: "신청자 또는 고객 이름" },
  },
  "lease.rent": {
    label: { ja: "賃料", zh: "租金", ko: "임대료" },
    helper: { ja: "賃貸条件の月額賃料", zh: "租赁条件里的月租金", ko: "임대 조건의 월 임대료" },
  },
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

function getTargetFieldLabel(locale: Locale, field: string) {
  return targetFieldCopy[field]?.label[locale] ?? (locale === "zh" ? "其他保存项" : locale === "ko" ? "기타 저장 항목" : "その他の保存項目");
}

function getTargetFieldHelper(locale: Locale, field: string) {
  return targetFieldCopy[field]?.helper[locale] ?? (locale === "zh" ? "读取到的补充项目" : locale === "ko" ? "읽어 온 추가 항목" : "読み取った補足項目");
}

function getMappingConfirmation(locale: Locale, source: string, target?: string) {
  if (!target) {
    if (locale === "zh") return `「${source}」暂不保存到资料库。`;
    if (locale === "ko") return `「${source}」는 자료실에 저장하지 않습니다.`;
    return `「${source}」は保存しません。`;
  }
  const label = getTargetFieldLabel(locale, target);
  if (locale === "zh") return `将「${source}」保存为「${label}」。`;
  if (locale === "ko") return `「${source}」를 「${label}」로 저장합니다.`;
  return `「${source}」を「${label}」として保存します。`;
}

function getCopy(locale: Locale) {
  const copyByLocale = {
    ja: {
      pageTitle: "情報入力",
      cardExcelTitle: "Excel 一括読取",
      cardExcelSubtitle: "物件台帳化を優先",
      cardPdfTitle: "PDF / スキャン登録",
      cardPdfSubtitle: "旧契約・書面を保管",
      cardManualTitle: "手入力登録",
      cardManualSubtitle: "不足情報の補完",
      labelJobName: "資料名",
      labelMemo: "メモ（任意）",
      btnCreateExcelJob: "Excel資料を登録",
      btnCreatePdfJob: "PDF資料を登録",
      btnCreateManualJob: "手入力を作成",
      phExcelJob: "例: 物件台帳_2026Q2.xlsx",
      phPdfJob: "例: 旧契約書一括登録（10件）",
      phManualJob: "例: 修繕履歴_管理物件A",
      phMemoExcel: "例: 31件、ヘッダ確認済",
      phMemoPdf: "例: 契約種別確認待ち",
      phMemoManual: "例: 先に発生日だけ入力",
      historyTitle: "資料登録履歴",
      historySubtitle: "最新順",
      colJob: "資料",
      colSource: "入力種別",
      colTarget: "対象",
      colCreatedAt: "作成日",
      colStatus: "状態",
      wizardTitle: "情報管理アシスト",
      wizardSubtitle: "保存先の確認",
      stepSelect: "選択",
      stepMap: "保存確認",
      stepValidate: "確認",
      stepComplete: "完了",
      schemaMappingTitle: "資料の保存先を確認",
      schemaMappingDesc: "資料にある名前を、業務で使う保存先に合わせます。違うところだけ直してください。",
      saveDraft: "途中保存",
      continueValidation: "確認へ進む",
      sourceColumn: "情報分類",
      targetField: "分類に保存",
      autoMapCol: "初期対応",
      sampleValue: "入力済情報確認",
      unmapped: "この列は保存しない",
      recentImportHistory: "最近の読取履歴",
      viewArchive: "アーカイブ表示",
      issueStatsTitle: "確認事項",
      issueStatsDesc: "直近の読取で確認が必要な内容",
      issueTrendTitle: "確認事項の推移（7日）",
      issueTrendDesc: "日別の確認件数",
      alerts: "アラート",
      validationLog: "確認記録",
      noFurtherAlerts: "追加アラートはありません",
      validationUnmappedRequired: "必須項目の保存先が未設定",
      validationFormatMismatch: "データ形式の不一致",
      validationSchemaSuggestion: "保存先の確認",
      validationUnmappedMsg: "案件に保存する必須項目がまだ選ばれていません。",
      validationFormatMsg: "読取元データに形式の揺れがあります。",
      validationSchemaMsg: "保存先を確認してください。",
      actionResolveNow: "今すぐ修正",
      actionAutoFix: "確認結果を保存",
      actionApplyMapping: "提案を使う",
      exportValidationReport: "確認結果を出力",
      proTipTitle: "操作ヒント",
      proTipDesc:
        "整理提案を確認し、違う行だけ保存先を直してから確認へ進んでください。",
      noJobs: "先に資料を1件追加してください。",
      wizardStep1: "1. 保存先を合わせる",
      wizardStep2: "2. 違うところだけ直す",
      labelTargetJob: "対象資料",
      labelTargetEntity: "保存先",
      labelSourceColumns: "資料の列（カンマ区切り）",
      labelTargetFields: "保存先の項目（カンマ区切り）",
      btnAutoMap: "標準ルールで整理",
      btnSaveMap: "保存",
      phSourceCols: "例: 物件名,所在地,エリア,価格",
      phMapMemo: "例: 保存先の初回整理",
      phSaveMemo: "例: 価格列は税抜",
      fieldDefTitle: "保存先項目",
      fieldDefSubtitle: "保存先を確認",
      attachmentTitle: "添付登録",
      attachmentSubtitle: "実ファイル保存対応",
      labelAttachmentTargetType: "対象種別",
      labelAttachmentTargetId: "関連記録",
      labelUpload: "ファイルアップロード（推奨）",
      labelFileName: "ファイル名（任意）",
      labelExternalUrl: "外部ファイルの場所（任意）",
      labelMime: "ファイル形式（任意）",
      labelFileSize: "ファイルサイズ（任意）",
      btnRegisterAttachment: "添付を登録",
      attachmentHint: "直接アップロードまたは外部ファイルの場所のいずれかを指定してください。",
      phTargetId: "例: import_002 / prop_shibuya",
      phFileName: "アップロードしない場合のみ入力",
      phExternalUrl: "例: https://storage.example.com/docs/a.pdf",
      phMime: "例: application/pdf",
      latestAttachmentTitle: "最新添付履歴",
      latestAttachmentSubtitle: "最新30件",
      noAttachments: "添付はまだありません。",
      typeUnset: "未設定",
      uploadDatePrefix: "登録日",
      openStorage: "保存ファイルを開く",
      optionImportJob: "書類読込",
      optionProperty: "物件",
      optionContract: "契約",
      optionServiceRequest: "対応履歴",
      optionQuote: "提案",
      optionParty: "関係者",
    },
    zh: {
      pageTitle: "录入资料",
      cardExcelTitle: "Excel 批量读取",
      cardExcelSubtitle: "优先整理物件台账",
      cardPdfTitle: "PDF / 扫描登记",
      cardPdfSubtitle: "归档旧合同与文件",
      cardManualTitle: "手动登记",
      cardManualSubtitle: "补齐缺失信息",
      labelJobName: "资料名称",
      labelMemo: "备注（可选）",
      btnCreateExcelJob: "登记 Excel 资料",
      btnCreatePdfJob: "登记 PDF 资料",
      btnCreateManualJob: "登记手动资料",
      phExcelJob: "例：物件台账_2026Q2.xlsx",
      phPdfJob: "例：旧合同批量登记（10条）",
      phManualJob: "例：维修履历_管理物件A",
      phMemoExcel: "例：31条，表头已确认",
      phMemoPdf: "例：待确认合同类型",
      phMemoManual: "例：先录入发生日期",
      historyTitle: "资料读取历史",
      historySubtitle: "按最新排序",
      colJob: "资料",
      colSource: "来源类型",
      colTarget: "目标",
      colCreatedAt: "创建日期",
      colStatus: "状态",
      wizardTitle: "资料整理助手",
      wizardSubtitle: "确认保存位置",
      stepSelect: "选择",
      stepMap: "保存确认",
      stepValidate: "检查",
      stepComplete: "完成",
      schemaMappingTitle: "确认资料要保存到哪里",
      schemaMappingDesc: "把资料里的名称对应到业务保存位置，明显不对的地方直接改。",
      saveDraft: "暂存",
      continueValidation: "进入检查",
      sourceColumn: "资料里的名称",
      targetField: "保存成",
      autoMapCol: "初步对应",
      sampleValue: "确认说明",
      unmapped: "不保存这一列",
      recentImportHistory: "最近读取历史",
      viewArchive: "查看归档",
      issueStatsTitle: "问题汇总",
      issueStatsDesc: "按最近读取结果统计需要处理的内容",
      issueTrendTitle: "问题变化（7天）",
      issueTrendDesc: "按天统计需要确认的内容",
      alerts: "告警",
      validationLog: "检查记录",
      noFurtherAlerts: "暂无更多告警",
      validationUnmappedRequired: "必填项还没有保存位置",
      validationFormatMismatch: "数据格式不一致",
      validationSchemaSuggestion: "保存位置建议",
      validationUnmappedMsg: "案件必填项还没有选择保存位置。",
      validationFormatMsg: "源数据包含格式不一致内容。",
      validationSchemaMsg: "请确认保存位置。",
      actionResolveNow: "立即处理",
      actionAutoFix: "按建议处理",
      actionApplyMapping: "使用建议",
      exportValidationReport: "导出检查结果",
      proTipTitle: "操作提示",
      proTipDesc: "先检查读取结果，只修正不对的行再进入确认。",
      noJobs: "请先登记至少 1 份资料。",
      wizardStep1: "1. 确认保存位置",
      wizardStep2: "2. 只修正不对的地方",
      labelTargetJob: "目标资料",
      labelTargetEntity: "保存到",
      labelSourceColumns: "资料列（逗号分隔）",
      labelTargetFields: "保存位置（逗号分隔）",
      btnAutoMap: "按标准方式整理",
      btnSaveMap: "确认并保存",
      phSourceCols: "例：物件名称,地址,区域,价格",
      phMapMemo: "例：首次确认保存位置",
      phSaveMemo: "例：价格列为不含税",
      fieldDefTitle: "可保存内容",
      fieldDefSubtitle: "确认要保存到案件的项目",
      attachmentTitle: "附件登记",
      attachmentSubtitle: "支持实际文件保存",
      labelAttachmentTargetType: "目标类型",
      labelAttachmentTargetId: "关联记录",
      labelUpload: "上传文件（推荐）",
      labelFileName: "文件名（可选）",
      labelExternalUrl: "外部文件地址（可选）",
      labelMime: "文件格式（可选）",
      labelFileSize: "文件大小（可选）",
      btnRegisterAttachment: "登记附件",
      attachmentHint: "请在直接上传与外部文件地址中二选一。",
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
      optionImportJob: "读取资料",
      optionProperty: "物件",
      optionContract: "合同",
      optionServiceRequest: "跟进记录",
      optionQuote: "提案",
      optionParty: "主体",
    },
    ko: {
      pageTitle: "자료 입력",
      cardExcelTitle: "Excel 일괄 읽기",
      cardExcelSubtitle: "매물 대장 정리 우선",
      cardPdfTitle: "PDF / 스캔 등록",
      cardPdfSubtitle: "구 계약/문서 보관",
      cardManualTitle: "수기 등록",
      cardManualSubtitle: "누락 정보 보완",
      labelJobName: "자료명",
      labelMemo: "메모(선택)",
      btnCreateExcelJob: "Excel 자료 등록",
      btnCreatePdfJob: "PDF 자료 등록",
      btnCreateManualJob: "수기 자료 등록",
      phExcelJob: "예: 매물대장_2026Q2.xlsx",
      phPdfJob: "예: 구 계약서 일괄 등록(10건)",
      phManualJob: "예: 수선 이력_관리매물A",
      phMemoExcel: "예: 31건, 헤더 확인 완료",
      phMemoPdf: "예: 계약 유형 확인 대기",
      phMemoManual: "예: 먼저 발생일만 입력",
      historyTitle: "자료 읽기 이력",
      historySubtitle: "최신순",
      colJob: "자료",
      colSource: "입력 유형",
      colTarget: "대상",
      colCreatedAt: "생성일",
      colStatus: "상태",
      wizardTitle: "자료 정리 도우미",
      wizardSubtitle: "저장 항목 확인",
      stepSelect: "선택",
      stepMap: "저장 확인",
      stepValidate: "확인",
      stepComplete: "완료",
      schemaMappingTitle: "자료를 어디에 저장할지 확인",
      schemaMappingDesc: "자료에 적힌 이름을 업무 저장 위치에 맞춥니다. 다른 부분만 수정하세요.",
      saveDraft: "임시 저장",
      continueValidation: "확인으로 이동",
      sourceColumn: "자료에 적힌 이름",
      targetField: "저장 위치",
      autoMapCol: "초기 대응",
      sampleValue: "확인 내용",
      unmapped: "이 열은 저장하지 않음",
      recentImportHistory: "최근 읽기 이력",
      viewArchive: "보관 이력 보기",
      issueStatsTitle: "확인 사항",
      issueStatsDesc: "최근 읽기 결과에서 확인이 필요한 내용",
      issueTrendTitle: "확인 사항 추이 (7일)",
      issueTrendDesc: "일자별 확인 건수",
      alerts: "알림",
      validationLog: "확인 기록",
      noFurtherAlerts: "추가 알림이 없습니다",
      validationUnmappedRequired: "필수 항목의 저장 위치 미설정",
      validationFormatMismatch: "데이터 형식 불일치",
      validationSchemaSuggestion: "저장 위치 후보",
      validationUnmappedMsg: "안건 필수 항목의 저장 위치가 아직 선택되지 않았습니다.",
      validationFormatMsg: "원본 데이터 형식이 일치하지 않습니다.",
      validationSchemaMsg: "확인할 저장 항목 제안이 있습니다.",
      actionResolveNow: "지금 수정",
      actionAutoFix: "후보 반영",
      actionApplyMapping: "제안 사용",
      exportValidationReport: "확인 결과 내보내기",
      proTipTitle: "사용 팁",
      proTipDesc: "정리 제안을 확인하고, 다른 행만 저장 항목을 고친 뒤 확인으로 진행하세요.",
      noJobs: "먼저 자료를 1건 이상 등록하세요.",
      wizardStep1: "1. 저장 항목 맞추기",
      wizardStep2: "2. 다른 곳만 수정",
      labelTargetJob: "대상 자료",
      labelTargetEntity: "저장 위치",
      labelSourceColumns: "자료 열(쉼표 구분)",
      labelTargetFields: "저장 항목(쉼표 구분)",
      btnAutoMap: "표준 규칙으로 정리",
      btnSaveMap: "확인 후 저장",
      phSourceCols: "예: 매물명,소재지,지역,가격",
      phMapMemo: "예: 저장 항목 첫 정리",
      phSaveMemo: "예: 가격 컬럼은 세전",
      fieldDefTitle: "저장 항목",
      fieldDefSubtitle: "안건에 저장할 항목 확인",
      attachmentTitle: "첨부 등록",
      attachmentSubtitle: "실파일 저장 지원",
      labelAttachmentTargetType: "대상 유형",
      labelAttachmentTargetId: "연결 기록",
      labelUpload: "파일 업로드(권장)",
      labelFileName: "파일명(선택)",
      labelExternalUrl: "외부 파일 위치(선택)",
      labelMime: "파일 형식(선택)",
      labelFileSize: "파일 크기(선택)",
      btnRegisterAttachment: "첨부 등록",
      attachmentHint: "직접 업로드 또는 외부 파일 위치 중 하나를 지정하세요.",
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
      optionImportJob: "읽은 자료",
      optionProperty: "매물",
      optionContract: "계약",
      optionServiceRequest: "후속 기록",
      optionQuote: "제안",
      optionParty: "관계자",
    },
  } as const;

  return copyByLocale[locale];
}

type ExcelImportPayload = {
  kind?: "property_row_import" | "input_file_extraction" | "identity_import_source";
  headers: string[];
  autoMapping: Record<string, string>;
  rows: Record<string, unknown>[];
  originalFilename: string;
  totalRows: number;
  inputExtraction?: InputFileExtractionResult;
  targetCaseId?: string;
};

type ExcelImportResult = {
  successCount: number;
  skipped: { row: number; reason: string }[];
};

type ImportCenterPageProps = {
  searchParams?: Promise<{
    job?: string;
    flash?: string;
    xlsxJob?: string;
    advanced?: string;
    intake?: string;
    targetCaseId?: string;
    flow?: string;
  }>;
};

function getImportPayloadKind(job: HubImportJobItem) {
  if (!job.notes) return undefined;
  try {
    const rawNotes = job.notes.trim();
    const firstLine = rawNotes.split(/\r?\n/, 1)[0] || rawNotes;
    const payload = JSON.parse(firstLine) as Pick<ExcelImportPayload, "kind">;
    return payload.kind;
  } catch {
    return undefined;
  }
}

function isInputFileExtractionJob(job: HubImportJobItem) {
  const kind = getImportPayloadKind(job);
  return kind === "input_file_extraction" || kind === "identity_import_source";
}

function isModernExcelImportJob(job: HubImportJobItem) {
  const kind = getImportPayloadKind(job);
  return kind === "property_row_import" || kind === "input_file_extraction" || kind === "identity_import_source";
}

function isBatchMappingJob(job: HubImportJobItem) {
  return (
    job.sourceType === "excel" &&
    !isInputFileExtractionJob(job) &&
    job.status !== "queued" &&
    job.status !== "processing"
  );
}

function hasBatchMappingPayload(payload: ExcelImportPayload | null): payload is ExcelImportPayload & {
  headers: string[];
  autoMapping: Record<string, string>;
  rows: Record<string, unknown>[];
} {
  if (!payload || payload.kind === "input_file_extraction") return false;
  return (
    (payload.kind === "property_row_import" || payload.kind === undefined) &&
    Array.isArray(payload.headers) &&
    Array.isArray(payload.rows) &&
    typeof payload.autoMapping === "object" &&
    payload.autoMapping !== null
  );
}

function hasPendingExtractionException(extraction: InputFileExtractionResult | undefined) {
  return Boolean(
    extraction?.fields.some((field) => {
      const status = String((field as ExtractedInputFieldWithDecision).reviewStatus ?? "suggested");
      if (status === "unknown") return true;
      if (status === "accepted" || status === "edited" || status === "rejected") return false;
      const value = String(field.normalizedValue || field.value || "").trim();
      return !value || field.confidence < 0.65;
    }),
  );
}

type ExtractedInputFieldWithDecision = InputFileExtractionResult["fields"][number] & {
  reviewStatus?: "suggested" | "accepted" | "edited" | "unknown" | "rejected";
};

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
  const reviewHref = "/organize-center";

  const sourceLabel: Record<HubImportJobItem["sourceType"], string> = {
    excel: t(locale, "import.source.excel"),
    pdf: t(locale, "import.source.pdf"),
    scan: t(locale, "import.source.scan"),
    manual: t(locale, "import.source.manual"),
  };

  const statusLabel: Record<HubImportJobItem["status"], string> = {
    queued: t(locale, "import.status.queued"),
    processing: t(locale, "import.status.processing"),
    mapped: t(locale, "import.status.mapped"),
    completed: t(locale, "import.status.completed"),
    failed: t(locale, "import.status.failed"),
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
  const mappingJobs = jobs.filter(isBatchMappingJob);
  const focusedJob = focusJobId ? jobs.find((job) => job.id === focusJobId) : undefined;
  const focusedMappingJob = focusedJob && isBatchMappingJob(focusedJob) ? focusedJob : undefined;
  const defaultJob = focusedMappingJob ?? mappingJobs[0];
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
  const mappingTargetOptions = Array.from(new Set([...(targetFieldOptions[defaultTarget] ?? []), ...previewTargetFields])).filter(Boolean);
  const previewRows = previewSourceColumns.map((source, index) => {
    const target = previewTargetFields[index];
    return {
      source,
      target,
      targetLabel: target ? getTargetFieldLabel(locale, target) : copy.unmapped,
      targetHelper: target ? getTargetFieldHelper(locale, target) : copy.unmapped,
      confirmation: getMappingConfirmation(locale, source, target),
    };
  });
  const actionLabelByOperation: Record<ImportValidationIssueAction, string> = {
    resolve_now: copy.actionResolveNow,
    auto_fix: copy.actionAutoFix,
    apply_mapping: copy.actionApplyMapping,
    retry: locale === "zh" ? "重新读取" : locale === "ko" ? "재시도" : "再試行",
  };
  const codeTitleMap: Record<string, string> = {
    missing_required_mapping: copy.validationUnmappedRequired,
    unknown_target_fields: copy.validationFormatMismatch,
    mapping_ready: copy.validationSchemaSuggestion,
    import_zero_success: locale === "zh" ? "保存结果为 0" : locale === "ko" ? "저장 성공 0건" : "保存成功 0 件",
    import_row_missing_name:
      locale === "zh" ? "存在空名称行" : locale === "ko" ? "매물명 누락 행 있음" : "物件名未入力行あり",
    import_row_invalid_listing_price:
      locale === "zh" ? "价格格式异常" : locale === "ko" ? "가격 형식 오류" : "価格フィールド異常",
    import_row_unknown_error:
      locale === "zh" ? "保存处理异常" : locale === "ko" ? "저장 처리 오류" : "保存処理エラー",
    import_partial_completed:
      locale === "zh" ? "已部分保存" : locale === "ko" ? "일부 저장 완료" : "一部保存完了",
    import_completed:
      locale === "zh" ? "保存完成" : locale === "ko" ? "저장 완료" : "保存完了",
    validation_resolved:
      locale === "zh" ? "检查已处理" : locale === "ko" ? "확인 완료" : "確認済み",
    retry_queued:
      locale === "zh" ? "已安排重试" : locale === "ko" ? "다시 시도 예정" : "再試行を予定",
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
      ja: "物件を保存しました。",
      zh: "物件已保存。",
      ko: "매물을 저장했습니다.",
    },
    import_job_created: {
      ja: "資料を登録しました。",
      zh: "资料已登记。",
      ko: "자료를 등록했습니다.",
    },
    import_mapping_saved: {
      ja: "資料の保存先を確認しました。",
      zh: "资料保存位置已确认。",
      ko: "자료 저장 항목을 확인했습니다.",
    },
    import_mapping_autofilled: {
      ja: "整理提案を適用しました。",
      zh: "已使用整理建议。",
      ko: "정리 제안을 적용했습니다.",
    },
    import_validation_resolved: {
      ja: "確認記録を更新しました。",
      zh: "检查记录已更新。",
      ko: "확인 기록을 업데이트했습니다.",
    },
    import_job_retried: {
      ja: "この資料をもう一度読み取ります。",
      zh: "这份资料将重新读取。",
      ko: "이 자료를 다시 읽습니다.",
    },
    input_extraction_ready: {
      ja: "業務ファイルの確認項目を読み取りました。",
      zh: "已读取业务文件的待确认项目。",
      ko: "업무 파일의 확인 항목을 읽었습니다.",
    },
    input_extraction_queued: {
      ja: "資料を受け取りました。読み取りを開始します。",
      zh: "资料已接收，正在开始读取。",
      ko: "자료를 받았습니다. 읽기를 시작합니다.",
    },
    identity_extraction_ready: {
      ja: "本人確認資料の確認項目を読み取りました。",
      zh: "已读取身份资料的待确认项目。",
      ko: "본인 확인 자료의 확인 항목을 읽었습니다.",
    },
    excel_upload_missing: {
      ja: "Excel ファイルを選択してください。",
      zh: "请选择 Excel 文件。",
      ko: "Excel 파일을 선택해 주세요.",
    },
    excel_upload_type: {
      ja: ".xlsx ファイルを選択してください。",
      zh: "请选择 .xlsx 文件。",
      ko: ".xlsx 파일을 선택해 주세요.",
    },
    excel_upload_read_failed: {
      ja: "Excel ファイルを読み取れませんでした。ファイル形式を確認してください。",
      zh: "无法读取 Excel 文件，请确认文件格式。",
      ko: "Excel 파일을 읽을 수 없습니다. 파일 형식을 확인해 주세요.",
    },
    excel_upload_empty: {
      ja: "Excel 内に読み取れるデータがありません。",
      zh: "Excel 内没有可读取的数据。",
      ko: "Excel 안에 읽을 수 있는 데이터가 없습니다.",
    },
    identity_upload_missing: {
      ja: "PDF または画像を選択してください。",
      zh: "请选择 PDF 或图片。",
      ko: "PDF 또는 이미지를 선택해 주세요.",
    },
    identity_upload_save_failed: {
      ja: "資料は読み取れましたが、元ファイルを安全に保存できませんでした。時間をおいて再試行してください。",
      zh: "资料已读取，但原始文件未能安全保存。请稍后重试。",
      ko: "자료는 읽었지만 원본 파일을 안전하게 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    },
    identity_upload_too_many: {
      ja: "本人確認資料は一度に6件まで選択できます。",
      zh: "本人资料一次最多选择 6 个文件。",
      ko: "본인 확인 자료는 한 번에 6개까지 선택할 수 있습니다.",
    },
    identity_upload_too_large: {
      ja: "1ファイルあたり25MB以下にしてください。",
      zh: "单个文件请控制在 25MB 以下。",
      ko: "파일 1개당 25MB 이하로 선택해 주세요.",
    },
    identity_upload_total_too_large: {
      ja: "本人確認資料の合計サイズは60MB以下にしてください。",
      zh: "本人资料总大小请控制在 60MB 以下。",
      ko: "본인 확인 자료의 총 용량은 60MB 이하로 선택해 주세요.",
    },
    identity_upload_type: {
      ja: "在留カード・運転免許証のPDFまたは画像ファイルを選択してください。",
      zh: "请选择在留卡或驾照的 PDF / 图片文件。",
      ko: "재류카드 또는 운전면허증 PDF/이미지를 선택해 주세요.",
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
  const flashTone =
    String(flashKey).includes("upload_") || String(flashKey).includes("missing") ? "error" : "success";

  // ── Excel 物件保存 state ──────────────────────────────────────────
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
  const isInputExtractionOnly =
    xlsxPayload?.kind === "input_file_extraction" || xlsxPayload?.kind === "identity_import_source";
  const targetCaseId = String(params?.targetCaseId ?? xlsxPayload?.targetCaseId ?? "").trim();
  const targetCase = targetCaseId ? cases.find((caseItem) => caseItem.id === targetCaseId) : undefined;
  const isIdentityExtractionOnly =
    isInputExtractionOnly &&
    (xlsxJob?.sourceType === "scan" || Boolean(inputExtractionPreview?.documentType.startsWith("identity_")));
  const mergeCandidates =
    xlsxJob && inputExtractionPreview && !targetCaseId
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
  const intakeMode = String(params?.intake ?? "new").trim();
  const isExistingIntake = intakeMode === "existing";
  const requestedJobId = xlsxJobId || focusJobId;
  const requestedJob = xlsxJob ?? focusedJob;
  const missingRequestedJob = Boolean(requestedJobId && !requestedJob);
  const caseByImportJobId = new Map(
    cases.flatMap((caseItem) => caseItem.sourceImportJobIds.map((importJobId) => [importJobId, caseItem] as const)),
  );
  const requestedJobCase = requestedJob ? caseByImportJobId.get(requestedJob.id) : undefined;
  const recentJobHref = (job: HubImportJobItem) => {
    if (isModernExcelImportJob(job)) return `/import-center?xlsxJob=${encodeURIComponent(job.id)}#source-upload`;
    if (job.sourceType === "excel" && (job.status === "queued" || job.status === "processing" || job.status === "failed")) {
      return `/import-center?xlsxJob=${encodeURIComponent(job.id)}#source-upload`;
    }
    if (isBatchMappingJob(job)) return `/import-center?job=${encodeURIComponent(job.id)}&advanced=1#job-mapping`;
    const linkedCase = caseByImportJobId.get(job.id);
    if (linkedCase) return `/cases/${encodeURIComponent(linkedCase.id)}#case-main-editor`;
    return `/import-center?job=${encodeURIComponent(job.id)}#source-review-summary`;
  };
  const requestedJobActionHref = requestedJob
    ? isInputFileExtractionJob(requestedJob)
      ? "#source-upload"
      : requestedJob.sourceType === "excel" &&
          (requestedJob.status === "queued" || requestedJob.status === "processing" || requestedJob.status === "failed")
        ? "#source-upload"
      : isBatchMappingJob(requestedJob)
        ? `/import-center?job=${encodeURIComponent(requestedJob.id)}&advanced=1#job-mapping`
        : requestedJobCase
          ? `/cases/${encodeURIComponent(requestedJobCase.id)}#case-main-editor`
          : "#source-review-summary"
    : "#source-upload";
  const requestedFlow = params?.flow === "ledger" || params?.flow === "case" ? params.flow : undefined;
  const flowIntent: "case" | "ledger" | undefined = targetCaseId ? "case" : requestedFlow;
  const isLedgerFlow = flowIntent === "ledger";
  const hasPendingExceptions = hasPendingExtractionException(inputExtractionPreview);
  const hasAdvancedBatchPayload = hasBatchMappingPayload(xlsxPayload);
  const hasCompletedBatchResult = Boolean(
    requestedJob && requestedJob.status === "completed" && isBatchMappingJob(requestedJob),
  );
  const isAdvancedMappingStep = Boolean(
    showAdvanced &&
      (hasAdvancedBatchPayload ||
        (!xlsxJob && focusedMappingJob && focusedMappingJob.status !== "completed")),
  );
  const wizardStep = !requestedJob
    ? "select"
    : requestedJob.status === "queued" || requestedJob.status === "processing"
      ? "processing"
      : requestedJob.status === "failed"
        ? "failed"
        : hasCompletedBatchResult
          ? "result"
          : hasAdvancedBatchPayload || isAdvancedMappingStep
          ? "mapping"
          : inputExtractionPreview
            ? hasPendingExceptions
              ? "review"
              : "confirm"
            : "review";
  const showPostProcessingContent = wizardStep !== "processing" && wizardStep !== "failed";
  const inputTaskJob = xlsxJob ?? (requestedJob && isInputFileExtractionJob(requestedJob) ? requestedJob : undefined);
  const failedInputJob = inputTaskJob?.status === "failed" ? inputTaskJob : undefined;
  return (
    <div className="bd-page bd-import-page space-y-6">
      <section>
        <h1 className="text-4xl font-bold tracking-tight text-slate-900">{copy.pageTitle}</h1>
      </section>
      <PageFlashBanner message={flashMessage} tone={flashTone} />

      {targetCaseId ? (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3" aria-label={locale === "zh" ? "当前案件目标" : locale === "ko" ? "현재 안건 대상" : "現在の案件"}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-black uppercase tracking-wider text-emerald-700">
                {locale === "zh" ? "追加目标已确定" : locale === "ko" ? "추가 대상이 지정됨" : "追加先を指定済み"}
              </p>
              <p className="mt-1 text-sm font-bold text-emerald-950">
                {targetCase?.caseTitle ?? targetCaseId}
              </p>
            </div>
            <Link href={`/import-center?flow=case&targetCaseId=${encodeURIComponent(targetCaseId)}#source-upload`} className="text-xs font-bold text-emerald-800 underline underline-offset-4">
              {locale === "zh" ? "安全返回资料选择" : locale === "ko" ? "자료 선택으로 돌아가기" : "資料選択へ戻る"}
            </Link>
          </div>
        </section>
      ) : null}

      {requestedJob && (wizardStep === "processing" || wizardStep === "failed") ? (
        <section className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-wider text-blue-700">
                {locale === "zh" ? "已定位到资料" : locale === "ko" ? "자료 위치 확인" : "資料を選択中"}
              </p>
              <h2 className="mt-1 truncate text-base font-black text-slate-950">{requestedJob.title}</h2>
              <p className="mt-1 text-xs font-semibold text-slate-600">
                {sourceLabel[requestedJob.sourceType]} / {targetLabel[requestedJob.targetEntity]} / {statusLabel[requestedJob.status]}
              </p>
            </div>
            <Link
              href={requestedJobActionHref}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#001e40] px-4 py-2 text-xs font-black text-white hover:bg-[#003366]"
            >
              <span className="material-symbols-outlined text-[16px]">
                {requestedJobCase && !isInputFileExtractionJob(requestedJob) && !isBatchMappingJob(requestedJob) ? "arrow_forward" : "arrow_downward"}
              </span>
              {requestedJobCase && !isInputFileExtractionJob(requestedJob) && !isBatchMappingJob(requestedJob)
                ? locale === "zh" ? "到案件中核对" : locale === "ko" ? "안건에서 확인" : "案件で確認"
                : locale === "zh" ? "去处理这份资料" : locale === "ko" ? "이 자료 처리" : "この資料を処理"}
            </Link>
            {wizardStep === "processing" ? (
              <Link href="/import-center?advanced=1" className="text-xs font-bold text-blue-800 underline underline-offset-4">
                {locale === "zh" ? "安全离开，稍后从最近记录恢复" : locale === "ko" ? "안전하게 나가고 최근 기록에서 다시 열기" : "安全に離れ、最近の記録から再開"}
              </Link>
            ) : null}
          </div>
        </section>
      ) : missingRequestedJob ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
          <p>
            {locale === "zh"
              ? "这条资料记录暂时找不到，可能已经被移动、合并或清理。"
              : locale === "ko"
                ? "이 자료 기록을 찾을 수 없습니다. 이동, 병합 또는 정리되었을 수 있습니다."
                : "この資料は見つかりません。移動、統合、または整理された可能性があります。"}
          </p>
          <Link href="/import-center#source-upload" className="mt-2 inline-flex text-xs font-bold text-amber-950 underline underline-offset-4">
            {locale === "zh" ? "返回资料入口" : locale === "ko" ? "자료 입구로 돌아가기" : "資料入口へ戻る"}
          </Link>
        </section>
      ) : null}

      {requestedJob &&
      wizardStep !== "processing" &&
      wizardStep !== "failed" &&
      !isInputFileExtractionJob(requestedJob) &&
      !isBatchMappingJob(requestedJob) ? (
        <section id="source-review-summary" className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="material-symbols-outlined text-blue-700">
                  {requestedJob.sourceType === "scan" ? "document_scanner" : requestedJob.sourceType === "pdf" ? "picture_as_pdf" : "edit_note"}
                </span>
                <h2 className="text-base font-black text-slate-950">
                  {locale === "zh" ? "资料核对入口" : locale === "ko" ? "자료 확인 입구" : "資料確認の入口"}
                </h2>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                  {sourceLabel[requestedJob.sourceType]}
                </span>
              </div>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
                {requestedJobCase
                  ? locale === "zh"
                    ? `这份资料已归入「${requestedJobCase.caseTitle}」。证件图片、PDF 和手动资料不需要做 Excel 列匹配，请在案件中核对读取值和缺失项。`
                    : locale === "ko"
                      ? `이 자료는 「${requestedJobCase.caseTitle}」 안건에 연결되어 있습니다. 이미지, PDF, 수동 자료는 Excel 열 매핑이 필요하지 않으며 안건에서 판독값과 누락 항목을 확인합니다.`
                      : `この資料は「${requestedJobCase.caseTitle}」に紐づいています。画像・PDF・手入力資料に Excel の列対応は不要です。案件で読取値と未入力項目を確認します。`
                  : locale === "zh"
                    ? "这条历史记录尚未连接案件，也没有可继续核对的读取值。可以重新读取原文件，或先建立归属。"
                    : locale === "ko"
                      ? "이 기존 기록은 아직 안건과 연결되지 않았고 계속 확인할 판독값도 없습니다. 원본 파일을 다시 읽거나 먼저 귀속을 지정하세요."
                      : "この旧記録はまだ案件に紐づいておらず、続けて確認できる読取値もありません。元ファイルを読み直すか、先に割当先を決めてください。"}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              {requestedJobCase ? (
                <Link
                  href={`/cases/${encodeURIComponent(requestedJobCase.id)}#case-main-editor`}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-xs font-black text-white hover:bg-slate-800"
                >
                  {locale === "zh" ? "核对案件资料" : locale === "ko" ? "안건 자료 확인" : "案件資料を確認"}
                  <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                </Link>
              ) : (
                <>
                  <Link href="#source-upload" className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-black text-white hover:bg-blue-800">
                    {locale === "zh" ? "重新读取" : locale === "ko" ? "다시 읽기" : "読み直す"}
                  </Link>
                  <Link href="/organize-center" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-black text-slate-700 hover:bg-slate-50">
                    {locale === "zh" ? "设置归属" : locale === "ko" ? "귀속 설정" : "割当先を設定"}
                  </Link>
                </>
              )}
            </div>
          </div>
        </section>
      ) : null}

      {(Boolean(requestedJob) || wizardStep === "select") ? (
      <section id="source-upload" className="scroll-mt-24 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5">
          <p className="text-[11px] font-black uppercase tracking-wider text-blue-700">
            {locale === "zh" ? "读取资料" : locale === "ko" ? "자료 읽기" : "書類読込"}
          </p>
          <h2 className="text-base font-bold text-slate-950">
            {wizardStep !== "select"
              ? locale === "zh" ? "当前导入任务" : locale === "ko" ? "현재 가져오기 작업" : "現在の取込タスク"
              : targetCaseId
                ? locale === "zh" ? "向当前案件追加资料" : locale === "ko" ? "현재 안건에 자료 추가" : "現在の案件に資料を追加"
                : isLedgerFlow
                  ? locale === "zh" ? "读取 Excel 批量台账" : locale === "ko" ? "Excel 일괄 대장 읽기" : "Excel 一括台帳を読み取る"
                  : locale === "zh" ? "选择要读取的资料" : locale === "ko" ? "읽을 자료 선택" : "読み取る資料を選ぶ"}
          </h2>
        </div>

        {wizardStep === "select" && !requestedJob ? (
        <div className={isLedgerFlow ? "grid gap-4 p-5" : "grid gap-4 p-5 xl:grid-cols-2"}>
          {!isLedgerFlow ? (
          <section id="case-material-upload" className="flex min-h-96 flex-col rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5">
            <div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-emerald-700">badge</span>
                <h2 className="text-base font-bold text-emerald-950">
                  {locale === "zh" ? "本人资料" : locale === "ko" ? "본인 자료" : "本人資料"}
                </h2>
              </div>
            </div>
            <div className="mt-auto pt-5">
              {!isIdentityExtractionOnly ? (
                <IdentityDocumentUploadForm
                  action={uploadAndParseIdentityDocumentAction}
                  locale={locale}
                  targetCaseId={targetCaseId || undefined}
                  uploadContext={targetCaseId ? "case" : "import"}
                />
              ) : (
                <a href="/import-center" className="flex h-12 items-center justify-center rounded-lg border border-emerald-300 bg-white px-4 text-sm font-bold text-emerald-900 hover:bg-emerald-50">
                  {locale === "zh" ? "重新选择文件" : locale === "ko" ? "파일 다시 선택" : "ファイルを選び直す"}
                </a>
              )}
            </div>
          </section>
          ) : null}

          <section id="excel-ledger-upload" className="flex min-h-96 flex-col rounded-2xl border border-blue-200 bg-blue-50/40 p-5">
            <div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-700">table_view</span>
                <h2 className="text-base font-bold text-blue-950">
                  {targetCaseId || requestedFlow === "case"
                    ? locale === "zh" ? "案件申请 Excel" : locale === "ko" ? "案件 신청 Excel" : "案件申込 Excel"
                    : isLedgerFlow
                      ? locale === "zh" ? "Excel 批量台账" : locale === "ko" ? "Excel 일괄 대장" : "Excel 一括台帳"
                      : locale === "zh" ? "Excel 资料" : locale === "ko" ? "Excel 자료" : "Excel資料"}
                </h2>
              </div>
              {!targetCaseId && !requestedFlow ? (
                <p className="mt-1 text-xs text-slate-600">
                  {locale === "zh"
                    ? "支持案件申请表和批量台账（.xlsx）。"
                    : locale === "ko"
                      ? "안건 신청서와 일괄 대장(.xlsx)을 지원합니다."
                      : "案件申込書と一括台帳（.xlsx）に対応します。"}
                </p>
              ) : null}
            </div>
            <div className="mt-auto pt-5">
              {!xlsxJob ? (
                <ExcelDocumentUploadForm
                  action={uploadAndParseExcelAction}
                  locale={locale}
                  targetCaseId={targetCaseId || undefined}
                  uploadContext={targetCaseId ? "case" : "import"}
                />
              ) : (
                <a href="/import-center" className="flex h-12 items-center justify-center rounded-lg border border-blue-300 bg-white px-4 text-sm font-bold text-blue-900 hover:bg-blue-50">
                  {locale === "zh" ? "重新选择文件" : locale === "ko" ? "파일 다시 선택" : "ファイルを選び直す"}
                </a>
              )}
            </div>
          </section>

          {!targetCaseId ? (
            <p className={isLedgerFlow ? "text-xs text-slate-500" : "text-xs text-slate-500 xl:col-span-2"}>
              {locale === "zh" ? "没有资料文件？" : locale === "ko" ? "자료 파일이 없나요?" : "資料ファイルがない場合は"} {" "}
              <Link href="/cases/new?from=entry" className="font-bold text-blue-700 underline underline-offset-4 hover:text-blue-900">
                {locale === "zh" ? "改为手动创建" : locale === "ko" ? "수동 생성으로 전환" : "手動作成へ切り替え"}
              </Link>
            </p>
          ) : null}

          {isExistingIntake && !targetCaseId ? (
            <div
              id="existing-case-list"
              className={isLedgerFlow
                ? "rounded-xl border border-slate-200 bg-slate-50 p-4"
                : "rounded-xl border border-slate-200 bg-slate-50 p-4 xl:col-span-2"}
            >
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-950">
                    {locale === "zh" ? "已有案件" : locale === "ko" ? "기존 안건" : "既存案件"}
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    {locale === "zh"
                      ? "进入案件可查看已有资料；读取后的核对结果会先等待确认，再追加到案件。"
                      : locale === "ko"
                        ? "안건에서 기존 자료를 확인할 수 있습니다. 읽은 뒤 확인 결과는 검토 후 안건에 추가됩니다."
                        : "案件で既存資料を確認できます。読取後の確認結果は確認後に案件へ追加します。"}
                  </p>
                </div>
                <Link href="/organize-center" className="text-xs font-bold text-blue-700 hover:underline">
                  {locale === "zh" ? "全部案件" : locale === "ko" ? "전체 안건" : "全案件"}
                </Link>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-3">
                {cases.slice(0, 3).map((caseItem) => (
                  <Link
                    key={caseItem.id}
                    href={`/import-center?intake=existing&targetCaseId=${encodeURIComponent(caseItem.id)}#source-upload`}
                    className="rounded-lg border border-slate-200 bg-white p-3 hover:border-blue-300 hover:bg-blue-50/40"
                  >
                    <p className="truncate text-sm font-bold text-slate-950">{caseItem.caseTitle}</p>
                    <p className="mt-1 text-[11px] text-slate-500">{formatDate(caseItem.updatedAt, locale)}</p>
                  </Link>
                ))}
                {cases.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-200 bg-white p-3 text-sm text-slate-500">
                    {locale === "zh" ? "还没有可选择的案件。" : locale === "ko" ? "선택할 안건이 없습니다." : "選択できる案件はまだありません。"}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
        ) : null}

        {inputTaskJob && (inputTaskJob.status === "queued" || inputTaskJob.status === "processing") ? (
          <ExcelImportQueueProcessor jobId={inputTaskJob.id} locale={locale} targetCaseId={targetCaseId || undefined} />
        ) : null}

        {failedInputJob ? (
          <ExcelImportQueueProcessor
            jobId={failedInputJob.id}
            locale={locale}
            targetCaseId={targetCaseId || undefined}
            statusOnly
          />
        ) : null}

        {showPostProcessingContent && xlsxJob && xlsxPayload && inputExtractionPreview && isIdentityExtractionOnly ? (
          <div className="border-t border-emerald-100 p-5">
          <div className="space-y-4 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-bold text-emerald-950">
                    {locale === "zh" ? "本人资料核对" : locale === "ko" ? "본인 자료 확인" : "顧客情報の確認"}
                  </h3>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                    {inputExtractionPreview.extractionStatus === "recognized"
                      ? locale === "zh" ? "已识别为支持证件" : locale === "ko" ? "지원 증명서로 인식" : "対応資料として識別"
                      : locale === "zh" ? "需手动确认" : locale === "ko" ? "수동 확인 필요" : "手動確認が必要"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  {locale === "zh"
                    ? "只采用确认无误的信息。在留卡或驾照任选一份即可。"
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
              targetCaseId={targetCaseId || undefined}
            />
          </div>
          </div>
        ) : null}
        {showPostProcessingContent &&
        !isIdentityExtractionOnly &&
        (Boolean(inputExtractionPreview) || (wizardStep === "mapping" && showAdvanced) || wizardStep === "result") ? (
          <div className="border-t border-blue-100 p-5">

        {/* Known business file extraction preview */}
        {showPostProcessingContent && xlsxJob && xlsxPayload && inputExtractionPreview && !isIdentityExtractionOnly && !hasBatchMappingPayload(xlsxPayload) && (
          <div className="space-y-4 rounded-xl border border-indigo-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-bold text-indigo-950">
                    {locale === "zh" ? "申请资料核对" : locale === "ko" ? "신청 자료 확인" : "入力内容の確認"}
                  </h3>
                  <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                    {inputExtractionPreview.extractionStatus === "recognized"
                      ? locale === "zh" ? "已读取" : locale === "ko" ? "읽기 완료" : "読取済み"
                      : locale === "zh" ? "需确认" : locale === "ko" ? "확인 필요" : "確認が必要"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  {locale === "zh"
                    ? "逐项核对、修正或标为不明。"
                    : locale === "ko"
                      ? "항목별로 확인, 수정 또는 불명 표시를 해 주세요."
                      : "項目ごとに確認・修正・不明を選びます。"}
                </p>
              </div>
              <a href="/import-center" className="text-xs font-semibold text-indigo-700 hover:underline">
                {locale === "zh" ? "重新选择文件" : locale === "ko" ? "파일 다시 선택" : "ファイルを選び直す"}
              </a>
            </div>

            <details className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-3">
              <summary className="cursor-pointer text-xs font-bold text-indigo-900">
                {locale === "zh" ? "资料详情" : locale === "ko" ? "자료 상세" : "資料詳細"}
              </summary>
            <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg bg-indigo-50 p-3">
                <dt className="font-semibold text-indigo-900">{locale === "zh" ? "状态" : locale === "ko" ? "상태" : "状態"}</dt>
                <dd className="mt-1 text-slate-700">
                  {inputExtractionPreview.extractionStatus === "recognized"
                    ? locale === "zh" ? "已读取" : locale === "ko" ? "읽기 완료" : "読取済み"
                    : locale === "zh" ? "需确认" : locale === "ko" ? "확인 필요" : "確認が必要"}
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
                <dt className="font-semibold text-indigo-900">{locale === "zh" ? "待确认项目数" : locale === "ko" ? "확인 항목 수" : "確認項目数"}</dt>
                <dd className="mt-1 text-slate-700">{inputExtractionPreview.fields.length}</dd>
              </div>
            </dl>
            </details>

            {inputExtractionPreview.fields.length > 0 ? (
              <InputExtractionReview
                extraction={inputExtractionPreview}
                locale={locale}
                importJobId={xlsxJob.id}
                mergeCandidates={mergeCandidates}
                targetCaseId={targetCaseId || undefined}
              />
            ) : (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                {locale === "zh"
                  ? "没有识别为支持的申请资料格式。普通物件台账可继续保存。"
                  : locale === "ko"
                    ? "신청 자료 형식과 일치하지 않습니다. 일반 매물 대장은 계속 저장할 수 있습니다."
                    : "申込資料の形式と一致しません。通常の物件台帳は続けて保存できます。"}
              </div>
            )}
          </div>
        )}

        {wizardStep === "mapping" && hasAdvancedBatchPayload && !showAdvanced && xlsxJob ? (
          <div className="border-t border-blue-100 bg-blue-50/60 p-5">
            <p className="text-sm font-bold text-blue-950">
              {locale === "zh" ? "这份 Excel 被识别为批量台账" : locale === "ko" ? "이 Excel은 일괄 대장으로 인식되었습니다" : "この Excel は一括台帳として識別されました"}
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-700">
              {locale === "zh" ? "字段映射属于高级批量路径。打开后继续确认，不会把它伪装成案件资料复核。" : locale === "ko" ? "필드 매핑은 고급 일괄 경로입니다. 열어 확인을 계속하며案件 자료 확인으로 가장하지 않습니다." : "列対応は高度な一括経路です。開いて確認を続け、案件資料の確認として扱いません。"}
            </p>
            <Link href={`/import-center?xlsxJob=${encodeURIComponent(xlsxJob.id)}&advanced=1#job-mapping`} className="mt-3 inline-flex rounded-lg bg-blue-700 px-3 py-2 text-xs font-bold text-white hover:bg-blue-800">
              {locale === "zh" ? "进入字段映射" : locale === "ko" ? "필드 매핑 열기" : "列対応を開く"}
            </Link>
          </div>
        ) : null}

        {/* Step 2: Mapping confirmation */}
        {wizardStep === "mapping" &&
          showAdvanced &&
          xlsxJob &&
          xlsxJob.sourceType === "excel" &&
          xlsxJob.status !== "completed" &&
          hasBatchMappingPayload(xlsxPayload) && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-blue-900">
                {xlsxPayload.originalFilename} &mdash; {xlsxPayload.totalRows}{" "}
                {locale === "zh" ? "行数据" : locale === "ko" ? "행 데이터" : "行のデータ"}
              </p>
              <a href="/import-center" className="text-xs text-blue-600 hover:underline">
                {locale === "zh" ? "重新选择文件" : locale === "ko" ? "파일 다시 선택" : "ファイルを選び直す"}
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
                {locale === "zh" ? "普通物件台账保存设置" : locale === "ko" ? "일반 매물 대장 저장 설정" : "通常の物件台帳保存設定"}
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
                {locale === "zh" ? "保存到物件台账" : locale === "ko" ? "매물 대장에 저장" : "物件台帳に保存"}
              </button>
            </form>
            </details>
          </div>
        )}

        {/* Step 3: Result */}
        {wizardStep === "result" && requestedJob && requestedJob.status === "completed" && isBatchMappingJob(requestedJob) && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className={`material-symbols-outlined ${xlsxResult ? "text-green-600" : "text-amber-600"}`}>
                {xlsxResult ? "check_circle" : "help"}
              </span>
              <p className="text-sm font-bold text-slate-800">
                {xlsxResult
                  ? locale === "zh"
                    ? `登录成功 ${xlsxResult.successCount} 件 / 跳过 ${xlsxResult.skipped.length} 件`
                    : locale === "ko"
                      ? `등록 성공 ${xlsxResult.successCount}건 / 건너뜀 ${xlsxResult.skipped.length}건`
                      : `登録成功 ${xlsxResult.successCount} 件 / スキップ ${xlsxResult.skipped.length} 件`
                  : locale === "zh"
                    ? "任务记录为 completed，但没有可验证的导入摘要；不能据此确认已写入或全部导入。"
                    : locale === "ko"
                      ? "작업 기록은 completed이지만 검증 가능한 가져오기 요약이 없습니다. 저장 또는 전체 가져오기를 확인할 수 없습니다."
                      : "タスク記録は completed ですが、検証できる取込サマリーがありません。保存済み・全件取込とは確認できません。"}
              </p>
            </div>
            {xlsxResult && xlsxResult.skipped.length > 0 && (
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
                {xlsxResult
                  ? locale === "zh" ? "接下来确认" : locale === "ko" ? "다음 확인 항목" : "次に確認すること"
                  : locale === "zh" ? "下一步" : locale === "ko" ? "다음 단계" : "次のステップ"}
              </p>
              <p className="mt-1 text-xs text-slate-600">
                {xlsxResult
                  ? locale === "zh"
                    ? "打开整理信息，确认要保留到案件的数据。"
                    : locale === "ko"
                      ? "정보 정리를 열고 안건에 남길 데이터를 확인하세요."
                      : "情報整理を開き、案件に残すデータを確認します。"
                  : locale === "zh"
                    ? "打开高级历史查看这条任务的原始状态，不把 completed 单独当作已写入。"
                    : locale === "ko"
                      ? "고급 기록에서 원래 작업 상태를 확인하세요. completed만으로 저장 완료로 간주하지 않습니다."
                      : "高度な履歴で元のタスク状態を確認します。completed だけで保存完了とは扱いません。"}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              {xlsxResult ? (
                <a
                  href={reviewHref}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700"
                >
                  {locale === "zh" ? "整理信息" : locale === "ko" ? "정보 정리" : "情報整理へ"}
                </a>
              ) : (
                <a
                  href={`/import-center?xlsxJob=${encodeURIComponent(requestedJob.id)}&advanced=1#source-history`}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700"
                >
                  {locale === "zh" ? "查看任务记录" : locale === "ko" ? "작업 기록 보기" : "タスク記録を確認"}
                </a>
              )}
              <a href="/import-center" className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                {locale === "zh" ? "继续读取资料" : locale === "ko" ? "자료 계속 읽기" : "続けて資料を読み取る"}
              </a>
            </div>
          </div>
        )}
          </div>
        ) : null}
      </section>
      ) : null}

      {!requestedJob && wizardStep === "select" ? (
      <section id={!showAdvanced ? "source-history" : undefined} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <h2 className="text-base font-bold text-slate-950">
              {locale === "zh" ? "最近读取的资料" : locale === "ko" ? "최근 읽은 자료" : "最近読み取った資料"}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {locale === "zh"
                ? "选择一条资料继续整理。"
                : locale === "ko"
                  ? "자료를 선택해 계속 정리합니다."
                : "資料を選んで整理を続けます。"}
            </p>
          </div>
	        </div>
	        <div className="mt-4 grid gap-2 md:grid-cols-3">
	          {jobs.slice(0, 3).map((job) => {
	            const selected = job.id === requestedJobId;
	            return (
	              <Link
	                key={`simple-import-${job.id}`}
	                href={recentJobHref(job)}
	                className={
	                  "rounded-lg border p-3 hover:bg-white " +
	                  (selected ? "border-blue-300 bg-blue-50 ring-1 ring-blue-100" : "border-slate-200 bg-slate-50")
	                }
	              >
	                <p className="truncate text-sm font-bold text-slate-900">{job.title}</p>
	                <p className="mt-1 text-xs text-slate-500">
	                  {formatDate(job.createdAt, locale)} / {statusLabel[job.status]}
	                </p>
	                <p className={"mt-2 text-[11px] font-bold " + (selected ? "text-blue-700" : "text-slate-700")}>
	                  {selected
	                    ? locale === "zh" ? "正在处理这条资料" : locale === "ko" ? "이 자료 처리 중" : "この資料を処理中"
	                    : locale === "zh" ? "继续处理这条资料" : locale === "ko" ? "이 자료 계속 처리" : "この資料を続ける"}
	                </p>
	              </Link>
	            );
	          })}
          {jobs.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 p-3 text-sm text-slate-500">
              {locale === "zh" ? "还没有读取记录。" : locale === "ko" ? "아직 읽기 기록이 없습니다." : "まだ読取記録はありません。"}
            </p>
          ) : null}
        </div>
      </section>
      ) : null}

      {wizardStep !== "processing" && wizardStep !== "failed" ? (
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              {locale === "zh" ? "台账与附件" : locale === "ko" ? "대장과 첨부" : "台帳と添付"}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {locale === "zh"
                ? "批量保存、检查记录、附件登记。"
                : locale === "ko"
                  ? "일괄 저장, 확인 기록, 첨부 등록."
                  : "一括保存、確認記録、添付登録。"}
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

	      {showAdvanced &&
        defaultJob &&
        focusedMappingJob &&
        isBatchMappingJob(defaultJob) &&
        defaultJob.status !== "completed" &&
        !xlsxJob && (
	      <section id="job-mapping" className="scroll-mt-24 grid gap-6 2xl:grid-cols-12">
        <div className="space-y-6 2xl:col-span-8">
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
	            {defaultJob ? (
	              <div className={"border-b px-6 py-4 " + (focusedMappingJob ? "border-blue-100 bg-blue-50/70" : "border-slate-100 bg-white")}>
	                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
	                  <div className="min-w-0">
	                    <p className="text-[11px] font-black uppercase tracking-wider text-blue-700">
	                      {focusedMappingJob
	                        ? locale === "zh" ? "当前处理资料" : locale === "ko" ? "현재 처리 자료" : "現在処理中の資料"
	                        : locale === "zh" ? "当前资料" : locale === "ko" ? "현재 자료" : "現在の資料"}
	                    </p>
	                    <h3 className="mt-1 truncate text-base font-black text-slate-950">{defaultJob.title}</h3>
	                    <p className="mt-1 text-xs font-semibold text-slate-600">
	                      {sourceLabel[defaultJob.sourceType]} / {targetLabel[defaultJob.targetEntity]}
	                      {defaultJob.notes ? ` / ${defaultJob.notes}` : ""}
	                    </p>
	                  </div>
	                  <span className="inline-flex w-fit rounded-full bg-rose-50 px-3 py-1 text-[11px] font-black text-rose-700 ring-1 ring-rose-100">
	                    {statusLabel[defaultJob.status]}
	                  </span>
	                </div>
	                {focusedMappingJob?.validationMessage ? (
	                  <p className="mt-3 rounded-lg border border-blue-100 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
	                    {focusedMappingJob.validationMessage}
	                  </p>
	                ) : null}
	              </div>
	            ) : null}
	            {!hasDefaultJob ? <p className="px-6 py-3 text-sm text-amber-700">{copy.noJobs}</p> : null}

	            <form id="mapping-form" action={updateImportJobMappingAction}>
              <input type="hidden" name="jobId" value={defaultJob?.id} />
              <input type="hidden" name="targetEntity" value={defaultTarget} />
	              <div className="overflow-x-auto">
		                <table className="w-full min-w-[760px] border-collapse text-left">
		                  <thead>
		                    <tr className="bg-[#edf2fd]">
		                      <th className="px-6 py-4 text-[11px] font-black uppercase tracking-widest text-[#1f477b]">{copy.sourceColumn}</th>
		                      <th className="px-6 py-4 text-[11px] font-black uppercase tracking-widest text-[#1f477b]">{copy.targetField}</th>
		                      <th className="px-6 py-4 text-[11px] font-black uppercase tracking-widest text-[#1f477b]">{copy.sampleValue}</th>
		                    </tr>
	                  </thead>
	                  <tbody className="divide-y divide-slate-100">
	                    {previewRows.map((row, index) => {
	                      const mapped = Boolean(row.target);
	                      return (
	                        <tr key={row.source + index} className="transition hover:bg-slate-50/70">
	                          <td className="px-6 py-4">
	                            <p className="text-sm font-black text-slate-950">{row.source}</p>
	                            <p className="mt-1 text-[11px] font-semibold text-slate-500">
	                              {locale === "zh" ? "原资料表头" : locale === "ko" ? "원본 자료 표기" : "元資料の表記"}
	                            </p>
	                          </td>
	                          <td className="px-6 py-4">
	                            <input type="hidden" name="sourceColumn" value={row.source} />
	                            <select
	                              name="targetField"
	                              defaultValue={row.target ?? ""}
	                              aria-label={`${copy.targetField}: ${row.source}`}
	                              className={"w-full rounded-lg border px-3 py-2 text-sm font-black focus:outline-none focus:ring-2 focus:ring-[#001e40] " + (mapped ? "border-[#001e40] bg-[#edf2fd] text-[#001e40]" : "border-red-300 bg-red-50 text-red-600")}
	                            >
	                              <option value="">{copy.unmapped}</option>
	                              {mappingTargetOptions.map((field) => (
	                                <option key={field} value={field}>{getTargetFieldLabel(locale, field)}</option>
	                              ))}
	                            </select>
	                            <p className="mt-1.5 text-[11px] font-semibold leading-5 text-slate-500">{row.targetHelper}</p>
	                          </td>
		                          <td className="px-6 py-4">
		                            <p className="text-xs font-semibold leading-5 text-slate-600">{row.confirmation}</p>
		                          </td>
	                        </tr>
	                      );
                    })}
                  </tbody>
                </table>
              </div>
            </form>
          </article>

          <article id="source-history" className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#001e40]">{copy.recentImportHistory}</h3>
              <Link href="/import-center?panel=history" className="inline-flex items-center gap-1 text-[11px] font-bold text-[#001e40]">
                {copy.viewArchive}
                <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
              </Link>
            </div>
            <div className="space-y-2">
	              {jobs.slice(0, 3).map((job, index) => {
	                const selected = job.id === requestedJobId;
	                return (
	                  <div
	                    key={job.id}
	                    className={
	                      "group flex items-center gap-5 rounded-xl p-4 transition hover:bg-[#e4edff] " +
	                      (selected ? "bg-blue-50 ring-2 ring-blue-200" : "bg-[#edf2fd]")
	                    }
	                  >
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
	                    <Link href={recentJobHref(job)} className="text-slate-400 transition group-hover:text-slate-700">
	                      <span className="material-symbols-outlined">more_vert</span>
	                    </Link>
	                  </div>
	                );
	              })}
            </div>
          </article>
        </div>

        <aside className="space-y-5 2xl:col-span-4">
          <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-[#1f477b]">
              {locale === "zh" ? "处理状态" : locale === "ko" ? "처리 상태" : "処理状態"}
            </h3>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
              <div className="rounded-lg bg-white p-3">
                <dt className="font-semibold text-slate-500">{locale === "zh" ? "读取待确认" : locale === "ko" ? "읽기 확인 대기" : "読取・確認待ち"}</dt>
                <dd className="mt-1 text-xl font-black text-slate-900">{mappedJobCount}</dd>
              </div>
              <div className="rounded-lg bg-white p-3">
                <dt className="font-semibold text-slate-500">{locale === "zh" ? "已处理记录" : locale === "ko" ? "처리 기록" : "処理記録"}</dt>
                <dd className="mt-1 text-xl font-black text-slate-900">{completedJobCount}</dd>
              </div>
              <div className="rounded-lg bg-white p-3">
                <dt className="font-semibold text-slate-500">{copy.alerts}</dt>
                <dd className="mt-1 text-xl font-black text-rose-700">{validationItems.length}</dd>
              </div>
            </dl>
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
                        {locale === "zh" ? "重新读取" : locale === "ko" ? "재시도" : "再試行"}
                      </button>
                    </form>
                  ) : null}
                </div>
              ))}
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
                      <a
                        href={att.storagePath.startsWith("local-private://") ? `/api/attachments/${att.id}` : att.storagePath}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex text-[10px] font-bold text-[#001e40] hover:underline"
                      >
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
      ) : null}
    </div>
  );
}
