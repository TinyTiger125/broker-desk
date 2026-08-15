"use client";

import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { isValidJapanesePostalCode } from "@/lib/japanese-postal-code-validation";

type CaseWorkbenchFieldFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  caseId: string;
  fieldKey: string;
  returnNode?: string;
  returnField?: string;
  returnAnchor?: string;
  returnView?: "quick" | "overview";
  showSaveWhenPristine?: boolean;
  className?: string;
  saveLabel: string;
  savingLabel: string;
  children: ReactNode;
};

function FieldSaveButton({
  dirty,
  saveLabel,
  savingLabel,
  showWhenPristine = false,
}: {
  dirty: boolean;
  saveLabel: string;
  savingLabel: string;
  showWhenPristine?: boolean;
}) {
  const { pending } = useFormStatus();
  const visible = showWhenPristine || dirty || pending;

  return (
    <div className={`overflow-hidden transition-all duration-200 ${visible ? "mt-4 max-h-12 opacity-100" : "mt-0 max-h-0 opacity-0"}`}>
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-slate-950 px-4 py-2 text-xs font-black text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? savingLabel : saveLabel}
        </button>
      </div>
    </div>
  );
}

export function CaseWorkbenchFieldForm({
  action,
  caseId,
  fieldKey,
  returnNode,
  returnField,
  returnAnchor = "case-main-editor",
  returnView,
  showSaveWhenPristine = false,
  className,
  saveLabel,
  savingLabel,
  children,
}: CaseWorkbenchFieldFormProps) {
  const [dirty, setDirty] = useState(false);
  const scrollTopRef = useRef<HTMLInputElement>(null);

  return (
    <form
      action={action}
      onChange={(event) => {
        setDirty(true);
        const target = event.target;
        if (target instanceof HTMLInputElement && target.dataset.caseValidation === "japanese-postal-code") {
          target.setCustomValidity("");
        }
      }}
      onInput={(event) => {
        setDirty(true);
        const target = event.target;
        if (target instanceof HTMLInputElement && target.dataset.caseValidation === "japanese-postal-code") {
          target.setCustomValidity("");
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" && (event.nativeEvent.isComposing || event.keyCode === 229)) {
          event.preventDefault();
        }
      }}
      onSubmit={(event) => {
        const postalInput = event.currentTarget.querySelector<HTMLInputElement>('input[data-case-validation="japanese-postal-code"]');
        if (postalInput && postalInput.value.trim() && !isValidJapanesePostalCode(postalInput.value)) {
          event.preventDefault();
          postalInput.setCustomValidity(postalInput.dataset.validationMessage || "日本の郵便番号は7桁で入力してください。");
          postalInput.reportValidity();
          postalInput.focus();
          return;
        }
        postalInput?.setCustomValidity("");
        if (scrollTopRef.current) {
          scrollTopRef.current.value = String(Math.max(0, Math.round(document.scrollingElement?.scrollTop ?? window.scrollY)));
        }
        setDirty(false);
      }}
      className={className}
    >
      <input type="hidden" name="caseId" value={caseId} />
      <input type="hidden" name="presentFieldKeysJson" value={JSON.stringify([fieldKey])} />
      <input type="hidden" name="returnAnchor" value={returnAnchor} />
      <input type="hidden" name="returnScrollTop" ref={scrollTopRef} value="" readOnly />
      {returnView ? <input type="hidden" name="returnView" value={returnView} /> : null}
      {returnNode ? <input type="hidden" name="returnNode" value={returnNode} /> : null}
      {returnField ? <input type="hidden" name="returnField" value={returnField} /> : null}
      {children}
      <FieldSaveButton dirty={dirty} saveLabel={saveLabel} savingLabel={savingLabel} showWhenPristine={showSaveWhenPristine} />
    </form>
  );
}
