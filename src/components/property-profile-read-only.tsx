import type { Locale } from "@/lib/locale";

type PropertyProfileReadOnlyProps = {
  locale: Locale;
  reason: "company_read" | "owner_read_only";
  property: {
    name: string;
    area?: string;
    address?: string;
    sizeSqm?: number;
    listingPrice: number;
    managementFee?: number;
    repairFee?: number;
    notes?: string;
  };
};

const copy = {
  ja: {
    companyRead: "会社メンバーに公開／読み取り専用",
    ownerReadOnly: "現在のアカウントは閲覧のみです。",
    name: "物件名",
    area: "エリア",
    address: "住所",
    size: "面積",
    price: "販売価格",
    managementFee: "管理費",
    repairFee: "修繕費",
    notes: "メモ",
    unset: "未設定",
  },
  zh: {
    companyRead: "公司成员可见／只读",
    ownerReadOnly: "当前账号仅可查看。",
    name: "物件名称",
    area: "区域",
    address: "地址",
    size: "面积",
    price: "售价",
    managementFee: "管理费",
    repairFee: "修缮费",
    notes: "备注",
    unset: "未设置",
  },
  ko: {
    companyRead: "회사 구성원 공개 / 읽기 전용",
    ownerReadOnly: "현재 계정은 보기 전용입니다.",
    name: "매물명",
    area: "지역",
    address: "주소",
    size: "면적",
    price: "판매 가격",
    managementFee: "관리비",
    repairFee: "수선비",
    notes: "메모",
    unset: "미설정",
  },
} as const;

function formatNumber(value: number | undefined, unset: string): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString() : unset;
}

export function PropertyProfileReadOnly({ locale, reason, property }: PropertyProfileReadOnlyProps) {
  const text = copy[locale];
  return (
    <section className="space-y-5 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200/60" aria-label={reason === "company_read" ? text.companyRead : text.ownerReadOnly}>
      <p className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-900">
        {reason === "company_read" ? text.companyRead : text.ownerReadOnly}
      </p>
      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        <div><dt className="text-xs font-bold text-slate-500">{text.name}</dt><dd className="mt-1 text-sm font-semibold text-slate-900">{property.name}</dd></div>
        <div><dt className="text-xs font-bold text-slate-500">{text.area}</dt><dd className="mt-1 text-sm text-slate-800">{property.area || text.unset}</dd></div>
        <div><dt className="text-xs font-bold text-slate-500">{text.address}</dt><dd className="mt-1 text-sm text-slate-800">{property.address || text.unset}</dd></div>
        <div><dt className="text-xs font-bold text-slate-500">{text.size}</dt><dd className="mt-1 text-sm text-slate-800">{formatNumber(property.sizeSqm, text.unset)}</dd></div>
        <div><dt className="text-xs font-bold text-slate-500">{text.price}</dt><dd className="mt-1 text-sm text-slate-800">{formatNumber(property.listingPrice, text.unset)}</dd></div>
        <div><dt className="text-xs font-bold text-slate-500">{text.managementFee}</dt><dd className="mt-1 text-sm text-slate-800">{formatNumber(property.managementFee, text.unset)}</dd></div>
        <div><dt className="text-xs font-bold text-slate-500">{text.repairFee}</dt><dd className="mt-1 text-sm text-slate-800">{formatNumber(property.repairFee, text.unset)}</dd></div>
        <div className="sm:col-span-2"><dt className="text-xs font-bold text-slate-500">{text.notes}</dt><dd className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{property.notes || text.unset}</dd></div>
      </dl>
    </section>
  );
}
