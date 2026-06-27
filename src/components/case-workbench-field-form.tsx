"use client";

import type { CSSProperties, ReactNode } from "react";
import { useState } from "react";
import { useFormStatus } from "react-dom";

type CaseWorkbenchFieldFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  caseId: string;
  fieldKey: string;
  returnNode?: string;
  className?: string;
  saveLabel: string;
  savingLabel: string;
  children: ReactNode;
};

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void | Promise<void>) => { finished: Promise<void> };
};

function getFieldViewTransitionName(fieldKey: string) {
  return `case-field-${fieldKey.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function FieldSaveButton({ dirty, saveLabel, savingLabel }: { dirty: boolean; saveLabel: string; savingLabel: string }) {
  const { pending } = useFormStatus();
  const visible = dirty || pending;

  return (
    <div className={`overflow-hidden transition-all duration-200 ${visible ? "mt-4 max-h-12 opacity-100" : "mt-0 max-h-0 opacity-0"}`}>
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-slate-950 px-4 py-2 text-xs font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
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
  className,
  saveLabel,
  savingLabel,
  children,
}: CaseWorkbenchFieldFormProps) {
  const [dirty, setDirty] = useState(false);
  const viewTransitionStyle = { viewTransitionName: getFieldViewTransitionName(fieldKey) } as CSSProperties;
  const submitAction = async (formData: FormData) => {
    setDirty(false);
    const transitionDocument = document as ViewTransitionDocument;
    if (!transitionDocument.startViewTransition) {
      await action(formData);
      return;
    }
    const startViewTransition = transitionDocument.startViewTransition.bind(transitionDocument);
    await startViewTransition(() => action(formData)).finished;
  };

  return (
    <form
      action={submitAction}
      onChange={() => setDirty(true)}
      onInput={() => setDirty(true)}
      className={className}
      style={viewTransitionStyle}
    >
      <input type="hidden" name="caseId" value={caseId} />
      <input type="hidden" name="presentFieldKeysJson" value={JSON.stringify([fieldKey])} />
      <input type="hidden" name="returnAnchor" value="case-main-editor" />
      {returnNode ? <input type="hidden" name="returnNode" value={returnNode} /> : null}
      {children}
      <FieldSaveButton dirty={dirty} saveLabel={saveLabel} savingLabel={savingLabel} />
    </form>
  );
}
