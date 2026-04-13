import {
  type AmlCheckStatus,
  type BrokerageContractType,
  type BudgetType,
  type ClientStage,
  type FollowUpType,
  type LoanPreApprovalStatus,
  type Purpose,
  type QuoteStatus,
  type TaskStatus,
  type Temperature,
} from "@/lib/domain";
import { buildFollowUpPriorityList } from "@/lib/followup-priority";
import type { Locale } from "@/lib/locale";
import { getStageLabel } from "@/lib/options";
import { computeQuote } from "@/lib/quote";
import { buildComplianceAlertList, type ComplianceAlertType } from "@/lib/compliance-alerts";
import { StageTransitionBlockedError, validateStageTransition } from "@/lib/workflow-engine";
import {
  getDefaultOutputTemplateSettings,
  type OutputTemplateSettings,
  type OutputTemplateSettingsInput,
} from "@/lib/output-doc";

export type { OutputTemplateSettingsInput } from "@/lib/output-doc";

export type User = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
};

export type Client = {
  id: string;
  name: string;
  phone: string;
  lineId?: string;
  email?: string;
  budgetMin?: number;
  budgetMax?: number;
  budgetType: BudgetType;
  preferredArea?: string;
  firstChoiceArea?: string;
  secondChoiceArea?: string;
  purpose: Purpose;
  loanPreApprovalStatus: LoanPreApprovalStatus;
  desiredMoveInPeriod?: string;
  stage: ClientStage;
  temperature: Temperature;
  brokerageContractType: BrokerageContractType;
  brokerageContractSignedAt?: Date;
  brokerageContractExpiresAt?: Date;
  importantMattersExplainedAt?: Date;
  contractDocumentDeliveredAt?: Date;
  personalInfoConsentAt?: Date;
  amlCheckStatus: AmlCheckStatus;
  nextFollowUpAt?: Date;
  lastContactedAt?: Date;
  notes?: string;
  ownerUserId: string;
  createdAt: Date;
  updatedAt: Date;
};

export type Property = {
  id: string;
  name: string;
  area?: string;
  address?: string;
  listingPrice: number;
  sizeSqm?: number;
  managementFee?: number;
  repairFee?: number;
  notes?: string;
  createdAt: Date;
};

export type Quotation = {
  id: string;
  clientId: string;
  propertyId?: string;
  quoteTitle: string;
  listingPrice: number;
  brokerageFee: number;
  taxFee: number;
  managementFee: number;
  repairFee: number;
  otherFee: number;
  downPayment: number;
  loanAmount: number;
  interestRate: number;
  loanYears: number;
  monthlyPaymentEstimate: number;
  totalInitialCost: number;
  monthlyTotalCost: number;
  summaryText: string;
  status: QuoteStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type FollowUp = {
  id: string;
  clientId: string;
  type: FollowUpType;
  content: string;
  nextAction?: string;
  nextFollowUpAt?: Date;
  createdById: string;
  createdAt: Date;
};

export type Task = {
  id: string;
  clientId?: string;
  title: string;
  dueAt?: Date;
  status: TaskStatus;
  createdById: string;
  createdAt: Date;
};

export type AuditLog = {
  id: string;
  userId: string;
  action: string;
  targetType: "client" | "task" | "quote" | "compliance";
  targetId?: string;
  message: string;
  createdAt: Date;
};

export type ImportSourceType = "excel" | "pdf" | "scan" | "manual";
export type ImportTargetEntity = "properties" | "parties" | "contracts" | "service_requests";
export type ImportJobStatus = "queued" | "mapped" | "completed";

export type ImportJob = {
  id: string;
  userId: string;
  sourceType: ImportSourceType;
  title: string;
  targetEntity: ImportTargetEntity;
  status: ImportJobStatus;
  notes?: string;
  mappingJson?: Record<string, string>;
  validationMessage?: string;
  createdAt: Date;
  updatedAt: Date;
};

export type AttachmentTargetType = "property" | "party" | "contract" | "service_request" | "import_job" | "quote";

export type Attachment = {
  id: string;
  userId: string;
  targetType: AttachmentTargetType;
  targetId: string;
  fileName: string;
  fileType?: string;
  fileSizeBytes?: number;
  storagePath?: string;
  uploadedAt: Date;
};

export type GeneratedOutput = {
  id: string;
  userId: string;
  quoteId: string;
  propertyId?: string;
  partyId?: string;
  outputType: "proposal" | "estimate_sheet" | "funding_plan" | "assumption_memo";
  outputFormat: "pdf" | "docx";
  language: Locale;
  title: string;
  templateVersionId?: string;
  generatedAt: Date;
};

export type OutputTemplateVersion = {
  id: string;
  userId: string;
  versionNumber: number;
  versionLabel: string;
  changeNote?: string;
  settingsSnapshot: OutputTemplateSettingsInput;
  isActive: boolean;
  createdAt: Date;
};

type DB = {
  users: User[];
  clients: Client[];
  properties: Property[];
  quotations: Quotation[];
  followUps: FollowUp[];
  tasks: Task[];
  auditLogs: AuditLog[];
  outputTemplateSettings: OutputTemplateSettings[];
  outputTemplateVersions: OutputTemplateVersion[];
  importJobs: ImportJob[];
  attachments: Attachment[];
  generatedOutputs: GeneratedOutput[];
};

function makeId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

const now = Date.now();

function toTemplateSettingsInput(settings: OutputTemplateSettings): OutputTemplateSettingsInput {
  return {
    companyName: settings.companyName,
    department: settings.department,
    representative: settings.representative,
    licenseNumber: settings.licenseNumber,
    postalAddress: settings.postalAddress,
    phone: settings.phone,
    email: settings.email,
    proposalTitle: settings.proposalTitle,
    estimateSheetTitle: settings.estimateSheetTitle,
    fundingPlanTitle: settings.fundingPlanTitle,
    assumptionMemoTitle: settings.assumptionMemoTitle,
    documentClassification: settings.documentClassification,
    disclaimerLine1: settings.disclaimerLine1,
    disclaimerLine2: settings.disclaimerLine2,
    disclaimerLine3: settings.disclaimerLine3,
    showApprovalSection: settings.showApprovalSection,
    showLegalStatusDigest: settings.showLegalStatusDigest,
    showOutstandingBalanceTable: settings.showOutstandingBalanceTable,
  };
}


const cherryOutputTemplate = getDefaultOutputTemplateSettings("user_demo");
cherryOutputTemplate.companyName = "Cherry Investment株式会社";
cherryOutputTemplate.department = "不動産仲介部";
cherryOutputTemplate.representative = "李 杰明";
cherryOutputTemplate.licenseNumber = "宅地建物取引業免許番号 東京都知事(2)第98765号";
cherryOutputTemplate.postalAddress = "東京都港区六本木3-2-1 CherryビルXF";
cherryOutputTemplate.phone = "03-6234-5678";
cherryOutputTemplate.email = "info@cherry-investment.co.jp";

const _g = globalThis as typeof globalThis & { __brokerDb?: DB };

const _freshDb: DB = {
  users: [
    {
      id: "user_demo",
      name: "李 杰明",
      email: "lijieming@cherry-investment.co.jp",
      passwordHash: "demo_password_hash",
      createdAt: new Date(now - 60 * 24 * 60 * 60 * 1000),
    },
  ],
  properties: [
    {
      id: "prop_minato_tower",
      name: "港区グランドタワー 8F",
      area: "港区",
      address: "東京都港区麻布台2-3-5",
      listingPrice: 135000000,
      sizeSqm: 82.4,
      managementFee: 44000,
      repairFee: 18000,
      notes: "タワーマンション、眺望良好、駅徒歩4分",
      createdAt: new Date(now - 20 * 24 * 60 * 60 * 1000),
    },
    {
      id: "prop_shibuya_court",
      name: "渋谷コートレジデンス 12F",
      area: "渋谷区",
      address: "東京都渋谷区代々木4-1-8",
      listingPrice: 88000000,
      sizeSqm: 68.5,
      managementFee: 36000,
      repairFee: 13000,
      notes: "渋谷駅徒歩8分、2022年築",
      createdAt: new Date(now - 15 * 24 * 60 * 60 * 1000),
    },
    {
      id: "prop_setagaya_garden",
      name: "世田谷ガーデンテラス",
      area: "世田谷区",
      address: "東京都世田谷区等々力3-12-6",
      listingPrice: 72000000,
      sizeSqm: 71.2,
      managementFee: 28000,
      repairFee: 11000,
      notes: "閑静な住宅街、庭付き低層マンション",
      createdAt: new Date(now - 18 * 24 * 60 * 60 * 1000),
    },
    {
      id: "prop_kawasaki_inv",
      name: "川崎南町投資マンション 3F",
      area: "川崎区",
      address: "神奈川県川崎市川崎区南町9-4",
      listingPrice: 48000000,
      sizeSqm: 44.8,
      managementFee: 18000,
      repairFee: 9000,
      notes: "表面利回り約5.2%、現況賃貸中",
      createdAt: new Date(now - 12 * 24 * 60 * 60 * 1000),
    },
    {
      id: "prop_bunkyo_soleil",
      name: "文京区ソレイユ 6F",
      area: "文京区",
      address: "東京都文京区本郷5-7-3",
      listingPrice: 95000000,
      sizeSqm: 74.6,
      managementFee: 38000,
      repairFee: 15000,
      notes: "東大前駅徒歩5分、閑静な文教エリア",
      createdAt: new Date(now - 25 * 24 * 60 * 60 * 1000),
    },
  ],
  clients: [
    {
      id: "client_yamada",
      name: "山田 健太 様",
      phone: "090-1234-5001",
      lineId: "yamada_kenta_inv",
      email: "yamada.kenta@example.jp",
      budgetMin: 120000000,
      budgetMax: 145000000,
      budgetType: "total_price",
      preferredArea: "港区 / 中央区",
      firstChoiceArea: "港区",
      secondChoiceArea: "中央区",
      purpose: "investment",
      loanPreApprovalStatus: "approved",
      desiredMoveInPeriod: "2026年Q3運用開始",
      stage: "negotiating",
      temperature: "high",
      brokerageContractType: "exclusive",
      brokerageContractSignedAt: new Date(now - 18 * 24 * 60 * 60 * 1000),
      brokerageContractExpiresAt: new Date(now + 75 * 24 * 60 * 60 * 1000),
      importantMattersExplainedAt: undefined,
      contractDocumentDeliveredAt: undefined,
      personalInfoConsentAt: new Date(now - 18 * 24 * 60 * 60 * 1000),
      amlCheckStatus: "pending",
      lastContactedAt: new Date(now - 4 * 24 * 60 * 60 * 1000),
      nextFollowUpAt: new Date(now + 1 * 24 * 60 * 60 * 1000),
      notes: "利回り重視。港区タワー物件に強い関心。頭金3500万円準備済み。AML書類は提出待ち。",
      ownerUserId: "user_demo",
      createdAt: new Date(now - 18 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(now - 4 * 24 * 60 * 60 * 1000),
    },
    {
      id: "client_li_meiling",
      name: "李 美玲 様",
      phone: "090-1234-5002",
      lineId: "li_meiling_home",
      budgetMin: 80000000,
      budgetMax: 95000000,
      budgetType: "total_price",
      preferredArea: "渋谷区 / 目黒区",
      firstChoiceArea: "渋谷区",
      secondChoiceArea: "目黒区",
      purpose: "self_use",
      loanPreApprovalStatus: "approved",
      desiredMoveInPeriod: "2026年7月入居希望",
      stage: "viewing",
      temperature: "medium",
      brokerageContractType: "exclusive",
      brokerageContractSignedAt: new Date(now - 14 * 24 * 60 * 60 * 1000),
      brokerageContractExpiresAt: new Date(now + 73 * 24 * 60 * 60 * 1000),
      importantMattersExplainedAt: undefined,
      contractDocumentDeliveredAt: undefined,
      personalInfoConsentAt: new Date(now - 14 * 24 * 60 * 60 * 1000),
      amlCheckStatus: "verified",
      lastContactedAt: new Date(now - 1 * 24 * 60 * 60 * 1000),
      nextFollowUpAt: new Date(now - 1 * 24 * 60 * 60 * 1000),
      notes: "渋谷コートレジデンスを内見済み。ネックは駐車場の有無。夫婦で再確認予定。",
      ownerUserId: "user_demo",
      createdAt: new Date(now - 14 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(now - 1 * 24 * 60 * 60 * 1000),
    },
    {
      id: "client_tamura",
      name: "田村 翔太 様",
      phone: "090-1234-5003",
      budgetMin: 65000000,
      budgetMax: 78000000,
      budgetType: "total_price",
      preferredArea: "世田谷区 / 杉並区",
      firstChoiceArea: "世田谷区",
      secondChoiceArea: "杉並区",
      purpose: "self_use",
      loanPreApprovalStatus: "screening",
      desiredMoveInPeriod: "2026年秋入居",
      stage: "quoted",
      temperature: "high",
      brokerageContractType: "exclusive",
      brokerageContractSignedAt: new Date(now - 12 * 24 * 60 * 60 * 1000),
      brokerageContractExpiresAt: new Date(now + 78 * 24 * 60 * 60 * 1000),
      importantMattersExplainedAt: undefined,
      contractDocumentDeliveredAt: undefined,
      personalInfoConsentAt: new Date(now - 12 * 24 * 60 * 60 * 1000),
      amlCheckStatus: "not_required",
      lastContactedAt: new Date(now - 6 * 24 * 60 * 60 * 1000),
      nextFollowUpAt: new Date(now + 2 * 24 * 60 * 60 * 1000),
      notes: "世田谷ガーデンテラスに関心あり。ローン事前審査中。子育て環境を重視。",
      ownerUserId: "user_demo",
      createdAt: new Date(now - 12 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(now - 6 * 24 * 60 * 60 * 1000),
    },
    {
      id: "client_wang_haoran",
      name: "王 浩然 様",
      phone: "090-1234-5004",
      lineId: "wang_haoran_inv",
      budgetMin: 42000000,
      budgetMax: 55000000,
      budgetType: "total_price",
      preferredArea: "川崎市 / 横浜市",
      firstChoiceArea: "川崎区",
      secondChoiceArea: "横浜市鶴見区",
      purpose: "investment",
      loanPreApprovalStatus: "not_applied",
      desiredMoveInPeriod: "時期未定（賃貸中物件希望）",
      stage: "contacted",
      temperature: "medium",
      brokerageContractType: "general",
      brokerageContractSignedAt: new Date(now - 25 * 24 * 60 * 60 * 1000),
      brokerageContractExpiresAt: new Date(now + 10 * 24 * 60 * 60 * 1000),
      importantMattersExplainedAt: undefined,
      contractDocumentDeliveredAt: undefined,
      personalInfoConsentAt: undefined,
      amlCheckStatus: "not_required",
      lastContactedAt: new Date(now - 5 * 24 * 60 * 60 * 1000),
      nextFollowUpAt: new Date(now - 2 * 24 * 60 * 60 * 1000),
      notes: "キャッシュフロー優先。融資付きの現況賃貸物件を希望。個資同意書未取得。",
      ownerUserId: "user_demo",
      createdAt: new Date(now - 25 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(now - 5 * 24 * 60 * 60 * 1000),
    },
    {
      id: "client_nakamura",
      name: "中村 恵子 様",
      phone: "090-1234-5005",
      email: "nakamura.keiko@example.jp",
      budgetMin: 88000000,
      budgetMax: 100000000,
      budgetType: "total_price",
      preferredArea: "文京区",
      firstChoiceArea: "文京区",
      secondChoiceArea: "豊島区",
      purpose: "self_use",
      loanPreApprovalStatus: "approved",
      desiredMoveInPeriod: "2026年4月入居（成約済み）",
      stage: "won",
      temperature: "high",
      brokerageContractType: "exclusive_exclusive",
      brokerageContractSignedAt: new Date(now - 45 * 24 * 60 * 60 * 1000),
      brokerageContractExpiresAt: new Date(now + 45 * 24 * 60 * 60 * 1000),
      importantMattersExplainedAt: new Date(now - 12 * 24 * 60 * 60 * 1000),
      contractDocumentDeliveredAt: new Date(now - 8 * 24 * 60 * 60 * 1000),
      personalInfoConsentAt: new Date(now - 45 * 24 * 60 * 60 * 1000),
      amlCheckStatus: "verified",
      lastContactedAt: new Date(now - 3 * 24 * 60 * 60 * 1000),
      nextFollowUpAt: new Date(now + 14 * 24 * 60 * 60 * 1000),
      notes: "文京区ソレイユにて成約。引渡し2026/04/15予定。アフターフォロー継続中。",
      ownerUserId: "user_demo",
      createdAt: new Date(now - 45 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(now - 3 * 24 * 60 * 60 * 1000),
    },
    {
      id: "client_matsushita",
      name: "松下 大輝 様",
      phone: "090-1234-5006",
      budgetMin: 55000000,
      budgetMax: 70000000,
      budgetType: "total_price",
      preferredArea: "品川区 / 目黒区",
      firstChoiceArea: "品川区",
      secondChoiceArea: "目黒区",
      purpose: "self_use",
      loanPreApprovalStatus: "not_applied",
      desiredMoveInPeriod: "2027年春（長期検討）",
      stage: "lead",
      temperature: "low",
      brokerageContractType: "none",
      personalInfoConsentAt: new Date(now - 1 * 24 * 60 * 60 * 1000),
      amlCheckStatus: "not_required",
      ownerUserId: "user_demo",
      createdAt: new Date(now - 1 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(now - 1 * 24 * 60 * 60 * 1000),
      notes: "SNS広告経由の新規問い合わせ。長期検討中。まず情報収集フェーズ。",
    },
    {
      id: "client_zhang_shufen",
      name: "張 淑芬 様",
      phone: "090-1234-5007",
      lineId: "zhang_shufen",
      budgetMin: 60000000,
      budgetMax: 80000000,
      budgetType: "total_price",
      preferredArea: "新宿区",
      firstChoiceArea: "新宿区",
      purpose: "self_use",
      loanPreApprovalStatus: "rejected",
      desiredMoveInPeriod: "見送り",
      stage: "lost",
      temperature: "low",
      brokerageContractType: "none",
      personalInfoConsentAt: new Date(now - 30 * 24 * 60 * 60 * 1000),
      amlCheckStatus: "verified",
      lastContactedAt: new Date(now - 20 * 24 * 60 * 60 * 1000),
      ownerUserId: "user_demo",
      createdAt: new Date(now - 35 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(now - 20 * 24 * 60 * 60 * 1000),
      notes: "ローン審査否決により見送り。半年後に審査再挑戦の可能性あり。再アプローチ候補。",
    },
  ],
  quotations: [],
  followUps: [
    { id: "fu_yamada_1", clientId: "client_yamada", type: "meeting", content: "初回面談。投資目的・希望エリア・資金計画をヒアリング。港区タワー物件に強い関心。頭金3500万円の準備済みと確認。", nextAction: "港区・中央区の物件2件をピックアップして送付", nextFollowUpAt: new Date(now - 14 * 24 * 60 * 60 * 1000), createdById: "user_demo", createdAt: new Date(now - 18 * 24 * 60 * 60 * 1000) },
    { id: "fu_yamada_2", clientId: "client_yamada", type: "email", content: "港区グランドタワー 投資シミュレーションプランAを送付。表面利回り4.1%、キャッシュフロー試算を添付。", nextAction: "電話にて内容確認・質問受付", nextFollowUpAt: new Date(now - 10 * 24 * 60 * 60 * 1000), createdById: "user_demo", createdAt: new Date(now - 14 * 24 * 60 * 60 * 1000) },
    { id: "fu_yamada_3", clientId: "client_yamada", type: "call", content: "電話確認。プランAに概ね満足。頭金比率を上げた改訂版を希望。「他社との比較も進めている」とのこと。", nextAction: "改訂プランBを48時間以内に提出", nextFollowUpAt: new Date(now - 8 * 24 * 60 * 60 * 1000), createdById: "user_demo", createdAt: new Date(now - 10 * 24 * 60 * 60 * 1000) },
    { id: "fu_yamada_4", clientId: "client_yamada", type: "line", content: "改訂プランB（頭金4000万円版）をLINEで送付。月次キャッシュフロー改善を説明。「前向きに検討」との返信あり。", nextAction: "AML書類の提出を依頼・申込書準備", nextFollowUpAt: new Date(now - 4 * 24 * 60 * 60 * 1000), createdById: "user_demo", createdAt: new Date(now - 8 * 24 * 60 * 60 * 1000) },
    { id: "fu_yamada_5", clientId: "client_yamada", type: "call", content: "AML書類提出を改めて依頼。「今週中に用意する」との返答。申込条件（手付金・引渡し時期）の希望も確認。", nextAction: "AML書類受取り後、申込書作成・35条説明準備", nextFollowUpAt: new Date(now + 1 * 24 * 60 * 60 * 1000), createdById: "user_demo", createdAt: new Date(now - 4 * 24 * 60 * 60 * 1000) },
    { id: "fu_meiling_1", clientId: "client_li_meiling", type: "line", content: "LINEにて初回ヒアリング。渋谷・目黒エリアで自用マンションを検討中。予算8000〜9500万円。2026年夏入居希望。", nextAction: "渋谷コートレジデンスの資料送付", nextFollowUpAt: new Date(now - 10 * 24 * 60 * 60 * 1000), createdById: "user_demo", createdAt: new Date(now - 14 * 24 * 60 * 60 * 1000) },
    { id: "fu_meiling_2", clientId: "client_li_meiling", type: "email", content: "渋谷コートレジデンス 購入提案書・費用見積を送付。月々返済試算：約25.8万円（金利1.5%・35年）。", nextAction: "内見日程の調整", nextFollowUpAt: new Date(now - 5 * 24 * 60 * 60 * 1000), createdById: "user_demo", createdAt: new Date(now - 8 * 24 * 60 * 60 * 1000) },
    { id: "fu_meiling_3", clientId: "client_li_meiling", type: "viewing", content: "渋谷コートレジデンス 12F 内見実施。採光・収納に満足。駐車場の有無が懸念点として浮上。ご夫婦で再相談の上、来週中に意思表示予定。", nextAction: "駐車場空き状況を管理会社に確認・共有", nextFollowUpAt: new Date(now - 1 * 24 * 60 * 60 * 1000), createdById: "user_demo", createdAt: new Date(now - 1 * 24 * 60 * 60 * 1000) },
    { id: "fu_tamura_1", clientId: "client_tamura", type: "call", content: "電話にて初回ヒアリング。世田谷で子育て環境の良いマンションを希望。夫婦+子供1人。ローン事前審査は現在申込中。", nextAction: "世田谷ガーデンテラスの資料作成・送付", nextFollowUpAt: new Date(now - 8 * 24 * 60 * 60 * 1000), createdById: "user_demo", createdAt: new Date(now - 12 * 24 * 60 * 60 * 1000) },
    { id: "fu_tamura_2", clientId: "client_tamura", type: "email", content: "世田谷ガーデンテラス 購入提案書（プランA）を送付。初期費用合計約1050万円、月々返済約19.6万円。内見のご提案も添付。", nextAction: "3日後に返答確認の電話", nextFollowUpAt: new Date(now - 3 * 24 * 60 * 60 * 1000), createdById: "user_demo", createdAt: new Date(now - 6 * 24 * 60 * 60 * 1000) },
    { id: "fu_wang_1", clientId: "client_wang_haoran", type: "meeting", content: "面談にて初回ヒアリング。川崎・横浜エリアの現況賃貸中物件を希望。キャッシュフロー重視で利回り5%以上を条件に。", nextAction: "川崎南町物件の詳細資料を送付", nextFollowUpAt: new Date(now - 7 * 24 * 60 * 60 * 1000), createdById: "user_demo", createdAt: new Date(now - 25 * 24 * 60 * 60 * 1000) },
    { id: "fu_wang_2", clientId: "client_wang_haoran", type: "line", content: "川崎南町投資マンション資料をLINEで送付。表面利回り5.2%、現況賃料8.3万円/月を説明。「ローン相談を先に進めたい」との返信。", nextAction: "融資相談の段取りをサポート・2日後に状況確認", nextFollowUpAt: new Date(now - 2 * 24 * 60 * 60 * 1000), createdById: "user_demo", createdAt: new Date(now - 5 * 24 * 60 * 60 * 1000) },
    { id: "fu_nakamura_1", clientId: "client_nakamura", type: "meeting", content: "初回面談。文京区エリアで自用マンション希望。予算9000万円前後。東大前周辺の静かな環境を希望。ローン事前審査済み。", nextAction: "文京区ソレイユの内見調整", nextFollowUpAt: new Date(now - 35 * 24 * 60 * 60 * 1000), createdById: "user_demo", createdAt: new Date(now - 45 * 24 * 60 * 60 * 1000) },
    { id: "fu_nakamura_2", clientId: "client_nakamura", type: "viewing", content: "文京区ソレイユ 6F 内見実施。採光・間取りに大変満足。「ここに決めたい」と強い意向を示す。申込意思を確認。", nextAction: "購入提案書・費用見積の最終版を作成", nextFollowUpAt: new Date(now - 30 * 24 * 60 * 60 * 1000), createdById: "user_demo", createdAt: new Date(now - 35 * 24 * 60 * 60 * 1000) },
    { id: "fu_nakamura_3", clientId: "client_nakamura", type: "email", content: "購入提案書・費用見積明細書・資金計画書（最終版）を送付。初期費用合計約1320万円、月々返済約25.1万円。", nextAction: "申込書の記入・提出", nextFollowUpAt: new Date(now - 22 * 24 * 60 * 60 * 1000), createdById: "user_demo", createdAt: new Date(now - 28 * 24 * 60 * 60 * 1000) },
    { id: "fu_nakamura_4", clientId: "client_nakamura", type: "meeting", content: "申込書受取り・重要事項説明（35条）を実施。内容確認・署名完了。売買契約書面の交付（37条）も完了。", nextAction: "引渡し前確認・鍵受取り準備", nextFollowUpAt: new Date(now - 8 * 24 * 60 * 60 * 1000), createdById: "user_demo", createdAt: new Date(now - 12 * 24 * 60 * 60 * 1000) },
    { id: "fu_nakamura_5", clientId: "client_nakamura", type: "note", content: "成約確定。引渡し日2026年4月15日で合意。引越し業者の手配状況も確認。アフターフォローとして2週間後に再連絡予定。", nextAction: "引渡し当日の立会いスケジュール確認", nextFollowUpAt: new Date(now + 14 * 24 * 60 * 60 * 1000), createdById: "user_demo", createdAt: new Date(now - 3 * 24 * 60 * 60 * 1000) },
    { id: "fu_zhang_1", clientId: "client_zhang_shufen", type: "call", content: "ローン事前審査の結果を確認。残念ながら否決。現時点での購入は困難と判断。半年後の再審査に向けてアドバイスを提供。", nextAction: "半年後（2026年9月頃）に再アプローチ", createdById: "user_demo", createdAt: new Date(now - 20 * 24 * 60 * 60 * 1000) },
  ],
  tasks: [
    { id: "task_yamada_aml", clientId: "client_yamada", title: "山田様 AML書類の受取り確認", dueAt: new Date(now + 4 * 60 * 60 * 1000), status: "pending", createdById: "user_demo", createdAt: new Date(now - 4 * 24 * 60 * 60 * 1000) },
    { id: "task_meiling_parking", clientId: "client_li_meiling", title: "李様 渋谷コートレジデンス駐車場空き状況を管理会社へ確認", dueAt: new Date(now - 4 * 60 * 60 * 1000), status: "pending", createdById: "user_demo", createdAt: new Date(now - 1 * 24 * 60 * 60 * 1000) },
    { id: "task_wang_contract", clientId: "client_wang_haoran", title: "王様 一般媒介契約の更新可否を確認（期限10日前）", dueAt: new Date(now + 2 * 24 * 60 * 60 * 1000), status: "pending", createdById: "user_demo", createdAt: new Date(now - 1 * 24 * 60 * 60 * 1000) },
  ],
  auditLogs: [
    { id: "log_1", userId: "user_demo", action: "client_created", targetType: "client", targetId: "client_yamada", message: "山田 健太 様 を新規登録しました", createdAt: new Date(now - 18 * 24 * 60 * 60 * 1000) },
    { id: "log_2", userId: "user_demo", action: "quote_created", targetType: "quote", targetId: "quote_yamada_a", message: "山田様 港区グランドタワー プランA を作成しました", createdAt: new Date(now - 14 * 24 * 60 * 60 * 1000) },
    { id: "log_3", userId: "user_demo", action: "stage_changed", targetType: "client", targetId: "client_li_meiling", message: "李 美玲 様 のステージを「内見済み」に更新しました", createdAt: new Date(now - 1 * 24 * 60 * 60 * 1000) },
    { id: "log_4", userId: "user_demo", action: "quote_sent", targetType: "quote", targetId: "quote_tamura_a", message: "田村様 世田谷ガーデンテラス プランA を送付済みに更新しました", createdAt: new Date(now - 6 * 24 * 60 * 60 * 1000) },
    { id: "log_5", userId: "user_demo", action: "client_won", targetType: "client", targetId: "client_nakamura", message: "中村 恵子 様 が成約しました。文京区ソレイユ", createdAt: new Date(now - 8 * 24 * 60 * 60 * 1000) },
  ],
  outputTemplateSettings: [cherryOutputTemplate],
  outputTemplateVersions: [
    { id: "tplver_user_demo_001", userId: "user_demo", versionNumber: 1, versionLabel: "標準版 v1", changeNote: "初期標準テンプレート", settingsSnapshot: toTemplateSettingsInput(cherryOutputTemplate), isActive: true, createdAt: new Date(now - 15 * 24 * 60 * 60 * 1000) },
  ],
  importJobs: [
    { id: "import_001", userId: "user_demo", sourceType: "excel", title: "物件台帳_2026Q1.xlsx", targetEntity: "properties", status: "completed", notes: "物件5件を取込", mappingJson: { 物件名: "name", 所在地: "address", エリア: "area", 売出価格: "listing_price" }, validationMessage: "必須項目を充足（4/4）", createdAt: new Date(now - 4 * 24 * 60 * 60 * 1000), updatedAt: new Date(now - 4 * 24 * 60 * 60 * 1000) },
    { id: "import_002", userId: "user_demo", sourceType: "pdf", title: "旧契約書一括取込（3件）", targetEntity: "contracts", status: "mapped", notes: "契約種別の確認待ち", mappingJson: { 契約番号: "contract_number", 契約種別: "contract_type", 物件ID: "property_id" }, validationMessage: "必須項目が不足（署名日）", createdAt: new Date(now - 2 * 24 * 60 * 60 * 1000), updatedAt: new Date(now - 2 * 24 * 60 * 60 * 1000) },
  ],
  attachments: [
    { id: "att_prop_minato_floor", userId: "user_demo", targetType: "property", targetId: "prop_minato_tower", fileName: "港区グランドタワー_間取り図.pdf", fileType: "application/pdf", fileSizeBytes: 924800, storagePath: "demo/property/prop_minato_tower/floorplan.pdf", uploadedAt: new Date(now - 3 * 24 * 60 * 60 * 1000) },
    { id: "att_contract_yamada", userId: "user_demo", targetType: "contract", targetId: "quote_yamada_b", fileName: "売買契約書ドラフト_山田様.pdf", fileType: "application/pdf", fileSizeBytes: 1105920, storagePath: "demo/contracts/quote_yamada_b/draft.pdf", uploadedAt: new Date(now - 2 * 24 * 60 * 60 * 1000) },
  ],
  generatedOutputs: [],
};

if (!_g.__brokerDb) _g.__brokerDb = _freshDb;
const db: DB = _g.__brokerDb;

const seedQuoteYamadaA = (() => {
  const data = { listingPrice: 135000000, brokerageFee: 4180000, taxFee: 1450000, managementFee: 44000, repairFee: 18000, otherFee: 850000, downPayment: 35000000, interestRate: 1.65, loanYears: 30 };
  const computed = computeQuote(data);
  return { id: "quote_yamada_a", clientId: "client_yamada", propertyId: "prop_minato_tower", quoteTitle: "山田様 港区グランドタワー プランA", ...data, ...computed, summaryText: "頭金3500万円・30年1.65%の条件で月々返済約28.4万円。表面利回り4.1%。申込条件調整中。", status: "sent" as const, createdAt: new Date(now - 14 * 24 * 60 * 60 * 1000), updatedAt: new Date(now - 14 * 24 * 60 * 60 * 1000) } satisfies Quotation;
})();

const seedQuoteYamadaB = (() => {
  const data = { listingPrice: 135000000, brokerageFee: 4180000, taxFee: 1450000, managementFee: 44000, repairFee: 18000, otherFee: 850000, downPayment: 40000000, interestRate: 1.65, loanYears: 30 };
  const computed = computeQuote(data);
  return { id: "quote_yamada_b", clientId: "client_yamada", propertyId: "prop_minato_tower", quoteTitle: "山田様 港区グランドタワー プランB（頭金増額）", ...data, ...computed, summaryText: "頭金4000万円に増額。月々返済約26.9万円に改善。キャッシュフロー負担を軽減したプラン。", status: "revised" as const, createdAt: new Date(now - 8 * 24 * 60 * 60 * 1000), updatedAt: new Date(now - 8 * 24 * 60 * 60 * 1000) } satisfies Quotation;
})();

const seedQuoteMeiling = (() => {
  const data = { listingPrice: 88000000, brokerageFee: 2740000, taxFee: 960000, managementFee: 36000, repairFee: 13000, otherFee: 580000, downPayment: 15000000, interestRate: 1.5, loanYears: 35 };
  const computed = computeQuote(data);
  return { id: "quote_meiling_a", clientId: "client_li_meiling", propertyId: "prop_shibuya_court", quoteTitle: "李様 渋谷コートレジデンス プランA", ...data, ...computed, summaryText: "頭金1500万円・35年1.5%。月々返済約25.8万円。内見済み、申込意向確認待ち。", status: "sent" as const, createdAt: new Date(now - 8 * 24 * 60 * 60 * 1000), updatedAt: new Date(now - 8 * 24 * 60 * 60 * 1000) } satisfies Quotation;
})();

const seedQuoteTamura = (() => {
  const data = { listingPrice: 72000000, brokerageFee: 2260000, taxFee: 790000, managementFee: 28000, repairFee: 11000, otherFee: 480000, downPayment: 12000000, interestRate: 1.55, loanYears: 35 };
  const computed = computeQuote(data);
  return { id: "quote_tamura_a", clientId: "client_tamura", propertyId: "prop_setagaya_garden", quoteTitle: "田村様 世田谷ガーデンテラス プランA", ...data, ...computed, summaryText: "頭金1200万円・35年1.55%。月々返済約19.6万円。送付後6日経過、返答待ち。", status: "sent" as const, createdAt: new Date(now - 6 * 24 * 60 * 60 * 1000), updatedAt: new Date(now - 6 * 24 * 60 * 60 * 1000) } satisfies Quotation;
})();

const seedQuoteNakamura = (() => {
  const data = { listingPrice: 95000000, brokerageFee: 2950000, taxFee: 1030000, managementFee: 38000, repairFee: 15000, otherFee: 620000, downPayment: 18000000, interestRate: 1.45, loanYears: 35 };
  const computed = computeQuote(data);
  return { id: "quote_nakamura_a", clientId: "client_nakamura", propertyId: "prop_bunkyo_soleil", quoteTitle: "中村様 文京区ソレイユ 最終プラン（成約）", ...data, ...computed, summaryText: "成約済み。引渡し2026年4月15日予定。頭金1800万円・35年1.45%・月々約25.1万円。", status: "sent" as const, createdAt: new Date(now - 28 * 24 * 60 * 60 * 1000), updatedAt: new Date(now - 12 * 24 * 60 * 60 * 1000) } satisfies Quotation;
})();

if (db.quotations.length === 0) {
  db.quotations.push(seedQuoteYamadaA, seedQuoteYamadaB, seedQuoteMeiling, seedQuoteTamura, seedQuoteNakamura);
}

const OPEN_STAGES: ClientStage[] = ["lead", "contacted", "quoted", "viewing", "negotiating"];
const STAGE_JA_LABEL: Record<ClientStage, string> = {
  lead: "新規受付",
  contacted: "初回接触済み",
  quoted: "提案送付済み",
  viewing: "内見済み",
  negotiating: "申込・条件調整",
  won: "成約",
  lost: "見送り",
};

export type DashboardQuoteItem = Quotation & {
  client: Client;
  property?: Property;
};

export async function getDefaultUser() {
  return db.users[0] ?? null;
}

export async function getOutputTemplateSettings(userId: string): Promise<OutputTemplateSettings> {
  const existing = db.outputTemplateSettings.find((item) => item.userId === userId);
  if (existing) return existing;

  const fallback = getDefaultOutputTemplateSettings(userId);
  db.outputTemplateSettings.push(fallback);
  return fallback;
}

export async function updateOutputTemplateSettings(
  userId: string,
  input: OutputTemplateSettingsInput
): Promise<OutputTemplateSettings> {
  const current = await getOutputTemplateSettings(userId);
  const next: OutputTemplateSettings = {
    ...current,
    ...input,
    updatedAt: new Date(),
  };
  const index = db.outputTemplateSettings.findIndex((item) => item.userId === userId);
  if (index >= 0) {
    db.outputTemplateSettings[index] = next;
  } else {
    db.outputTemplateSettings.push(next);
  }
  return next;
}

export async function listOutputTemplateVersions(userId: string, limit = 20): Promise<OutputTemplateVersion[]> {
  return db.outputTemplateVersions
    .filter((item) => item.userId === userId)
    .sort((a, b) => b.versionNumber - a.versionNumber)
    .slice(0, limit)
    .map((item) => ({ ...item }));
}

export async function createOutputTemplateVersion(input: {
  userId: string;
  versionLabel?: string;
  changeNote?: string;
  settingsSnapshot?: OutputTemplateSettingsInput;
  activate?: boolean;
}): Promise<OutputTemplateVersion> {
  const current = await getOutputTemplateSettings(input.userId);
  const currentMax = db.outputTemplateVersions
    .filter((item) => item.userId === input.userId)
    .reduce((max, item) => Math.max(max, item.versionNumber), 0);
  const versionNumber = currentMax + 1;
  const nextActive = input.activate ?? true;

  if (nextActive) {
    db.outputTemplateVersions.forEach((item) => {
      if (item.userId === input.userId) item.isActive = false;
    });
  }

  const version: OutputTemplateVersion = {
    id: makeId("tplver"),
    userId: input.userId,
    versionNumber,
    versionLabel: input.versionLabel?.trim() || `テンプレート v${versionNumber}`,
    changeNote: input.changeNote?.trim() || undefined,
    settingsSnapshot: input.settingsSnapshot ?? toTemplateSettingsInput(current),
    isActive: nextActive,
    createdAt: new Date(),
  };

  db.outputTemplateVersions.unshift(version);
  return version;
}

export async function applyOutputTemplateVersion(input: {
  userId: string;
  versionId: string;
}): Promise<OutputTemplateSettings | null> {
  const version = db.outputTemplateVersions.find((item) => item.userId === input.userId && item.id === input.versionId);
  if (!version) return null;

  const settings = await updateOutputTemplateSettings(input.userId, version.settingsSnapshot);
  db.outputTemplateVersions.forEach((item) => {
    if (item.userId === input.userId) {
      item.isActive = item.id === input.versionId;
    }
  });
  return settings;
}

export async function getOutputTemplateVersionById(input: {
  userId: string;
  versionId: string;
}): Promise<OutputTemplateVersion | null> {
  const version = db.outputTemplateVersions.find((item) => item.userId === input.userId && item.id === input.versionId);
  return version ? { ...version } : null;
}

export async function listImportJobs(userId: string, limit = 50): Promise<ImportJob[]> {
  return db.importJobs
    .filter((item) => item.userId === userId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit)
    .map((item) => ({ ...item }));
}

export async function addImportJob(input: {
  userId: string;
  sourceType: ImportSourceType;
  title: string;
  targetEntity: ImportTargetEntity;
  status?: ImportJobStatus;
  notes?: string;
}): Promise<ImportJob> {
  const sourceLabel: Record<ImportSourceType, string> = {
    excel: "Excel",
    pdf: "PDF",
    scan: "スキャン",
    manual: "手入力",
  };
  const targetLabel: Record<ImportTargetEntity, string> = {
    properties: "物件",
    parties: "関係者",
    contracts: "契約",
    service_requests: "対応依頼",
  };
  const nowDate = new Date();
  const job: ImportJob = {
    id: makeId("import"),
    userId: input.userId,
    sourceType: input.sourceType,
    title: input.title.trim() || `${sourceLabel[input.sourceType]}取込 - ${targetLabel[input.targetEntity]}`,
    targetEntity: input.targetEntity,
    status: input.status ?? "queued",
    notes: input.notes?.trim() || undefined,
    createdAt: nowDate,
    updatedAt: nowDate,
  };
  db.importJobs.unshift(job);
  return job;
}

export async function updateImportJobMapping(input: {
  userId: string;
  jobId: string;
  mappingJson: Record<string, string>;
  validationMessage?: string;
  notes?: string;
  status?: ImportJobStatus;
}): Promise<ImportJob | null> {
  const job = db.importJobs.find((item) => item.userId === input.userId && item.id === input.jobId);
  if (!job) return null;

  job.mappingJson = input.mappingJson;
  job.validationMessage = input.validationMessage?.trim() || undefined;
  if (typeof input.notes === "string") {
    job.notes = input.notes.trim() || undefined;
  }
  if (input.status) {
    job.status = input.status;
  }
  job.updatedAt = new Date();
  return { ...job };
}

export async function listAttachments(input: {
  userId: string;
  targetType?: AttachmentTargetType;
  targetId?: string;
  limit?: number;
}): Promise<Attachment[]> {
  const limit = input.limit ?? 100;
  return db.attachments
    .filter((item) => item.userId === input.userId)
    .filter((item) => (input.targetType ? item.targetType === input.targetType : true))
    .filter((item) => (input.targetId ? item.targetId === input.targetId : true))
    .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime())
    .slice(0, limit)
    .map((item) => ({ ...item }));
}

export async function addAttachment(input: {
  userId: string;
  targetType: AttachmentTargetType;
  targetId: string;
  fileName: string;
  fileType?: string;
  fileSizeBytes?: number;
  storagePath?: string;
}): Promise<Attachment> {
  const attachment: Attachment = {
    id: makeId("att"),
    userId: input.userId,
    targetType: input.targetType,
    targetId: input.targetId,
    fileName: input.fileName.trim(),
    fileType: input.fileType?.trim() || undefined,
    fileSizeBytes: input.fileSizeBytes,
    storagePath: input.storagePath?.trim() || undefined,
    uploadedAt: new Date(),
  };
  db.attachments.unshift(attachment);
  return attachment;
}

export async function listGeneratedOutputs(input: {
  userId: string;
  quoteId?: string;
  limit?: number;
}): Promise<GeneratedOutput[]> {
  const limit = input.limit ?? 100;
  return db.generatedOutputs
    .filter((item) => item.userId === input.userId)
    .filter((item) => (input.quoteId ? item.quoteId === input.quoteId : true))
    .sort((a, b) => b.generatedAt.getTime() - a.generatedAt.getTime())
    .slice(0, limit)
    .map((item) => ({ ...item }));
}

export async function getGeneratedOutputById(input: {
  userId: string;
  id: string;
}): Promise<GeneratedOutput | undefined> {
  const found = db.generatedOutputs.find((item) => item.userId === input.userId && item.id === input.id);
  return found ? { ...found } : undefined;
}

export async function addGeneratedOutput(input: {
  userId: string;
  quoteId: string;
  propertyId?: string;
  partyId?: string;
  outputType: GeneratedOutput["outputType"];
  outputFormat: GeneratedOutput["outputFormat"];
  language: Locale;
  title: string;
  templateVersionId?: string;
}): Promise<GeneratedOutput> {
  const output: GeneratedOutput = {
    id: makeId("out"),
    userId: input.userId,
    quoteId: input.quoteId,
    propertyId: input.propertyId,
    partyId: input.partyId,
    outputType: input.outputType,
    outputFormat: input.outputFormat,
    language: input.language,
    title: input.title.trim(),
    templateVersionId: input.templateVersionId,
    generatedAt: new Date(),
  };
  db.generatedOutputs.unshift(output);
  return output;
}

export async function getDashboardData(userId: string) {
  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const threeDaysAgo = new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000);

  const clients = db.clients.filter((item) => item.ownerUserId === userId);

  const todayFollowUps = clients.filter(
    (item) =>
      item.nextFollowUpAt &&
      item.nextFollowUpAt >= startOfDay &&
      item.nextFollowUpAt < endOfDay &&
      OPEN_STAGES.includes(item.stage)
  ).length;

  const newClientsThisWeek = clients.filter((item) => item.createdAt >= sevenDaysAgo).length;
  const quotedCount = clients.filter((item) => item.stage === "quoted").length;
  const negotiatingCount = clients.filter((item) => item.stage === "negotiating").length;

  const followUpList = clients
    .filter((item) => item.nextFollowUpAt && item.nextFollowUpAt <= endOfDay && OPEN_STAGES.includes(item.stage))
    .sort((a, b) => {
      const aTime = a.nextFollowUpAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const bTime = b.nextFollowUpAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    })
    .slice(0, 8);
  const priorityList = buildFollowUpPriorityList(clients);
  const pendingTaskKeys = new Set(
    db.tasks
      .filter((task) => task.status === "pending" && Boolean(task.clientId))
      .map((task) => `${task.clientId}::${task.title}`)
  );
  const complianceAlerts = buildComplianceAlertList(clients).map((item) => ({
    ...item,
    isTaskCreated: pendingTaskKeys.has(`${item.clientId}::${item.title}`),
  }));
  const clientIdSet = new Set(clients.map((item) => item.id));
  const pendingTasks = db.tasks
    .filter((item) => item.clientId && clientIdSet.has(item.clientId) && item.status === "pending")
    .sort((a, b) => (a.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER) - (b.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER))
    .slice(0, 20);
  const notifications = [
    ...pendingTasks
      .filter((task) => task.dueAt && task.dueAt < startOfDay)
      .map((task) => ({
        id: `task-overdue-${task.id}`,
        level: "urgent" as const,
        title: "期限超過タスク",
        message: `${task.title}（期限 ${task.dueAt?.toLocaleDateString("ja-JP")}）`,
        clientId: task.clientId,
      })),
    ...pendingTasks
      .filter((task) => task.dueAt && task.dueAt >= startOfDay && task.dueAt < endOfDay)
      .map((task) => ({
        id: `task-today-${task.id}`,
        level: "info" as const,
        title: "本日期限タスク",
        message: task.title,
        clientId: task.clientId,
      })),
    ...complianceAlerts
      .filter((alert) => alert.level === "urgent")
      .map((alert) => ({
        id: `compliance-${alert.type}-${alert.clientId}`,
        level: "urgent" as const,
        title: "法定対応アラート",
        message: `${alert.clientName}: ${alert.title}`,
        clientId: alert.clientId,
      })),
  ]
    .sort((a, b) => {
      if (a.level !== b.level) return a.level === "urgent" ? -1 : 1;
      return a.title.localeCompare(b.title, "ja");
    })
    .slice(0, 8);

  const recentQuotes = await listQuotations(6);

  const staleClients = clients
    .filter(
      (item) => OPEN_STAGES.includes(item.stage) && (!item.lastContactedAt || item.lastContactedAt < sevenDaysAgo)
    )
    .sort((a, b) => (a.lastContactedAt?.getTime() ?? 0) - (b.lastContactedAt?.getTime() ?? 0))
    .slice(0, 6);

  const newUnquoted = clients
    .filter(
      (item) =>
        ["lead", "contacted"].includes(item.stage) &&
        item.createdAt >= threeDaysAgo &&
        db.quotations.every((q) => q.clientId !== item.id)
    )
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 6);
  const recentAuditLogs = db.auditLogs
    .filter((item) => item.userId === userId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 8);

  return {
    kpis: {
      todayFollowUps,
      newClientsThisWeek,
      quotedCount,
      negotiatingCount,
    },
    followUpList,
    priorityList,
    notifications,
    complianceAlerts,
    recentAuditLogs,
    recentQuotes,
    staleClients,
    newUnquoted,
  };
}

export type ClientListSort = "follow_up" | "recent_contact" | "recent_created";

export type ClientListFilter = {
  query?: string;
  stage?: ClientStage | "all";
  purpose?: Purpose | "all";
  temperature?: Temperature | "all";
  sort?: ClientListSort;
};

export async function listClients(userId: string, filter: ClientListFilter = {}) {
  const filtered = db.clients
    .filter((item) => item.ownerUserId === userId)
    .filter((item) => (filter.stage && filter.stage !== "all" ? item.stage === filter.stage : true))
    .filter((item) => (filter.purpose && filter.purpose !== "all" ? item.purpose === filter.purpose : true))
    .filter((item) =>
      filter.temperature && filter.temperature !== "all" ? item.temperature === filter.temperature : true
    )
    .filter((item) => {
      if (!filter.query) return true;
      const q = filter.query;
      return (
        item.name.includes(q) ||
        item.phone.includes(q) ||
        (item.preferredArea?.includes(q) ?? false) ||
        (item.firstChoiceArea?.includes(q) ?? false) ||
        (item.secondChoiceArea?.includes(q) ?? false) ||
        (item.notes?.includes(q) ?? false)
      );
    });

  const sort = filter.sort ?? "follow_up";

  filtered.sort((a, b) => {
    if (sort === "recent_created") {
      return b.createdAt.getTime() - a.createdAt.getTime();
    }
    if (sort === "recent_contact") {
      return (b.lastContactedAt?.getTime() ?? 0) - (a.lastContactedAt?.getTime() ?? 0);
    }
    const aTime = a.nextFollowUpAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const bTime = b.nextFollowUpAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return aTime - bTime;
  });

  return filtered.map((item) => ({
    ...item,
    _count: {
      quotations: db.quotations.filter((quote) => quote.clientId === item.id).length,
      followUps: db.followUps.filter((followUp) => followUp.clientId === item.id).length,
    },
  }));
}

export async function getClientById(clientId: string) {
  return db.clients.find((item) => item.id === clientId) ?? null;
}

export async function getClientDetail(clientId: string) {
  const client = db.clients.find((item) => item.id === clientId);
  if (!client) return null;

  const tasks = db.tasks
    .filter((item) => item.clientId === clientId)
    .sort((a, b) => {
      const statusWeight = (status: TaskStatus) => {
        if (status === "pending") return 0;
        if (status === "done") return 1;
        return 2;
      };
      const statusCompare = statusWeight(a.status) - statusWeight(b.status);
      if (statusCompare !== 0) return statusCompare;

      const dueA = a.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const dueB = b.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      if (dueA !== dueB) return dueA - dueB;

      return b.createdAt.getTime() - a.createdAt.getTime();
    });

  return {
    ...client,
    quotations: db.quotations
      .filter((item) => item.clientId === clientId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((item) => ({
        ...item,
        property: item.propertyId ? db.properties.find((property) => property.id === item.propertyId) : undefined,
      })),
    followUps: db.followUps
      .filter((item) => item.clientId === clientId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    tasks,
    ownerUser: db.users.find((user) => user.id === client.ownerUserId)!,
  };
}

export async function getBoardData(userId: string) {
  const clients = db.clients.filter((item) => item.ownerUserId === userId);
  return clients.reduce<Record<ClientStage, Client[]>>(
    (acc, client) => {
      acc[client.stage].push(client);
      return acc;
    },
    {
      lead: [],
      contacted: [],
      quoted: [],
      viewing: [],
      negotiating: [],
      won: [],
      lost: [],
    }
  );
}

export async function listQuoteFormData() {
  return {
    clients: db.clients.map((item) => ({ id: item.id, name: item.name })),
    properties: db.properties.map((item) => ({
      id: item.id,
      name: item.name,
      listingPrice: item.listingPrice,
      managementFee: item.managementFee ?? null,
      repairFee: item.repairFee ?? null,
    })),
  };
}

export async function addProperty(input: {
  name: string;
  area?: string;
  address?: string;
  listingPrice: number;
  sizeSqm?: number;
  managementFee?: number;
  repairFee?: number;
  notes?: string;
}) {
  const property: Property = {
    id: makeId("prop"),
    name: input.name,
    area: input.area,
    address: input.address,
    listingPrice: input.listingPrice,
    sizeSqm: input.sizeSqm,
    managementFee: input.managementFee,
    repairFee: input.repairFee,
    notes: input.notes,
    createdAt: new Date(),
  };
  db.properties.unshift(property);
  return property;
}

export async function listQuotations(limit?: number) {
  const sorted = [...db.quotations].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const sliced = typeof limit === "number" ? sorted.slice(0, limit) : sorted;

  return sliced.map((quote) => ({
    ...quote,
    client: db.clients.find((item) => item.id === quote.clientId)!,
    property: quote.propertyId ? db.properties.find((item) => item.id === quote.propertyId) : undefined,
  }));
}

export async function getQuotationById(quoteId: string) {
  const quote = db.quotations.find((item) => item.id === quoteId);
  if (!quote) return null;

  return {
    ...quote,
    client: db.clients.find((item) => item.id === quote.clientId),
    property: quote.propertyId ? db.properties.find((item) => item.id === quote.propertyId) : undefined,
  };
}

export async function addClient(input: {
  ownerUserId: string;
  name: string;
  phone: string;
  lineId?: string;
  email?: string;
  budgetMin?: number;
  budgetMax?: number;
  budgetType: BudgetType;
  preferredArea?: string;
  firstChoiceArea?: string;
  secondChoiceArea?: string;
  purpose: Purpose;
  loanPreApprovalStatus: LoanPreApprovalStatus;
  desiredMoveInPeriod?: string;
  stage: ClientStage;
  temperature: Temperature;
  brokerageContractType: BrokerageContractType;
  brokerageContractSignedAt?: Date;
  brokerageContractExpiresAt?: Date;
  importantMattersExplainedAt?: Date;
  contractDocumentDeliveredAt?: Date;
  personalInfoConsentAt?: Date;
  amlCheckStatus: AmlCheckStatus;
  nextFollowUpAt?: Date;
  notes?: string;
}) {
  const client: Client = {
    id: makeId("client"),
    name: input.name,
    phone: input.phone,
    lineId: input.lineId,
    email: input.email,
    budgetMin: input.budgetMin,
    budgetMax: input.budgetMax,
    budgetType: input.budgetType,
    preferredArea: input.preferredArea,
    firstChoiceArea: input.firstChoiceArea,
    secondChoiceArea: input.secondChoiceArea,
    purpose: input.purpose,
    loanPreApprovalStatus: input.loanPreApprovalStatus,
    desiredMoveInPeriod: input.desiredMoveInPeriod,
    stage: input.stage,
    temperature: input.temperature,
    brokerageContractType: input.brokerageContractType,
    brokerageContractSignedAt: input.brokerageContractSignedAt,
    brokerageContractExpiresAt: input.brokerageContractExpiresAt,
    importantMattersExplainedAt: input.importantMattersExplainedAt,
    contractDocumentDeliveredAt: input.contractDocumentDeliveredAt,
    personalInfoConsentAt: input.personalInfoConsentAt,
    amlCheckStatus: input.amlCheckStatus,
    nextFollowUpAt: input.nextFollowUpAt,
    notes: input.notes,
    ownerUserId: input.ownerUserId,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  db.clients.unshift(client);
  return client;
}

export async function updateClient(
  clientId: string,
  input: {
    name: string;
    phone: string;
    lineId?: string;
    email?: string;
    budgetMin?: number;
    budgetMax?: number;
    budgetType: BudgetType;
    preferredArea?: string;
    firstChoiceArea?: string;
    secondChoiceArea?: string;
    purpose: Purpose;
    loanPreApprovalStatus: LoanPreApprovalStatus;
    desiredMoveInPeriod?: string;
    stage: ClientStage;
    temperature: Temperature;
    brokerageContractType: BrokerageContractType;
    brokerageContractSignedAt?: Date;
    brokerageContractExpiresAt?: Date;
    importantMattersExplainedAt?: Date;
    contractDocumentDeliveredAt?: Date;
    personalInfoConsentAt?: Date;
    amlCheckStatus: AmlCheckStatus;
    nextFollowUpAt?: Date;
    notes?: string;
  }
) {
  const client = db.clients.find((entry) => entry.id === clientId);
  if (!client) return null;

  client.name = input.name;
  client.phone = input.phone;
  client.lineId = input.lineId;
  client.email = input.email;
  client.budgetMin = input.budgetMin;
  client.budgetMax = input.budgetMax;
  client.budgetType = input.budgetType;
  client.preferredArea = input.preferredArea;
  client.firstChoiceArea = input.firstChoiceArea;
  client.secondChoiceArea = input.secondChoiceArea;
  client.purpose = input.purpose;
  client.loanPreApprovalStatus = input.loanPreApprovalStatus;
  client.desiredMoveInPeriod = input.desiredMoveInPeriod;
  client.stage = input.stage;
  client.temperature = input.temperature;
  client.brokerageContractType = input.brokerageContractType;
  client.brokerageContractSignedAt = input.brokerageContractSignedAt;
  client.brokerageContractExpiresAt = input.brokerageContractExpiresAt;
  client.importantMattersExplainedAt = input.importantMattersExplainedAt;
  client.contractDocumentDeliveredAt = input.contractDocumentDeliveredAt;
  client.personalInfoConsentAt = input.personalInfoConsentAt;
  client.amlCheckStatus = input.amlCheckStatus;
  client.nextFollowUpAt = input.nextFollowUpAt;
  client.notes = input.notes;
  client.updatedAt = new Date();

  return client;
}

export async function appendFollowUp(input: {
  clientId: string;
  createdById: string;
  type: FollowUpType;
  content: string;
  nextAction?: string;
  nextFollowUpAt?: Date;
}) {
  const item: FollowUp = {
    id: makeId("followup"),
    clientId: input.clientId,
    createdById: input.createdById,
    type: input.type,
    content: input.content,
    nextAction: input.nextAction,
    nextFollowUpAt: input.nextFollowUpAt,
    createdAt: new Date(),
  };

  db.followUps.unshift(item);

  const client = db.clients.find((entry) => entry.id === input.clientId);
  if (client) {
    client.lastContactedAt = new Date();
    client.nextFollowUpAt = input.nextFollowUpAt;
    client.updatedAt = new Date();
  }

  return item;
}

export async function addAuditLog(input: {
  userId: string;
  action: string;
  targetType: AuditLog["targetType"];
  targetId?: string;
  message: string;
}) {
  const log: AuditLog = {
    id: makeId("audit"),
    userId: input.userId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    message: input.message,
    createdAt: new Date(),
  };
  db.auditLogs.unshift(log);
  return log;
}

export async function createComplianceTaskFromAlert(input: {
  clientId: string;
  alertType: ComplianceAlertType;
  alertTitle: string;
  reason: string;
  dueAt?: Date;
  createdById?: string;
}) {
  const client = db.clients.find((entry) => entry.id === input.clientId);
  if (!client) return null;

  const createdById = input.createdById ?? client.ownerUserId;
  const existing = db.tasks.find(
    (task) =>
      task.clientId === input.clientId &&
      task.title === input.alertTitle &&
      task.status === "pending"
  );
  if (existing) return existing;

  const task: Task = {
    id: makeId("task"),
    clientId: input.clientId,
    title: input.alertTitle,
    dueAt: input.dueAt,
    status: "pending",
    createdById,
    createdAt: new Date(),
  };
  db.tasks.unshift(task);

  db.followUps.unshift({
    id: makeId("followup"),
    clientId: input.clientId,
    createdById,
    type: "note",
    content: `法定対応タスクを作成: ${input.alertTitle}`,
    nextAction: input.reason,
    nextFollowUpAt: input.dueAt,
    createdAt: new Date(),
  });

  client.updatedAt = new Date();
  await addAuditLog({
    userId: createdById,
    action: "compliance_task_created",
    targetType: "task",
    targetId: task.id,
    message: `法定対応タスクを作成しました: ${input.alertTitle}`,
  });

  return task;
}

export async function addTask(input: {
  clientId?: string;
  title: string;
  dueAt?: Date;
  status?: TaskStatus;
  createdById: string;
}) {
  const task: Task = {
    id: makeId("task"),
    clientId: input.clientId,
    title: input.title,
    dueAt: input.dueAt,
    status: input.status ?? "pending",
    createdById: input.createdById,
    createdAt: new Date(),
  };
  db.tasks.unshift(task);
  return task;
}

export async function resolveComplianceAlert(input: {
  clientId: string;
  alertType: ComplianceAlertType;
  resolvedById: string;
  resolvedAt?: Date;
  extendDays?: number;
}) {
  const client = db.clients.find((entry) => entry.id === input.clientId);
  if (!client) return null;

  const resolvedAt = input.resolvedAt ?? new Date();
  let content = "法定対応を更新しました。";
  if (input.alertType === "missing_35") {
    client.importantMattersExplainedAt = resolvedAt;
    content = "重要事項説明（35条）実施日を記録しました。";
  } else if (input.alertType === "missing_37") {
    client.contractDocumentDeliveredAt = resolvedAt;
    content = "契約書面交付（37条）日を記録しました。";
  } else if (input.alertType === "aml_pending") {
    client.amlCheckStatus = "verified";
    content = "本人確認/AMLステータスを「確認済み」に更新しました。";
  } else if (input.alertType === "missing_pii_consent") {
    client.personalInfoConsentAt = resolvedAt;
    content = "個人情報利用目的の同意確認日を記録しました。";
  } else if (input.alertType === "brokerage_expired" || input.alertType === "brokerage_expiring") {
    const extendDays = input.extendDays && input.extendDays > 0 ? input.extendDays : 90;
    client.brokerageContractSignedAt = client.brokerageContractSignedAt ?? resolvedAt;
    client.brokerageContractType = client.brokerageContractType === "none" ? "general" : client.brokerageContractType;
    client.brokerageContractExpiresAt = new Date(resolvedAt.getTime() + extendDays * 24 * 60 * 60 * 1000);
    content = `媒介契約の満了日を ${extendDays} 日延長して更新しました。`;
  }
  client.updatedAt = new Date();

  db.followUps.unshift({
    id: makeId("followup"),
    clientId: client.id,
    createdById: input.resolvedById,
    type: "note",
    content: `法定対応を解消: ${content}`,
    nextAction: "法定対応記録を再確認",
    createdAt: new Date(),
  });
  await addAuditLog({
    userId: input.resolvedById,
    action: "compliance_resolved",
    targetType: "compliance",
    targetId: client.id,
    message: content,
  });
  return client;
}

export async function updateTaskStatus(input: {
  taskId: string;
  status: TaskStatus;
  updatedById: string;
}) {
  const task = db.tasks.find((entry) => entry.id === input.taskId);
  if (!task) return null;
  task.status = input.status;
  const statusLabel = input.status === "done" ? "完了" : input.status === "canceled" ? "取消" : "未着手";

  if (task.clientId) {
    db.followUps.unshift({
      id: makeId("followup"),
      clientId: task.clientId,
      createdById: input.updatedById,
      type: "note",
      content: `タスク状態を更新: ${task.title}（${statusLabel}）`,
      nextAction: input.status === "done" ? "次の優先タスクを確認" : "必要に応じて再計画",
      createdAt: new Date(),
    });
  }
  await addAuditLog({
    userId: input.updatedById,
    action: "task_status_updated",
    targetType: "task",
    targetId: task.id,
    message: `${task.title} を ${statusLabel} に更新しました。`,
  });
  return task;
}

export async function rescheduleTask(input: {
  taskId: string;
  dueAt: Date;
  updatedById: string;
}) {
  const task = db.tasks.find((entry) => entry.id === input.taskId);
  if (!task) return null;
  task.dueAt = input.dueAt;
  task.status = "pending";

  if (task.clientId) {
    db.followUps.unshift({
      id: makeId("followup"),
      clientId: task.clientId,
      createdById: input.updatedById,
      type: "note",
      content: `タスク期限を変更: ${task.title}`,
      nextAction: `新しい期限は ${input.dueAt.toLocaleDateString("ja-JP")}`,
      nextFollowUpAt: input.dueAt,
      createdAt: new Date(),
    });
  }
  await addAuditLog({
    userId: input.updatedById,
    action: "task_rescheduled",
    targetType: "task",
    targetId: task.id,
    message: `${task.title} の期限を ${input.dueAt.toLocaleDateString("ja-JP")} に変更しました。`,
  });
  return task;
}

export async function setClientStage(clientId: string, stage: ClientStage) {
  const client = db.clients.find((entry) => entry.id === clientId);
  if (!client) return null;
  const blockers = validateStageTransition({
    from: client.stage,
    to: stage,
    quotationCount: db.quotations.filter((item) => item.clientId === client.id).length,
    followUpCount: db.followUps.filter((item) => item.clientId === client.id).length,
    hasViewingFollowUp: db.followUps.some((item) => item.clientId === client.id && item.type === "viewing"),
    importantMattersExplainedAt: client.importantMattersExplainedAt,
    personalInfoConsentAt: client.personalInfoConsentAt,
    amlCheckStatus: client.amlCheckStatus,
  });
  if (blockers.length > 0) {
    throw new StageTransitionBlockedError(blockers);
  }
  client.stage = stage;
  client.updatedAt = new Date();
  return client;
}

export async function setClientStageWithLog(input: {
  clientId: string;
  stage: ClientStage;
  createdById?: string;
  reason?: string;
  locale?: Locale;
}) {
  const client = db.clients.find((entry) => entry.id === input.clientId);
  if (!client) return null;

  const fromStage = client.stage;
  const toStage = input.stage;
  const locale = input.locale ?? "ja";
  const stageLabel = getStageLabel(locale);
  const blockers = validateStageTransition({
    from: fromStage,
    to: toStage,
    quotationCount: db.quotations.filter((item) => item.clientId === client.id).length,
    followUpCount: db.followUps.filter((item) => item.clientId === client.id).length,
    hasViewingFollowUp: db.followUps.some((item) => item.clientId === client.id && item.type === "viewing"),
    importantMattersExplainedAt: client.importantMattersExplainedAt,
    personalInfoConsentAt: client.personalInfoConsentAt,
    amlCheckStatus: client.amlCheckStatus,
    locale,
  });
  if (blockers.length > 0) {
    throw new StageTransitionBlockedError(blockers);
  }

  client.stage = toStage;
  client.updatedAt = new Date();

  if (fromStage !== toStage) {
    db.followUps.unshift({
      id: makeId("followup"),
      clientId: client.id,
      createdById: input.createdById ?? client.ownerUserId,
      type: "note",
      content:
        locale === "zh"
          ? `阶段更新: ${stageLabel[fromStage]} -> ${stageLabel[toStage]}`
          : locale === "ko"
            ? `단계 업데이트: ${stageLabel[fromStage]} -> ${stageLabel[toStage]}`
            : `ステージ更新: ${stageLabel[fromStage]} -> ${stageLabel[toStage]}`,
      nextAction:
        input.reason ??
        (locale === "zh"
          ? "进入下一阶段"
          : locale === "ko"
            ? "다음 단계로 진행"
            : "次のステージへ進める"),
      createdAt: new Date(),
    });
  }

  return client;
}

export async function addQuotation(input: {
  clientId: string;
  propertyId?: string;
  quoteTitle: string;
  listingPrice: number;
  brokerageFee: number;
  taxFee: number;
  managementFee: number;
  repairFee: number;
  otherFee: number;
  downPayment: number;
  interestRate: number;
  loanYears: number;
  summaryText: string;
}) {
  const computed = computeQuote(input);

  const quotation: Quotation = {
    id: makeId("quote"),
    clientId: input.clientId,
    propertyId: input.propertyId,
    quoteTitle: input.quoteTitle,
    listingPrice: input.listingPrice,
    brokerageFee: input.brokerageFee,
    taxFee: input.taxFee,
    managementFee: input.managementFee,
    repairFee: input.repairFee,
    otherFee: input.otherFee,
    downPayment: input.downPayment,
    interestRate: input.interestRate,
    loanYears: input.loanYears,
    summaryText: input.summaryText,
    status: "draft",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...computed,
  };

  db.quotations.unshift(quotation);

  const client = db.clients.find((entry) => entry.id === input.clientId);
  if (client) {
    const stageBefore = client.stage;
    client.stage = "quoted";
    client.lastContactedAt = new Date();
    client.updatedAt = new Date();

    db.followUps.unshift({
      id: makeId("followup"),
      clientId: client.id,
      createdById: client.ownerUserId,
      type: "note",
      content: `見積を作成: ${quotation.quoteTitle}（月々返済 ${Math.round(quotation.monthlyPaymentEstimate).toLocaleString("ja-JP")} 円）`,
      nextAction: "見積を送付し、顧客フィードバックを回収",
      nextFollowUpAt: client.nextFollowUpAt,
      createdAt: new Date(),
    });

    if (stageBefore !== "quoted") {
      db.followUps.unshift({
        id: makeId("followup"),
        clientId: client.id,
        createdById: client.ownerUserId,
        type: "note",
        content: `ステージ提案: 「${STAGE_JA_LABEL.quoted}」へ自動反映しました。`,
        nextAction: "頭金と月次支出の受容度を確認",
        nextFollowUpAt: client.nextFollowUpAt,
        createdAt: new Date(),
      });
    }
  }

  return quotation;
}

export async function duplicateQuotation(quoteId: string) {
  const source = db.quotations.find((item) => item.id === quoteId);
  if (!source) return null;

  const normalized = source.quoteTitle.replace(/\s+v\d+$/i, "").trim();
  const maxVersion = db.quotations.reduce((max, quote) => {
    const match = quote.quoteTitle.match(new RegExp(`^${normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+v(\\d+)$`, "i"));
    if (!match) return max;
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? Math.max(max, parsed) : max;
  }, 1);
  const nextVersion = maxVersion + 1;

  const quotation: Quotation = {
    ...source,
    id: makeId("quote"),
    quoteTitle: `${normalized} v${nextVersion}`,
    status: "draft",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  db.quotations.unshift(quotation);

  const client = db.clients.find((entry) => entry.id === quotation.clientId);
  if (client) {
    db.followUps.unshift({
      id: makeId("followup"),
      clientId: client.id,
      createdById: client.ownerUserId,
      type: "note",
      content: `見積改訂: 新バージョン ${quotation.quoteTitle} を作成。`,
      nextAction: "差分確認後に顧客へ送付",
      nextFollowUpAt: client.nextFollowUpAt,
      createdAt: new Date(),
    });
  }

  return quotation;
}

export async function updateQuotationStatus(quoteId: string, status: QuoteStatus) {
  const quote = db.quotations.find((item) => item.id === quoteId);
  if (!quote) return null;
  quote.status = status;
  quote.updatedAt = new Date();
  return quote;
}

export async function healthCheckDataDriver() {
  return {
    ok: true,
    driver: "memory" as const,
  };
}
