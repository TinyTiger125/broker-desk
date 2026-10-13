"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui-foundation";
import { isValidCaseDateInput } from "@/lib/case-date";
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
  saveButtonPlacement?: "stacked" | "inline";
  readOnly?: boolean;
  editLabel?: string;
  onEdit?: () => void;
  className?: string;
  saveButtonWrapperClassName?: string;
  saveButtonClassName?: string;
  saveButtonAriaLabel?: string;
  editButtonAriaLabel?: string;
  onDirtyChange?: (dirty: boolean) => void;
  onSubmitAccepted?: () => void;
  onPendingChange?: (pending: boolean) => void;
  saveLabel: string;
  savingLabel: string;
  children: ReactNode | ((readOnly: boolean) => ReactNode);
};

function FieldSaveButton({
  dirty,
  saveLabel,
  savingLabel,
  showWhenPristine = false,
  placement = "stacked",
  readOnly = false,
  editLabel,
  onEdit,
  onPendingChange,
  wrapperClassName = "",
  buttonClassName = "text-xs",
  buttonAriaLabel,
  editButtonAriaLabel,
}: {
  dirty: boolean;
  saveLabel: string;
  savingLabel: string;
  showWhenPristine?: boolean;
  placement?: "stacked" | "inline";
  readOnly?: boolean;
  editLabel?: string;
  onEdit?: () => void;
  onPendingChange?: (pending: boolean) => void;
  wrapperClassName?: string;
  buttonClassName?: string;
  buttonAriaLabel?: string;
  editButtonAriaLabel?: string;
}) {
  const { pending } = useFormStatus();
  const visible = readOnly || showWhenPristine || dirty || pending;

  useEffect(() => {
    onPendingChange?.(pending);
  }, [onPendingChange, pending]);

  return (
    <div className={`overflow-hidden transition-all duration-200 ${placement === "inline" ? "mt-0" : visible ? "mt-4" : "mt-0"} ${visible ? "max-h-12 opacity-100" : "max-h-0 opacity-0"} ${wrapperClassName}`}>
      <div className="flex justify-end">
        {readOnly ? (
          <Button
            type="button"
            tone="secondary"
            controlSize="regular"
            aria-label={editButtonAriaLabel ?? buttonAriaLabel}
            className={buttonClassName}
            onClick={(event) => {
              event.preventDefault();
              onEdit?.();
            }}
          >
            {editLabel}
          </Button>
        ) : (
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
        )}
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
  saveButtonPlacement = "stacked",
  readOnly = false,
  editLabel,
  onEdit,
  className,
  saveButtonWrapperClassName,
  saveButtonClassName,
  saveButtonAriaLabel,
  editButtonAriaLabel,
  onDirtyChange,
  onSubmitAccepted,
  onPendingChange,
  saveLabel,
  savingLabel,
  children,
}: CaseWorkbenchFieldFormProps) {
  const [dirty, setDirty] = useState(false);
  const [editingReadOnlyField, setEditingReadOnlyField] = useState(false);
  const scrollTopRef = useRef<HTMLInputElement>(null);
  const fieldValueSnapshotRef = useRef<HTMLInputElement>(null);
  const effectiveReadOnly = readOnly && !editingReadOnlyField;

  const handleEdit = () => {
    setEditingReadOnlyField(true);
    setDirty(false);
    onDirtyChange?.(false);
    onEdit?.();
  };

  return (
    <form
      action={action}
      data-case-workbench-field={fieldKey}
      onChange={(event) => {
        if (effectiveReadOnly) return;
        setDirty(true);
        onDirtyChange?.(true);
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
        if (target instanceof HTMLInputElement && target.dataset.caseFieldKind === "date") {
          target.setCustomValidity("");
        }
      }}
      onInput={(event) => {
        if (effectiveReadOnly) return;
        setDirty(true);
        onDirtyChange?.(true);
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
        if (target instanceof HTMLInputElement && target.dataset.caseFieldKind === "date") {
          target.setCustomValidity("");
        }
      }}
      onKeyDown={(event) => {
        if (effectiveReadOnly) return;
        if (event.key !== "Enter") return;
        // Let the browser/IME finish candidate confirmation. Synthetic Enter
        // from an active composition must never be turned into a save.
        if (event.nativeEvent.isComposing || event.keyCode === 229) return;
        if (event.target instanceof HTMLInputElement) {
          event.preventDefault();
          event.currentTarget.requestSubmit();
        }
      }}
      onSubmit={(event) => {
        if (effectiveReadOnly) {
          event.preventDefault();
          return;
        }
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
        const dateInput = event.currentTarget.querySelector<HTMLInputElement>('input[data-case-field-kind="date"]');
        if (dateInput && dateInput.value.trim() && !isValidCaseDateInput(dateInput.value)) {
          event.preventDefault();
          dateInput.setCustomValidity(dateInput.dataset.caseDateValidationMessage || "请输入有效日期。");
          dateInput.reportValidity();
          dateInput.focus();
          return;
        }
        dateInput?.setCustomValidity("");
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
        onSubmitAccepted?.();
        // Keep the editor dirty until the action redirects and remounts the
        // page. If the server action fails without a redirect, the current
        // value and the save control must remain available for correction.
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
      {typeof children === "function" ? children(effectiveReadOnly) : children}
      <FieldSaveButton dirty={dirty} saveLabel={saveLabel} savingLabel={savingLabel} showWhenPristine={showSaveWhenPristine} placement={saveButtonPlacement} readOnly={effectiveReadOnly} editLabel={editLabel} onEdit={handleEdit} onPendingChange={onPendingChange} wrapperClassName={saveButtonWrapperClassName} buttonClassName={saveButtonClassName} buttonAriaLabel={saveButtonAriaLabel} editButtonAriaLabel={editButtonAriaLabel} />
    </form>
  );
}
