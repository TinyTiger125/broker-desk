import type { Locale } from "@/lib/locale";

export type GuaranteeFormsMessages = {
  title: string;
  disabled: string;
  permissionDenied: string;
  returnHome: string;
};

const MESSAGES: Record<Locale, GuaranteeFormsMessages> = {
  ja: {
    title: "会社書式ライブラリ",
    disabled: "会社書式ライブラリは現在、対象の非本番ワークスペースでのみ利用できます。",
    permissionDenied: "この会社書式ライブラリを利用する権限がありません。",
    returnHome: "会社ホームへ戻る",
  },
  zh: {
    title: "公司表格库",
    disabled: "公司表格库目前仅可在受控的非生产工作区使用。",
    permissionDenied: "当前身份无权访问公司表格库。",
    returnHome: "返回公司首页",
  },
  ko: {
    title: "회사 서식 라이브러리",
    disabled: "회사 서식 라이브러리는 현재 지정된 비프로덕션 워크스페이스에서만 사용할 수 있습니다.",
    permissionDenied: "현재 계정에는 회사 서식 라이브러리를 사용할 권한이 없습니다.",
    returnHome: "회사 홈으로 돌아가기",
  },
};

export function getGuaranteeFormsMessages(locale: Locale): GuaranteeFormsMessages {
  return MESSAGES[locale] ?? MESSAGES.ja;
}
