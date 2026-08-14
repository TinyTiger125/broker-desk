"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  Button,
  DateInput,
  DisplayField,
  IssueField,
  MessageStrip,
  SectionHeader,
  StatusBadge,
  Surface,
  TextInput,
} from "@/components/ui-foundation";
import styles from "./case-object-preview.module.css";

export type PreviewMode = "quick" | "overview";

type Field = {
  key: string;
  label: string;
  value?: string;
  issue?: string;
  required?: boolean;
  wide?: boolean;
};

type FieldGroup = {
  id: string;
  title: string;
  eyebrow: string;
  fields: Field[];
};

const groups: FieldGroup[] = [
  {
    id: "applicant",
    title: "申请人",
    eyebrow: "申込者・賃借人",
    fields: [
      { key: "applicant.name", label: "姓名", value: "永田 沙織", required: true },
      { key: "applicant.furigana", label: "姓名（假名）", value: "ナガタ サオリ" },
      { key: "applicant.birthDate", label: "出生日期", issue: "尚未填写", required: true },
      { key: "applicant.phone", label: "联系电话", value: "090-3344-6789" },
    ],
  },
  {
    id: "property",
    title: "物件",
    eyebrow: "物件基本・所在地",
    fields: [
      { key: "property.name", label: "物件名称", value: "勝どきリバーサイド" },
      { key: "property.roomNumber", label: "房间号", value: "1503" },
      { key: "property.address", label: "地址", value: "東京都中央区勝どき4-8-2", wide: true },
      { key: "property.postalCode", label: "邮政编码", value: "104-0054" },
    ],
  },
  {
    id: "contract",
    title: "合同条件",
    eyebrow: "月額費用・契約期間",
    fields: [
      { key: "lease.rent", label: "月租金", value: "198,000 円" },
      { key: "lease.commonFee", label: "共益费", value: "18,000 円" },
      { key: "lease.monthlyRentTotal", label: "每月合计", value: "216,000 円", required: true },
      { key: "lease.moveInDate", label: "入住日期", issue: "尚未填写" },
    ],
  },
  {
    id: "employment",
    title: "工作与收入",
    eyebrow: "勤務先・収入",
    fields: [
      { key: "applicant.employerName", label: "工作单位", value: "新宿医療法人" },
      { key: "applicant.annualIncome", label: "年收入", value: "430 万円" },
      { key: "applicant.employerPhone", label: "工作单位电话", issue: "尚未填写" },
    ],
  },
  {
    id: "related",
    title: "相关人员",
    eyebrow: "緊急連絡先・連帯保証人",
    fields: [
      { key: "emergencyContact.name", label: "紧急联系人", issue: "尚未填写" },
      { key: "emergencyContact.relationship", label: "与申请人关系", issue: "尚未填写" },
      { key: "guarantor.name", label: "连带保证人", issue: "尚未填写" },
    ],
  },
];

const queueItems = [
  { key: "applicant.birthDate", label: "出生日期", message: "尚未填写" },
  { key: "lease.moveInDate", label: "入住日期", message: "尚未填写" },
  { key: "applicant.employerPhone", label: "工作单位电话", message: "尚未填写" },
  { key: "emergencyContact.name", label: "紧急联系人", message: "尚未填写" },
];

const anchorLabels = ["申请人", "物件", "合同条件", "工作与收入", "相关人员"];

function ModeButton({ mode, active, children, onClick }: { mode: PreviewMode; active: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <Button
      tone={active ? "primary" : "quiet"}
      controlSize="compact"
      aria-pressed={active}
      data-mode={mode}
      className={styles.modeButton}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function FieldDisplay({ field, onEdit }: { field: Field; onEdit: (field: Field) => void }) {
  if (field.issue) {
    return (
      <IssueField
        label={field.label}
        message={field.issue}
        actionLabel="处理问题"
        onAction={() => onEdit(field)}
      />
    );
  }

  return (
    <div className={styles.fieldRow}>
      <DisplayField label={field.label} value={field.value} />
      <Button tone="quiet" controlSize="compact" className={styles.fieldAction} onClick={() => onEdit(field)}>
        编辑
      </Button>
    </div>
  );
}

function CaseHeader({ mode, onModeChange }: { mode: PreviewMode; onModeChange: (mode: PreviewMode) => void }) {
  return (
    <>
      <div className={styles.prototypeNotice} role="note">
        <span className={styles.prototypeMarker} aria-hidden="true" />
        <span>UI-GOV-003 Checkpoint A · 非正式视觉合同 · 只读演示数据</span>
      </div>

      <header className={styles.caseHeader}>
        <div className={styles.headerIdentity}>
          <div className={styles.caseHeaderMarker} aria-hidden="true">BD</div>
          <div className={styles.headerCopy}>
            <p className={styles.headerEyebrow}>案件工作台 / 保证会社申请</p>
            <h1>勝どきリバーサイド 1503 保証会社申込</h1>
            <p className={styles.headerSubline}>永田 沙織 · 賃貸申込 · 只读演示数据</p>
          </div>
        </div>
        <div className={styles.headerActions}>
          <Button tone="secondary" controlSize="compact">申请书预览</Button>
          <Button tone="primary" controlSize="compact">下载申请书</Button>
          <Button tone="quiet" controlSize="compact" className={styles.mobileMoreAction}>更多</Button>
        </div>

        <div className={styles.headerMeta}>
          <div className={styles.modeSwitch} aria-label="案件视图切换">
            <ModeButton mode="quick" active={mode === "quick"} onClick={() => onModeChange("quick")}>快速补全</ModeButton>
            <ModeButton mode="overview" active={mode === "overview"} onClick={() => onModeChange("overview")}>案件总览</ModeButton>
          </div>
          <div className={styles.headerStatus}>
            <StatusBadge tone="warning">待处理 4 项</StatusBadge>
            <span>完成后可以下载申请书</span>
          </div>
        </div>
      </header>
    </>
  );
}

function EditPanel({ field, onClose }: { field: Field; onClose: () => void }) {
  const isDate = field.key.endsWith("birthDate") || field.key.endsWith("moveInDate");
  return (
    <Surface as="section" className={styles.editPanel} aria-label={`${field.label}编辑面板`}>
      <SectionHeader
        eyebrow="字段编辑"
        title={field.label}
        description="这是 Checkpoint A 的编辑面板视觉形态，不执行保存。"
      />
      {isDate ? (
        <DateInput label={field.label} value="" onChange={() => undefined} warning="需要补充案件信息。" />
      ) : (
        <TextInput label={field.label} value={field.value ?? ""} onChange={() => undefined} warning={field.issue ? "当前字段需要处理。" : undefined} />
      )}
      <MessageStrip tone="info" title="保存反馈">
        保存后应留在当前章节，并把焦点还给原字段。
      </MessageStrip>
      <div className={styles.panelActions}>
        <Button tone="quiet" controlSize="compact" onClick={onClose}>取消</Button>
        <Button tone="primary" controlSize="compact" onClick={onClose}>保存</Button>
      </div>
    </Surface>
  );
}

function StatusSummary() {
  return (
    <div className={styles.statusSummary}>
      <span className={styles.statusSummaryLabel}>输出状态</span>
      <span className={styles.statusSummaryText}>可以预览</span>
      <Button tone="quiet" controlSize="compact">查看问题</Button>
    </div>
  );
}

function QuickCompletion({ onEdit }: { onEdit: (field: Field) => void }) {
  return (
    <div className={styles.quickLayout}>
      <Surface as="section" className={styles.queuePanel}>
        <SectionHeader eyebrow="现在处理什么" title="待处理" action={<StatusBadge tone="warning">4</StatusBadge>} />
        <ol className={styles.queueList}>
          {queueItems.map((item, index) => (
            <li key={item.key} className={styles.queueItem}>
              <button type="button" className={styles.queueButton} onClick={() => onEdit({ key: item.key, label: item.label, issue: item.message })}>
                <span className={styles.queueIndex}>{String(index + 1).padStart(2, "0")}</span>
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.message}</small>
                </span>
              </button>
            </li>
          ))}
        </ol>
        <p className={styles.queueFooter}>正常填写的信息不会进入默认队列。</p>
      </Surface>

      <Surface as="section" className={styles.quickMain}>
        <SectionHeader eyebrow="当前处理组 · 申请人" title="快速补全" description="连续处理缺失信息，完成一项后继续下一项。" />
        <div className={styles.quickFields}>
          <FieldDisplay field={groups[0].fields[0]} onEdit={onEdit} />
          <FieldDisplay field={groups[0].fields[1]} onEdit={onEdit} />
          <FieldDisplay field={groups[0].fields[2]} onEdit={onEdit} />
          <FieldDisplay field={groups[0].fields[3]} onEdit={onEdit} />
        </div>
        <MessageStrip tone="warning" title="需要补充">
          出生日期尚未填写，申请书输出前需要处理。
        </MessageStrip>
        <div className={styles.nextActionRow}>
          <span>当前进度 · 申请人 3 / 7 项已填写</span>
          <Button tone="secondary" controlSize="compact" onClick={() => onEdit(groups[0].fields[2])}>处理下一项</Button>
        </div>
      </Surface>
    </div>
  );
}

function CaseOverview({ onEdit }: { onEdit: (field: Field) => void }) {
  return (
    <div className={styles.overviewBody}>
      <nav className={styles.anchorBar} aria-label="案件章节">
        <span className={styles.anchorLabel}>案件章节</span>
        <div className={styles.anchorScroller}>
          {anchorLabels.map((label, index) => (
            <a key={label} className={index === 0 ? styles.anchorActive : styles.anchorLink} href={`#preview-${groups[index].id}`}>
              {label}
            </a>
          ))}
        </div>
        <Button tone="quiet" controlSize="compact">更多</Button>
      </nav>
      <div className={styles.overviewGrid}>
        {groups.map((group) => (
          <Surface as="section" key={group.id} id={`preview-${group.id}`} className={`${styles.groupCard} ${group.id === "property" ? styles.groupCardWide : ""}`}>
            <SectionHeader eyebrow={group.eyebrow} title={group.title} action={<Button tone="quiet" controlSize="compact">编辑本组</Button>} />
            <dl className={styles.groupFields}>
              {group.fields.map((field) => (
                <div key={field.key} className={field.wide ? styles.fieldWide : undefined}>
                  <FieldDisplay field={field} onEdit={onEdit} />
                </div>
              ))}
            </dl>
          </Surface>
        ))}
      </div>
    </div>
  );
}

export function CaseObjectPreview({ initialMode }: { initialMode: PreviewMode }) {
  const [mode, setMode] = useState<PreviewMode>(initialMode);
  const [activeField, setActiveField] = useState<Field | null>(initialMode === "quick" ? groups[0].fields[2] : null);

  useEffect(() => {
    const previewShellClass = "uiGov003PreviewMobileShell";
    const previewMobileHeaderClass = styles.previewMobileHeader;
    const mediaQuery = window.matchMedia("(max-width: 47.9375rem)");
    const mobileHeader = document.querySelector<HTMLElement>(".app-mobile-header");
    const syncPreviewShell = () => {
      document.documentElement.classList.toggle(previewShellClass, mediaQuery.matches);
      mobileHeader?.classList.toggle(previewMobileHeaderClass, mediaQuery.matches);
    };

    syncPreviewShell();
    mediaQuery.addEventListener("change", syncPreviewShell);
    return () => {
      mediaQuery.removeEventListener("change", syncPreviewShell);
      document.documentElement.classList.remove(previewShellClass);
      mobileHeader?.classList.remove(previewMobileHeaderClass);
    };
  }, []);

  function changeMode(nextMode: PreviewMode) {
    setMode(nextMode);
    setActiveField(nextMode === "quick" ? groups[0].fields[2] : null);
  }

  return (
    <main className={styles.page}>
      <CaseHeader mode={mode} onModeChange={changeMode} />
      <StatusSummary />
      {mode === "quick" ? <QuickCompletion onEdit={setActiveField} /> : <CaseOverview onEdit={setActiveField} />}
      {activeField ? <EditPanel field={activeField} onClose={() => setActiveField(null)} /> : null}
    </main>
  );
}
