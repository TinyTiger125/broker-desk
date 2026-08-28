import type { Locale } from "@/lib/locale";

export type HomeResumableCase = {
  id: string;
  title: string;
  status: string;
  updatedAt: Date;
  sourceImportJobIds: string[];
};

export type HomeResumableImportJob = {
  id: string;
  title: string;
  sourceType: "excel" | "pdf" | "scan" | "manual";
  status: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
};

export type HomeResumableWorkItem = {
  id: string;
  title: string;
  reason: string;
  href: string;
  updatedAt: Date;
};

export function buildHomeResumableWork(input: {
  locale: Locale;
  query?: string;
  cases: HomeResumableCase[];
  importJobs: HomeResumableImportJob[];
}): HomeResumableWorkItem[] {
  const caseReason = input.locale === "zh" ? "案件尚未检查完成" : input.locale === "ko" ? "안건 검토가 완료되지 않음" : "案件の確認が未完了";
  const jobReason = (status: string) => {
    if (status === "queued") return input.locale === "zh" ? "资料正在排队" : input.locale === "ko" ? "자료가 대기 중" : "資料は待機中";
    if (status === "processing") return input.locale === "zh" ? "资料正在读取" : input.locale === "ko" ? "자료를 읽는 중" : "資料を読取中";
    if (status === "mapped") return input.locale === "zh" ? "读取结果等待确认" : input.locale === "ko" ? "읽기 결과 확인 대기" : "読取結果の確認待ち";
    return input.locale === "zh" ? "读取失败，可继续恢复" : input.locale === "ko" ? "읽기 실패, 다시 시작 가능" : "読取失敗・再開可能";
  };
  const caseItems = input.cases
    .filter((item) => item.status === "draft")
    .map((item) => ({
      id: `case:${item.id}`,
      title: item.title,
      reason: caseReason,
      href: `/cases/${encodeURIComponent(item.id)}`,
      updatedAt: item.updatedAt,
    }));
  const caseByJobId = new Map(input.cases.flatMap((item) => item.sourceImportJobIds.map((jobId) => [jobId, item.id] as const)));
  const jobItems = input.importJobs
    .filter((item) => item.status === "queued" || item.status === "processing" || item.status === "mapped" || item.status === "failed")
    .map((item) => {
      let kind: string | undefined;
      if (item.notes) {
        try {
          const firstLine = item.notes.trim().split(/\r?\n/, 1)[0] || item.notes;
          kind = (JSON.parse(firstLine) as { kind?: string }).kind;
        } catch {
          kind = undefined;
        }
      }
      const id = encodeURIComponent(item.id);
      const inputExtraction = kind === "input_file_extraction" || kind === "identity_import_source";
      const modernExcel = kind === "property_row_import" || inputExtraction;
      const batchMapping = item.sourceType === "excel" && !inputExtraction && item.status !== "queued" && item.status !== "processing";
      const linkedCaseId = caseByJobId.get(item.id);
      const href = modernExcel || (item.sourceType === "excel" && (item.status === "queued" || item.status === "processing" || item.status === "failed"))
        ? `/import-center?xlsxJob=${id}#source-upload`
        : batchMapping
          ? `/import-center?job=${id}&advanced=1#job-mapping`
          : linkedCaseId
            ? `/cases/${encodeURIComponent(linkedCaseId)}#case-main-editor`
            : `/import-center?job=${id}#source-review-summary`;
      return {
        id: `source:${item.id}`,
        title: item.title,
        reason: jobReason(item.status),
        href,
        updatedAt: item.updatedAt,
      };
    });
  const query = input.query?.trim().toLocaleLowerCase() ?? "";
  return [...caseItems, ...jobItems]
    .filter((item) => item.updatedAt instanceof Date && Number.isFinite(item.updatedAt.getTime()))
    .filter((item) => !query || `${item.title} ${item.reason}`.toLocaleLowerCase().includes(query))
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, 5);
}
