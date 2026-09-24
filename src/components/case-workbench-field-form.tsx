"use client";

import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui-foundation";
import { isValidJapanesePostalCode } from "@/lib/japanese-postal-code-validation";
import { getCaseContactValidationError } from "@/lib/case-contact-validation";

type CaseWorkbenchFieldFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  caseId: string;
  fieldKey: string;
  initialValue?: string;
  returnNode?: string;
  returnField?: string;
  returnAnchor?: string;
  returnView?: "quick" | "overview";
  showSaveWhenPristine?: boolean;
  className?: string;
  saveButtonWrapperClassName?: string;
  saveButtonClassName?: string;
  saveButtonAriaLabel?: string;
  saveLabel: string;
  savingLabel: string;
  children: ReactNode;
};

function FieldSaveButton({
  dirty,
  saveLabel,
  savingLabel,
  showWhenPristine = false,
  wrapperClassName = "",
  buttonClassName = "text-xs",
  buttonAriaLabel,
}: {
  dirty: boolean;
  saveLabel: string;
  savingLabel: string;
  showWhenPristine?: boolean;
  wrapperClassName?: string;
  buttonClassName?: string;
  buttonAriaLabel?: string;
}) {
  const { pending } = useFormStatus();
  const visible = showWhenPristine || dirty || pending;

  return (
    <div className={`overflow-hidden transition-all duration-200 ${visible ? "mt-4 max-h-12 opacity-100" : "mt-0 max-h-0 opacity-0"} ${wrapperClassName}`}>
      <div className="flex justify-end">
        <Button
          type="submit"
          tone="primary"
          controlSize="regular"
          loading={pending}
          aria-live="polite"
          aria-label={buttonAriaLabel}
          className={buttonClassName}
        >
          {pending ? savingLabel : saveLabel}
        </Button>
      </div>
    </div>
  );
}

export function CaseWorkbenchFieldForm({
  action,
  caseId,
  fieldKey,
  initialValue = "",
  returnNode,
  returnField,
  returnAnchor = "case-main-editor",
  returnView,
  showSaveWhenPristine = false,
  className,
  saveButtonWrapperClassName,
  saveButtonClassName,
  saveButtonAriaLabel,
  saveLabel,
  savingLabel,
  children,
}: CaseWorkbenchFieldFormProps) {
  const [dirty, setDirty] = useState(false);
  const scrollTopRef = useRef<HTMLInputElement>(null);
  const fieldValueSnapshotRef = useRef<HTMLInputElement>(null);

  return (
    <form
      action={action}
      onChange={(event) => {
        setDirty(true);
        const target = event.target;
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
          if (target.name === `field:${fieldKey}` && fieldValueSnapshotRef.current) fieldValueSnapshotRef.current.value = target.value;
        }
        if (target instanceof HTMLInputElement && target.dataset.caseValidation === "japanese-postal-code") {
          target.setCustomValidity("");
        }
        if (target instanceof HTMLInputElement && (target.dataset.caseFieldKind === "tel" || target.dataset.caseFieldKind === "email")) {
          target.setCustomValidity("");
        }
      }}
      onInput={(event) => {
        setDirty(true);
        const target = event.target;
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
          if (target.name === `field:${fieldKey}` && fieldValueSnapshotRef.current) fieldValueSnapshotRef.current.value = target.value;
        }
        if (target instanceof HTMLInputElement && target.dataset.caseValidation === "japanese-postal-code") {
          target.setCustomValidity("");
        }
        if (target instanceof HTMLInputElement && (target.dataset.caseFieldKind === "tel" || target.dataset.caseFieldKind === "email")) {
          target.setCustomValidity("");
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" && (event.nativeEvent.isComposing || event.keyCode === 229)) {
          event.preventDefault();
        }
      }}
      onSubmit={(event) => {
        // Form actions serialize the form after this handler runs. Read the
        // live control at the last possible moment so programmatic fills or
        // a remount cannot leave the snapshot behind the value on screen.
        const fieldControl = Array.from(event.currentTarget.elements).find((element): element is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement => {
          return (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) && element.name === `field:${fieldKey}`;
        });
        if (fieldControl && fieldValueSnapshotRef.current) {
          fieldValueSnapshotRef.current.value = fieldControl.value;
        }
        const contactInput = Array.from(event.currentTarget.querySelectorAll<HTMLInputElement>('input[data-case-field-kind="tel"], input[data-case-field-kind="email"]')).find((input) => {
          const fieldKey = input.name.startsWith("field:") ? input.name.slice("field:".length) : "";
          const error = getCaseContactValidationError(fieldKey, input.value, "ja");
          if (!error) return false;
          input.setCustomValidity(input.dataset.caseContactValidationMessage || error);
          input.reportValidity();
          input.focus();
          return true;
        });
        if (contactInput) {
          event.preventDefault();
          return;
        }
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
      <input type="hidden" name="fieldValueSnapshot" ref={fieldValueSnapshotRef} defaultValue={initialValue} readOnly />
      <input type="hidden" name="returnAnchor" value={returnAnchor} />
      <input type="hidden" name="returnScrollTop" ref={scrollTopRef} value="" readOnly />
      {returnView ? <input type="hidden" name="returnView" value={returnView} /> : null}
      {returnNode ? <input type="hidden" name="returnNode" value={returnNode} /> : null}
      {returnField ? <input type="hidden" name="returnField" value={returnField} /> : null}
      {children}
      <FieldSaveButton dirty={dirty} saveLabel={saveLabel} savingLabel={savingLabel} showWhenPristine={showSaveWhenPristine} wrapperClassName={saveButtonWrapperClassName} buttonClassName={saveButtonClassName} buttonAriaLabel={saveButtonAriaLabel} />
    </form>
  );
}
