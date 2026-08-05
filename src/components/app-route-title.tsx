"use client";

import { usePathname, useSearchParams } from "next/navigation";
import type { Locale } from "@/lib/locale";

const labels = {
  zh: {
    home: "工作台",
    import: "录入资料",
    organize: "整理信息",
    output: "输出文件",
    case: "案件资料",
    party: "主体资料",
    property: "物件资料",
    unassigned: "待归属资料",
    relation: "关系图",
    team: "团队成员",
    required: "必填项目",
    documentHeader: "文书抬头",
    settings: "工作区设置",
  },
  ja: {
    home: "ホーム",
    import: "情報入力",
    organize: "情報整理",
    output: "文書出力",
    case: "案件資料",
    party: "主体資料",
    property: "物件資料",
    unassigned: "未分類資料",
    relation: "関係図",
    team: "チーム",
    required: "必須項目",
    documentHeader: "書類情報",
    settings: "設定",
  },
  ko: {
    home: "작업대",
    import: "자료 입력",
    organize: "정보 정리",
    output: "문서 출력",
    case: "안건 자료",
    party: "주체 자료",
    property: "물건 자료",
    unassigned: "미분류 자료",
    relation: "관계도",
    team: "팀",
    required: "필수 항목",
    documentHeader: "문서 정보",
    settings: "설정",
  },
} satisfies Record<Locale, Record<string, string>>;

function joinPath(parts: string[]) {
  return parts.filter(Boolean).join(" / ");
}

export function AppRouteTitle({ locale }: { locale: Locale }) {
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  const l = labels[locale];

  if (pathname === "/") return <span>{l.home}</span>;
  if (pathname.startsWith("/import-center")) return <span>{joinPath([l.home, l.import])}</span>;
  if (pathname.startsWith("/output-center")) return <span>{joinPath([l.home, l.output])}</span>;
  if (pathname.startsWith("/relationship-tree")) return <span>{joinPath([l.home, l.organize, l.relation])}</span>;
  if (pathname.startsWith("/cases/")) return <span>{joinPath([l.home, l.organize, l.case])}</span>;
  if (pathname.startsWith("/parties/")) return <span>{joinPath([l.home, l.organize, l.party])}</span>;
  if (pathname.startsWith("/properties/")) return <span>{joinPath([l.home, l.organize, l.property])}</span>;
  if (pathname.startsWith("/organize-center")) {
    const type = searchParams.get("type");
    const objectLabel =
      type === "case"
        ? l.case
        : type === "party"
          ? l.party
          : type === "property"
            ? l.property
            : type === "unassigned"
              ? l.unassigned
              : "";
    return <span>{joinPath([l.home, l.organize, objectLabel])}</span>;
  }
  if (pathname.startsWith("/settings/members")) return <span>{joinPath([l.settings, l.team])}</span>;
  if (pathname.startsWith("/settings/case-workbench-fields")) return <span>{joinPath([l.settings, l.required])}</span>;
  if (pathname.startsWith("/settings/output-templates")) return <span>{joinPath([l.settings, l.documentHeader])}</span>;
  if (pathname.startsWith("/settings")) return <span>{l.settings}</span>;

  return <span>{joinPath([l.home, l.organize])}</span>;
}
