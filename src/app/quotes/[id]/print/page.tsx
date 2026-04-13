import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintToolbar } from "@/components/print-toolbar";
import { getDefaultUser, getOutputTemplateSettings, getQuotationById } from "@/lib/data";
import { formatCurrency, formatDate } from "@/lib/format";
import { getLocale } from "@/lib/locale";
import {
  getAmlCheckStatusLabel,
  getBrokerageContractTypeLabel,
  getLoanPreApprovalLabel,
} from "@/lib/options";
import {
  createDocumentNumber,
  getDefaultOutputTemplateSettings,
  getOutputTitle,
  isOutputDocType,
  getOutputDocDescription,
  type OutputDocType,
} from "@/lib/output-doc";

export const dynamic = "force-dynamic";

type QuotePrintPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ type?: string }>;
};

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "-";
  return `${value.toFixed(2)}%`;
}

function getOutstandingBalance(principal: number, annualRate: number, totalMonths: number, paidMonths: number): number {
  if (principal <= 0 || totalMonths <= 0) return 0;
  if (paidMonths <= 0) return Math.round(principal);
  if (paidMonths >= totalMonths) return 0;

  const monthlyRate = annualRate / 100 / 12;
  if (monthlyRate === 0) {
    return Math.max(0, Math.round(principal * (1 - paidMonths / totalMonths)));
  }

  const n = totalMonths;
  const k = paidMonths;
  const base = Math.pow(1 + monthlyRate, n);
  const paid = Math.pow(1 + monthlyRate, k);
  const balance = principal * ((base - paid) / (base - 1));
  return Math.max(0, Math.round(balance));
}

const OUTPUT_TYPES: OutputDocType[] = ["proposal", "estimate_sheet", "funding_plan", "assumption_memo"];

const texts = {
  ja: {
    back: "提案詳細へ戻る",
    docNo: "文書番号",
    version: "版数",
    issueDate: "発行日",
    classification: "区分",
    recipient: "宛先",
    proposalName: "提案名",
    targetProperty: "対象物件",
    unlinkedProperty: "未連携物件",
    legalSummary: "法定対応サマリー",
    brokerageType: "媒介契約種別",
    brokerageExpires: "媒介契約期限",
    loanPre: "ローン事前審査",
    aml: "AML確認",
    matters35: "重要事項説明（35条）",
    matters37: "契約書交付（37条）",
    notSet: "未設定",
    notDone: "未実施",
    notDelivered: "未交付",
    proposal1: "1. 提案サマリー",
    proposal2: "2. 取得時費用（概算）",
    proposal3: "3. 担当コメント",
    listingPrice: "物件価格",
    downPayment: "自己資金（頭金）",
    loanAmount: "借入額",
    downRatio: "頭金比率",
    monthlyPay: "月々返済額（試算）",
    monthlyTotal: "月次総支出（概算）",
    brokerageFee: "仲介手数料",
    taxFee: "税金・諸費用",
    otherFee: "その他費用",
    acquisitionTotal: "取得関連費用合計",
    initialCash: "契約時必要自己資金（概算）",
    estimate1: "1. 費用明細（概算）",
    estimate2: "2. 集計",
    item: "項目",
    amount: "金額",
    basis: "算定根拠 / 備考",
    funding1: "1. ローン試算条件",
    funding2: "2. 借入残高推移（概算）",
    interest: "金利（年率）",
    term: "返済期間",
    monthlyCommon: "管理費+修繕積立金（月額）",
    point: "時点",
    balance: "借入残高（概算）",
    note: "備考",
    beforeRepay: "返済開始前",
    repayAssume: "回返済想定",
    assumption1: "1. 試算前提条件",
    assumption2: "2. 確認事項チェック",
    notice: "ご留意事項",
    staffConfirm: "担当者確認",
    customerConfirm: "顧客確認",
    check1: "□ 顧客へ試算前提を説明済み",
    check2: "□ 金利条件の再確認が必要",
    check3: "□ 税金・諸費用の最新見直しが必要",
    check4: "□ 管理規約・長期修繕計画を確認予定",
    check5: "□ 事前審査結果反映後に再試算予定",
    check6: "□ 契約条件変更時に再発行予定",
    assumptionL1: "本書はヒアリング時点の情報に基づく概算資料です。",
    assumptionL2: "金利・借入可否・借入上限は金融機関審査結果を優先します。",
    assumptionL3: "税金・登記費用・保険料等は契約条件および時点により変動します。",
    assumptionL4: "管理費・修繕積立金は管理組合の決議により改定される場合があります。",
    contractAt: "契約時",
    after1y: "1年後",
    after5y: "5年後",
    after10y: "10年後",
    maturity: "満期",
    year: "年",
    times: "回",
    noQuote: "提案データが見つかりません。",
    basePrice: "売出価格ベース",
    ownFund: "自己資金投入予定",
    brokerageBasis: "媒介契約条件に基づく概算",
    taxBasis: "登録免許税・印紙税等の概算",
    otherBasis: "引渡調整費・関連実費等",
    mgmtBasis: "管理組合規約に基づく",
  },
  zh: {
    back: "返回提案详情",
    docNo: "文档编号",
    version: "版本",
    issueDate: "发行日",
    classification: "分类",
    recipient: "收件人",
    proposalName: "提案名",
    targetProperty: "目标物件",
    unlinkedProperty: "未关联物件",
    legalSummary: "法定应对摘要",
    brokerageType: "媒介合同类型",
    brokerageExpires: "媒介合同期限",
    loanPre: "贷款预审",
    aml: "AML确认",
    matters35: "重要事项说明（35条）",
    matters37: "合同书面交付（37条）",
    notSet: "未设置",
    notDone: "未实施",
    notDelivered: "未交付",
    proposal1: "1. 提案摘要",
    proposal2: "2. 取得时费用（估算）",
    proposal3: "3. 担当备注",
    listingPrice: "物件价格",
    downPayment: "自有资金（首付）",
    loanAmount: "贷款额",
    downRatio: "首付比例",
    monthlyPay: "月供（试算）",
    monthlyTotal: "每月总支出（估算）",
    brokerageFee: "中介费",
    taxFee: "税费",
    otherFee: "其他费用",
    acquisitionTotal: "取得相关费用合计",
    initialCash: "签约时所需自有资金（估算）",
    estimate1: "1. 费用明细（估算）",
    estimate2: "2. 汇总",
    item: "项目",
    amount: "金额",
    basis: "计算依据 / 备注",
    funding1: "1. 贷款试算条件",
    funding2: "2. 贷款余额变化（估算）",
    interest: "利率（年）",
    term: "还款期限",
    monthlyCommon: "管理费+修缮基金（月）",
    point: "时点",
    balance: "贷款余额（估算）",
    note: "备注",
    beforeRepay: "还款开始前",
    repayAssume: "期还款假设",
    assumption1: "1. 试算前提条件",
    assumption2: "2. 确认事项检查",
    notice: "注意事项",
    staffConfirm: "担当确认",
    customerConfirm: "客户确认",
    check1: "□ 已向客户说明试算前提",
    check2: "□ 需再次确认利率条件",
    check3: "□ 需更新税费与杂费",
    check4: "□ 计划确认管理规约与长期修缮计划",
    check5: "□ 预审结果反映后再试算",
    check6: "□ 合同条件变化时重新出具",
    assumptionL1: "本文件基于访谈时点信息的估算资料。",
    assumptionL2: "利率、可贷性与额度以上线机构审查结果为准。",
    assumptionL3: "税金、登记费用、保险费会因条件和时点变动。",
    assumptionL4: "管理费与修缮基金可能因管理组合决议而调整。",
    contractAt: "签约时",
    after1y: "1年后",
    after5y: "5年后",
    after10y: "10年后",
    maturity: "到期",
    year: "年",
    times: "期",
    noQuote: "未找到提案数据。",
    basePrice: "按挂牌价估算",
    ownFund: "预计自有资金投入",
    brokerageBasis: "按媒介合同条件估算",
    taxBasis: "登记税、印花税等估算",
    otherBasis: "交付调整费及相关实费",
    mgmtBasis: "依据管理组合规约",
  },
  ko: {
    back: "제안 상세로 돌아가기",
    docNo: "문서 번호",
    version: "버전",
    issueDate: "발행일",
    classification: "구분",
    recipient: "수신",
    proposalName: "제안명",
    targetProperty: "대상 매물",
    unlinkedProperty: "미연결 매물",
    legalSummary: "법정 대응 요약",
    brokerageType: "중개 계약 유형",
    brokerageExpires: "중개 계약 만료",
    loanPre: "대출 사전심사",
    aml: "AML 확인",
    matters35: "중요사항 설명(35조)",
    matters37: "계약서 교부(37조)",
    notSet: "미설정",
    notDone: "미실시",
    notDelivered: "미교부",
    proposal1: "1. 제안 요약",
    proposal2: "2. 취득 시 비용(추정)",
    proposal3: "3. 담당자 코멘트",
    listingPrice: "매물 가격",
    downPayment: "자기자금(계약금)",
    loanAmount: "대출금",
    downRatio: "계약금 비율",
    monthlyPay: "월 상환액(예상)",
    monthlyTotal: "월 총지출(추정)",
    brokerageFee: "중개수수료",
    taxFee: "세금/제비용",
    otherFee: "기타 비용",
    acquisitionTotal: "취득 관련 비용 합계",
    initialCash: "계약 시 필요 자기자금(추정)",
    estimate1: "1. 비용 명세(추정)",
    estimate2: "2. 집계",
    item: "항목",
    amount: "금액",
    basis: "산정 근거 / 비고",
    funding1: "1. 대출 시뮬레이션 조건",
    funding2: "2. 대출 잔액 추이(추정)",
    interest: "금리(연)",
    term: "상환 기간",
    monthlyCommon: "관리비+수선적립금(월)",
    point: "시점",
    balance: "대출 잔액(추정)",
    note: "비고",
    beforeRepay: "상환 시작 전",
    repayAssume: "회 상환 가정",
    assumption1: "1. 시뮬레이션 전제조건",
    assumption2: "2. 확인사항 체크",
    notice: "유의사항",
    staffConfirm: "담당자 확인",
    customerConfirm: "고객 확인",
    check1: "□ 고객에게 전제조건 설명 완료",
    check2: "□ 금리 조건 재확인 필요",
    check3: "□ 세금/제비용 최신값 재점검 필요",
    check4: "□ 관리규약/장기수선계획 확인 예정",
    check5: "□ 사전심사 결과 반영 후 재시뮬레이션 예정",
    check6: "□ 계약 조건 변경 시 재발행 예정",
    assumptionL1: "본 문서는 상담 시점 정보를 기반으로 한 추정 자료입니다.",
    assumptionL2: "금리/대출 가능 여부/한도는 금융기관 심사 결과를 우선합니다.",
    assumptionL3: "세금/등기비용/보험료 등은 조건 및 시점에 따라 변동됩니다.",
    assumptionL4: "관리비/수선적립금은 관리조합 결정으로 조정될 수 있습니다.",
    contractAt: "계약 시",
    after1y: "1년 후",
    after5y: "5년 후",
    after10y: "10년 후",
    maturity: "만기",
    year: "년",
    times: "회",
    noQuote: "제안 데이터를 찾을 수 없습니다.",
    basePrice: "매도 호가 기준",
    ownFund: "자기자금 투입 예정",
    brokerageBasis: "중개 계약 조건 기반 추정",
    taxBasis: "등록면허세/인지세 등 추정",
    otherBasis: "인도 조정비/관련 실비 등",
    mgmtBasis: "관리조합 규약 기준",
  },
} as const;

export default async function QuotePrintPage({ params, searchParams }: QuotePrintPageProps) {
  const locale = await getLocale();
  const tx = texts[locale];
  const brokerageLabel = getBrokerageContractTypeLabel(locale);
  const loanPreLabel = getLoanPreApprovalLabel(locale);
  const amlLabel = getAmlCheckStatusLabel(locale);

  const { id } = await params;
  const query = (await searchParams) ?? {};
  const quote = await getQuotationById(id);

  if (!quote || !quote.client) {
    notFound();
  }

  const rawType = query.type ?? "proposal";
  const docType: OutputDocType = isOutputDocType(rawType) ? rawType : "proposal";

  const issueAt = quote.updatedAt ?? quote.createdAt;
  const issueDate = formatDate(issueAt, locale);
  const versionMatch = quote.quoteTitle.match(/\sv(\d+)$/i);
  const versionLabel = versionMatch ? `Ver.${versionMatch[1]}` : "Ver.1";
  const documentNumber = createDocumentNumber(quote.id, docType, issueAt);
  const user = await getDefaultUser();
  const settings = user
    ? await getOutputTemplateSettings(user.id)
    : getDefaultOutputTemplateSettings("user_demo");

  const acquisitionExpense = quote.brokerageFee + quote.taxFee + quote.otherFee;
  const initialCashRequired = quote.downPayment + acquisitionExpense;
  const monthlyCommonFee = quote.managementFee + quote.repairFee;
  const downPaymentRatio = quote.listingPrice > 0 ? (quote.downPayment / quote.listingPrice) * 100 : 0;

  const totalMonths = Math.max(1, quote.loanYears * 12);
  const outstandingSnapshots = [
    { label: tx.contractAt, months: 0 },
    { label: tx.after1y, months: 12 },
    { label: tx.after5y, months: 60 },
    { label: tx.after10y, months: 120 },
    { label: tx.maturity, months: totalMonths },
  ].map((item) => ({
    ...item,
    balance: getOutstandingBalance(quote.loanAmount, quote.interestRate, totalMonths, item.months),
  }));

  return (
    <div className="mx-auto max-w-4xl">
      <PrintToolbar locale={locale} />

      <div className="mb-3 flex flex-wrap items-center gap-2 print:hidden">
        <Link href={`/quotes/${quote.id}`} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
          {tx.back}
        </Link>
        {OUTPUT_TYPES.map((type) => (
          <Link
            key={type}
            href={`/quotes/${quote.id}/print?type=${type}`}
            className={`rounded-lg border px-3 py-2 text-sm ${
              docType === type ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-300 text-slate-700 hover:bg-slate-100"
            }`}
          >
            {getOutputTitle(settings, type)}
          </Link>
        ))}
      </div>

      <div className="space-y-6 rounded-2xl bg-white p-8 shadow print:shadow-none">
        <header className="space-y-4 border-b border-slate-200 pb-5">
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="text-xs tracking-widest text-slate-400">{getOutputDocDescription(locale, docType)}</p>
              <h1 className="text-2xl font-bold text-slate-900">{getOutputTitle(settings, docType)}</h1>
            </div>
            <dl className="grid grid-cols-[110px_1fr] gap-y-1 text-xs text-slate-600">
              <dt>{tx.docNo}</dt>
              <dd>{documentNumber}</dd>
              <dt>{tx.version}</dt>
              <dd>{versionLabel}</dd>
              <dt>{tx.issueDate}</dt>
              <dd>{issueDate}</dd>
              <dt>{tx.classification}</dt>
              <dd>{settings.documentClassification}</dd>
            </dl>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <p>{tx.recipient}: {quote.client.name}</p>
              <p>{tx.proposalName}: {quote.quoteTitle}</p>
              <p>{tx.targetProperty}: {quote.property?.name ?? tx.unlinkedProperty}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <p>{settings.companyName}</p>
              <p>{settings.department} / {settings.representative}</p>
              <p>{settings.postalAddress}</p>
              <p>{settings.phone} / {settings.email}</p>
              <p>{settings.licenseNumber}</p>
            </div>
          </div>
        </header>

        {settings.showLegalStatusDigest ? (
          <section className="rounded-xl border border-slate-200 p-4">
            <h2 className="text-sm font-semibold text-slate-900">{tx.legalSummary}</h2>
            <dl className="mt-2 grid grid-cols-[220px_1fr] gap-y-2 text-sm">
              <dt className="text-slate-500">{tx.brokerageType}</dt>
              <dd>{brokerageLabel[quote.client.brokerageContractType] ?? quote.client.brokerageContractType}</dd>
              <dt className="text-slate-500">{tx.brokerageExpires}</dt>
              <dd>{quote.client.brokerageContractExpiresAt ? formatDate(quote.client.brokerageContractExpiresAt, locale) : tx.notSet}</dd>
              <dt className="text-slate-500">{tx.loanPre}</dt>
              <dd>{loanPreLabel[quote.client.loanPreApprovalStatus] ?? quote.client.loanPreApprovalStatus}</dd>
              <dt className="text-slate-500">{tx.aml}</dt>
              <dd>{amlLabel[quote.client.amlCheckStatus] ?? quote.client.amlCheckStatus}</dd>
              <dt className="text-slate-500">{tx.matters35}</dt>
              <dd>{quote.client.importantMattersExplainedAt ? formatDate(quote.client.importantMattersExplainedAt, locale) : tx.notDone}</dd>
              <dt className="text-slate-500">{tx.matters37}</dt>
              <dd>{quote.client.contractDocumentDeliveredAt ? formatDate(quote.client.contractDocumentDeliveredAt, locale) : tx.notDelivered}</dd>
            </dl>
          </section>
        ) : null}

        {docType === "proposal" ? (
          <>
            <section>
              <h2 className="text-sm font-semibold text-slate-900">{tx.proposal1}</h2>
              <div className="mt-3 grid gap-2 rounded-xl bg-slate-50 p-4 text-sm text-slate-700 md:grid-cols-2">
                <p className="flex justify-between"><span>{tx.listingPrice}</span><strong>{formatCurrency(quote.listingPrice, locale)}</strong></p>
                <p className="flex justify-between"><span>{tx.downPayment}</span><strong>{formatCurrency(quote.downPayment, locale)}</strong></p>
                <p className="flex justify-between"><span>{tx.loanAmount}</span><strong>{formatCurrency(quote.loanAmount, locale)}</strong></p>
                <p className="flex justify-between"><span>{tx.downRatio}</span><strong>{formatPercent(downPaymentRatio)}</strong></p>
                <p className="flex justify-between"><span>{tx.monthlyPay}</span><strong>{formatCurrency(quote.monthlyPaymentEstimate, locale)}</strong></p>
                <p className="flex justify-between"><span>{tx.monthlyTotal}</span><strong>{formatCurrency(quote.monthlyTotalCost, locale)}</strong></p>
              </div>
            </section>

            <section>
              <h2 className="text-sm font-semibold text-slate-900">{tx.proposal2}</h2>
              <dl className="mt-3 grid grid-cols-[220px_1fr] gap-y-2 text-sm">
                <dt className="text-slate-500">{tx.brokerageFee}</dt>
                <dd>{formatCurrency(quote.brokerageFee, locale)}</dd>
                <dt className="text-slate-500">{tx.taxFee}</dt>
                <dd>{formatCurrency(quote.taxFee, locale)}</dd>
                <dt className="text-slate-500">{tx.otherFee}</dt>
                <dd>{formatCurrency(quote.otherFee, locale)}</dd>
                <dt className="text-slate-500">{tx.acquisitionTotal}</dt>
                <dd className="font-semibold text-slate-900">{formatCurrency(acquisitionExpense, locale)}</dd>
                <dt className="text-slate-500">{tx.initialCash}</dt>
                <dd className="font-semibold text-slate-900">{formatCurrency(initialCashRequired, locale)}</dd>
              </dl>
            </section>

            <section className="rounded-xl bg-slate-50 p-4">
              <h2 className="text-sm font-semibold text-slate-900">{tx.proposal3}</h2>
              <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-800">{quote.summaryText}</p>
            </section>
          </>
        ) : null}

        {docType === "estimate_sheet" ? (
          <>
            <section>
              <h2 className="text-sm font-semibold text-slate-900">{tx.estimate1}</h2>
              <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">{tx.item}</th>
                      <th className="px-3 py-2 text-right font-medium">{tx.amount}</th>
                      <th className="px-3 py-2 text-left font-medium">{tx.basis}</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-700">
                    <tr className="border-t border-slate-100"><td className="px-3 py-2">{tx.listingPrice}</td><td className="px-3 py-2 text-right">{formatCurrency(quote.listingPrice, locale)}</td><td className="px-3 py-2">{tx.basePrice}</td></tr>
                    <tr className="border-t border-slate-100"><td className="px-3 py-2">{tx.downPayment}</td><td className="px-3 py-2 text-right">{formatCurrency(quote.downPayment, locale)}</td><td className="px-3 py-2">{tx.ownFund}</td></tr>
                    <tr className="border-t border-slate-100"><td className="px-3 py-2">{tx.brokerageFee}</td><td className="px-3 py-2 text-right">{formatCurrency(quote.brokerageFee, locale)}</td><td className="px-3 py-2">{tx.brokerageBasis}</td></tr>
                    <tr className="border-t border-slate-100"><td className="px-3 py-2">{tx.taxFee}</td><td className="px-3 py-2 text-right">{formatCurrency(quote.taxFee, locale)}</td><td className="px-3 py-2">{tx.taxBasis}</td></tr>
                    <tr className="border-t border-slate-100"><td className="px-3 py-2">{tx.otherFee}</td><td className="px-3 py-2 text-right">{formatCurrency(quote.otherFee, locale)}</td><td className="px-3 py-2">{tx.otherBasis}</td></tr>
                    <tr className="border-t border-slate-100"><td className="px-3 py-2">{tx.monthlyCommon}</td><td className="px-3 py-2 text-right">{formatCurrency(monthlyCommonFee, locale)}</td><td className="px-3 py-2">{tx.mgmtBasis}</td></tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h2 className="text-sm font-semibold text-slate-900">{tx.estimate2}</h2>
              <dl className="mt-3 grid grid-cols-[240px_1fr] gap-y-2 text-sm">
                <dt className="text-slate-500">{tx.acquisitionTotal}</dt>
                <dd className="font-semibold text-slate-900">{formatCurrency(acquisitionExpense, locale)}</dd>
                <dt className="text-slate-500">{tx.initialCash}</dt>
                <dd className="font-semibold text-slate-900">{formatCurrency(initialCashRequired, locale)}</dd>
                <dt className="text-slate-500">{tx.monthlyCommon}</dt>
                <dd className="font-semibold text-slate-900">{formatCurrency(monthlyCommonFee, locale)}</dd>
                <dt className="text-slate-500">{tx.monthlyTotal}</dt>
                <dd className="font-semibold text-slate-900">{formatCurrency(quote.monthlyTotalCost, locale)}</dd>
              </dl>
            </section>
          </>
        ) : null}

        {docType === "funding_plan" ? (
          <>
            <section>
              <h2 className="text-sm font-semibold text-slate-900">{tx.funding1}</h2>
              <dl className="mt-3 grid grid-cols-[220px_1fr] gap-y-2 text-sm">
                <dt className="text-slate-500">{tx.loanAmount}</dt>
                <dd>{formatCurrency(quote.loanAmount, locale)}</dd>
                <dt className="text-slate-500">{tx.interest}</dt>
                <dd>{formatPercent(quote.interestRate)}</dd>
                <dt className="text-slate-500">{tx.term}</dt>
                <dd>{quote.loanYears}{tx.year}（{totalMonths}{tx.times}）</dd>
                <dt className="text-slate-500">{tx.monthlyPay}</dt>
                <dd className="font-semibold text-slate-900">{formatCurrency(quote.monthlyPaymentEstimate, locale)}</dd>
                <dt className="text-slate-500">{tx.monthlyCommon}</dt>
                <dd>{formatCurrency(monthlyCommonFee, locale)}</dd>
                <dt className="text-slate-500">{tx.monthlyTotal}</dt>
                <dd className="font-semibold text-slate-900">{formatCurrency(quote.monthlyTotalCost, locale)}</dd>
              </dl>
            </section>

            {settings.showOutstandingBalanceTable ? (
              <section>
                <h2 className="text-sm font-semibold text-slate-900">{tx.funding2}</h2>
                <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">{tx.point}</th>
                        <th className="px-3 py-2 text-right font-medium">{tx.balance}</th>
                        <th className="px-3 py-2 text-left font-medium">{tx.note}</th>
                      </tr>
                    </thead>
                    <tbody className="text-slate-700">
                      {outstandingSnapshots.map((item) => (
                        <tr key={item.label} className="border-t border-slate-100">
                          <td className="px-3 py-2">{item.label}</td>
                          <td className="px-3 py-2 text-right">{formatCurrency(item.balance, locale)}</td>
                          <td className="px-3 py-2">{item.months === 0 ? tx.beforeRepay : `${item.months}${tx.repayAssume}`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}
          </>
        ) : null}

        {docType === "assumption_memo" ? (
          <>
            <section>
              <h2 className="text-sm font-semibold text-slate-900">{tx.assumption1}</h2>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-700">
                <li>{tx.assumptionL1}</li>
                <li>{tx.assumptionL2}</li>
                <li>{tx.assumptionL3}</li>
                <li>{tx.assumptionL4}</li>
              </ul>
            </section>

            <section>
              <h2 className="text-sm font-semibold text-slate-900">{tx.assumption2}</h2>
              <div className="mt-3 grid gap-2 rounded-xl border border-slate-200 p-4 text-sm text-slate-700 md:grid-cols-2">
                <p>{tx.check1}</p>
                <p>{tx.check2}</p>
                <p>{tx.check3}</p>
                <p>{tx.check4}</p>
                <p>{tx.check5}</p>
                <p>{tx.check6}</p>
              </div>
            </section>
          </>
        ) : null}

        <section className="rounded-xl border border-slate-200 p-4">
          <h2 className="text-sm font-semibold text-slate-900">{tx.notice}</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-slate-600">
            <li>{settings.disclaimerLine1}</li>
            <li>{settings.disclaimerLine2}</li>
            <li>{settings.disclaimerLine3}</li>
          </ul>
          {settings.showApprovalSection ? (
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-slate-600">
              <div className="rounded-lg border border-slate-200 p-3">{tx.staffConfirm}: ＿＿＿＿＿＿＿＿</div>
              <div className="rounded-lg border border-slate-200 p-3">{tx.customerConfirm}: ＿＿＿＿＿＿＿＿</div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
