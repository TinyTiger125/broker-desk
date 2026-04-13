import Link from "next/link";
import { notFound } from "next/navigation";
import { applyOutputTemplateVersionAction, updateOutputTemplateSettingsAction } from "@/app/actions";
import { getDefaultUser, getOutputTemplateSettings, listOutputTemplateVersions, listQuotations } from "@/lib/data";
import { getLocale, type Locale } from "@/lib/locale";
import { getOutputDocLabel, type OutputDocType, type OutputTemplateSettingsInput } from "@/lib/output-doc";

export const dynamic = "force-dynamic";

const OUTPUT_TYPES: OutputDocType[] = ["proposal", "estimate_sheet", "funding_plan", "assumption_memo"];

type OutputTemplateSettingsPageProps = {
  searchParams?: Promise<{
    diffVersionId?: string;
  }>;
};

function getCopy(locale: Locale) {
  const copyByLocale = {
    ja: {
      title: "出力テンプレート調整センター",
      desc: "日本市場向け帳票の書式・見出し・注意文を統一管理し、業務実態に合わせて継続調整できます。",
      toQuotes: "提案一覧へ",
      previewLatest: "最新提案をプレビュー",
      companyBlockTitle: "会社情報ブロック",
      companyBlockDesc: "全テンプレート共通で表示される発行元情報です。",
      documentBlockTitle: "文書タイトル・区分",
      documentBlockDesc: "帳票種別ごとの正式名称と文書分類を調整できます。",
      displayBlockTitle: "注意事項・表示制御",
      displayBlockDesc: "法務文言と表示項目を設定し、案件ごとの出力品質を均一化します。",
      showApproval: "承認欄を表示",
      showLegalStatus: "法定対応サマリーを表示",
      showOutstanding: "借入残高推移表を表示",
      opsMemoTitle: "運用メモ",
      opsMemo1: "保存後は、すべての出力テンプレートに即時反映されます。",
      opsMemo2: "案件ごとの差分は、提案本文の「担当コメント」で補足してください。",
      opsMemo3: "文書番号・版数・発行日はシステムで自動付番されます。",
      saveSettings: "設定を保存",
      resetTemplate: "日本標準テンプレートを再適用",
      versionLabel: "版名（任意）",
      versionLabelPlaceholder: "例: 2026年4月改訂版",
      changeNote: "変更メモ（任意）",
      changeNotePlaceholder: "例: 注意文と会社情報を更新",
      versionsTitle: "テンプレート版履歴",
      versionsDesc: "保存時に自動で版を作成します。任意の版に戻すこともできます。",
      activeVersion: "現在適用中",
      checkDiff: "差分を確認",
      applyVersion: "この版を適用",
      diffPreviewTitle: "差分プレビュー",
      diffPreviewDesc: "現在適用中テンプレートとの差分を表示しています。",
      closeDiff: "差分表示を閉じる",
      noDiff: "差分はありません。",
      diffColField: "項目",
      diffColCurrent: "現在",
      diffColTarget: "比較対象",
      shortcutTitle: "出力確認ショートカット",
      shortcutDesc: "保存後に下記リンクで仕上がりを確認できます。最新提案がない場合は提案を先に作成してください。",
      shortcutCheck: "を確認",
      noQuote: "提案データがまだありません。",
    },
    zh: {
      title: "输出模板调整中心",
      desc: "统一管理面向日本市场的文书格式、标题和注意文，并可持续按业务实际调整。",
      toQuotes: "前往提案列表",
      previewLatest: "预览最新提案",
      companyBlockTitle: "公司信息区块",
      companyBlockDesc: "此处为所有模板共用的出具方信息。",
      documentBlockTitle: "文书标题与分类",
      documentBlockDesc: "可调整各类文书的正式名称与文档分类。",
      displayBlockTitle: "注意事项与显示控制",
      displayBlockDesc: "设置法务文案与显示项，统一每个案件的输出质量。",
      showApproval: "显示审批栏",
      showLegalStatus: "显示法定应对摘要",
      showOutstanding: "显示贷款余额趋势表",
      opsMemoTitle: "运用备注",
      opsMemo1: "保存后会立即反映到全部输出模板。",
      opsMemo2: "案件差异请在提案正文“担当备注”中补充。",
      opsMemo3: "文书编号、版本号与出具日由系统自动生成。",
      saveSettings: "保存设置",
      resetTemplate: "恢复日本标准模板",
      versionLabel: "版本名（可选）",
      versionLabelPlaceholder: "例：2026年4月修订版",
      changeNote: "变更备注（可选）",
      changeNotePlaceholder: "例：更新注意文与公司信息",
      versionsTitle: "模板版本历史",
      versionsDesc: "每次保存会自动生成版本，也可回滚到任意版本。",
      activeVersion: "当前生效中",
      checkDiff: "查看差异",
      applyVersion: "应用此版本",
      diffPreviewTitle: "差异预览",
      diffPreviewDesc: "显示与当前生效模板的差异。",
      closeDiff: "关闭差异",
      noDiff: "无差异。",
      diffColField: "字段",
      diffColCurrent: "当前值",
      diffColTarget: "对比值",
      shortcutTitle: "输出检查快捷入口",
      shortcutDesc: "保存后可通过下方链接确认成品。若暂无提案，请先创建提案。",
      shortcutCheck: "查看",
      noQuote: "暂无提案数据。",
    },
    ko: {
      title: "출력 템플릿 조정 센터",
      desc: "일본 시장용 문서의 서식·제목·주의문을 통합 관리하고, 실제 운영에 맞춰 지속적으로 조정할 수 있습니다.",
      toQuotes: "제안 목록으로",
      previewLatest: "최신 제안 미리보기",
      companyBlockTitle: "회사 정보 블록",
      companyBlockDesc: "모든 템플릿에 공통으로 표시되는 발행자 정보입니다.",
      documentBlockTitle: "문서 제목·구분",
      documentBlockDesc: "문서 유형별 정식 명칭과 문서 구분을 조정할 수 있습니다.",
      displayBlockTitle: "주의사항·표시 제어",
      displayBlockDesc: "법무 문구와 표시 항목을 설정해 건별 출력 품질을 균일화합니다.",
      showApproval: "승인란 표시",
      showLegalStatus: "법정 대응 요약 표시",
      showOutstanding: "대출 잔액 추이표 표시",
      opsMemoTitle: "운영 메모",
      opsMemo1: "저장 후 모든 출력 템플릿에 즉시 반영됩니다.",
      opsMemo2: "건별 차이는 제안 본문의 ‘담당자 코멘트’에 보완하세요.",
      opsMemo3: "문서 번호·버전·발행일은 시스템이 자동 부여합니다.",
      saveSettings: "설정 저장",
      resetTemplate: "일본 표준 템플릿 재적용",
      versionLabel: "버전명(선택)",
      versionLabelPlaceholder: "예: 2026년 4월 개정판",
      changeNote: "변경 메모(선택)",
      changeNotePlaceholder: "예: 주의문 및 회사 정보 업데이트",
      versionsTitle: "템플릿 버전 이력",
      versionsDesc: "저장 시 자동으로 버전이 생성되며, 원하는 버전으로 복원할 수 있습니다.",
      activeVersion: "현재 적용 중",
      checkDiff: "차이 확인",
      applyVersion: "이 버전 적용",
      diffPreviewTitle: "차이 미리보기",
      diffPreviewDesc: "현재 적용 템플릿과의 차이를 표시합니다.",
      closeDiff: "차이 보기 닫기",
      noDiff: "차이가 없습니다.",
      diffColField: "항목",
      diffColCurrent: "현재",
      diffColTarget: "비교 대상",
      shortcutTitle: "출력 확인 바로가기",
      shortcutDesc: "저장 후 아래 링크로 결과를 확인할 수 있습니다. 최신 제안이 없으면 먼저 제안을 생성하세요.",
      shortcutCheck: "확인",
      noQuote: "제안 데이터가 아직 없습니다.",
    },
  } as const;

  return copyByLocale[locale];
}

function getTemplateFieldLabels(locale: Locale): Record<keyof OutputTemplateSettingsInput, string> {
  const labelsByLocale: Record<Locale, Record<keyof OutputTemplateSettingsInput, string>> = {
    ja: {
      companyName: "会社名",
      department: "部署",
      representative: "担当者名",
      licenseNumber: "免許番号",
      postalAddress: "所在地",
      phone: "電話番号",
      email: "メール",
      proposalTitle: "購入提案書タイトル",
      estimateSheetTitle: "費用明細タイトル",
      fundingPlanTitle: "資金計画書タイトル",
      assumptionMemoTitle: "前提条件説明書タイトル",
      documentClassification: "文書区分",
      disclaimerLine1: "留意事項 1",
      disclaimerLine2: "留意事項 2",
      disclaimerLine3: "留意事項 3",
      showApprovalSection: "承認欄表示",
      showLegalStatusDigest: "法定対応サマリー表示",
      showOutstandingBalanceTable: "借入残高推移表表示",
    },
    zh: {
      companyName: "公司名称",
      department: "部门",
      representative: "负责人",
      licenseNumber: "许可证编号",
      postalAddress: "地址",
      phone: "电话号码",
      email: "邮箱",
      proposalTitle: "购买提案书标题",
      estimateSheetTitle: "费用明细标题",
      fundingPlanTitle: "资金计划书标题",
      assumptionMemoTitle: "前提条件说明书标题",
      documentClassification: "文书分类",
      disclaimerLine1: "注意事项 1",
      disclaimerLine2: "注意事项 2",
      disclaimerLine3: "注意事项 3",
      showApprovalSection: "显示审批栏",
      showLegalStatusDigest: "显示法定应对摘要",
      showOutstandingBalanceTable: "显示贷款余额趋势表",
    },
    ko: {
      companyName: "회사명",
      department: "부서",
      representative: "담당자명",
      licenseNumber: "면허 번호",
      postalAddress: "소재지",
      phone: "전화번호",
      email: "이메일",
      proposalTitle: "구매 제안서 제목",
      estimateSheetTitle: "비용 명세 제목",
      fundingPlanTitle: "자금 계획서 제목",
      assumptionMemoTitle: "전제조건 설명서 제목",
      documentClassification: "문서 구분",
      disclaimerLine1: "유의사항 1",
      disclaimerLine2: "유의사항 2",
      disclaimerLine3: "유의사항 3",
      showApprovalSection: "승인란 표시",
      showLegalStatusDigest: "법정 대응 요약 표시",
      showOutstandingBalanceTable: "대출 잔액 추이표 표시",
    },
  };
  return labelsByLocale[locale];
}

function toSnapshot(settings: Awaited<ReturnType<typeof getOutputTemplateSettings>>): OutputTemplateSettingsInput {
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

function formatDateTime(date: Date, locale: Locale): string {
  const intlLocale = locale === "zh" ? "zh-CN" : locale === "ko" ? "ko-KR" : "ja-JP";
  return date.toLocaleString(intlLocale);
}

export default async function OutputTemplateSettingsPage({ searchParams }: OutputTemplateSettingsPageProps) {
  const locale = await getLocale();
  const copy = getCopy(locale);
  const templateFieldLabels = getTemplateFieldLabels(locale);

  const params = searchParams ? await searchParams : undefined;
  const diffVersionId = params?.diffVersionId?.trim() ?? "";
  const user = await getDefaultUser();
  if (!user) {
    notFound();
  }
  const settings = await getOutputTemplateSettings(user.id);
  const versions = await listOutputTemplateVersions(user.id, 20);
  const latestQuote = (await listQuotations(1))[0];
  const currentSnapshot = toSnapshot(settings);
  const diffTarget = diffVersionId ? versions.find((version) => version.id === diffVersionId) : undefined;
  const diffRows = diffTarget
    ? (Object.keys(templateFieldLabels) as Array<keyof OutputTemplateSettingsInput>)
        .filter((key) => {
          return JSON.stringify(diffTarget.settingsSnapshot[key]) !== JSON.stringify(currentSnapshot[key]);
        })
        .map((key) => ({
          key,
          label: templateFieldLabels[key],
          current: currentSnapshot[key],
          selected: diffTarget.settingsSnapshot[key],
        }))
    : [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">{copy.title}</h1>
          <p className="mt-1 text-sm text-slate-600">{copy.desc}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/quotes" className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
            {copy.toQuotes}
          </Link>
          {latestQuote ? (
            <Link href={`/quotes/${latestQuote.id}/print?type=proposal`} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700">
              {copy.previewLatest}
            </Link>
          ) : null}
        </div>
      </header>

      <form action={updateOutputTemplateSettingsAction} className="space-y-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">{copy.companyBlockTitle}</h2>
          <p className="mt-1 text-xs text-slate-500">{copy.companyBlockDesc}</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="text-slate-600">{templateFieldLabels.companyName}</span>
              <input name="companyName" defaultValue={settings.companyName} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-600">{templateFieldLabels.department}</span>
              <input name="department" defaultValue={settings.department} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-600">{templateFieldLabels.representative}</span>
              <input name="representative" defaultValue={settings.representative} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-600">{templateFieldLabels.licenseNumber}</span>
              <input name="licenseNumber" defaultValue={settings.licenseNumber} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </label>
            <label className="space-y-1 text-sm md:col-span-2">
              <span className="text-slate-600">{templateFieldLabels.postalAddress}</span>
              <input name="postalAddress" defaultValue={settings.postalAddress} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-600">{templateFieldLabels.phone}</span>
              <input name="phone" defaultValue={settings.phone} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-600">{templateFieldLabels.email}</span>
              <input name="email" defaultValue={settings.email} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </label>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">{copy.documentBlockTitle}</h2>
          <p className="mt-1 text-xs text-slate-500">{copy.documentBlockDesc}</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="text-slate-600">{templateFieldLabels.proposalTitle}</span>
              <input name="proposalTitle" defaultValue={settings.proposalTitle} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-600">{templateFieldLabels.estimateSheetTitle}</span>
              <input name="estimateSheetTitle" defaultValue={settings.estimateSheetTitle} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-600">{templateFieldLabels.fundingPlanTitle}</span>
              <input name="fundingPlanTitle" defaultValue={settings.fundingPlanTitle} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-600">{templateFieldLabels.assumptionMemoTitle}</span>
              <input name="assumptionMemoTitle" defaultValue={settings.assumptionMemoTitle} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </label>
            <label className="space-y-1 text-sm md:col-span-2">
              <span className="text-slate-600">{templateFieldLabels.documentClassification}</span>
              <input name="documentClassification" defaultValue={settings.documentClassification} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </label>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">{copy.displayBlockTitle}</h2>
          <p className="mt-1 text-xs text-slate-500">{copy.displayBlockDesc}</p>
          <div className="mt-4 space-y-3">
            <label className="space-y-1 text-sm">
              <span className="text-slate-600">{templateFieldLabels.disclaimerLine1}</span>
              <textarea name="disclaimerLine1" defaultValue={settings.disclaimerLine1} rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-600">{templateFieldLabels.disclaimerLine2}</span>
              <textarea name="disclaimerLine2" defaultValue={settings.disclaimerLine2} rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-600">{templateFieldLabels.disclaimerLine3}</span>
              <textarea name="disclaimerLine3" defaultValue={settings.disclaimerLine3} rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </label>
          </div>
          <div className="mt-4 grid gap-2 text-sm text-slate-700 md:grid-cols-3">
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 p-3">
              <input type="checkbox" name="showApprovalSection" defaultChecked={settings.showApprovalSection} />
              <span>{copy.showApproval}</span>
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 p-3">
              <input type="checkbox" name="showLegalStatusDigest" defaultChecked={settings.showLegalStatusDigest} />
              <span>{copy.showLegalStatus}</span>
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 p-3">
              <input type="checkbox" name="showOutstandingBalanceTable" defaultChecked={settings.showOutstandingBalanceTable} />
              <span>{copy.showOutstanding}</span>
            </label>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <h2 className="text-lg font-semibold text-slate-900">{copy.opsMemoTitle}</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
            <li>{copy.opsMemo1}</li>
            <li>{copy.opsMemo2}</li>
            <li>{copy.opsMemo3}</li>
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="submit" className="ui-button-stable rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
              {copy.saveSettings}
            </button>
            <button type="submit" name="resetToStandard" value="1" className="ui-button-stable rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100">
              {copy.resetTemplate}
            </button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="text-slate-600">{copy.versionLabel}</span>
              <input name="versionLabel" placeholder={copy.versionLabelPlaceholder} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-600">{copy.changeNote}</span>
              <input name="changeNote" placeholder={copy.changeNotePlaceholder} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </label>
          </div>
        </section>
      </form>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{copy.versionsTitle}</h2>
        <p className="mt-1 text-xs text-slate-500">{copy.versionsDesc}</p>
        <ul className="mt-3 space-y-2">
          {versions.map((version) => (
            <li key={version.id} className="rounded-lg border border-slate-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">v{version.versionNumber} · {version.versionLabel}</p>
                  <p className="text-xs text-slate-500">
                    {formatDateTime(version.createdAt, locale)}
                    {version.changeNote ? ` · ${version.changeNote}` : ""}
                  </p>
                </div>
                {version.isActive ? (
                  <span className="ui-tag-stable rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-700">{copy.activeVersion}</span>
                ) : (
                  <div className="flex items-center gap-2">
                    <Link href={`/settings/output-templates?diffVersionId=${version.id}`} className="ui-button-stable rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100">
                      {copy.checkDiff}
                    </Link>
                    <form action={applyOutputTemplateVersionAction}>
                      <input type="hidden" name="versionId" value={version.id} />
                      <button type="submit" className="ui-button-stable rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100">
                        {copy.applyVersion}
                      </button>
                    </form>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {diffTarget ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{copy.diffPreviewTitle}: v{diffTarget.versionNumber} · {diffTarget.versionLabel}</h2>
              <p className="mt-1 text-xs text-slate-500">{copy.diffPreviewDesc}</p>
            </div>
            <Link href="/settings/output-templates" className="ui-button-stable rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100">
              {copy.closeDiff}
            </Link>
          </div>
          {diffRows.length === 0 ? (
            <p className="mt-4 text-sm text-slate-600">{copy.noDiff}</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">{copy.diffColField}</th>
                    <th className="px-3 py-2">{copy.diffColCurrent}</th>
                    <th className="px-3 py-2">{copy.diffColTarget}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {diffRows.map((row) => (
                    <tr key={row.key}>
                      <td className="px-3 py-2 font-medium text-slate-900">{row.label}</td>
                      <td className="px-3 py-2 text-slate-700">{String(row.current)}</td>
                      <td className="px-3 py-2 text-slate-700">{String(row.selected)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{copy.shortcutTitle}</h2>
        <p className="mt-1 text-xs text-slate-500">{copy.shortcutDesc}</p>
        {latestQuote ? (
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {OUTPUT_TYPES.map((type) => (
              <Link key={type} href={`/quotes/${latestQuote.id}/print?type=${type}`} className="ui-button-stable rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
                {getOutputDocLabel(locale, type)} {copy.shortcutCheck}
              </Link>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500">{copy.noQuote}</p>
        )}
      </section>
    </div>
  );
}
