import Link from "next/link";
import { getGuaranteePdfTemplateConfig } from "@/lib/friends-guarantee-pdf";
import { guaranteeCompanyTemplates } from "@/lib/guarantee-application";
import { resolveGuaranteeTemplateLayout } from "@/lib/guarantee-template-layout-runtime";
import { getLocale, type Locale } from "@/lib/locale";
import { PlatformSessionError, requirePlatformOwnerSession } from "@/lib/platform-session";

export const dynamic = "force-dynamic";

function copy(locale: Locale) {
  return {
    title: locale === "zh" ? "官方文书模板" : locale === "ko" ? "공식 문서 템플릿" : "公式書類テンプレート",
    subtitle:
      locale === "zh"
        ? "在这里维护官方 PDF 表单、填写区域、项目对应关系和发布状态；工作区只使用已发布模板。"
        : locale === "ko"
          ? "공식 PDF 원본, 박스, 필드 바인딩, 릴리스 상태를 이곳에서 관리합니다. 테넌트 프로덕션은 게시된 템플릿만 사용합니다."
          : "公式PDF原本・入力枠・フィールド紐付け・リリース状態をここで管理します。テナント本番利用は公開済みテンプレートのみを参照します。",
    forbidden: locale === "zh" ? "需要平台管理员权限。" : locale === "ko" ? "플랫폼 관리자 권한이 필요합니다." : "プラットフォーム管理者権限が必要です。",
    template: locale === "zh" ? "模板" : locale === "ko" ? "템플릿" : "テンプレート",
    quality: locale === "zh" ? "质量" : locale === "ko" ? "품질" : "品質",
    source: locale === "zh" ? "官方源文件" : locale === "ko" ? "공식 원본" : "公式原本",
    overlay: locale === "zh" ? "填写区域" : locale === "ko" ? "박스/오버레이" : "入力枠/オーバーレイ",
    actions: locale === "zh" ? "操作" : locale === "ko" ? "작업" : "操作",
    openFactory: locale === "zh" ? "调整模板" : locale === "ko" ? "보정 화면 열기" : "校正画面を開く",
    ownerLabel: locale === "zh" ? "模板维护" : locale === "ko" ? "플랫폼 템플릿 공장" : "プラットフォームテンプレート工場",
    officialBase: locale === "zh" ? "官方表单" : locale === "ko" ? "공식 원본" : "公式原本",
    coordinateSetup: locale === "zh" ? "填写位置" : locale === "ko" ? "좌표 설정" : "座標設定",
    fieldCount: locale === "zh" ? "输入框" : locale === "ko" ? "입력칸" : "入力枠",
    adjustedCount: locale === "zh" ? "调整" : locale === "ko" ? "조정" : "調整",
    removedCount: locale === "zh" ? "删除" : locale === "ko" ? "삭제" : "削除",
    baseVersion: locale === "zh" ? "模板版本" : locale === "ko" ? "원본 기록" : "原本記録",
    publication: locale === "zh" ? "发布版本" : locale === "ko" ? "게시 버전" : "公開版",
    developmentOnly: locale === "zh" ? "开发用本地底稿" : locale === "ko" ? "개발용 로컬 원본" : "開発用ローカル底版",
  };
}

function qualityTone(status: string) {
  if (status === "verified") return "bg-emerald-100 text-emerald-800";
  if (status === "source_quality_blocked") return "bg-rose-100 text-rose-800";
  return "bg-amber-100 text-amber-800";
}

export default async function PlatformTemplatesPage() {
  const locale = await getLocale();
  const ui = copy(locale);
  let platformUserName = "";
  try {
    const session = await requirePlatformOwnerSession();
    platformUserName = session.user.name;
  } catch (error) {
    if (error instanceof PlatformSessionError) {
      return (
        <div className="mx-auto max-w-3xl rounded-lg border border-rose-200 bg-rose-50 p-6 text-rose-900">
          <h1 className="text-xl font-bold">{ui.title}</h1>
          <p className="mt-2 text-sm">{ui.forbidden}</p>
        </div>
      );
    }
    throw error;
  }

  const rows = await Promise.all(guaranteeCompanyTemplates.map(async (template) => {
    const layout = await resolveGuaranteeTemplateLayout(template.id);
    const config = getGuaranteePdfTemplateConfig(template.id);
    return {
      template,
      layout,
      overlayCount: config.overlayFields.length + layout.snapshot.customOverlayFields.length,
      layoutOverrideCount: Object.keys(layout.snapshot.layoutOverrides).length,
      deletedCount: layout.snapshot.deletedOverlayFieldKeys.length,
    };
  }));

  return (
    <div className="bd-page bd-templates-page space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">{ui.ownerLabel} / {platformUserName}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">{ui.title}</h1>
          <p className="mt-1 max-w-4xl text-sm text-slate-600">{ui.subtitle}</p>
        </div>
      </header>

      <section className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <div className="grid min-w-[860px] grid-cols-[1.4fr_0.8fr_1fr_1fr_0.8fr] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-500">
          <span>{ui.template}</span>
          <span>{ui.quality}</span>
          <span>{ui.source}</span>
          <span>{ui.overlay}</span>
          <span>{ui.actions}</span>
        </div>
        <div className="divide-y divide-slate-100">
          {rows.map(({ template, layout, overlayCount, layoutOverrideCount, deletedCount }) => (
            <div key={template.id} className="grid min-w-[860px] grid-cols-[1.4fr_0.8fr_1fr_1fr_0.8fr] items-center gap-3 px-4 py-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-900">{template.companyDisplayName} / {template.templateDisplayName}</p>
                <p className="truncate text-xs text-slate-500">{ui.officialBase}</p>
              </div>
              <span className={`w-fit rounded-full px-2 py-1 text-xs font-bold ${qualityTone(template.qualityStatus)}`}>{template.qualityStatus}</span>
              <div className="min-w-0 text-xs text-slate-600">
                <p className="truncate">{template.sourcePdfFileName}</p>
                <p className="truncate text-slate-400">{ui.coordinateSetup}</p>
              </div>
              <div className="text-xs text-slate-600">
                <p>{ui.fieldCount} {overlayCount}</p>
                <p>{ui.adjustedCount} {layoutOverrideCount} / {ui.removedCount} {deletedCount}</p>
                <p className="text-slate-400">{ui.baseVersion} {layout.snapshot.baselineVersion}</p>
                <p className="text-slate-400">
                  {layout.source === "published" ? `${ui.publication} v${layout.versionNumber}` : ui.developmentOnly}
                </p>
              </div>
              <Link
                href={`/platform/templates/${template.id}`}
                className="rounded-md border border-slate-300 px-3 py-2 text-center text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                {ui.openFactory}
              </Link>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
