"use client";

import { CaseFieldInput, CaseFieldState, type CaseFieldInputSpec } from "@/components/case-overview";
import { CaseWorkbenchFieldForm } from "@/components/case-workbench-field-form";
import type { Locale } from "@/lib/locale";

type FieldAction = (formData: FormData) => void | Promise<void>;

type ObjectImportBinding = {
  targetId: string;
  fieldId: string;
  importJobId: string;
  expectedVersion: string;
  observedVersion?: string;
  expectedCandidateValue: string;
  candidateValue: string;
  status: string;
  sourceEvidence?: string;
};

export type CaseWorkbenchFieldRowProps = {
  rowKey: string;
  action: FieldAction;
  refreshAction?: FieldAction;
  caseId: string;
  fieldKey: string;
  candidateValue: string;
  returnNode: string;
  label: string;
  path: string;
  inputLabel: string;
  inputSpec: CaseFieldInputSpec;
  locale: Locale;
  tone: "default" | "attention";
  issueLabel?: string;
  selected: boolean;
  serverConfirmed: boolean;
  required: boolean;
  editLabel: string;
  editButtonAriaLabel: string;
  saveLabel: string;
  savingLabel: string;
  saveButtonAriaLabel: string;
  objectImportBinding?: ObjectImportBinding;
  objectImportMessage?: string;
  objectImportReviewJson?: string;
  canRefreshObjectImport: boolean;
};

export function CaseWorkbenchFieldRow({
  rowKey,
  action,
  refreshAction,
  caseId,
  fieldKey,
  candidateValue,
  returnNode,
  label,
  path,
  inputLabel,
  inputSpec,
  locale,
  tone,
  issueLabel,
  selected,
  serverConfirmed,
  required,
  editLabel,
  editButtonAriaLabel,
  saveLabel,
  savingLabel,
  saveButtonAriaLabel,
  objectImportBinding,
  objectImportMessage,
  objectImportReviewJson,
  canRefreshObjectImport,
}: CaseWorkbenchFieldRowProps) {
  return (
    <div
      data-case-server-confirmed={serverConfirmed ? "true" : "false"}
      className={`grid grid-cols-[4rem_minmax(0,1fr)_minmax(0,1.35fr)_auto] items-start gap-2 px-3 py-3 transition sm:grid-cols-[5.5rem_minmax(0,1fr)_minmax(0,1.35fr)_auto] sm:items-start sm:gap-3 sm:px-5 ${selected ? "bg-blue-50 ring-1 ring-inset ring-blue-700" : "hover:bg-slate-50"}`}
    >
      <CaseWorkbenchFieldForm
        key={rowKey}
        action={action}
        caseId={caseId}
        fieldKey={fieldKey}
        initialValue={candidateValue}
        returnNode={returnNode}
        returnField={fieldKey}
        returnAnchor="case-main-editor"
        returnView="quick"
        showSaveWhenPristine
        saveButtonPlacement="inline"
        readOnly={serverConfirmed}
        editLabel={editLabel}
        editButtonAriaLabel={editButtonAriaLabel}
        saveLabel={saveLabel}
        savingLabel={savingLabel}
        saveButtonAriaLabel={saveButtonAriaLabel}
        saveButtonWrapperClassName="col-start-4 row-start-1 max-h-12 self-start opacity-100"
        saveButtonClassName="h-11 min-h-11 min-w-[3.5rem] rounded-md px-3 py-2 text-xs font-black"
        className="contents"
      >
        {(readOnly) => (
          <>
            <span>
              <CaseFieldState issueLabel={issueLabel} />
            </span>
            <span className="min-w-0">
              <span className="block break-words text-sm font-black text-slate-950">
                {label}
                {required ? <span className="ml-1 text-slate-400" aria-label={locale === "zh" ? "必填" : locale === "ko" ? "필수" : "必須"}>*</span> : null}
              </span>
              <span className="mt-1 block break-words text-[11px] font-semibold text-slate-500">{path}</span>
            </span>
            <span className="min-w-0">
              <CaseFieldInput
                name={`field:${fieldKey}`}
                value={candidateValue}
                label={inputLabel}
                inputSpec={inputSpec}
                locale={locale}
                required={required}
                readOnly={readOnly}
                tone={tone}
                controlClassName={inputSpec.kind === "textarea" ? undefined : "h-11"}
              />
              {objectImportBinding ? <p className="mt-1 text-[11px] font-semibold text-amber-700">{objectImportMessage}</p> : null}
              {objectImportReviewJson ? <input type="hidden" name="objectImportReviewJson" value={objectImportReviewJson} readOnly /> : null}
            </span>
          </>
        )}
      </CaseWorkbenchFieldForm>
      {canRefreshObjectImport && objectImportBinding && refreshAction ? (
        <form action={refreshAction} className="col-start-3 row-start-2 mt-1 sm:col-start-3">
          <input type="hidden" name="importTargetId" value={objectImportBinding.targetId} />
          <input type="hidden" name="fieldId" value={objectImportBinding.fieldId} />
          <input type="hidden" name="importJobId" value={objectImportBinding.importJobId} />
          <input type="hidden" name="expectedVersion" value={objectImportBinding.expectedVersion} />
          <input type="hidden" name="observedVersion" value={objectImportBinding.observedVersion} />
          <input type="hidden" name="expectedCandidateValue" value={objectImportBinding.expectedCandidateValue} />
          <input type="hidden" name="field" value={fieldKey} />
          <input type="hidden" name="returnNode" value={returnNode} />
          <input type="hidden" name="returnField" value={fieldKey} />
          <input type="hidden" name="returnView" value="quick" />
          <input type="hidden" name="returnAnchor" value="case-main-editor" />
          <button type="submit" className="text-xs font-bold text-amber-800 underline underline-offset-2">
            {locale === "zh" ? "重新核对最新资料" : locale === "ko" ? "최신 자료 다시 확인" : "最新の資料を再確認"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
