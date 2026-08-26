import { readFile } from "node:fs/promises";

const action = await readFile("src/app/actions.ts", "utf8");
const form = await readFile("src/components/client-form.tsx", "utf8");
const createPage = await readFile("src/app/clients/new/page.tsx", "utf8");
const editPage = await readFile("src/app/clients/[id]/edit/page.tsx", "utf8");
const detailPage = await readFile("src/app/clients/[id]/page.tsx", "utf8");
const failures = [];

function requireText(source, text, description) {
  if (!source.includes(text)) failures.push(description);
}

function forbidText(source, text, description) {
  if (source.includes(text)) failures.push(description);
}

requireText(form, 'basic: "基本情報"', "form must keep the basic information group");
requireText(form, 'ja: {', "form must define a Japanese copy map");
requireText(form, 'management: "顧客管理"', "form must keep the customer management group");
requireText(form, 'legal: "契約・法定情報"', "form must keep the legal group");
requireText(form, 'notes: "備考"', "form must keep the notes group");
requireText(form, 'label("budgetType", text.budgetType)', "budget type label must come from the locale copy map");
const expectedCopy = {
  ja: {
    basic: "基本情報", needs: "希望条件", management: "顧客管理", legal: "契約・法定情報", notes: "備考", name: "顧客名", phone: "電話番号", lineId: "LINE ID", email: "メールアドレス", budgetMin: "予算下限", budgetMax: "予算上限", budgetType: "予算タイプ", preferredArea: "意向エリア", firstChoiceArea: "第1希望エリア", secondChoiceArea: "第2希望エリア", purpose: "用途", period: "入居/運用希望時期", loan: "ローン事前審査", stage: "ステージ", temperature: "温度感", nextFollowUpAt: "次回フォロー日", brokerage: "媒介契約", signedAt: "媒介契約締結日", expiresAt: "媒介契約満了日", matters35: "重要事項説明日（35条）", matters37: "契約書面交付日（37条）", consent: "個人情報利用目的同意確認日", aml: "本人確認/AML", notesPlaceholder: "顧客の要望や確認事項", save: "顧客を保存", saving: "保存中…", cancel: "キャンセル", back: "戻る", choose: "選択してください", optional: "任意", error: "入力内容を確認してください。", initialState: "作成時のシステム初期状態です。人工的な確認完了を示しません。",
  },
  zh: {
    basic: "基本信息", needs: "需求条件", management: "客户管理", legal: "合同与法定信息", notes: "备注", name: "客户姓名", phone: "电话号码", lineId: "LINE ID", email: "邮箱地址", budgetMin: "预算下限", budgetMax: "预算上限", budgetType: "预算类型", preferredArea: "意向区域", firstChoiceArea: "第一意向区域", secondChoiceArea: "第二意向区域", purpose: "用途", period: "入住/运营期望时间", loan: "贷款预审", stage: "阶段", temperature: "温度", nextFollowUpAt: "下次跟进日期", brokerage: "媒介合同", signedAt: "媒介合同签订日", expiresAt: "媒介合同到期日", matters35: "重要事项说明日（35条）", matters37: "合同书面交付日（37条）", consent: "个人信息使用同意确认日", aml: "实名/AML", notesPlaceholder: "客户需求和确认事项", save: "保存客户", saving: "保存中…", cancel: "取消", back: "返回", choose: "请选择", optional: "选填", error: "请检查以下输入内容。", initialState: "创建时的系统初始状态，不表示人工核验完成。",
  },
  ko: {
    basic: "기본 정보", needs: "희망 조건", management: "고객 관리", legal: "계약 및 법정 정보", notes: "메모", name: "고객명", phone: "전화번호", lineId: "LINE ID", email: "이메일", budgetMin: "예산 하한", budgetMax: "예산 상한", budgetType: "예산 유형", preferredArea: "희망 지역", firstChoiceArea: "1순위 희망 지역", secondChoiceArea: "2순위 희망 지역", purpose: "용도", period: "입주/운용 희망 시기", loan: "대출 사전심사", stage: "단계", temperature: "온도", nextFollowUpAt: "다음 후속 날짜", brokerage: "중개 계약", signedAt: "중개 계약 체결일", expiresAt: "중개 계약 만료일", matters35: "중요사항 설명일(35조)", matters37: "계약서 교부일(37조)", consent: "개인정보 이용 동의 확인일", aml: "본인확인/AML", notesPlaceholder: "고객 요청과 확인 사항", save: "고객 저장", saving: "저장 중…", cancel: "취소", back: "돌아가기", choose: "선택해 주세요", optional: "선택", error: "다음 입력 내용을 확인해 주세요.", initialState: "작성 시 시스템 초기 상태이며, 수동 확인 완료를 뜻하지 않습니다.",
  },
};
const copyStart = form.indexOf("const copy =");
const copyEnd = form.indexOf("} as const;", copyStart);
const copySource = form.slice(copyStart, copyEnd);
for (const [locale, messages] of Object.entries(expectedCopy)) {
  const start = copySource.indexOf(`${locale}: {`);
  const next = ["ja", "zh", "ko"].filter((candidate) => candidate !== locale).map((candidate) => copySource.indexOf(`${candidate}: {`, start + 1)).filter((index) => index >= 0).sort((a, b) => a - b)[0] ?? copySource.length;
  const block = copySource.slice(start, next);
  for (const [key, value] of Object.entries(messages)) {
    if (!block.includes(`${key}: ${JSON.stringify(value)}`)) failures.push(`${locale} ClientForm copy mismatch: ${key}`);
  }
}
forbidText(form, 'label("budgetType", "予算タイプ")', "ClientForm must not hardcode a single-language budget type label");
const renderedSource = `${form.slice(0, copyStart)}${form.slice(copyEnd + "} as const;".length)}`;
if (/["'][^"']*[一-龥ぁ-んァ-ン가-힣][^"']*["']/u.test(renderedSource)) failures.push("ClientForm contains a hardcoded user-visible localized string outside the locale copy map");
requireText(form, 'setValues(state.values)', "server validation errors must restore submitted values");
requireText(form, 'role="alert"', "form must expose one focusable error summary");
requireText(form, 'aria-describedby', "field errors must be associated with fields");
requireText(form, 'onCompositionStart', "IME composition guard must exist as code mechanism");
if ((form.match(/<button type="submit"/g) ?? []).length !== 1) failures.push("complete form must have exactly one submit button");
forbidText(form, "afterSave", "complete form must not expose the old second submit flow");

forbidText(createPage, "client-form-template", "new page must not import template helpers");
forbidText(createPage, "client-intake-parser", "new page must not import memo parser");
forbidText(createPage, "confidence", "new page must not show confidence UI");
forbidText(createPage, "import-center", "new page must not treat import-center as returnTo");
requireText(createPage, 'stage: "lead"', "create page must seed only the lead stage");
requireText(editPage, "updateClientProfileAction", "edit page must use the structured update action");
requireText(editPage, "normalizeReturnTo", "edit page must validate returnTo before rendering");

const returnToStart = action.indexOf("function safeClientReturnTo");
const returnToEnd = action.indexOf("async function persistClientForm", returnToStart);
const returnTo = action.slice(returnToStart, returnToEnd);
requireText(returnTo, 'parsed.pathname === "/clients"', "actions must whitelist the client list return path");
requireText(returnTo, 'parsed.pathname === "/organize-center"', "actions must whitelist the approved organize entry");
forbidText(returnTo, "/import-center", "actions must reject import-center as a form return path");
requireText(action, "export async function createClient(formData: FormData)", "quick create compatibility wrapper must remain");
requireText(action, "await persistClientForm(formData, \"create\", undefined, true)", "quick create must reuse the shared persistence core");
requireText(action, "parsed <= 0", "budget zero and negative values must be rejected server-side");
requireText(action, "budgetMin > budgetMax", "budget bounds must be validated server-side");
requireText(action, 'redirect(`/clients/${client.id}?flash=client_created`)', "create must redirect with the client_created feedback code");
requireText(detailPage, "client_created", "client detail must map the creation feedback code");
requireText(detailPage, "顧客を作成しました。", "client detail must include the Japanese creation feedback");
requireText(detailPage, "客户已创建。", "client detail must include the Chinese creation feedback");
requireText(detailPage, "고객을 생성했습니다.", "client detail must include the Korean creation feedback");

if (failures.length > 0) {
  console.error(failures.map((failure) => `FAIL: ${failure}`).join("\n"));
  process.exit(1);
}

console.log("TASK-032 client Responsive Form contract checks passed (groups, validation, errors, returnTo, and boundaries).");
