import Link from "next/link";
import { createPropertyQuickAction } from "@/app/actions";
import { FormDraftAssist } from "@/components/form-draft-assist";
import { getLocale } from "@/lib/locale";
import { requireTenantSession } from "@/lib/tenant-session";

export const dynamic = "force-dynamic";

const copy = {
  ja: {
    title: "物件を追加",
    desc: "建物名、所在地、費用を先に登録します。資料は作成後に追加できます。",
    back: "整理情報へ戻る",
    basic: "物件情報",
    cost: "費用",
    name: "物件名",
    area: "エリア",
    address: "所在地",
    sizeSqm: "面積",
    listingPrice: "価格",
    managementFee: "管理費",
    repairFee: "修繕積立金",
    save: "物件を保存",
    saveAndList: "保存して物件一覧へ",
  },
  zh: {
    title: "新建物件",
    desc: "先登记楼名、地址和费用。资料可以在创建后继续补充。",
    back: "返回整理信息",
    basic: "物件信息",
    cost: "费用",
    name: "物件名",
    area: "区域",
    address: "所在地",
    sizeSqm: "面积",
    listingPrice: "价格",
    managementFee: "管理费",
    repairFee: "修缮积立金",
    save: "保存物件",
    saveAndList: "保存并去物件列表",
  },
  ko: {
    title: "매물 추가",
    desc: "건물명, 소재지, 비용을 먼저 등록합니다. 자료는 생성 후 추가할 수 있습니다.",
    back: "정보 정리로 돌아가기",
    basic: "매물 정보",
    cost: "비용",
    name: "매물명",
    area: "지역",
    address: "소재지",
    sizeSqm: "면적",
    listingPrice: "가격",
    managementFee: "관리비",
    repairFee: "수선 적립금",
    save: "매물 저장",
    saveAndList: "저장 후 매물 목록으로",
  },
} as const;

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-[#d5e3fc]";

export default async function NewPropertyPage() {
  const [locale] = await Promise.all([
    getLocale(),
    requireTenantSession({ permission: "record.update" }),
  ]);
  const text = copy[locale];
  const formId = "property-create-form";
  const fieldNames = ["name", "area", "address", "sizeSqm", "listingPrice", "managementFee", "repairFee"];

  return (
    <div className="space-y-5 pb-16">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-950">{text.title}</h1>
          <p className="mt-2 text-sm font-semibold text-slate-600">{text.desc}</p>
        </div>
        <Link href="/organize-center?type=property" className="rounded border border-slate-300 px-3 py-2 text-sm font-black text-slate-700 hover:bg-slate-50">
          {text.back}
        </Link>
      </header>

      <form id={formId} action={createPropertyQuickAction} className="space-y-5 rounded-lg border border-slate-200 bg-white p-5">
        <FormDraftAssist
          formId={formId}
          storageKey="draft:properties:new"
          fieldNames={fieldNames}
          reuseKey="properties:create"
          locale={locale}
        />

        <section className="space-y-3">
          <h2 className="text-base font-black text-slate-950">{text.basic}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 md:col-span-2">
              <span className="text-xs font-black text-slate-600">{text.name}</span>
              <input name="name" required className={inputClass} />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-black text-slate-600">{text.area}</span>
              <input name="area" className={inputClass} />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-black text-slate-600">{text.sizeSqm}</span>
              <input name="sizeSqm" inputMode="decimal" className={inputClass} />
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className="text-xs font-black text-slate-600">{text.address}</span>
              <input name="address" className={inputClass} />
            </label>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-black text-slate-950">{text.cost}</h2>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="space-y-1">
              <span className="text-xs font-black text-slate-600">{text.listingPrice}</span>
              <input name="listingPrice" inputMode="numeric" className={inputClass} />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-black text-slate-600">{text.managementFee}</span>
              <input name="managementFee" inputMode="numeric" className={inputClass} />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-black text-slate-600">{text.repairFee}</span>
              <input name="repairFee" inputMode="numeric" className={inputClass} />
            </label>
          </div>
        </section>

        <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
          <button type="submit" name="afterSave" value="organize" className="rounded bg-slate-950 px-4 py-2 text-sm font-black text-white hover:bg-slate-800">
            {text.save}
          </button>
          <button type="submit" name="afterSave" value="list" className="rounded border border-slate-300 px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50">
            {text.saveAndList}
          </button>
        </div>
      </form>
    </div>
  );
}
