import Link from "next/link";
import { forwardRef, type FormHTMLAttributes, type HTMLAttributes, type MouseEventHandler, type ReactNode } from "react";
import styles from "./layout-system.module.css";

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export type PageFrameProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

/** Page-level composition only. Authentication, tenant and domain data remain outside this layer. */
export function PageFrame({ children, className, ...props }: PageFrameProps) {
  return <div {...props} className={cx(styles.pageFrame, className)}>{children}</div>;
}

export type ObjectPageShellProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  header: ReactNode;
  feedback?: ReactNode;
  state?: ReactNode;
  navigation?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
};

/** A structural object page composition; state and actions remain with the caller. */
export function ObjectPageShell({ header, feedback, state, navigation, children, footer, className, ...props }: ObjectPageShellProps) {
  return (
    <div {...props} className={cx(styles.objectPageShell, className)} data-object-page-shell="true">
      <div className={styles.objectPageSlot} data-object-page-slot="header">{header}</div>
      {feedback ? <div className={styles.objectPageSlot} data-object-page-slot="feedback">{feedback}</div> : null}
      {state ? <div className={styles.objectPageSlot} data-object-page-slot="state">{state}</div> : null}
      {navigation ? <div className={styles.objectPageSlot} data-object-page-slot="navigation">{navigation}</div> : null}
      <div className={styles.objectPageSlot} data-object-page-slot="children">{children}</div>
      {footer ? <div className={styles.objectPageSlot} data-object-page-slot="footer">{footer}</div> : null}
    </div>
  );
}

export type PageHeaderProps = HTMLAttributes<HTMLElement> & {
  title: ReactNode;
  description?: ReactNode;
  backHref?: string;
  backLabel?: ReactNode;
  onBackClick?: MouseEventHandler<HTMLAnchorElement>;
  children?: ReactNode;
};

export function PageHeader({ title, description, backHref, backLabel, onBackClick, children, className, ...props }: PageHeaderProps) {
  return (
    <header {...props} className={cx(styles.pageHeader, className)}>
      <div className={styles.pageHeaderCopy}>
        <h1 className={styles.pageTitle}>{title}</h1>
        {description ? <p className={styles.pageDescription}>{description}</p> : null}
      </div>
      <div className={styles.pageHeaderActions}>
        {children ?? (backHref && backLabel ? <Link href={backHref} onClick={onBackClick} className={styles.backLink}>{backLabel}</Link> : null)}
      </div>
    </header>
  );
}

export type ListReportShellProps = Omit<HTMLAttributes<HTMLElement>, "children" | "results"> & {
  scope?: ReactNode;
  filters?: ReactNode;
  summary?: ReactNode;
  results?: ReactNode;
  pagination?: ReactNode;
  state?: ReactNode;
};

/** A slot-only list report composition; query, data, permissions and row behavior stay with the page. */
export function ListReportShell({ scope, filters, summary, results, pagination, state, className, ...props }: ListReportShellProps) {
  return (
    <section {...props} className={cx(styles.listReportShell, className)} data-list-report-shell="true">
      {scope ? <div className={cx(styles.listReportSlot, styles.listReportScope)} data-list-report-slot="scope">{scope}</div> : null}
      {filters ? <div className={cx(styles.listReportSlot, styles.listReportFilters)} data-list-report-slot="filters">{filters}</div> : null}
      {summary ? <div className={cx(styles.listReportSlot, styles.listReportSummary)} data-list-report-slot="summary">{summary}</div> : null}
      {results ? <div className={cx(styles.listReportSlot, styles.listReportResults)} data-list-report-slot="results">{results}</div> : null}
      {pagination ? <div className={cx(styles.listReportSlot, styles.listReportPagination)} data-list-report-slot="pagination">{pagination}</div> : null}
      {state ? <div className={cx(styles.listReportSlot, styles.listReportState)} data-list-report-slot="state">{state}</div> : null}
    </section>
  );
}

export type ResponsiveFormShellProps = FormHTMLAttributes<HTMLFormElement> & {
  children: ReactNode;
};

export function ResponsiveFormShell({ children, className, ...props }: ResponsiveFormShellProps) {
  return <form {...props} className={cx(styles.responsiveFormShell, className)}>{children}</form>;
}

export type FormSectionProps = HTMLAttributes<HTMLElement> & {
  children: ReactNode;
};

/** A page-level surface for one coherent form section; it owns no domain state. */
export function FormSection({ children, className, ...props }: FormSectionProps) {
  return <section {...props} className={cx(styles.formSection, className)}>{children}</section>;
}

export type ActionBarProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  mobileFixed?: boolean;
};

export function ActionBar({ children, mobileFixed = false, className, ...props }: ActionBarProps) {
  return <div {...props} className={cx(styles.actionBar, className)} data-mobile-fixed={mobileFixed || undefined}>{children}</div>;
}

export type StateSurfaceProps = HTMLAttributes<HTMLElement> & {
  children?: ReactNode;
  tone?: "empty" | "loading" | "error" | "permission";
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
};

export function StateSurface({ children, tone = "empty", title, description, action, className, ...props }: StateSurfaceProps) {
  return (
    <section {...props} aria-busy={tone === "loading" || undefined} data-state-tone={tone} className={cx(styles.stateSurface, styles[`stateSurface${tone[0].toUpperCase()}${tone.slice(1)}`], className)}>
      {title ? <h3 className={styles.stateSurfaceTitle}>{title}</h3> : null}
      {description ? <p className={styles.stateSurfaceDescription}>{description}</p> : null}
      {children}
      {action ? <div className={styles.stateSurfaceAction}>{action}</div> : null}
    </section>
  );
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
