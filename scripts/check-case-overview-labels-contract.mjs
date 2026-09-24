import assert from "node:assert/strict";
import fs from "node:fs";

const localization = fs.readFileSync("src/lib/case-overview-localization.ts", "utf8");
const page = fs.readFileSync("src/app/cases/[id]/page.tsx", "utf8");
const overview = fs.readFileSync("src/components/case-overview.tsx", "utf8");
const associations = fs.readFileSync("src/lib/case-associations.ts", "utf8");

assert.match(localization, /"申込者・賃借人": \{ ja: "申込者・賃借人", zh: "申请人／承租人", ko: "신청인·임차인" \}/, "case applicant group keeps the approved three-locale labels");
assert.doesNotMatch(localization, /申请人／租客/, "the retired Chinese applicant-group label is absent");
assert.match(page, /localizeCaseOverviewTreeLabel\(locale, node\.label\)/, "quick navigation group labels use case overview localization");
assert.match(page, /localizeCaseOverviewTreeLabel\(locale, selectedTopTreeNode\.label\)/, "selected group headings use case overview localization");
assert.match(page, /localizeCaseOverviewTreeLabel\(locale, selectedChapterNode\.label\)/, "selected chapter heading uses case overview localization");
assert.match(page, /field\.treePath\.map\(\(path\) => localizeCaseOverviewTreeLabel\(locale, path\)\)/, "quick inline field paths use case overview localization");
assert.doesNotMatch(page, /field\.treePath\.join\(" \/ "\)/, "quick inline paths do not render raw Japanese tree labels");
assert.match(page, /`确认并保存：\$\{fieldLabel\}`/, "Chinese save assistance names the field and action");
assert.match(page, /`\$\{fieldLabel\} 확인 후 저장`/, "Korean save assistance uses the existing action wording");
assert.match(page, /`\$\{fieldLabel\}を確認して保存`/, "Japanese save assistance keeps the natural Japanese wording");
assert.match(page, /readText\(brokerageCase\.confirmedDataJson, "applicant\.name"\) \|\| readText\(brokerageCase\.confirmedDataJson, "tenant\.name"\)/, "top summary source remains the case field value");
assert.match(overview, /locale === "zh" \? "申请人" : locale === "ko" \? "신청인" : "申込人"/, "top summary keeps the non-role-specific applicant label");
assert.match(associations, /"主要申请人"/, "association role vocabulary remains unchanged");

console.log("case overview labels contract: PASS");
