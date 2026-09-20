import type { Locale } from "@/lib/locale";

const COPY = {
  ja: {
    propertyAddressLabel: "物件主資料の住所",
    caseAddressLabel: "本案件で使用する住所",
    differenceNotice: "本案件と物件主資料の住所が異なります。申込書には、本案件で確認済みの住所を使用します。",
  },
  zh: {
    propertyAddressLabel: "物件资料库地址",
    caseAddressLabel: "本案件使用地址",
    differenceNotice: "本案件与物件资料库的地址不同；申请书使用本案件已确认的地址。",
  },
  ko: {
    propertyAddressLabel: "매물 기본 자료의 주소",
    caseAddressLabel: "이 안건에서 사용할 주소",
    differenceNotice: "이 안건과 매물 기본 자료의 주소가 다릅니다. 신청서에는 이 안건에서 확인한 주소를 사용합니다.",
  },
} as const;

type CasePropertyAddressPresentationInput = {
  locale: Locale;
  savedPrimaryPropertyId?: string;
  propertyId?: string;
  propertyAddress?: string;
  caseAddress?: string;
  caseAddressConfirmed?: boolean;
};

export function resolveCasePropertyAddressPresentation(input: CasePropertyAddressPresentationInput) {
  const text = COPY[input.locale];
  const propertyAddress = input.propertyAddress?.trim() ?? "";
  const caseAddress = input.caseAddress?.trim() ?? "";
  const normalizedPropertyAddress = propertyAddress.normalize("NFKC").replace(/\s+/gu, "").toLocaleLowerCase("ja-JP");
  const normalizedCaseAddress = caseAddress.normalize("NFKC").replace(/\s+/gu, "").toLocaleLowerCase("ja-JP");
  const sameLinkedProperty = Boolean(
    input.savedPrimaryPropertyId &&
      input.propertyId &&
      input.savedPrimaryPropertyId === input.propertyId,
  );
  const showDifferenceNotice = Boolean(
    sameLinkedProperty &&
      input.caseAddressConfirmed &&
      propertyAddress &&
      caseAddress &&
      normalizedPropertyAddress !== normalizedCaseAddress,
  );

  return {
    ...text,
    showDifferenceNotice,
    differenceNotice: showDifferenceNotice ? text.differenceNotice : undefined,
  };
}
