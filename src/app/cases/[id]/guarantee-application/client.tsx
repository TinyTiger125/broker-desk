"use client";

import { useEffect, useState } from "react";
import type { Locale } from "@/lib/locale";
import { getGuaranteeApplicationRecoveryAction } from "@/lib/guarantee-application-recovery";

type PublishedVersion = { id: string; versionNumber: number; blankFormVersionId: string; formName: string };
type HistoryItem = { id: string; generatedAt: string; version?: string; fileReady: boolean };
type ApplicationDraftValues = {
  guaranteeCompany: string;
  applicationDate: string;
  planType: string;
  consent: boolean;
  collectionAgency: string;
  singleRider: string;
  notes: string;
};

const COPY: Record<Locale, {
  errors: Record<string, string>;
  temporaryError: string;
  disabled: string;
  backToCase: string;
  eyebrow: string;
  title: string;
  caseFactsTitle: string;
  caseFactsDescription: string;
  caseFactsEmpty: string;
  noPublishedVersions: string;
  contactTemplateAdmin: string;
  selectFormTitle: string;
  formLabel: string;
  chooseForm: string;
  durableDataBoundary: string;
  templateUnavailable: string;
  guaranteeCompany: string;
  applicationDate: string;
  planType: string;
  collectionAgency: string;
  singleRider: string;
  notSelected: string;
  use: string;
  doNotUse: string;
  undecided: string;
  singleRiderYes: string;
  singleRiderNo: string;
  unconfirmed: string;
  consent: string;
  notes: string;
  saveDraft: string;
  saved: string;
  previewTitle: string;
  previewDescription: string;
  previewButton: string;
  generateButton: string;
  noGeneratePermission: string;
  previewLocked: string;
  generationHelp: string;
  generationInProgress: string;
  refreshGenerationStatus: string;
  generated: string;
  historyTitle: string;
  historyEmpty: string;
  version: string;
  openPdf: string;
  openingPdf: string;
  retryPdf: string;
  fileUnavailable: string;
  historyOpenFailed: string;
  historyEmptyFile: string;
  historyLoaded: string;
  planOptions: Array<{ value: string; label: string }>;
}> = {
  ja: {
    errors: {
      case_not_found: "案件が見つからないか、現在のアカウントではアクセスできません。",
      mask_match_not_exact: "現在の帳票バージョンは利用できません。会社の帳票ライブラリに戻って、もう一度開いてください。",
      application_draft_context_required: "公開済みの会社帳票を先に選択してください。",
      application_draft_save_context_required: "保存する前に公開済みの会社帳票を選択してください。",
      permission_denied: "現在のアカウントにはこの操作の権限がありません。",
      generation_confirmation_not_found: "生成状態を確認できません。入力内容を確認して、もう一度プレビューを生成してください。",
      generation_in_progress: "ファイルを生成中です。完了するまでお待ちください。履歴に結果が表示されたら、そこから開けます。",
      preview_confirmation_expired: "プレビューの有効期限が切れました。入力内容を確認して、もう一度プレビューを生成してからファイルを生成してください。",
      preview_confirmation_required: "先にプレビューを生成してください。入力内容を確認してから、もう一度プレビューを生成してください。",
      preview_stale: "案件に登録済みの情報または帳票が更新されたため、確認済みプレビューを使えません。現在の内容を確認して、もう一度プレビューを生成してください。",
      guarantee_slice1_failed: "申請資料の生成に失敗したか、状態の確認に時間がかかっています。連続送信せず、履歴または生成状態を確認してから再試行してください。",
    },
    temporaryError: "申請資料の生成状態を確認できません。連続送信せず、履歴または生成状態を確認してから再試行してください。",
    disabled: "この申込機能は現在利用できません。利用権限または環境設定を確認してください。",
    backToCase: "案件に戻る",
    eyebrow: "案件の申請資料",
    title: "保証会社申込書を作成",
    caseFactsTitle: "案件資料",
    caseFactsDescription: "以下は現在の案件から読み込んだ、案件に登録済みの情報です。このページで今回の保証申請を入力しても、案件資料は変更されません。",
    caseFactsEmpty: "表示できる案件資料はありません。",
    noPublishedVersions: "利用できる公開済み帳票がありません。",
    contactTemplateAdmin: "会社の帳票管理者に確認してください。",
    selectFormTitle: "公開済み帳票を選択",
    formLabel: "帳票",
    chooseForm: "選択してください",
    durableDataBoundary: "氏名・住所・勤務先・物件などは案件に登録済みの情報です。保証会社、申請日、今回の申告・選択はこの申請記録に保存され、案件の事実情報は変更しません。",
    templateUnavailable: "選択した帳票は利用できません。別の公開済み帳票を選択するか、会社の帳票管理者に確認してください。",
    guaranteeCompany: "保証会社",
    applicationDate: "申請日",
    planType: "今回の保証プラン",
    collectionAgency: "収納代行",
    singleRider: "単身者特約",
    notSelected: "未選択",
    use: "利用する",
    doNotUse: "利用しない",
    undecided: "未定",
    singleRiderYes: "あり",
    singleRiderNo: "なし",
    unconfirmed: "未確認",
    consent: "今回の申請に関する個人情報の同意を確認しました",
    notes: "今回の申告・備考",
    saveDraft: "今回の保証申請を保存",
    saved: "保存済み",
    previewTitle: "プレビューと生成",
    previewDescription: "案件に登録済みの情報、帳票バージョン、今回の申請記録を固定してプレビューを生成します。生成前に表示内容と権限を確認してください。",
    previewButton: "申込書をプレビュー",
    generateButton: "確認してファイルを生成",
    noGeneratePermission: "生成権限がありません",
    previewLocked: "プレビューを固定しました。確認後にファイルを生成できます。",
    generationHelp: "生成中は同じファイルを重ねて作成しないため、ボタンを連続して押さず、履歴または「生成状態を確認」から結果を確認してください。失敗しても案件資料は変更されません。",
    generationInProgress: "ファイル生成を処理中です。同じファイルを重ねて作成しないため、連続送信せず、生成状態を更新するか履歴を確認してください。",
    refreshGenerationStatus: "生成状態を確認",
    generated: "申込書を生成し、この案件の履歴に保存しました。",
    historyTitle: "案件申込書の履歴",
    historyEmpty: "生成済みファイルはありません。",
    version: "バージョン",
    openPdf: "PDFを表示",
    openingPdf: "開いています…",
    retryPdf: "PDFを再表示",
    fileUnavailable: "ファイルを利用できません",
    historyOpenFailed: "履歴ファイルを開けません。もう一度お試しください。案件資料は変更されていません。",
    historyEmptyFile: "履歴ファイルが空です。もう一度お試しください。案件資料は変更されていません。",
    historyLoaded: "履歴PDFを読み込みました。この案件ページで確認できます。",
    planOptions: [
      { value: "住居用標準プラン", label: "住居用標準プラン" },
      { value: "サポート50", label: "サポート50" },
      { value: "サポート100", label: "サポート100" },
      { value: "学生", label: "学生" },
      { value: "駐車場プラン", label: "駐車場プラン" },
      { value: "店舗・事務所プラン", label: "店舗・事務所プラン" },
      { value: "その他", label: "その他" },
    ],
  },
  zh: {
    errors: {
      case_not_found: "当前案件不存在或无法访问。",
      mask_match_not_exact: "当前表格版本暂不可用，请返回公司表格库后重新进入。",
      application_draft_context_required: "请先选择已发布的公司表格。",
      application_draft_save_context_required: "请先选择已发布的公司表格后再保存。",
      permission_denied: "当前身份没有执行此操作的权限。",
      generation_confirmation_not_found: "无法确认生成状态。请确认本次申请内容后重新生成预览。",
      generation_in_progress: "文件正在生成，请稍候。完成后结果会出现在历史记录中，可从那里打开。",
      preview_confirmation_expired: "预览已过期。请确认本次申请内容，重新生成预览后再生成文件。",
      preview_confirmation_required: "请先生成预览。确认本次申请内容后，再重新生成预览。",
      preview_stale: "案件中已登记的信息或表格已更新，无法使用之前确认的预览。请确认当前内容后重新生成预览。",
      guarantee_slice1_failed: "申请资料可能仍在生成，或暂时无法确认状态。请勿重复提交，先查看历史记录或刷新生成状态后再重试。",
    },
    temporaryError: "暂时无法确认申请资料的生成状态。请勿重复提交，先查看历史记录或刷新生成状态后再重试。",
    disabled: "当前无法使用该申请功能。请确认访问权限或环境设置。",
    backToCase: "返回案件",
    eyebrow: "案件申请资料",
    title: "生成保证公司申请书",
    caseFactsTitle: "案件资料",
    caseFactsDescription: "以下资料读取自当前案件，是案件中已登记的信息；本页面不会因填写本次保证申请而改写。",
    caseFactsEmpty: "当前案件暂无可显示的案件资料。",
    noPublishedVersions: "当前公司没有可用的已发布表格。",
    contactTemplateAdmin: "请联系公司表格管理员。",
    selectFormTitle: "选择已发布表格",
    formLabel: "表格",
    chooseForm: "请选择",
    durableDataBoundary: "案件姓名、地址、工作和房源等属于案件中已登记的信息；保证公司、申请日期和本次声明/选择属于当前案件的本次保证申请记录，不会改写案件事实。",
    templateUnavailable: "所选表格暂不可用。请选择其他已发布表格，或联系公司表格管理员。",
    guaranteeCompany: "保证公司",
    applicationDate: "申请日期",
    planType: "本次保证选择",
    collectionAgency: "収納代行",
    singleRider: "单身特约",
    notSelected: "未选择",
    use: "利用",
    doNotUse: "不利用",
    undecided: "未定",
    singleRiderYes: "有",
    singleRiderNo: "无",
    unconfirmed: "未确认",
    consent: "已确认本次申请的个人信息同意",
    notes: "本次声明/备注",
    saveDraft: "保存本次保证申请",
    saved: "已保存到当前案件",
    previewTitle: "预览与生成",
    previewDescription: "系统会锁定案件中已登记的信息、表格版本和本次申请记录后生成预览。生成前请确认显示内容和权限。",
    previewButton: "预览申请书",
    generateButton: "确认并生成文件",
    noGeneratePermission: "没有生成权限",
    previewLocked: "预览已锁定，可以确认后生成文件。",
    generationHelp: "生成过程中不会重复创建同一文件。请勿连续提交，可通过历史记录或“刷新生成状态”确认结果；即使失败，案件资料也不会被修改。",
    generationInProgress: "文件正在生成，请勿重复提交。可以安全刷新生成状态或查看下方历史记录。",
    refreshGenerationStatus: "刷新生成状态",
    generated: "申请书已生成并保存到本案件历史。",
    historyTitle: "案件申请书历史",
    historyEmpty: "尚无已生成文件。",
    version: "版本",
    openPdf: "查看 PDF",
    openingPdf: "正在打开…",
    retryPdf: "重试查看 PDF",
    fileUnavailable: "文件暂不可用",
    historyOpenFailed: "历史文件暂时无法打开，请重试。案件资料未受影响。",
    historyEmptyFile: "历史文件为空，请重试。案件资料未受影响。",
    historyLoaded: "历史 PDF 已加载，可在当前案件页面查看。",
    planOptions: [
      { value: "住居用標準プラン", label: "居住用标准方案" },
      { value: "サポート50", label: "Support 50" },
      { value: "サポート100", label: "Support 100" },
      { value: "学生", label: "学生方案" },
      { value: "駐車場プラン", label: "停车场方案" },
      { value: "店舗・事務所プラン", label: "店铺/办公室方案" },
      { value: "その他", label: "其他" },
    ],
  },
  ko: {
    errors: {
      case_not_found: "안건을 찾을 수 없거나 현재 계정으로 접근할 수 없습니다.",
      mask_match_not_exact: "현재 서식 버전을 사용할 수 없습니다. 회사 서식 라이브러리에서 다시 열어 주세요.",
      application_draft_context_required: "먼저 게시된 회사 서식을 선택해 주세요.",
      application_draft_save_context_required: "저장하기 전에 게시된 회사 서식을 선택해 주세요.",
      permission_denied: "현재 계정에는 이 작업을 수행할 권한이 없습니다.",
      generation_confirmation_not_found: "생성 상태를 확인할 수 없습니다. 이번 신청 내용을 확인한 뒤 미리보기를 다시 생성해 주세요.",
      generation_in_progress: "파일을 생성 중입니다. 완료되면 이력에서 결과를 열 수 있습니다.",
      preview_confirmation_expired: "미리보기 유효 시간이 만료되었습니다. 이번 신청 내용을 확인한 뒤 미리보기를 다시 생성하고 파일을 만들어 주세요.",
      preview_confirmation_required: "먼저 미리보기를 생성해 주세요. 이번 신청 내용을 확인한 뒤 미리보기를 다시 생성해 주세요.",
      preview_stale: "안건에 등록된 정보 또는 서식이 변경되어 이전에 확인한 미리보기를 사용할 수 없습니다. 현재 내용을 확인한 뒤 미리보기를 다시 생성해 주세요.",
      guarantee_slice1_failed: "신청 자료가 아직 생성 중이거나 상태를 확인할 수 없습니다. 중복 제출하지 말고 이력 또는 생성 상태를 확인한 뒤 다시 시도해 주세요.",
    },
    temporaryError: "신청 자료의 생성 상태를 확인할 수 없습니다. 중복 제출하지 말고 이력 또는 생성 상태를 확인한 뒤 다시 시도해 주세요.",
    disabled: "현재 신청 기능을 사용할 수 없습니다. 이용 권한 또는 환경 설정을 확인해 주세요.",
    backToCase: "안건으로 돌아가기",
    eyebrow: "안건 신청 자료",
    title: "보증회사 신청서 만들기",
    caseFactsTitle: "안건 자료",
    caseFactsDescription: "다음 자료는 현재 안건에서 읽은 안건 등록 정보입니다. 이 페이지에서 이번 보증 신청을 입력해도 안건 자료는 변경되지 않습니다.",
    caseFactsEmpty: "현재 안건에 표시할 자료가 없습니다.",
    noPublishedVersions: "사용할 수 있는 게시된 서식이 없습니다.",
    contactTemplateAdmin: "회사 서식 관리자에게 문의해 주세요.",
    selectFormTitle: "게시된 서식 선택",
    formLabel: "서식",
    chooseForm: "선택해 주세요",
    durableDataBoundary: "이름·주소·근무처·매물 등은 안건에 등록된 정보입니다. 보증회사, 신청일, 이번 신고/선택은 이번 신청 기록에 저장되며 안건 사실은 변경하지 않습니다.",
    templateUnavailable: "선택한 서식을 사용할 수 없습니다. 다른 게시 서식을 선택하거나 회사 서식 관리자에게 문의해 주세요.",
    guaranteeCompany: "보증회사",
    applicationDate: "신청일",
    planType: "이번 보증 플랜",
    collectionAgency: "수납 대행",
    singleRider: "1인 가구 특약",
    notSelected: "선택하지 않음",
    use: "이용",
    doNotUse: "이용하지 않음",
    undecided: "미정",
    singleRiderYes: "있음",
    singleRiderNo: "없음",
    unconfirmed: "미확인",
    consent: "이번 신청의 개인정보 동의를 확인했습니다",
    notes: "이번 신고/메모",
    saveDraft: "이번 보증 신청 저장",
    saved: "현재 안건에 저장됨",
    previewTitle: "미리보기 및 생성",
    previewDescription: "안건 등록 정보, 서식 버전, 이번 신청 기록을 고정한 뒤 미리보기를 생성합니다. 생성 전에 표시 내용과 권한을 확인해 주세요.",
    previewButton: "신청서 미리보기",
    generateButton: "확인 후 파일 생성",
    noGeneratePermission: "생성 권한 없음",
    previewLocked: "미리보기를 고정했습니다. 확인 후 파일을 생성할 수 있습니다.",
    generationHelp: "생성 중에는 같은 파일을 중복으로 만들지 않습니다. 연속 제출하지 말고 이력 또는 ‘생성 상태 새로 고침’으로 결과를 확인해 주세요. 실패해도 안건 자료는 변경되지 않습니다.",
    generationInProgress: "파일 생성 처리 중입니다. 중복 제출하지 말고 생성 상태 또는 아래 이력을 확인해 주세요.",
    refreshGenerationStatus: "생성 상태 새로 고침",
    generated: "신청서를 생성하여 이 안건의 이력에 저장했습니다.",
    historyTitle: "안건 신청서 이력",
    historyEmpty: "생성된 파일이 없습니다.",
    version: "버전",
    openPdf: "PDF 보기",
    openingPdf: "여는 중…",
    retryPdf: "PDF 다시 보기",
    fileUnavailable: "파일을 사용할 수 없습니다",
    historyOpenFailed: "이력 파일을 열 수 없습니다. 다시 시도해 주세요. 안건 자료는 변경되지 않았습니다.",
    historyEmptyFile: "이력 파일이 비어 있습니다. 다시 시도해 주세요. 안건 자료는 변경되지 않았습니다.",
    historyLoaded: "이력 PDF를 불러왔습니다. 이 안건 페이지에서 확인할 수 있습니다.",
    planOptions: [
      { value: "住居用標準プラン", label: "주거용 표준 플랜" },
      { value: "サポート50", label: "Support 50" },
      { value: "サポート100", label: "Support 100" },
      { value: "学生", label: "학생 플랜" },
      { value: "駐車場プラン", label: "주차장 플랜" },
      { value: "店舗・事務所プラン", label: "점포/사무실 플랜" },
      { value: "その他", label: "기타" },
    ],
  },
};

function defaultApplicationDate() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function defaultApplicationValues(): ApplicationDraftValues {
  return {
    guaranteeCompany: "friends_guarantee",
    applicationDate: defaultApplicationDate(),
    planType: "住居用標準プラン",
    consent: false,
    collectionAgency: "",
    singleRider: "",
    notes: "",
  };
}

type Props = {
  locale: Locale;
  enabled: boolean;
  caseId: string;
  caseTitle: string;
  caseFacts: Array<{ label: string; value: string }>;
  publishedVersions: PublishedVersion[];
  initialHistory: HistoryItem[];
  canGenerate: boolean;
};

class GuaranteeApplicationActionError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "GuaranteeApplicationActionError";
    this.code = code;
  }
}

async function postJson(locale: Locale, action: string, body: Record<string, unknown>) {
  const response = await fetch("/api/guarantee-g1-slice1", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ...body }) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = String(payload.error ?? "");
    const recoveryAction = getGuaranteeApplicationRecoveryAction(code);
    const message = recoveryAction === "select_template"
      ? COPY[locale].templateUnavailable
      : COPY[locale].errors[code] ?? COPY[locale].temporaryError;
    throw new GuaranteeApplicationActionError(code, message);
  }
  return payload as Record<string, unknown>;
}

export function GuaranteeApplicationClient({ locale, enabled, caseId, caseTitle, caseFacts, publishedVersions, initialHistory, canGenerate }: Props) {
  const text = COPY[locale];
  const [maskVersionId, setMaskVersionId] = useState(publishedVersions[0]?.id ?? "");
  const initialValues = defaultApplicationValues();
  const [guaranteeCompany, setGuaranteeCompany] = useState(initialValues.guaranteeCompany);
  const [applicationDate, setApplicationDate] = useState(initialValues.applicationDate);
  const [planType, setPlanType] = useState(initialValues.planType);
  const [consent, setConsent] = useState(initialValues.consent);
  const [collectionAgency, setCollectionAgency] = useState(initialValues.collectionAgency);
  const [singleRider, setSingleRider] = useState(initialValues.singleRider);
  const [notes, setNotes] = useState(initialValues.notes);
  const [persisted, setPersisted] = useState(false);
  const [confirmationId, setConfirmationId] = useState("");
  const [previewSrc, setPreviewSrc] = useState("");
  const [history, setHistory] = useState(initialHistory);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [generationPending, setGenerationPending] = useState(false);
  const [historyLoadingId, setHistoryLoadingId] = useState("");
  const [historyErrorId, setHistoryErrorId] = useState("");
  const [historyPreviewUrl, setHistoryPreviewUrl] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!maskVersionId) return;
      setError("");
      try {
        const result = await postJson(locale, "loadApplicationDraft", { caseId, maskVersionId });
        if (cancelled) return;
        const supplement = result.supplement as Record<string, unknown> | undefined;
        const defaults = defaultApplicationValues();
        const stringValue = (key: string, fallback: string) => typeof supplement?.[key] === "string" && String(supplement[key]).trim() ? String(supplement[key]) : fallback;
        setConsent(supplement?.["company_option.friends_consent"] === true);
        setGuaranteeCompany(stringValue("application.guarantee_company", defaults.guaranteeCompany));
        setApplicationDate(stringValue("application.application_date", defaults.applicationDate));
        setPlanType(stringValue("company_option.friends_plan_type", defaults.planType));
        setCollectionAgency(stringValue("company_option.friends_collection_agency", defaults.collectionAgency));
        setSingleRider(stringValue("company_option.friends_single_rider", defaults.singleRider));
        setNotes(stringValue("company_option.friends_notes", defaults.notes));
        setPersisted(result.persisted === true);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : text.temporaryError);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [caseId, locale, maskVersionId, text.temporaryError]);

  useEffect(() => () => {
    if (historyPreviewUrl) window.URL.revokeObjectURL(historyPreviewUrl);
  }, [historyPreviewUrl]);

  if (!enabled) return <main className="mx-auto max-w-3xl px-6 py-12"><h1 className="text-2xl font-semibold text-slate-950">{text.title}</h1><p className="mt-3 text-sm text-slate-600">{text.disabled}</p></main>;

  const selected = publishedVersions.find((item) => item.id === maskVersionId);
  const clearPreviewConfirmation = () => {
    setConfirmationId("");
    setPreviewSrc("");
    setGenerationPending(false);
  };
  const handleActionError = (caught: unknown) => {
    const recoveryAction = caught instanceof GuaranteeApplicationActionError
      ? getGuaranteeApplicationRecoveryAction(caught.code)
      : "none";
    if (recoveryAction === "retry_preview" || recoveryAction === "select_template") clearPreviewConfirmation();
    if (recoveryAction === "refresh_generation") {
      setGenerationPending(true);
      setError("");
      setMessage(text.generationInProgress);
      return;
    }
    setError(caught instanceof Error ? caught.message : text.temporaryError);
  };
  const run = async (operation: () => Promise<void>) => {
    setBusy(true); setError(""); setMessage("");
    try { await operation(); } catch (caught) { handleActionError(caught); } finally { setBusy(false); }
  };

  const currentDraftValues = (): ApplicationDraftValues => ({
    guaranteeCompany,
    applicationDate,
    planType,
    consent,
    collectionAgency,
    singleRider,
    notes,
  });

  const resetApplicationValues = () => {
    const defaults = defaultApplicationValues();
    setGuaranteeCompany(defaults.guaranteeCompany);
    setApplicationDate(defaults.applicationDate);
    setPlanType(defaults.planType);
    setConsent(defaults.consent);
    setCollectionAgency(defaults.collectionAgency);
    setSingleRider(defaults.singleRider);
    setNotes(defaults.notes);
    setPersisted(false);
  };

  const saveDraft = () => void run(async () => {
    if (!selected) throw new Error("application_draft_save_context_required");
    await postJson(locale, "saveApplicationDraft", { caseId, maskVersionId, supplement: currentDraftValues() });
    setPersisted(true);
    setMessage(text.saved);
  });

  const openHistoryFile = async (item: HistoryItem) => {
    setHistoryLoadingId(item.id);
    setHistoryErrorId("");
    setError("");
    try {
      const response = await fetch(`/api/guarantee-g1-slice1/output/${encodeURIComponent(item.id)}?caseId=${encodeURIComponent(caseId)}`, { credentials: "include", cache: "no-store" });
      const contentType = String(response.headers.get("content-type") ?? "").toLowerCase();
      if (!response.ok || !contentType.includes("application/pdf")) {
        const payload = await response.json().catch(() => ({}));
        const requestId = typeof payload.requestId === "string" ? payload.requestId : "";
        throw new Error(requestId ? `${text.historyOpenFailed} ${locale === "ja" ? "リクエスト番号" : locale === "ko" ? "요청 번호" : "请求编号"}：${requestId}` : text.historyOpenFailed);
      }
      const bytes = await response.blob();
      if (!bytes.size) throw new Error(text.historyEmptyFile);
      if (historyPreviewUrl) window.URL.revokeObjectURL(historyPreviewUrl);
      setHistoryPreviewUrl(window.URL.createObjectURL(bytes));
      setMessage(text.historyLoaded);
    } catch (caught) {
      setHistoryErrorId(item.id);
      setError(caught instanceof Error ? caught.message : text.historyOpenFailed);
    } finally {
      setHistoryLoadingId("");
    }
  };

  const refreshGenerationStatus = () => void run(async () => {
    if (!confirmationId) return;
    const result = await postJson(locale, "generationStatus", { confirmationId });
    const status = String(result.status ?? "");
    if (status === "completed" && result.outputId) {
      const id = String(result.outputId);
      setHistory((items) => [{ id, generatedAt: new Date().toISOString(), version: String(selected?.versionNumber ?? ""), fileReady: true }, ...items.filter((item) => item.id !== id)]);
      clearPreviewConfirmation();
      setMessage(text.generated);
      return;
    }
    if (status === "processing") {
      setGenerationPending(true);
      setMessage(text.generationInProgress);
      return;
    }
    if (status === "issued") {
      setGenerationPending(false);
      setMessage(text.previewLocked);
      return;
    }
    clearPreviewConfirmation();
    setError(status === "expired" ? text.errors.preview_confirmation_expired : text.errors.generation_confirmation_not_found);
  });

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <header className="border-b border-slate-200 pb-6">
        <a href={"/cases/" + encodeURIComponent(caseId)} className="text-sm text-blue-700 underline">{text.backToCase}</a>
        <p className="mt-5 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">{text.eyebrow}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{text.title}</h1>
        <p className="mt-2 text-sm text-slate-600">{caseTitle}</p>
      </header>
      {error && <p role="alert" className="mt-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      {message && <p role="status" className="mt-5 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</p>}
      <section className="mt-8 rounded-lg border border-slate-200 bg-slate-50 p-5" aria-labelledby="case-data-title">
        <h2 id="case-data-title" className="text-lg font-semibold text-slate-950">{text.caseFactsTitle}</h2>
        <p className="mt-2 text-sm text-slate-600">{text.caseFactsDescription}</p>
        {caseFacts.length === 0 ? <p className="mt-4 text-sm text-slate-600">{text.caseFactsEmpty}</p> : <dl className="mt-4 grid gap-3 sm:grid-cols-2">{caseFacts.map((fact) => <div key={fact.label} className="rounded-md border border-slate-200 bg-white px-3 py-2"><dt className="text-xs text-slate-500">{fact.label}</dt><dd className="mt-1 text-sm font-medium text-slate-900">{fact.value}</dd></div>)}</dl>}
      </section>
      <p data-generation-help className="mt-5 rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-900">{text.generationHelp}</p>
      {publishedVersions.length === 0 ? <p className="mt-8 rounded-md border border-dashed border-slate-300 px-4 py-8 text-sm text-slate-600">{text.noPublishedVersions} {text.contactTemplateAdmin}</p> : <>
        <section className="mt-8 border-b border-slate-200 pb-8" aria-labelledby="select-form">
          <h2 id="select-form" className="text-lg font-semibold text-slate-950">{text.selectFormTitle}</h2>
          <label className="mt-4 grid max-w-xl gap-2 text-sm text-slate-700">
            {text.formLabel}
            <select value={maskVersionId} onChange={(event) => { setMaskVersionId(event.target.value); clearPreviewConfirmation(); setError(""); setMessage(""); resetApplicationValues(); }} className="rounded-md border border-slate-300 px-3 py-2">
              <option value="">{text.chooseForm}</option>
              {publishedVersions.map((item) => <option key={item.id} value={item.id}>{item.formName} · v{item.versionNumber}</option>)}
            </select>
          </label>
          <p className="mt-3 text-xs leading-5 text-slate-500">{text.durableDataBoundary}</p>
          <div className="mt-5 grid max-w-xl gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm text-slate-700">{text.guaranteeCompany}<input value={guaranteeCompany === "friends_guarantee" ? "ふれんず保証" : guaranteeCompany} readOnly className="rounded-md border border-slate-300 bg-slate-50 px-3 py-2" /></label>
            <label className="grid gap-2 text-sm text-slate-700">{text.applicationDate}<input type="date" value={applicationDate} onChange={(event) => { setApplicationDate(event.target.value); setConfirmationId(""); setPreviewSrc(""); setPersisted(false); }} className="rounded-md border border-slate-300 px-3 py-2" /></label>
            <label className="grid gap-2 text-sm text-slate-700">{text.planType}<select value={planType} onChange={(event) => { setPlanType(event.target.value); setConfirmationId(""); setPreviewSrc(""); setPersisted(false); }} className="rounded-md border border-slate-300 px-3 py-2">{text.planOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <label className="grid gap-2 text-sm text-slate-700">{text.collectionAgency}<select value={collectionAgency} onChange={(event) => { setCollectionAgency(event.target.value); setConfirmationId(""); setPreviewSrc(""); setPersisted(false); }} className="rounded-md border border-slate-300 px-3 py-2"><option value="">{text.notSelected}</option><option value="利用する">{text.use}</option><option value="利用しない">{text.doNotUse}</option><option value="未定">{text.undecided}</option></select></label>
            <label className="grid gap-2 text-sm text-slate-700">{text.singleRider}<select value={singleRider} onChange={(event) => { setSingleRider(event.target.value); setConfirmationId(""); setPreviewSrc(""); setPersisted(false); }} className="rounded-md border border-slate-300 bg-white px-3 py-2"><option value="">{text.notSelected}</option><option value="あり">{text.singleRiderYes}</option><option value="なし">{text.singleRiderNo}</option><option value="未確認">{text.unconfirmed}</option></select></label>
          </div>
          <label className="mt-4 flex max-w-xl items-start gap-2 text-sm text-slate-700"><input type="checkbox" checked={consent} onChange={(event) => { setConsent(event.target.checked); setConfirmationId(""); setPreviewSrc(""); setPersisted(false); }} className="mt-1" />{text.consent}</label>
          <label className="mt-4 grid max-w-xl gap-2 text-sm text-slate-700">{text.notes}<textarea value={notes} onChange={(event) => { setNotes(event.target.value); setConfirmationId(""); setPreviewSrc(""); setPersisted(false); }} rows={3} className="rounded-md border border-slate-300 px-3 py-2" /></label>
          <div className="mt-4 flex flex-wrap items-center gap-3"><button type="button" disabled={!selected || busy} onClick={saveDraft} className="rounded-md border border-slate-300 px-4 py-2 text-sm disabled:opacity-50">{text.saveDraft}</button>{persisted && <span className="text-xs text-emerald-700">{text.saved}</span>}</div>
        </section>
        <section className="mt-8" aria-labelledby="preview-generate">
          <h2 id="preview-generate" className="text-lg font-semibold text-slate-950">{text.previewTitle}</h2>
          <p className="mt-2 text-sm text-slate-600">{text.previewDescription}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" disabled={!selected || busy} onClick={() => void run(async () => { const result = await postJson(locale, "preview", { caseId, blankFormVersionId: selected?.blankFormVersionId, maskVersionId, supplement: currentDraftValues() }); setConfirmationId(String(result.confirmationId ?? "")); setPreviewSrc(result.previewPdfBase64 ? "data:application/pdf;base64," + String(result.previewPdfBase64) : ""); setMessage(text.previewLocked); setPersisted(true); })} className="rounded-md border border-slate-300 px-4 py-2 text-sm disabled:opacity-50">{text.previewButton}</button>
            <button type="button" disabled={!confirmationId || !canGenerate || busy || generationPending} onClick={() => void run(async () => { const result = await postJson(locale, "generate", { confirmationId }); const id = String(result.outputId ?? ""); setHistory((items) => [{ id, generatedAt: new Date().toISOString(), version: String(selected?.versionNumber ?? ""), fileReady: true }, ...items.filter((item) => item.id !== id)]); clearPreviewConfirmation(); setMessage(text.generated); })} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{canGenerate ? text.generateButton : text.noGeneratePermission}</button>
          </div>
          {generationPending && <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><p>{text.generationInProgress}</p><button type="button" disabled={busy} onClick={refreshGenerationStatus} className="mt-2 text-blue-700 underline disabled:opacity-50">{text.refreshGenerationStatus}</button></div>}
          {previewSrc && <iframe title={text.previewTitle} src={previewSrc} className="mt-6 h-[560px] w-full rounded border border-slate-200" />}
        </section>
      </>}
      <section className="mt-10 border-t border-slate-200 pt-8" aria-labelledby="history-title">
        <h2 id="history-title" className="text-lg font-semibold text-slate-950">{text.historyTitle}</h2>
        {history.length === 0 ? <p className="mt-3 text-sm text-slate-600">{text.historyEmpty}</p> : <ul className="mt-4 divide-y divide-slate-200 border-y border-slate-200">{history.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><span className="text-sm text-slate-700">{text.version} v{item.version || "-"} · {new Date(item.generatedAt).toLocaleString(locale === "ja" ? "ja-JP" : locale === "ko" ? "ko-KR" : "zh-CN")}</span>{item.fileReady ? <button type="button" className="text-sm text-blue-700 underline disabled:opacity-50" disabled={historyLoadingId === item.id} onClick={() => void openHistoryFile(item)}>{historyLoadingId === item.id ? text.openingPdf : historyErrorId === item.id ? text.retryPdf : text.openPdf}</button> : <span className="text-sm text-slate-500">{text.fileUnavailable}</span>}</li>)}</ul>}
        {historyPreviewUrl && <iframe title={text.historyTitle} src={historyPreviewUrl} className="mt-6 h-[560px] w-full rounded border border-slate-200" />}
      </section>
    </main>
  );
}
