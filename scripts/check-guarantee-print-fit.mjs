#!/usr/bin/env node
import Module from "node:module";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const tsModuleCache = new Map();

function resolveProjectAlias(request) {
  if (!request.startsWith("@/lib/")) return null;
  return path.resolve(`src/lib/${request.slice("@/lib/".length)}.ts`);
}

function loadTsModule(sourcePath) {
  sourcePath = path.resolve(sourcePath);
  if (tsModuleCache.has(sourcePath)) return tsModuleCache.get(sourcePath);

  const source = fs.readFileSync(sourcePath, "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  const mod = new Module(sourcePath);
  mod.filename = sourcePath;
  mod.paths = Module._nodeModulePaths(process.cwd());
  const originalRequire = mod.require.bind(mod);
  tsModuleCache.set(sourcePath, mod.exports);
  mod.require = (request) => {
    const aliasPath = resolveProjectAlias(request);
    return aliasPath ? loadTsModule(aliasPath) : originalRequire(request);
  };
  mod._compile(js, sourcePath);
  tsModuleCache.set(sourcePath, mod.exports);
  return mod.exports;
}

function fail(message) {
  console.error(`[FAIL] ${message}`);
  process.exit(1);
}

function formatValue(field, rawValue, formatFriendsOverlayValue) {
  const value = String(rawValue ?? "").trim();
  const formatted = formatFriendsOverlayValue ? formatFriendsOverlayValue(field, value) : value;
  if (!formatted || !field.valuePart) return formatted;
  const parts = formatted.split(/[\s　]+/).filter(Boolean);
  if (field.valuePart === "firstToken") return parts[0] ?? formatted;
  return parts.length > 1 ? parts.slice(1).join(" ") : "";
}

function checkSample(input) {
  const {
    name,
    fields,
    sampleValues,
    getFriendsOverlayEstimatedTextFit,
    getFriendsOverlayFieldPrintMode,
    formatFriendsOverlayValue,
    isFriendsOverlayFieldNeverPrinted,
  } = input;
  return fields.flatMap((field) => {
    if (isFriendsOverlayFieldNeverPrinted(field)) return [];
    if (getFriendsOverlayFieldPrintMode(field) === "manual") return [];
    const rawValue = sampleValues[field.sourceFieldKey ?? field.fieldKey] ?? "";
    const value = formatValue(field, rawValue, formatFriendsOverlayValue);
    const fit = getFriendsOverlayEstimatedTextFit({ field, value, box: field.box });
    if (fit.status === "overflows" || fit.status === "segment_overflows" || fit.status === "shrinks") {
      return [{
        sample: name,
        fieldKey: field.fieldKey,
        label: field.label,
        value,
        status: fit.status,
        estimatedWidth: Number(fit.estimatedWidth.toFixed(1)),
        printableWidth: Number(fit.printableWidth.toFixed(1)),
      }];
    }
    return [];
  });
}

const guaranteeApplication = loadTsModule(path.resolve("src/lib/guarantee-application.ts"));
const friendsGuaranteeFit = loadTsModule(path.resolve("src/lib/friends-guarantee-fit.ts"));
const friendsGuaranteePdf = loadTsModule(path.resolve("src/lib/friends-guarantee-pdf.ts"));
const { COMPLETE_CASE_FIELD_DEFAULTS, COMPLETE_DRAFT_DEFAULTS } = loadTsModule(path.resolve("src/lib/guarantee-application-fixtures.ts"));

const {
  getFriendsGuaranteeEffectiveOverlayFields,
  getFriendsOverlayFieldPrintMode,
  formatFriendsOverlayValue,
  isFriendsOverlayFieldNeverPrinted,
} = friendsGuaranteePdf;
const { getFriendsOverlayEstimatedTextFit } = friendsGuaranteeFit;
const { guaranteeCompanyTemplates } = guaranteeApplication;

const completeValues = { ...COMPLETE_CASE_FIELD_DEFAULTS, ...COMPLETE_DRAFT_DEFAULTS };
const stressValues = {
  ...completeValues,
  "property.name": "港区グランドタワー西棟プレミアムレジデンス最上階メゾネット住戸長期契約用",
  "property.address": "東京都港区芝公園一丁目二番三号 港区グランドタワー西棟プレミアムレジデンス八階八百二号室",
  "applicant.currentAddress": "東京都品川区大崎四丁目五番六号 大崎ニューシティサウスタワー三十二階三二〇一号室",
  "applicant.employerName": "山田商事株式会社 首都圏法人営業第一本部 不動産ソリューション推進室",
  "applicant.employerAddress": "東京都千代田区丸の内一丁目一番一号 丸の内中央ビルディング二十八階",
  "applicant.phone": "090-1234-5678-999",
  "guarantor.address": "東京都練馬区豊玉北五丁目六番七号 練馬中央レジデンス東棟二十階二〇〇一号室",
  "guarantor.employerName": "東京設備株式会社 首都圏ファシリティマネジメント第一事業部",
  "emergencyContact.address": "東京都世田谷区三軒茶屋二丁目三番四号 三軒茶屋ハイツ南棟十階一〇〇二号室",
  "emergencyContact.employerName": "さくら介護株式会社 地域包括ケア事業推進本部",
  "broker.companyName": "東京サクラリアルティ株式会社 港区国際不動産仲介事業部",
  "management.companyName": "港区グランド管理株式会社 建物管理サービス第一部",
};

const templateSummaries = guaranteeCompanyTemplates
  .filter((template) => template.outputStatus === "active")
  .map((template) => {
    const fields = getFriendsGuaranteeEffectiveOverlayFields({
      templateId: template.id,
      confirmedDataJson: completeValues,
    });
    const completeFindings = checkSample({
      name: "complete",
      fields,
      sampleValues: completeValues,
      getFriendsOverlayEstimatedTextFit,
      getFriendsOverlayFieldPrintMode,
      formatFriendsOverlayValue,
      isFriendsOverlayFieldNeverPrinted,
    });
    const completeBlocking = completeFindings.filter((finding) => finding.status !== "shrinks");
    if (completeBlocking.length > 0) {
      fail(`${template.id} complete fixture has print-blocking issue(s):\n${completeBlocking.map((item) => `- ${item.fieldKey} ${item.status}: ${item.value}`).join("\n")}`);
    }

    const stressFindings = checkSample({
      name: "stress-long",
      fields,
      sampleValues: stressValues,
      getFriendsOverlayEstimatedTextFit,
      getFriendsOverlayFieldPrintMode,
      formatFriendsOverlayValue,
      isFriendsOverlayFieldNeverPrinted,
    });

    return {
      template: template.id,
      fieldCount: fields.length,
      completeWarnings: completeFindings.length,
      stressWarnings: stressFindings.length,
      stressExamples: stressFindings.slice(0, 3),
    };
  });

const totalStressWarnings = templateSummaries.reduce((sum, summary) => sum + summary.stressWarnings, 0);
if (totalStressWarnings < templateSummaries.length) {
  fail(`stress-long sample did not produce enough print-fit warnings; overflow detection is too weak (${totalStressWarnings})`);
}

console.log(JSON.stringify({
  ok: true,
  templateCount: templateSummaries.length,
  totalStressWarnings,
  templates: templateSummaries,
}, null, 2));
