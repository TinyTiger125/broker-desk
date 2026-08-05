import Link from "next/link";
import { applyOutputTemplateVersionAction, updateOutputTemplateSettingsAction } from "@/app/actions";
import { getOutputTemplateSettings, listOutputTemplateVersions } from "@/lib/data";
import { getLocale, type Locale } from "@/lib/locale";
import { type OutputTemplateSettingsInput } from "@/lib/output-doc";
import { requireTenantSession } from "@/lib/tenant-session";

export const dynamic = "force-dynamic";

type OutputTemplateSettingsPageProps = {
  searchParams?: Promise<{
    diffVersionId?: string;
  }>;
};

function getCopy(locale: Locale) {
  const copyByLocale = {
    ja: {
      title: "書類の発行元情報",
      desc: "作成する書類に表示する会社名、所在地、電話番号、免許番号を設定します。初回利用時や会社情報が変わった時だけ確認してください。",
      companyBlockTitle: "発行元情報",
      companyBlockDesc: "保証会社申込書など、確認済みの出力様式に表示されます。",
      documentBlockTitle: "書類名の詳細設定",
      documentBlockDesc: "書類タイトルを統一して変更したい場合だけ調整します。",
      displayBlockTitle: "固定で表示する注意事項",
      displayBlockDesc: "出力書類に毎回表示する注意事項です。",
      showApproval: "承認欄を表示",
      showLegalStatus: "法定対応サマリーを表示",
      showOutstanding: "借入残高推移表を表示",
      opsMemoTitle: "保存について",
      opsMemo1: "保存後、新しく作成する書類にこの情報が使われます。",
      opsMemo2: "すでに作成済みの書類は自動で作り直されません。",
      opsMemo3: "文書番号、発行日、保存記録は自動で記録されます。",
      saveSettings: "設定を保存",
      resetTemplate: "初期設定に戻す",
      versionLabel: "保存記録名（任意）",
      versionLabelPlaceholder: "例: 会社所在地を更新",
      changeNote: "メモ（任意）",
      changeNotePlaceholder: "例: 電話番号と免許番号を更新",
      versionsTitle: "保存記録",
      versionsDesc: "保存した内容を記録します。必要に応じて過去の設定へ戻せます。",
      activeVersion: "現在適用中",
      checkDiff: "差分を確認",
      applyVersion: "この記録を適用",
      confirmApply: "差分確認済み。適用を確定する",
      diffPreviewTitle: "差分プレビュー",
      diffPreviewDesc: "現在適用中テンプレートとの差分を表示しています。",
      closeDiff: "差分表示を閉じる",
      noDiff: "差分はありません。",
      diffColField: "項目",
      diffColCurrent: "現在",
      diffColTarget: "比較対象",
    },
    zh: {
      title: "文书抬头设置",
      desc: "设置生成文件中显示的公司名称、地址、电话和许可证信息。通常只在首次使用或公司资料变更时修改。",
      companyBlockTitle: "出具方信息",
      companyBlockDesc: "这些内容会显示在保证会社申请书等已核验的输出文件中。",
      documentBlockTitle: "高级文书名称",
      documentBlockDesc: "只有需要统一修改文件标题时，才需要调整这里。",
      displayBlockTitle: "固定说明",
      displayBlockDesc: "需要在输出文件中固定显示的注意事项。",
      showApproval: "显示审批栏",
      showLegalStatus: "显示法定应对摘要",
      showOutstanding: "显示贷款余额趋势表",
      opsMemoTitle: "保存说明",
      opsMemo1: "保存后，新生成的文件会使用这些信息。",
      opsMemo2: "已经生成过的历史文件不会自动重做。",
      opsMemo3: "文书编号、出具日和保存记录由系统自动生成。",
      saveSettings: "保存设置",
      resetTemplate: "恢复默认设置",
      versionLabel: "保存记录名（可选）",
      versionLabelPlaceholder: "例：公司地址更新",
      changeNote: "备注（可选）",
      changeNotePlaceholder: "例：更新电话和许可证号",
      versionsTitle: "保存记录",
      versionsDesc: "每次保存会留下记录，必要时可以恢复到过去的设置。",
      activeVersion: "当前生效中",
      checkDiff: "查看差异",
      applyVersion: "应用此记录",
      confirmApply: "已确认差异，执行应用",
      diffPreviewTitle: "差异预览",
      diffPreviewDesc: "显示与当前生效模板的差异。",
      closeDiff: "关闭差异",
      noDiff: "无差异。",
      diffColField: "项目",
      diffColCurrent: "当前值",
      diffColTarget: "对比值",
    },
    ko: {
      title: "문서 발행 정보",
      desc: "생성 문서에 표시할 회사명, 주소, 전화번호, 면허 번호를 설정합니다. 최초 사용 시 또는 회사 정보가 바뀔 때 확인합니다.",
      companyBlockTitle: "발행 정보",
      companyBlockDesc: "보증회사 신청서 등 검증이 끝난 출력 서식에 표시됩니다.",
      documentBlockTitle: "문서명 상세 설정",
      documentBlockDesc: "문서 제목을 통일해서 바꿔야 할 때만 조정합니다.",
      displayBlockTitle: "고정 안내문",
      displayBlockDesc: "출력 문서에 매번 표시할 안내문입니다.",
      showApproval: "승인란 표시",
      showLegalStatus: "법정 대응 요약 표시",
      showOutstanding: "대출 잔액 추이표 표시",
      opsMemoTitle: "저장 안내",
      opsMemo1: "저장 후 새로 만드는 문서에 이 정보가 사용됩니다.",
      opsMemo2: "이미 생성된 문서는 자동으로 다시 만들어지지 않습니다.",
      opsMemo3: "문서 번호, 발행일, 저장 기록은 자동으로 기록됩니다.",
      saveSettings: "설정 저장",
      resetTemplate: "기본값으로 되돌리기",
      versionLabel: "저장 기록명(선택)",
      versionLabelPlaceholder: "예: 회사 주소 업데이트",
      changeNote: "메모(선택)",
      changeNotePlaceholder: "예: 전화번호와 면허 번호 업데이트",
      versionsTitle: "저장 기록",
      versionsDesc: "저장한 내용을 기록합니다. 필요하면 이전 설정으로 되돌릴 수 있습니다.",
      activeVersion: "현재 적용 중",
      checkDiff: "차이 확인",
      applyVersion: "이 기록 적용",
      confirmApply: "차이를 확인했고 적용을 확정합니다",
      diffPreviewTitle: "차이 미리보기",
      diffPreviewDesc: "현재 적용 템플릿과의 차이를 표시합니다.",
      closeDiff: "차이 보기 닫기",
      noDiff: "차이가 없습니다.",
      diffColField: "항목",
      diffColCurrent: "현재",
      diffColTarget: "비교 대상",
    },
  } as const;

  return copyByLocale[locale];
}

function getSavedRecordsLabel(locale: Locale): string {
  if (locale === "zh") return "查看保存记录";
  if (locale === "ko") return "저장 기록 보기";
  return "保存記録を見る";
}

type VisibleTemplateFieldKey =
  | "companyName"
  | "department"
  | "representative"
  | "licenseNumber"
  | "postalAddress"
  | "phone"
  | "email";

function getTemplateFieldLabels(locale: Locale): Record<VisibleTemplateFieldKey, string> {
  const labelsByLocale: Record<Locale, Record<VisibleTemplateFieldKey, string>> = {
    ja: {
      companyName: "会社名",
      department: "部署",
      representative: "担当者名",
      licenseNumber: "免許番号",
      postalAddress: "所在地",
      phone: "電話番号",
      email: "メール",
    },
    zh: {
      companyName: "公司名称",
      department: "部门",
      representative: "负责人",
      licenseNumber: "许可证编号",
      postalAddress: "地址",
      phone: "电话号码",
      email: "邮箱",
    },
    ko: {
      companyName: "회사명",
      department: "부서",
      representative: "담당자명",
      licenseNumber: "면허 번호",
      postalAddress: "소재지",
      phone: "전화번호",
      email: "이메일",
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
  const [locale, session] = await Promise.all([
    getLocale(),
    requireTenantSession({ permission: "template.view" }),
  ]);
  const copy = getCopy(locale);
  const templateFieldLabels = getTemplateFieldLabels(locale);

  const params = searchParams ? await searchParams : undefined;
  const diffVersionId = params?.diffVersionId?.trim() ?? "";
  const user = session.user;
  const tenantId = session.tenant.id;
  const [settings, versions] = await Promise.all([
    getOutputTemplateSettings(user.id, tenantId),
    listOutputTemplateVersions(user.id, 20, tenantId),
  ]);
  const currentSnapshot = toSnapshot(settings);
  const diffTarget = diffVersionId ? versions.find((version) => version.id === diffVersionId) : undefined;
  const visibleTemplateFieldKeys: VisibleTemplateFieldKey[] = [
    "companyName",
    "department",
    "representative",
    "licenseNumber",
    "postalAddress",
    "phone",
    "email",
  ];
  const diffRows = diffTarget
    ? visibleTemplateFieldKeys
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

      <details className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <summary className="cursor-pointer text-lg font-semibold text-slate-900">{getSavedRecordsLabel(locale)}</summary>
        <div className="mt-4">
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
                    <div className="space-y-2">
                      <Link href={`/settings/output-templates?diffVersionId=${version.id}`} className="ui-button-stable rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100">
                        {copy.checkDiff}
                      </Link>
                      <form action={applyOutputTemplateVersionAction} className="space-y-1">
                        <input type="hidden" name="versionId" value={version.id} />
                        <label className="flex items-start gap-2 text-[11px] text-slate-600">
                          <input type="checkbox" name="confirmApply" value="1" required className="mt-0.5" />
                          <span>{copy.confirmApply}</span>
                        </label>
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
        </div>
      </details>

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

    </div>
  );
}
