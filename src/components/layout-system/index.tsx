import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import styles from "./layout-system.module.css";

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export type ResponsiveFormLayoutProps = HTMLAttributes<HTMLElement> & {
  children: ReactNode;
  editorOpen?: boolean;
};

export function ResponsiveFormLayout({ children, editorOpen = false, className, ...props }: ResponsiveFormLayoutProps) {
  return (
    <section {...props} className={cx(styles.formLayout, className)} data-editor-open={editorOpen || undefined}>
      {children}
    </section>
  );
}

export function ResponsiveFormRow({ children, className, ...props }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return <div {...props} className={cx(styles.formRow, className)}>{children}</div>;
}

export type ResponsiveFormFieldProps = HTMLAttributes<HTMLElement> & {
  children: ReactNode;
  wide?: boolean;
  selected?: boolean;
};

export function ResponsiveFormField({ children, wide = false, selected = false, className, ...props }: ResponsiveFormFieldProps) {
  return (
    <article {...props} className={cx(styles.formField, wide && styles.formFieldWide, selected && styles.formFieldSelected, className)} data-selected={selected || undefined}>
      {children}
    </article>
  );
}

export type ResponsiveFormEditorSlotProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

export const ResponsiveFormEditorSlot = forwardRef<HTMLDivElement, ResponsiveFormEditorSlotProps>(function ResponsiveFormEditorSlot(
  { children, className, ...props },
  ref,
) {
  return (
    <div {...props} ref={ref} role="region" className={cx(styles.editorSlot, className)}>
      {children}
    </div>
  );
});
