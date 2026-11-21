"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui-foundation";
import { isValidCaseDateInput } from "@/lib/case-date";
import { isValidJapanesePostalCode, normalizeJapanesePostalCode } from "@/lib/japanese-postal-code-validation";
import { getCaseContactValidationError } from "@/lib/case-contact-validation";
import { formatJapanesePhone } from "@/lib/japanese-mobile-phone";

function normalizePhoneInput(target: HTMLInputElement) {
  if (target.dataset.caseFieldKind !== "tel") return;
  const formatted = formatJapanesePhone(target.value);
  if (formatted !== target.value) target.value = formatted;
}

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
  postalAddress?: { fieldKey: string; label: string; value: string; locale: "ja" | "zh" | "ko" };
  saveLabel: string;
  savingLabel: string;
  children: ReactNode | ((readOnly: boolean, postalLookupButton?: ReactNode) => ReactNode);
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
  postalAddress,
  saveLabel,
  savingLabel,
  children,
}: CaseWorkbenchFieldFormProps) {
  const [dirty, setDirty] = useState(false);
  const [editingReadOnlyField, setEditingReadOnlyField] = useState(false);
  const [postalAddressDraft, setPostalAddressDraft] = useState<string | null>(null);
  const [postalLookupStatus, setPostalLookupStatus] = useState<"idle" | "loading" | "found" | "invalid" | "not_found" | "unavailable">("idle");
  const scrollTopRef = useRef<HTMLInputElement>(null);
  const fieldValueSnapshotRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const effectiveReadOnly = readOnly && !editingReadOnlyField;

  const lookupPostalAddress = async () => {
    if (!postalAddress || effectiveReadOnly) return;
    const postalInput = formRef.current?.querySelector<HTMLInputElement>('input[data-case-validation="japanese-postal-code"]');
    const postalCode = normalizeJapanesePostalCode(postalInput?.value ?? "");
    if (!isValidJapanesePostalCode(postalCode)) {
      setPostalLookupStatus("invalid");
      return;
    }
    setPostalLookupStatus("loading");
    try {
      const response = await fetch(`/api/postal-codes/lookup?postalCode=${encodeURIComponent(postalCode)}`, { cache: "no-store" });
      const payload = await response.json() as { ok?: boolean; error?: string; addressPrefix?: string; prefecture?: string; municipality?: string };
      if (normalizeJapanesePostalCode(postalInput?.value ?? "") !== postalCode) return;
      if (response.status === 503 || payload.error === "postal_code_index_unavailable") {
        setPostalLookupStatus("unavailable");
        return;
      }
      if (!response.ok || !payload.ok || !payload.addressPrefix) {
        setPostalLookupStatus("not_found");
        return;
      }
      const prefix = payload.addressPrefix;
      const administrativePrefix = `${payload.prefecture ?? ""}${payload.municipality ?? ""}`;
      // Read the live input after the request resolves. The user may have edited
      // the address while the lookup was in flight.
      const currentAddress = formRef.current?.querySelector<HTMLInputElement>(`input[name="field:${postalAddress.fieldKey}"]`)?.value.trim() ?? postalAddress.value.trim();
      const address = !currentAddress
        ? prefix
        : currentAddress.startsWith(prefix) || (administrativePrefix && currentAddress.startsWith(administrativePrefix))
          ? currentAddress
          : /^(東京都|北海道|京都府|大阪府|.{2,3}県)/.test(currentAddress)
            ? currentAddress
            : `${prefix}${currentAddress}`;
      setPostalAddressDraft(address);
      setDirty(true);
      onDirtyChange?.(true);
      setPostalLookupStatus("found");
    } catch {
      if (normalizeJapanesePostalCode(postalInput?.value ?? "") === postalCode) setPostalLookupStatus("unavailable");
    }
  };

  const postalLookupButton = postalAddress ? (
    <button type="button" onClick={() => void lookupPostalAddress()} disabled={effectiveReadOnly || postalLookupStatus === "loading"} className="min-h-11 shrink-0 rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
      {postalAddress.locale === "zh" ? "查询地址" : postalAddress.locale === "ko" ? "주소 검색" : "住所検索"}
    </button>
  ) : undefined;

  const handleEdit = () => {
    setEditingReadOnlyField(true);
    setDirty(false);
    onDirtyChange?.(false);
    onEdit?.();
  };

  return (
    <form
      ref={formRef}
      action={action}
      data-case-workbench-field={fieldKey}
      onChange={(event) => {
        if (effectiveReadOnly) return;
        setDirty(true);
        onDirtyChange?.(true);
        const target = event.target;
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
          if (target instanceof HTMLInputElement) normalizePhoneInput(target);
          if (target.name === `field:${fieldKey}` && fieldValueSnapshotRef.current) fieldValueSnapshotRef.current.value = target.value;
        }
        if (target instanceof HTMLInputElement && target.dataset.caseValidation === "japanese-postal-code") {
          target.setCustomValidity("");
          setPostalAddressDraft(null);
          setPostalLookupStatus("idle");
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
          if (target instanceof HTMLInputElement) normalizePhoneInput(target);
          if (target.name === `field:${fieldKey}` && fieldValueSnapshotRef.current) fieldValueSnapshotRef.current.value = target.value;
        }
        if (target instanceof HTMLInputElement && target.dataset.caseValidation === "japanese-postal-code") {
          target.setCustomValidity("");
          setPostalAddressDraft(null);
          setPostalLookupStatus("idle");
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
        if (postalLookupStatus === "loading") {
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
      <input type="hidden" name="presentFieldKeysJson" value={JSON.stringify(postalAddressDraft !== null && postalAddress ? [fieldKey, postalAddress.fieldKey] : [fieldKey])} />
      <input type="hidden" name="fieldValueSnapshot" ref={fieldValueSnapshotRef} defaultValue={initialValue} readOnly />
      <input type="hidden" name="returnAnchor" value={returnAnchor} />
      <input type="hidden" name="returnScrollTop" ref={scrollTopRef} value="" readOnly />
      {returnView ? <input type="hidden" name="returnView" value={returnView} /> : null}
      {returnNode ? <input type="hidden" name="returnNode" value={returnNode} /> : null}
      {returnField ? <input type="hidden" name="returnField" value={returnField} /> : null}
      {typeof children === "function" ? children(effectiveReadOnly, postalLookupButton) : children}
      {postalAddress && postalLookupStatus !== "idle" ? <p role={postalLookupStatus === "invalid" || postalLookupStatus === "unavailable" ? "alert" : "status"} className={`text-xs font-semibold ${postalLookupStatus === "found" ? "text-emerald-700" : postalLookupStatus === "loading" ? "text-slate-600" : "text-amber-700"}`}>
        {postalLookupStatus === "loading" ? postalAddress.locale === "zh" ? "正在查询地址…" : postalAddress.locale === "ko" ? "주소 검색 중…" : "住所を検索中…" : postalLookupStatus === "found" ? postalAddress.locale === "zh" ? "查询完成，请核对下方地址并保存。" : postalAddress.locale === "ko" ? "검색이 완료되었습니다. 아래 주소를 확인하고 저장해 주세요." : "検索が完了しました。下の住所を確認して保存してください。" : postalLookupStatus === "invalid" ? postalAddress.locale === "zh" ? "请输入7位邮编。" : postalAddress.locale === "ko" ? "우편번호 7자리를 입력해 주세요." : "郵便番号は7桁で入力してください。" : postalLookupStatus === "not_found" ? postalAddress.locale === "zh" ? "未找到该邮编，请手动填写地址。" : postalAddress.locale === "ko" ? "우편번호를 찾지 못했습니다. 주소를 직접 입력해 주세요." : "郵便番号が見つかりません。住所を入力してください。" : postalAddress.locale === "zh" ? "暂时无法查询地址，请手动填写。" : postalAddress.locale === "ko" ? "주소를 검색할 수 없습니다. 직접 입력해 주세요." : "住所を検索できません。手入力してください。"}
      </p> : null}
      {postalAddress && postalAddressDraft !== null ? <div className="space-y-1"><label htmlFor={`case-postal-address-${fieldKey}`} className="text-sm font-semibold text-slate-700">{postalAddress.label}</label><input id={`case-postal-address-${fieldKey}`} name={`field:${postalAddress.fieldKey}`} value={postalAddressDraft} onChange={(event) => setPostalAddressDraft(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900" /></div> : null}
      <FieldSaveButton dirty={dirty} saveLabel={saveLabel} savingLabel={savingLabel} showWhenPristine={showSaveWhenPristine} placement={saveButtonPlacement} readOnly={effectiveReadOnly} editLabel={editLabel} onEdit={handleEdit} onPendingChange={onPendingChange} wrapperClassName={saveButtonWrapperClassName} buttonClassName={saveButtonClassName} buttonAriaLabel={saveButtonAriaLabel} editButtonAriaLabel={editButtonAriaLabel} />
    </form>
  );
}
