import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outputDir = join(root, "tmp/qa_stress_samples");
mkdirSync(outputDir, { recursive: true });

function resolveTemplatePath(label, candidates) {
  const resolved = candidates.filter(Boolean).find((candidate) => existsSync(candidate));
  if (resolved) return resolved;

  throw new Error(
    [
      `${label} template was not found.`,
      "Set the matching BROKER_DESK_QA_*_TEMPLATE_PATH env var, or keep the source workbook in /Users/laineyzhu/Desktop/房产专家资料库.",
      `Checked: ${candidates.filter(Boolean).join(", ")}`,
    ].join(" "),
  );
}

const importantTemplate = resolveTemplatePath("Important matters", [
  process.env.BROKER_DESK_QA_IMPORTANT_TEMPLATE_PATH,
  join(root, "tmp/qa_filled_14_a-03_important_matters.xlsx"),
  "/Users/laineyzhu/Desktop/房产专家资料库/14_a-03.xlsx",
]);
const contractTemplate = resolveTemplatePath("Sale contract", [
  process.env.BROKER_DESK_QA_CONTRACT_TEMPLATE_PATH,
  join(root, "tmp/qa_filled_5_ippan_kubun_sale_contract.xlsx"),
  "/Users/laineyzhu/Desktop/房产专家资料库/5_ippan_kubun.xlsx",
]);

const propertyNames = [
  "港区グランドタワー",
  "芝公園グリーンレジデンス",
  "新宿サウスレジデンス",
  "目黒リバーサイド",
  "中目黒テラス",
  "渋谷イーストコート",
  "品川ベイタワー",
  "恵比寿ガーデンヒルズ",
  "豊洲ベイフロント",
  "麻布台レジデンス",
];

const addressBases = [
  "東京都港区芝公園1-2-3",
  "東京都港区芝公園 1丁目2番3号",
  "東京都新宿区西新宿2-8-1",
  "東京都目黒区中目黒4-5-6",
  "東京都渋谷区東3-10-2",
  "東京都品川区東品川2-3-14",
  "東京都江東区豊洲6-2-31",
  "東京都港区麻布台1-3-1",
];

const amountFormats = [
  (n) => String(n),
  (n) => `${n.toLocaleString("ja-JP")}円`,
  (n) => `¥${n.toLocaleString("ja-JP")}`,
  (n) => String(n).replace(/[0-9]/g, (d) => "０１２３４５６７８９"[Number(d)]),
  (n) => `${Math.floor(n / 10000)} 万円`,
  (n) => ` ${n.toLocaleString("ja-JP")} `,
];

function setCell(sheet, address, value) {
  sheet.getCell(address).value = value;
}

function setCells(sheet, addresses, value) {
  addresses.forEach((address) => setCell(sheet, address, ""));
  setCell(sheet, addresses[0], value);
}

function sheetByHint(workbook, hint) {
  return workbook.worksheets.find((sheet) => sheet.name.includes(hint)) ?? workbook.worksheets[0];
}

async function readWorkbook(templatePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templatePath);
  return workbook;
}

function mutateImportant(workbook, sample) {
  const sheet = sheetByHint(workbook, "重要事項説明書");
  setCells(sheet, ["G40", "H40", "I40"], sample.importantPropertyName);
  setCells(sheet, ["F41", "G41", "H41", "F42"], sample.importantAddress);
  setCells(sheet, ["G44", "H44"], sample.buildingLocation);
  setCells(sheet, ["G45", "H45"], sample.structure);
  setCells(sheet, ["G14", "H14"], sample.brokerName);
  setCells(sheet, ["G18", "H18"], sample.agentName);
  if (sample.lowQuality) {
    setCells(sheet, ["G40", "H40", "I40"], "");
    setCells(sheet, ["F41", "G41", "H41", "F42"], "");
  }
  if (sample.breakFingerprint) {
    setCell(sheet, "B2", "重要事項説明書（書式変更テスト）");
  }
}

function mutateContract(workbook, sample) {
  const sheet = sheetByHint(workbook, "売買契約書");
  setCells(sheet, ["E10", "F10", "G10"], sample.contractPropertyName);
  setCells(sheet, ["E11", "F11", "G11"], sample.contractAddress);
  setCells(sheet, ["E12", "F12"], sample.structure);
  setCells(sheet, ["R41", "S41"], sample.salePrice);
  setCells(sheet, ["R43", "S43"], sample.deposit);
  setCells(sheet, ["N46", "O46"], sample.balance);
  if (sample.lowQuality) {
    setCells(sheet, ["E10", "F10", "G10"], "");
    setCells(sheet, ["R41", "S41"], "");
  }
  if (sample.breakFingerprint) {
    setCell(sheet, "B1", "区分所有建物売買契約書（改変テスト）");
  }
}

const generatedSamples = Array.from({ length: 30 }, (_, index) => {
  const i = index + 1;
  const baseName = propertyNames[index % propertyNames.length];
  const baseAddress = addressBases[index % addressBases.length];
  const amount = 52000000 + index * 1370000;
  const rent = 120000 + index * 3000;
  const amountFormat = amountFormats[index % amountFormats.length];
  const mismatch = [7, 14, 22].includes(i);
  const lowQuality = [9, 18, 27].includes(i);
  const duplicateSource = [10, 20, 30].includes(i);
  const breakFingerprint = [12, 24].includes(i);
  const scenarioAddress = duplicateSource ? addressBases[0] : baseAddress;
  return {
    id: `case_${String(i).padStart(2, "0")}`,
    variant: breakFingerprint
      ? "fingerprint_changed"
      : lowQuality
        ? "low_quality"
        : mismatch
          ? "should_not_merge"
          : duplicateSource
            ? "duplicate_upload"
            : "merge_candidate",
    importantPropertyName: duplicateSource ? propertyNames[0] : `${baseName}${i % 3 === 0 ? " " : ""}${i % 4 === 0 ? "A棟" : ""}`.trim(),
    contractPropertyName: mismatch ? `${baseName}別館` : duplicateSource ? propertyNames[0] : `${baseName}${i % 3 === 0 ? "" : ""}${i % 4 === 0 ? " A棟" : ""}`.trim(),
    importantAddress: scenarioAddress,
    contractAddress: mismatch ? addressBases[(index + 3) % addressBases.length] : scenarioAddress.replace("丁目", "-").replace("番", "-").replace("号", ""),
    buildingLocation: scenarioAddress,
    structure: i % 2 === 0 ? "鉄筋コンクリート造陸屋根15階建" : "鉄筋コンクリート造 地上15階建",
    brokerName: i % 5 === 0 ? "Cherry Investment株式会社" : "東京サクラリアルティ株式会社",
    agentName: ["佐藤 一郎", "田中 健一", "鈴木 花子", "高橋 明"][index % 4],
    salePrice: amountFormat(amount),
    deposit: amountFormat(Math.round(amount * 0.1)),
    balance: amountFormat(Math.round(amount * 0.9)),
    rent,
    lowQuality,
    breakFingerprint,
  };
});

const edgeCaseSamples = [
  {
    id: "case_31",
    variant: "long_text",
    importantPropertyName: "港区グランドタワー西棟プレミアムレジデンス最上階メゾネット住戸長期表示確認用",
    contractPropertyName: "港区グランドタワー西棟プレミアムレジデンス最上階メゾネット住戸長期表示確認用",
    importantAddress:
      "東京都港区芝公園一丁目二番三号 港区グランドタワー西棟プレミアムレジデンス八階八百二号室 管理組合長期住所表示確認",
    contractAddress:
      "東京都港区芝公園一丁目二番三号 港区グランドタワー西棟プレミアムレジデンス八階八百二号室 管理組合長期住所表示確認",
    buildingLocation:
      "東京都港区芝公園一丁目二番三号 港区グランドタワー西棟プレミアムレジデンス八階八百二号室 管理組合長期住所表示確認",
    structure: "鉄筋コンクリート造陸屋根地下二階付地上四十二階建免震構造長期表示確認",
    brokerName: "Cherry Investment株式会社 港区不動産保証申込長文検証営業部 第一仲介センター",
    agentName: "田中 健一郎長文表示確認",
    salePrice: "123,456,789円",
    deposit: "12,345,678円",
    balance: "111,111,111円",
    rent: 987654,
    lowQuality: false,
    breakFingerprint: false,
  },
  {
    id: "case_32",
    variant: "short_text",
    importantPropertyName: "A",
    contractPropertyName: "A",
    importantAddress: "甲1",
    contractAddress: "甲1",
    buildingLocation: "甲1",
    structure: "木造",
    brokerName: "B社",
    agentName: "C",
    salePrice: "1",
    deposit: "1",
    balance: "1",
    rent: 1,
    lowQuality: false,
    breakFingerprint: false,
  },
];

const samples = [...generatedSamples, ...edgeCaseSamples];

const manifest = [];
for (const sample of samples) {
  const importantWorkbook = await readWorkbook(importantTemplate);
  mutateImportant(importantWorkbook, sample);
  const contractWorkbook = await readWorkbook(contractTemplate);
  mutateContract(contractWorkbook, sample);

  const importantPath = join(outputDir, `${sample.id}_important_${sample.variant}.xlsx`);
  const contractPath = join(outputDir, `${sample.id}_contract_${sample.variant}.xlsx`);
  await importantWorkbook.xlsx.writeFile(importantPath);
  await contractWorkbook.xlsx.writeFile(contractPath);
  manifest.push({
    ...sample,
    importantPath,
    contractPath,
  });
}

writeFileSync(join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ outputDir, groups: samples.length, files: samples.length * 2 }, null, 2));
