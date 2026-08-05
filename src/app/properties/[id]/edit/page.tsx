import { notFound } from "next/navigation";
import { updatePropertyProfileAction } from "@/app/actions";
import {
  ObjectWorkbenchShell,
  WorkbenchFieldCard,
  WorkbenchProgressCard,
  WorkbenchProgressNav,
  workbenchInputClass,
} from "@/components/object-workbench-shell";
import { PageFlashBanner } from "@/components/page-flash-banner";
import { formatCurrency } from "@/lib/format";
import { getPropertyById } from "@/lib/data";
import { getLocale, type Locale } from "@/lib/locale";
import { requireTenantSession } from "@/lib/tenant-session";

export const dynamic = "force-dynamic";

type EditPropertyPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ flash?: string }>;
};

const copy = {
  ja: {
    eyebrow: "情報を整理する",
    back: "整理情報へ戻る",
    relationTree: "関係を確認",
    updated: "物件を更新しました。",
    progressLabel: "確認状況",
    progressTitle: "物件情報",
    basic: "基本情報",
    money: "価格・費用",
    detail: "面積・補足",
    name: "物件名",
    area: "エリア",
    address: "住所",
    listingPrice: "賃料 / 価格",
    managementFee: "管理費",
    repairFee: "修繕積立金",
    sizeSqm: "専有面積",
    notes: "備考",
    yen: "円",
    sqm: "㎡",
    save: "保存",
    overall: "全体",
    remaining: "残り",
    complete: "確認済み",
    pending: "未確認",
    filled: "確認済み",
    optional: "任意",
    missing: "未入力",
  },
  zh: {
    eyebrow: "整理信息",
    back: "返回整理信息",
    relationTree: "查看关系",
    updated: "物件已更新。",
    progressLabel: "核对进度",
    progressTitle: "物件资料",
    basic: "基本信息",
    money: "价格与费用",
    detail: "面积与补充说明",
    name: "物件名",
    area: "区域",
    address: "地址",
    listingPrice: "租金 / 价格",
    managementFee: "管理费",
    repairFee: "修缮基金",
    sizeSqm: "专有面积",
    notes: "备注",
    yen: "日元",
    sqm: "㎡",
    save: "保存",
    overall: "整体",
    remaining: "还差",
    complete: "已确认",
    pending: "待补充",
    filled: "已确认",
    optional: "选填",
    missing: "未填写",
  },
  ko: {
    eyebrow: "정보 정리",
    back: "정보 정리로 돌아가기",
    relationTree: "관계 확인",
    updated: "매물을 업데이트했습니다.",
    progressLabel: "확인 상태",
    progressTitle: "매물 정보",
    basic: "기본 정보",
    money: "가격과 비용",
    detail: "면적과 보충 설명",
    name: "매물명",
    area: "지역",
    address: "주소",
    listingPrice: "임대료 / 가격",
    managementFee: "관리비",
    repairFee: "수선 적립금",
    sizeSqm: "전용 면적",
    notes: "메모",
    yen: "엔",
    sqm: "㎡",
    save: "저장",
    overall: "전체",
    remaining: "남음",
    complete: "확인됨",
    pending: "확인 필요",
    filled: "확인됨",
    optional: "선택",
    missing: "미입력",
  },
} as const;

function getLabels(locale: Locale) {
  const text = copy[locale];
  return {
    progress: { overall: text.overall, remaining: text.remaining },
    nav: { complete: text.complete, pending: text.pending, optional: text.optional },
    field: { complete: text.filled, optional: text.optional, missing: text.missing },
  };
}

export default async function EditPropertyPage({ params, searchParams }: EditPropertyPageProps) {
  const [locale, session] = await Promise.all([
    getLocale(),
    requireTenantSession({ permission: "record.update" }),
  ]);
  const text = copy[locale];
  const labels = getLabels(locale);
  const { id } = await params;
  const property = await getPropertyById(id, session.tenant.id);
  if (!property) {
    notFound();
  }

  const hasLocation = Boolean(property.area || property.address);
  const hasPrice = property.listingPrice > 0;
  const hasManagementFee = Boolean(property.managementFee && property.managementFee > 0);
  const hasRepairFee = Boolean(property.repairFee && property.repairFee > 0);
  const basicCompleted = [Boolean(property.name), hasLocation].filter(Boolean).length;
  const moneyCompleted = [hasPrice, hasManagementFee, hasRepairFee].filter(Boolean).length;
  const completed = basicCompleted + moneyCompleted;
  const total = 5;
  const query = (await searchParams) ?? {};
  const flashMessage = query.flash === "property_updated" ? text.updated : undefined;

  return (
    <ObjectWorkbenchShell
      eyebrow={text.eyebrow}
      title={property.name}
      actions={[
        { href: `/organize-center?type=property&focus=${encodeURIComponent(property.id)}`, label: text.back },
        { href: `/relationship-tree?type=property&id=${encodeURIComponent(property.id)}`, label: text.relationTree, tone: "blue" },
      ]}
      flash={<PageFlashBanner message={flashMessage} />}
      left={
        <>
          <WorkbenchProgressCard
            label={text.progressLabel}
            title={text.progressTitle}
            completed={completed}
            total={total}
            labels={labels.progress}
          />
          <WorkbenchProgressNav
            labels={labels.nav}
            items={[
              { label: text.basic, completed: basicCompleted, total: 2, href: "#property-basic" },
              { label: text.money, completed: moneyCompleted, total: 3, href: "#property-money" },
              { label: text.detail, completed: 0, total: 0, href: "#property-detail" },
            ]}
          />
        </>
      }
      right={
        <form action={updatePropertyProfileAction} className="space-y-4">
          <input type="hidden" name="propertyId" value={property.id} />
          <WorkbenchFieldCard
            id="property-basic"
            title={text.basic}
            status={basicCompleted >= 2 ? "complete" : "missing"}
            labels={labels.field}
          >
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1 md:col-span-2">
                <span className="text-xs font-bold text-slate-600">{text.name}</span>
                <input name="name" required defaultValue={property.name} className={workbenchInputClass} />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-bold text-slate-600">{text.area}</span>
                <input name="area" defaultValue={property.area ?? ""} className={workbenchInputClass} />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-bold text-slate-600">{text.address}</span>
                <input name="address" defaultValue={property.address ?? ""} className={workbenchInputClass} />
              </label>
            </div>
          </WorkbenchFieldCard>

          <WorkbenchFieldCard
            id="property-money"
            title={text.money}
            status={moneyCompleted >= 3 ? "complete" : "missing"}
            labels={labels.field}
          >
            <div className="grid gap-3 md:grid-cols-3">
              <label className="space-y-1">
                <span className="text-xs font-bold text-slate-600">{text.listingPrice}</span>
                <div className="flex items-center rounded-lg border border-slate-200 bg-white focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-100">
                  <input name="listingPrice" type="number" min="0" defaultValue={property.listingPrice || ""} className="min-w-0 flex-1 rounded-lg border-0 bg-transparent px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none" />
                  <span className="pr-3 text-xs font-bold text-slate-500">{text.yen}</span>
                </div>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-bold text-slate-600">{text.managementFee}</span>
                <div className="flex items-center rounded-lg border border-slate-200 bg-white focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-100">
                  <input name="managementFee" type="number" min="0" defaultValue={property.managementFee ?? ""} className="min-w-0 flex-1 rounded-lg border-0 bg-transparent px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none" />
                  <span className="pr-3 text-xs font-bold text-slate-500">{text.yen}</span>
                </div>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-bold text-slate-600">{text.repairFee}</span>
                <div className="flex items-center rounded-lg border border-slate-200 bg-white focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-100">
                  <input name="repairFee" type="number" min="0" defaultValue={property.repairFee ?? ""} className="min-w-0 flex-1 rounded-lg border-0 bg-transparent px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none" />
                  <span className="pr-3 text-xs font-bold text-slate-500">{text.yen}</span>
                </div>
              </label>
            </div>
            <p className="mt-3 text-xs font-semibold text-slate-500">
              {hasPrice ? formatCurrency(property.listingPrice, locale) : ""}
            </p>
          </WorkbenchFieldCard>

          <WorkbenchFieldCard
            id="property-detail"
            title={text.detail}
            status="optional"
            labels={labels.field}
          >
            <div className="grid gap-3 2xl:grid-cols-[220px_minmax(0,1fr)]">
              <label className="space-y-1">
                <span className="text-xs font-bold text-slate-600">{text.sizeSqm}</span>
                <div className="flex items-center rounded-lg border border-slate-200 bg-white focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-100">
                  <input name="sizeSqm" type="number" min="0" step="0.01" defaultValue={property.sizeSqm ?? ""} className="min-w-0 flex-1 rounded-lg border-0 bg-transparent px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none" />
                  <span className="pr-3 text-xs font-bold text-slate-500">{text.sqm}</span>
                </div>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-bold text-slate-600">{text.notes}</span>
                <textarea name="notes" defaultValue={property.notes ?? ""} rows={4} className={`${workbenchInputClass} resize-y`} />
              </label>
            </div>
          </WorkbenchFieldCard>

          <div className="sticky bottom-4 z-10 flex justify-end">
            <button type="submit" className="rounded-lg bg-slate-950 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-slate-900/10 hover:bg-slate-800">
              {text.save}
            </button>
          </div>
        </form>
      }
    />
  );
}
