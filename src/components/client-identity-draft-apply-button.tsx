"use client";

import { useState } from "react";
import type { Locale } from "@/lib/locale";
import { CLIENT_IDENTITY_DRAFT_APPLY_EVENT, filterClientIdentityDraftSuggestionsForPartyType, isEditableClientIdentityDraftControl, type ClientIdentityDraftSuggestion } from "@/lib/customer-identity-draft";

const copy = {
  ja: { apply: "空欄に候補を入力（要確認）", applied: "候補を入力しました。原本と照合してから保存してください。", empty: "入力できる空欄はありません。現在の値を確認してください。", corporate: "法人顧客には個人候補を入力できません。" },
  zh: { apply: "填入空白字段（需核对）", applied: "候选已填入，请与原件核对后再保存。", empty: "没有可填入的空白字段，请确认当前值。", corporate: "法人客户不能填入个人证件候选。" },
  ko: { apply: "빈 필드에 후보 입력(확인 필요)", applied: "후보를 입력했습니다. 원본과 대조한 후 저장해 주세요.", empty: "입력할 빈 필드가 없습니다. 현재 값을 확인해 주세요.", corporate: "법인 고객에는 개인 후보를 입력할 수 없습니다." },
} as const;

export function ClientIdentityDraftApplyButton({ locale, formId, suggestions }: { locale: Locale; formId: string; suggestions: readonly ClientIdentityDraftSuggestion[] }) {
  const text = copy[locale];
  const [feedback, setFeedback] = useState("");
  const apply = () => {
    const form = document.getElementById(formId);
    if (!(form instanceof HTMLFormElement)) return;
    const partyTypeControl = form.elements.namedItem("partyType");
    const livePartyType = partyTypeControl instanceof HTMLSelectElement ? partyTypeControl.value : "";
    const safeSuggestions = filterClientIdentityDraftSuggestionsForPartyType(livePartyType, suggestions);
    if (livePartyType === "corporate") {
      setFeedback(text.corporate);
      return;
    }
    const eligible = safeSuggestions.filter((suggestion) => {
      const control = form.elements.namedItem(suggestion.key);
      if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement)) return false;
      return isEditableClientIdentityDraftControl({
        value: control.value,
        type: control instanceof HTMLInputElement ? control.type : undefined,
        disabled: control.disabled,
        readOnly: "readOnly" in control ? control.readOnly : false,
      });
    });
    if (eligible.length === 0) {
      setFeedback(text.empty);
      return;
    }
    window.dispatchEvent(new CustomEvent(CLIENT_IDENTITY_DRAFT_APPLY_EVENT, { detail: { formId, suggestions: eligible } }));
    setFeedback(text.applied);
  };
  return <div className="flex flex-wrap items-center gap-2">
    <button type="button" onClick={apply} className="rounded border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] font-bold text-amber-900 hover:bg-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600">{text.apply}</button>
    {feedback ? <span role="status" className="text-[11px] font-semibold text-amber-800">{feedback}</span> : null}
  </div>;
}
