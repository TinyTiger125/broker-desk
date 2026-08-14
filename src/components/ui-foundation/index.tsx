"use client";

import { useId, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import styles from "./ui-foundation.module.css";

type Tone = "primary" | "secondary" | "quiet" | "warning" | "danger";
type ControlSize = "compact" | "regular" | "touch";

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: Tone;
  controlSize?: ControlSize;
  loading?: boolean;
};

export function Button({
  tone = "primary",
  controlSize = "regular",
  loading = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={props.type ?? "button"}
      className={cx(styles.button, styles[`buttonTone${tone[0].toUpperCase()}${tone.slice(1)}`], styles[`controlSize${controlSize[0].toUpperCase()}${controlSize.slice(1)}`], className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading ? <span className={styles.spinner} aria-hidden="true" /> : null}
      <span className={styles.buttonLabel}>{children}</span>
    </button>
  );
}

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label"> & {
  label: string;
  children: ReactNode;
  tone?: Exclude<Tone, "danger">;
  controlSize?: ControlSize;
  loading?: boolean;
};

export function IconButton({ label, tone = "quiet", controlSize = "touch", loading = false, disabled, className, children, ...props }: IconButtonProps) {
  return (
    <button
      {...props}
      type={props.type ?? "button"}
      aria-label={label}
      title={label}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(styles.iconButton, styles[`buttonTone${tone[0].toUpperCase()}${tone.slice(1)}`], styles[`controlSize${controlSize[0].toUpperCase()}${controlSize.slice(1)}`], className)}
    >
      {loading ? <span className={styles.spinner} aria-hidden="true" /> : children}
    </button>
  );
}

export function StatusBadge({ tone = "neutral", children }: { tone?: "neutral" | "info" | "success" | "warning" | "danger"; children: ReactNode }) {
  return <span className={cx(styles.statusBadge, styles[`statusTone${tone[0].toUpperCase()}${tone.slice(1)}`])}>{children}</span>;
}

export function FieldLabel({ htmlFor, required = false, children }: { htmlFor?: string; required?: boolean; children: ReactNode }) {
  return (
    <label className={styles.fieldLabel} htmlFor={htmlFor}>
      <span>{children}</span>
      {required ? <span className={styles.requiredMark} aria-hidden="true">*</span> : null}
    </label>
  );
}

export function DisplayField({ label, value, meta, emptyLabel = "尚未填写" }: { label: ReactNode; value?: ReactNode; meta?: ReactNode; emptyLabel?: string }) {
  const hasValue = value !== undefined && value !== null && value !== "";
  return (
    <div className={styles.displayField}>
      <dt className={styles.displayLabel}>{label}</dt>
      <dd className={cx(styles.displayValue, !hasValue && styles.displayValueEmpty)}>{hasValue ? value : emptyLabel}</dd>
      {meta ? <div className={styles.displayMeta}>{meta}</div> : null}
    </div>
  );
}

export function IssueField({
  label,
  value,
  message,
  tone = "warning",
  actionLabel,
  onAction,
}: {
  label: ReactNode;
  value?: ReactNode;
  message: ReactNode;
  tone?: "warning" | "danger";
  actionLabel?: string;
  onAction?: () => void;
}) {
  const hasValue = value !== undefined && value !== null && value !== "";
  return (
    <div className={cx(styles.issueField, tone === "danger" ? styles.issueDanger : styles.issueWarning)}>
      <div className={styles.issueFieldBody}>
        <dt className={styles.displayLabel}>{label}</dt>
        <dd className={styles.displayValue}>{hasValue ? value : "尚未填写"}</dd>
        <p className={styles.issueMessage}>{message}</p>
      </div>
      {actionLabel && onAction ? <Button tone="quiet" controlSize="compact" onClick={onAction}>{actionLabel}</Button> : null}
    </div>
  );
}

export function SectionHeader({ eyebrow, title, description, action, level = "h2" }: { eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; action?: ReactNode; level?: "h2" | "h3" }) {
  const Heading = level;
  return (
    <header className={styles.sectionHeader}>
      <div className={styles.sectionHeading}>
        {eyebrow ? <p className={styles.sectionEyebrow}>{eyebrow}</p> : null}
        <Heading className={styles.sectionTitle}>{title}</Heading>
        {description ? <p className={styles.sectionDescription}>{description}</p> : null}
      </div>
      {action ? <div className={styles.sectionAction}>{action}</div> : null}
    </header>
  );
}

export function Surface({ as = "div", tone = "default", className, children, ...props }: HTMLAttributes<HTMLDivElement> & { as?: "div" | "section" | "article"; tone?: "default" | "muted" | "issue" }) {
  const Element = as;
  return <Element {...props} className={cx(styles.surface, styles[`surfaceTone${tone[0].toUpperCase()}${tone.slice(1)}`], className)}>{children}</Element>;
}

export function MessageStrip({ tone = "info", title, children }: { tone?: "info" | "success" | "warning" | "danger"; title?: ReactNode; children: ReactNode }) {
  return (
    <div className={cx(styles.messageStrip, styles[`messageTone${tone[0].toUpperCase()}${tone.slice(1)}`])} role={tone === "danger" ? "alert" : "status"}>
      <span className={styles.messageMarker} aria-hidden="true" />
      <div className={styles.messageContent}>
        {title ? <p className={styles.messageTitle}>{title}</p> : null}
        <div className={styles.messageBody}>{children}</div>
      </div>
    </div>
  );
}

type FieldMeta = {
  label: string;
  hint?: ReactNode;
  error?: string;
  warning?: string;
  id?: string;
  required?: boolean;
};

function useFieldMeta({ id, label, hint, error, warning }: FieldMeta) {
  const generatedId = useId().replace(/:/g, "");
  const inputId = id ?? `bd-field-${generatedId}`;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const warningId = `${inputId}-warning`;
  const describedBy = [hint && hintId, error && errorId, !error && warning && warningId].filter(Boolean).join(" ") || undefined;
  return { inputId, hintId, errorId, warningId, describedBy, label };
}

function FieldMessages({ hint, error, warning, hintId, errorId, warningId }: Pick<FieldMeta, "hint" | "error" | "warning"> & { hintId: string; errorId: string; warningId: string }) {
  return (
    <>
      {error ? <p className={styles.fieldError} id={errorId}>{error}</p> : null}
      {!error && warning ? <p className={styles.fieldWarning} id={warningId}>{warning}</p> : null}
      {hint ? <p className={styles.fieldHint} id={hintId}>{hint}</p> : null}
    </>
  );
}

export type TextInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "className"> & FieldMeta & { className?: string };

export function TextInput({ label, hint, error, warning, id, required, className, ...props }: TextInputProps) {
  const meta = useFieldMeta({ id, label, hint, error, warning, required });
  return (
    <div className={cx(styles.formField, className)}>
      <FieldLabel htmlFor={meta.inputId} required={required}>{label}</FieldLabel>
      <input {...props} id={meta.inputId} required={required} className={cx(styles.input, error ? styles.inputError : warning ? styles.inputWarning : undefined)} aria-invalid={Boolean(error) || undefined} aria-describedby={meta.describedBy} />
      <FieldMessages hint={hint} error={error} warning={warning} hintId={meta.hintId} errorId={meta.errorId} warningId={meta.warningId} />
    </div>
  );
}

export type SelectInputProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "id" | "className"> & FieldMeta & { className?: string };

export function SelectInput({ label, hint, error, warning, id, required, className, children, ...props }: SelectInputProps) {
  const meta = useFieldMeta({ id, label, hint, error, warning, required });
  return (
    <div className={cx(styles.formField, className)}>
      <FieldLabel htmlFor={meta.inputId} required={required}>{label}</FieldLabel>
      <select {...props} id={meta.inputId} required={required} className={cx(styles.input, styles.select, error ? styles.inputError : warning ? styles.inputWarning : undefined)} aria-invalid={Boolean(error) || undefined} aria-describedby={meta.describedBy}>{children}</select>
      <FieldMessages hint={hint} error={error} warning={warning} hintId={meta.hintId} errorId={meta.errorId} warningId={meta.warningId} />
    </div>
  );
}

export type DateInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "className" | "type"> & FieldMeta & { className?: string };

export function DateInput({ label, hint, error, warning, id, required, className, ...props }: DateInputProps) {
  const meta = useFieldMeta({ id, label, hint, error, warning, required });
  return (
    <div className={cx(styles.formField, className)}>
      <FieldLabel htmlFor={meta.inputId} required={required}>{label}</FieldLabel>
      <input {...props} id={meta.inputId} required={required} type="date" className={cx(styles.input, error ? styles.inputError : warning ? styles.inputWarning : undefined)} aria-invalid={Boolean(error) || undefined} aria-describedby={meta.describedBy} />
      <FieldMessages hint={hint} error={error} warning={warning} hintId={meta.hintId} errorId={meta.errorId} warningId={meta.warningId} />
    </div>
  );
}
