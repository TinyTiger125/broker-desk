"use client";

import { useState } from "react";
import {
  Button,
  DateInput,
  DisplayField,
  FieldLabel,
  IconButton,
  IssueField,
  MessageStrip,
  SectionHeader,
  SelectInput,
  StatusBadge,
  Surface,
  TextInput,
} from "@/components/ui-foundation";
import styles from "@/components/ui-foundation/ui-foundation.module.css";

export default function UiFoundationPreviewPage() {
  const [notice, setNotice] = useState("这是开发预览，不会读取案件、写入数据库或改变权限。");
  const [applicant, setApplicant] = useState("佐藤 健一（组件预览）");
  const [relationship, setRelationship] = useState("申请人");
  const [birthDate, setBirthDate] = useState("1986-04-12");

  return (
    <main className={styles.previewPage}>
      <header className={styles.previewHeader}>
        <p className={styles.previewKicker}>UI-GOV-002A · 开发预览</p>
        <h1 className={styles.previewTitle}>Broker Desk 基础组件预览</h1>
        <p className={styles.previewIntro}>
          本页只用于核对视觉 Token、键盘状态、异常表达和中日韩长文本。示例内容明确标记为预览，不代表真实案件，也不进入正式业务导航。
        </p>
        <MessageStrip tone="info" title="预览边界">
          {notice}
        </MessageStrip>
      </header>

      <div className={styles.previewSections}>
        <Surface as="section">
          <SectionHeader
            eyebrow="基础操作"
            title="Button / IconButton"
            description="按钮保持单一层级，触控尺寸至少 44px，焦点不依赖颜色单一表达。"
          />
          <div className={styles.stateGrid}>
            <div className={styles.stateCell}>
              <p className={styles.stateLabel}>默认 / 悬停</p>
              <div className={styles.previewRow}>
                <Button onClick={() => setNotice("主要操作已触发，当前仍停留在开发预览。")}>申请书预览</Button>
                <Button tone="secondary">查看问题</Button>
                <Button controlSize="touch">触控尺寸</Button>
              </div>
            </div>
            <div className={styles.stateCell}>
              <p className={styles.stateLabel}>按下</p>
              <Button tone="secondary" aria-pressed>问题已处理</Button>
            </div>
            <div className={styles.stateCell}>
              <p className={styles.stateLabel}>禁用 / 加载</p>
              <div className={styles.previewRow}>
                <Button disabled>无法下载</Button>
                <Button loading>生成申请书</Button>
              </div>
            </div>
            <div className={styles.stateCell}>
              <p className={styles.stateLabel}>图标按钮</p>
              <div className={styles.previewRow}>
                <IconButton label="编辑申请人字段">
                  <span className="material-symbols-outlined" aria-hidden="true">edit</span>
                </IconButton>
                <IconButton label="正在加载申请人字段" loading>
                  <span className="material-symbols-outlined" aria-hidden="true">sync</span>
                </IconButton>
              </div>
            </div>
          </div>
        </Surface>

        <Surface as="section">
          <SectionHeader
            eyebrow="案件信息"
            title="Status / Display / Issue"
            description="正常字段安静展示；缺失、冲突和输出风险获得明确语义。"
            action={<StatusBadge tone="warning">待处理 2 项</StatusBadge>}
          />
          <div className={styles.stateGrid}>
            <div className={styles.stateCell}>
              <p className={styles.stateLabel}>状态</p>
              <div className={styles.previewRow}>
                <StatusBadge>未设置</StatusBadge>
                <StatusBadge tone="info">处理中</StatusBadge>
                <StatusBadge tone="success">可输出</StatusBadge>
                <StatusBadge tone="warning">待补充</StatusBadge>
                <StatusBadge tone="danger">有问题</StatusBadge>
              </div>
            </div>
          </div>
          <dl className={styles.fieldGrid}>
            <DisplayField label="申请人姓名" value="佐藤 健一（样例）" meta="案件内最终值" />
            <DisplayField label="物件所在地" value="東京都新宿区西新宿二丁目8番1号" />
            <DisplayField label="连带保证人" />
            <IssueField
              label="出生日期"
              value="1986年4月12日 / 1986年4月21日"
              message="两份资料中的出生日期不同，请选择正确内容。"
              actionLabel="处理问题"
              onAction={() => setNotice("已打开出生日期异常示例；真实页面由案件流程决定如何处理。")}
            />
          </dl>
        </Surface>

        <Surface as="section">
          <SectionHeader
            eyebrow="反馈"
            title="MessageStrip / Surface"
            description="反馈说明发生了什么以及下一步，不把底层 AI 过程塞进正常页面。"
          />
          <div className={styles.stateGrid}>
            <MessageStrip tone="success" title="资料已保存">案件信息已更新，可以继续查看其他章节。</MessageStrip>
            <MessageStrip tone="warning" title="需要补充">申请书仍缺少必要的物件信息。</MessageStrip>
            <MessageStrip tone="danger" title="无法输出">模板渲染失败，请稍后重试或更换已安装模板。</MessageStrip>
          </div>
          <p className={styles.previewNote}>Surface 只负责承载层级，不自动添加重复的状态标签或业务流程。</p>
        </Surface>

        <Surface as="section">
          <SectionHeader
            eyebrow="字段编辑"
            title="TextInput / SelectInput / DateInput"
            description="输入控件统一焦点、错误和警告表达；长标签允许换行，不用固定宽度截断。"
          />
          <div className={styles.fieldGrid}>
            <TextInput label="申込人の氏名（日文长标签示例）" value={applicant} onChange={(event) => setApplicant(event.target.value)} required hint="这是组件预览中的本地状态。" />
            <SelectInput label="关系 / 관계" value={relationship} onChange={(event) => setRelationship(event.target.value)} warning="请确认该人员与申请人的业务关系。">
              <option value="申请人">申请人 / 申込人 / 신청인</option>
              <option value="借主">借主 / 借主 / 차주</option>
              <option value="连带保证人">连带保证人 / 連帯保証人 / 연대보증인</option>
            </SelectInput>
            <DateInput label="생년월일 / 出生日期" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} error="日期格式或资料内容需要重新确认。" />
            <div>
              <FieldLabel required>资料归属确认</FieldLabel>
              <p className={styles.previewNote}>同一案件中的资料归属必须由业务流程决定，基础组件不自行判断。</p>
            </div>
          </div>
        </Surface>
      </div>
    </main>
  );
}
