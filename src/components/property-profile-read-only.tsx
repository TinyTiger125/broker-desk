import type { Locale } from "@/lib/locale";

type PropertyProfileReadOnlyProps = {
  locale: Locale;
  reason: "company_read" | "owner_read_only";
  property: {
    name: string;
    furigana?: string;
    area?: string;
    address?: string;
    roomNumber?: string;
    postalCode?: string;
    usage?: string;
    sizeSqm?: number;
    listingPrice: number;
    listingRent?: number;
    listingCommonFee?: number;
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
    furigana: "物件名かな",
    area: "エリア",
    address: "住所",
    roomNumber: "部屋番号",
    postalCode: "郵便番号",
    usage: "用途",
    size: "面積",
    price: "販売価格",
    listingRent: "参考月額賃料",
    listingCommonFee: "参考共益費",
    managementFee: "管理費",
    repairFee: "修繕費",
    notes: "メモ",
    yen: "円",
    unset: "未設定",
  },
  zh: {
    companyRead: "公司成员可见／只读",
    ownerReadOnly: "当前账号仅可查看。",
    name: "物件名称",
    furigana: "物件名拼音/假名",
    area: "区域",
    address: "地址",
    roomNumber: "房号",
    postalCode: "邮编",
    usage: "用途",
    size: "面积",
    price: "售价",
    listingRent: "参考月租",
    listingCommonFee: "参考共益费",
    managementFee: "管理费",
    repairFee: "修缮费",
    notes: "备注",
    yen: "日元",
    unset: "未设置",
  },
  ko: {
    companyRead: "회사 구성원 공개 / 읽기 전용",
    ownerReadOnly: "현재 계정은 보기 전용입니다.",
    name: "매물명",
    furigana: "매물명 후리가나",
    area: "지역",
    address: "주소",
    roomNumber: "호수",
    postalCode: "우편번호",
    usage: "용도",
    size: "면적",
    price: "판매 가격",
    listingRent: "참고 월세",
    listingCommonFee: "참고 공익비",
    managementFee: "관리비",
    repairFee: "수선비",
    notes: "메모",
    yen: "엔",
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
        <div><dt className="text-xs font-bold text-slate-500">{text.furigana}</dt><dd className="mt-1 text-sm text-slate-800">{property.furigana || text.unset}</dd></div>
        <div><dt className="text-xs font-bold text-slate-500">{text.area}</dt><dd className="mt-1 text-sm text-slate-800">{property.area || text.unset}</dd></div>
        <div><dt className="text-xs font-bold text-slate-500">{text.address}</dt><dd className="mt-1 text-sm text-slate-800">{property.address || text.unset}</dd></div>
        <div><dt className="text-xs font-bold text-slate-500">{text.roomNumber}</dt><dd className="mt-1 text-sm text-slate-800">{property.roomNumber || text.unset}</dd></div>
        <div><dt className="text-xs font-bold text-slate-500">{text.postalCode}</dt><dd className="mt-1 text-sm text-slate-800">{property.postalCode || text.unset}</dd></div>
        <div><dt className="text-xs font-bold text-slate-500">{text.usage}</dt><dd className="mt-1 text-sm text-slate-800">{property.usage || text.unset}</dd></div>
        <div><dt className="text-xs font-bold text-slate-500">{text.size}</dt><dd className="mt-1 text-sm text-slate-800">{formatNumber(property.sizeSqm, text.unset)}</dd></div>
        <div><dt className="text-xs font-bold text-slate-500">{text.price}</dt><dd className="mt-1 text-sm text-slate-800">{formatNumber(property.listingPrice, text.unset)}{Number.isFinite(property.listingPrice) ? ` ${text.yen}` : ""}</dd></div>
        <div><dt className="text-xs font-bold text-slate-500">{text.listingRent}</dt><dd className="mt-1 text-sm text-slate-800">{formatNumber(property.listingRent, text.unset)}{typeof property.listingRent === "number" && Number.isFinite(property.listingRent) ? ` ${text.yen}` : ""}</dd></div>
        <div><dt className="text-xs font-bold text-slate-500">{text.listingCommonFee}</dt><dd className="mt-1 text-sm text-slate-800">{formatNumber(property.listingCommonFee, text.unset)}{typeof property.listingCommonFee === "number" && Number.isFinite(property.listingCommonFee) ? ` ${text.yen}` : ""}</dd></div>
        <div><dt className="text-xs font-bold text-slate-500">{text.managementFee}</dt><dd className="mt-1 text-sm text-slate-800">{formatNumber(property.managementFee, text.unset)}{typeof property.managementFee === "number" && Number.isFinite(property.managementFee) ? ` ${text.yen}` : ""}</dd></div>
        <div><dt className="text-xs font-bold text-slate-500">{text.repairFee}</dt><dd className="mt-1 text-sm text-slate-800">{formatNumber(property.repairFee, text.unset)}{typeof property.repairFee === "number" && Number.isFinite(property.repairFee) ? ` ${text.yen}` : ""}</dd></div>
        <div className="sm:col-span-2"><dt className="text-xs font-bold text-slate-500">{text.notes}</dt><dd className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{property.notes || text.unset}</dd></div>
      </dl>
    </section>
  );
}
