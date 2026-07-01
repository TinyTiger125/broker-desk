import type {
  BrokerageCase,
  Client,
  DashboardQuoteItem,
  GeneratedOutput,
  ImportJob,
} from "@/lib/data";
import type { Locale } from "@/lib/locale";

const zhPhraseMap: Array<[string, string]> = [
  ["管理会社_費用更新", "管理公司_费用更新"],
  ["旧契約書一括取込", "旧合同批量导入"],
  ["新規問合せ", "新咨询"],
  ["前提条件メモ", "前提条件备忘录"],
  ["法人申込書", "法人申请书"],
  ["抽出確認案件", "抽取核对案件"],
  ["申込書", "申请书"],
  ["法人申込", "法人申请"],
  ["賃貸申込一式", "租赁申请一套资料"],
  ["賃貸申込", "租赁申请"],
  ["保証会社申込", "保证公司申请"],
  ["投資初回案", "投资初版方案"],
  ["投資案件", "投资案件"],
  ["購入費用案", "购入费用方案"],
  ["初期費用", "初期费用"],
  ["高層階案", "高楼层方案"],
  ["追加検討", "追加评估"],
  ["本人確認資料", "本人确认资料"],
  ["本人確認書類", "本人确认文件"],
  ["本人資料", "本人资料"],
  ["在留カード", "在留卡"],
  ["表裏", "正反面"],
  ["勤務先証明", "工作单位证明"],
  ["在留期限", "在留期限"],
  ["代表者", "代表人"],
  ["確認欄", "确认栏"],
  ["確認待ち", "待确认"],
  ["確認済み", "已确认"],
  ["必須項目を充足", "必填项已满足"],
  ["必須項目", "必填项"],
  ["修繕積立金", "修缮积立金"],
  ["管理費", "管理费"],
  ["費用更新", "费用更新"],
  ["貸主", "出租方"],
  ["聞き取りメモ", "访谈备忘录"],
  ["申込者", "申请人"],
  ["賃料", "租金"],
  ["物件名", "物件名"],
  ["氏名", "姓名"],
  ["電話", "电话"],
  ["希望エリア", "意向区域"],
  ["賃貸", "租赁"],
  ["売買", "买卖"],
  ["契約", "合同"],
  ["提案", "提案"],
  ["申込", "申请"],
  ["資料", "资料"],
  ["取込", "导入"],
  ["書", "书"],
  ["一括", "批量"],
  ["新規", "新建"],
  ["問合せ", "咨询"],
  ["海外投資家", "海外投资人"],
  ["管理会社", "管理公司"],
  ["保証会社", "保证公司"],
  ["法人", "法人"],
  ["抽出", "抽取"],
  ["確認", "确认"],
  ["運用担当", "运营负责人"],
  ["招待中", "邀请中"],
];

export function localizeDemoText(locale: Locale, value: string | null | undefined): string | null | undefined {
  if (!value || locale !== "zh") return value;
  return [...zhPhraseMap]
    .sort((a, b) => b[0].length - a[0].length)
    .reduce((text, [from, to]) => text.split(from).join(to), value);
}

export function localizeDemoBrokerageCase(locale: Locale, item: BrokerageCase): BrokerageCase {
  if (locale !== "zh") return item;
  return {
    ...item,
    caseTitle: localizeDemoText(locale, item.caseTitle) ?? item.caseTitle,
  };
}

export function localizeDemoImportJob(locale: Locale, item: ImportJob): ImportJob {
  if (locale !== "zh") return item;
  return {
    ...item,
    title: localizeDemoText(locale, item.title) ?? item.title,
    notes: localizeDemoText(locale, item.notes) ?? undefined,
    validationMessage: localizeDemoText(locale, item.validationMessage) ?? undefined,
    mappingJson: item.mappingJson
      ? Object.fromEntries(
          Object.entries(item.mappingJson).map(([key, value]) => [
            localizeDemoText(locale, key) ?? key,
            value,
          ]),
        )
      : item.mappingJson,
  };
}

type LocalizableProperty = {
  name: string;
  area?: string | null;
  address?: string | null;
  notes?: string | null;
};

export function localizeDemoProperty<T extends LocalizableProperty>(locale: Locale, item: T): T {
  if (locale !== "zh") return item;
  return item;
}

export function localizeDemoClient(locale: Locale, item: Client): Client {
  if (locale !== "zh") return item;
  return item;
}

export function localizeDemoQuotation(locale: Locale, item: DashboardQuoteItem): DashboardQuoteItem {
  if (locale !== "zh") return item;
  return {
    ...item,
    quoteTitle: localizeDemoText(locale, item.quoteTitle) ?? item.quoteTitle,
    summaryText: localizeDemoText(locale, item.summaryText) ?? item.summaryText,
    client: localizeDemoClient(locale, item.client),
    property: item.property ? localizeDemoProperty(locale, item.property) : item.property,
  };
}

export function localizeDemoGeneratedOutput(locale: Locale, item: GeneratedOutput): GeneratedOutput {
  if (locale !== "zh") return item;
  return {
    ...item,
    title: localizeDemoText(locale, item.title) ?? item.title,
  };
}
