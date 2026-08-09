import Image from "next/image";
import Link from "next/link";
import { installGuaranteeTemplateForTenantAction } from "@/app/actions";
import { listTenantGuaranteeTemplateInstalls } from "@/lib/data";
import { guaranteeCompanyTemplates } from "@/lib/guarantee-application";
import { getLocale, type Locale } from "@/lib/locale";
import { requireTenantSession } from "@/lib/tenant-session";

export const dynamic = "force-dynamic";

type TemplatesPageProps = {
  searchParams?: Promise<{
    template?: string;
    flash?: string;
  }>;
};

type TemplateVisual = {
  src: string;
  width: number;
  height: number;
};

const templateVisuals: Record<string, TemplateVisual> = {
  zenhoren_individual_v1: { src: "/guarantee-templates/zenhoren-v1-hd.png", width: 2400, height: 1697 },
  nihon_safety_individual_v1: { src: "/guarantee-templates/nihon-safety-v1-hd.png", width: 2400, height: 1696 },
  j_lease_individual_v1: { src: "/guarantee-templates/j-lease-v1-hd.png", width: 1697, height: 2400 },
  insure_individual_v1: { src: "/guarantee-templates/insure-v1-hd.png", width: 2400, height: 1658 },
  friends_guarantee_individual_v1: { src: "/guarantee-templates/friends-guarantee-v1.png", width: 1600, height: 1131 },
};

const copyByLocale = {
  ja: {
    eyebrow: "テンプレートライブラリ",
    title: "テンプレートライブラリ",
    subtitle: "必要な公式書式をこのワークスペースに追加し、書類出力で使用します。",
    installedCount: "追加済み",
    officialCount: "公式テンプレート",
    myTemplates: "このワークスペースのテンプレート",
    myTemplatesDesc: "追加済みのテンプレートだけが書類出力で選択できます。",
    noInstalled: "まだテンプレートが追加されていません。公式ライブラリから必要な書式を選んでください。",
    officialLibrary: "公式ライブラリ",
    officialLibraryDesc: "保証会社の申込書テンプレート。追加後はこのワークスペース専用のコピーとして扱われます。",
    application: "保証会社申込書",
    selected: "選択中のテンプレート",
    add: "ワークスペースに追加",
    added: "追加済み",
    useInOutput: "書類出力へ",
    addDescription: "追加したテンプレートは、このワークスペースだけで使います。公式版の更新で自動的に上書きされることはありません。",
    sourceVersion: "追加元の公式版",
    preview: "書式プレビュー",
    installedMessage: "テンプレートをワークスペースに追加しました。書類出力で選択できます。",
  },
  zh: {
    eyebrow: "模板库",
    title: "模板库",
    subtitle: "将需要的官方文书添加到当前工作区，再从输出文件中使用。",
    installedCount: "已添加",
    officialCount: "官方模板",
    myTemplates: "当前工作区的模板",
    myTemplatesDesc: "只有已添加的模板会出现在输出文件中。",
    noInstalled: "当前工作区还没有模板。请从下方官方模板库中添加所需文书。",
    officialLibrary: "官方模板库",
    officialLibraryDesc: "保证会社申请书模板。添加后会作为当前工作区的独立副本使用。",
    application: "保证会社申请书",
    selected: "当前模板",
    add: "添加到工作区",
    added: "已添加",
    useInOutput: "前往输出文件",
    addDescription: "添加后的模板仅供当前工作区使用，官方版本更新不会自动覆盖已有副本。",
    sourceVersion: "来源官方版本",
    preview: "格式预览",
    installedMessage: "模板已添加到当前工作区，可以在输出文件中选择。",
  },
  ko: {
    eyebrow: "템플릿 라이브러리",
    title: "템플릿 라이브러리",
    subtitle: "필요한 공식 서식을 현재 워크스페이스에 추가한 뒤 문서 출력에서 사용합니다.",
    installedCount: "추가됨",
    officialCount: "공식 템플릿",
    myTemplates: "현재 워크스페이스의 템플릿",
    myTemplatesDesc: "추가된 템플릿만 문서 출력에서 선택할 수 있습니다.",
    noInstalled: "아직 추가한 템플릿이 없습니다. 아래 공식 라이브러리에서 필요한 서식을 선택하세요.",
    officialLibrary: "공식 템플릿 라이브러리",
    officialLibraryDesc: "보증회사 신청서 템플릿입니다. 추가 후에는 현재 워크스페이스 전용 사본으로 사용합니다.",
    application: "보증회사 신청서",
    selected: "선택한 템플릿",
    add: "워크스페이스에 추가",
    added: "추가됨",
    useInOutput: "문서 출력으로",
    addDescription: "추가한 템플릿은 현재 워크스페이스에서만 사용합니다. 공식판이 업데이트되어도 기존 사본은 자동으로 덮어쓰지 않습니다.",
    sourceVersion: "원본 공식판",
    preview: "서식 미리보기",
    installedMessage: "템플릿을 현재 워크스페이스에 추가했습니다. 문서 출력에서 선택할 수 있습니다.",
  },
} as const;

function templateApplicationLabel(locale: Locale) {
  return copyByLocale[locale].application;
}

export default async function TemplatesPage({ searchParams }: TemplatesPageProps) {
  const [locale, session] = await Promise.all([
    getLocale(),
    requireTenantSession({ permission: "template.view" }),
  ]);
  const copy = copyByLocale[locale];
  const params = searchParams ? await searchParams : undefined;
  const templates = guaranteeCompanyTemplates.filter((template) => template.outputStatus === "active");
  const selectedTemplateId = params?.template ?? templates[0]?.id;
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) ?? templates[0];
  const installedTemplates = await listTenantGuaranteeTemplateInstalls({ tenantId: session.tenant.id });
  const installedByTemplateId = new Map(installedTemplates.map((item) => [item.templateId, item]));

  if (!selectedTemplate) return null;

  const selectedVisual = templateVisuals[selectedTemplate.id] ?? templateVisuals.friends_guarantee_individual_v1;
  const selectedInstall = installedByTemplateId.get(selectedTemplate.id);
  const installedTemplateEntries = templates.filter((template) => installedByTemplateId.has(template.id));

  return (
    <div className="bd-page bd-templates-page space-y-6">
      <header className="bd-page-header flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.08em] text-[#1960a3]">{copy.eyebrow}</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950">{copy.title}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{copy.subtitle}</p>
        </div>
        <div className="grid min-w-[17rem] grid-cols-2 divide-x divide-slate-200 border border-slate-200 bg-white">
          <div className="p-3">
            <p className="text-[11px] font-bold text-slate-500">{copy.installedCount}</p>
            <p className="mt-1 text-2xl font-black text-slate-950">{installedTemplateEntries.length}</p>
          </div>
          <div className="p-3">
            <p className="text-[11px] font-bold text-slate-500">{copy.officialCount}</p>
            <p className="mt-1 text-2xl font-black text-slate-950">{templates.length}</p>
          </div>
        </div>
      </header>

      {params?.flash === "template_installed" ? (
        <p className="border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">{copy.installedMessage}</p>
      ) : null}

      <section className="border border-slate-200 bg-white">
        <div className="flex flex-col gap-2 border-b border-slate-200 px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-base font-black text-slate-950">{copy.myTemplates}</h2>
            <p className="mt-1 text-sm text-slate-600">{copy.myTemplatesDesc}</p>
          </div>
          {installedTemplateEntries.length > 0 ? (
            <Link href="/output-center?docGroup=application&doc=guarantee_application" className="inline-flex items-center justify-center gap-2 rounded border border-slate-950 bg-slate-950 px-4 py-2 text-sm font-black text-white hover:bg-slate-800">
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">print</span>
              {copy.useInOutput}
            </Link>
          ) : null}
        </div>
        {installedTemplateEntries.length === 0 ? (
          <p className="px-5 py-5 text-sm leading-6 text-slate-600">{copy.noInstalled}</p>
        ) : (
          <div className="grid gap-px bg-slate-200 md:grid-cols-2 xl:grid-cols-3">
            {installedTemplateEntries.map((template) => {
              const install = installedByTemplateId.get(template.id);
              return (
                <Link key={template.id} href={`/templates?template=${encodeURIComponent(template.id)}`} className="bg-white p-4 hover:bg-[#edf2fd]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-950">{template.companyDisplayName}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">{templateApplicationLabel(locale)}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-800">{copy.added}</span>
                  </div>
                  <p className="mt-4 text-xs text-slate-500">{copy.sourceVersion} v{install?.sourceVersionNumber}</p>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(17rem,21rem)_minmax(0,1fr)]">
        <aside className="self-start border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-4">
            <h2 className="text-base font-black text-slate-950">{copy.officialLibrary}</h2>
            <p className="mt-1 text-xs leading-5 text-slate-600">{copy.officialLibraryDesc}</p>
          </div>
          <div className="divide-y divide-slate-200">
            {templates.map((template) => {
              const active = template.id === selectedTemplate.id;
              const installed = installedByTemplateId.has(template.id);
              return (
                <Link
                  key={template.id}
                  href={`/templates?template=${encodeURIComponent(template.id)}`}
                  className={`block px-4 py-4 transition ${active ? "bg-[#edf2fd] shadow-[inset_3px_0_0_#1960a3]" : "bg-white hover:bg-slate-50"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-950">{template.companyDisplayName}</p>
                      <p className="mt-1 truncate text-xs font-semibold text-slate-500">{template.templateDisplayName}</p>
                    </div>
                    {installed ? <span className="shrink-0 text-[10px] font-black text-emerald-700">{copy.added}</span> : null}
                  </div>
                </Link>
              );
            })}
          </div>
        </aside>

        <article className="overflow-hidden border border-slate-200 bg-white">
          <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-black text-[#1960a3]">{copy.selected}</p>
              <h2 className="mt-1 text-2xl font-black text-slate-950">{selectedTemplate.companyDisplayName}</h2>
              <p className="mt-1 text-sm font-semibold text-slate-600">{selectedTemplate.templateDisplayName}</p>
              <p className="mt-3 text-sm text-slate-500">{templateApplicationLabel(locale)} · {selectedTemplate.pageCount} {locale === "zh" ? "页" : locale === "ko" ? "페이지" : "ページ"}</p>
            </div>
            {selectedInstall ? (
              <div className="flex flex-col items-stretch gap-2 sm:flex-row">
                <span className="inline-flex items-center justify-center rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-black text-emerald-800">{copy.added}</span>
                <Link href={`/output-center?docGroup=application&doc=guarantee_application&guaranteeTemplate=${encodeURIComponent(selectedTemplate.id)}`} className="inline-flex items-center justify-center gap-2 rounded bg-slate-950 px-4 py-2 text-sm font-black text-white hover:bg-slate-800">
                  <span aria-hidden="true" className="material-symbols-outlined text-[18px]">print</span>
                  {copy.useInOutput}
                </Link>
              </div>
            ) : (
              <form action={installGuaranteeTemplateForTenantAction}>
                <input type="hidden" name="templateId" value={selectedTemplate.id} />
                <button className="inline-flex items-center justify-center gap-2 rounded bg-slate-950 px-4 py-2 text-sm font-black text-white hover:bg-slate-800">
                  <span aria-hidden="true" className="material-symbols-outlined text-[18px]">add</span>
                  {copy.add}
                </button>
              </form>
            )}
          </div>

          <div className="grid gap-5 bg-slate-50 p-5 2xl:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="overflow-auto border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-4 py-3 text-xs font-black text-slate-700">{copy.preview}</div>
              <Image
                src={selectedVisual.src}
                alt={`${selectedTemplate.companyDisplayName} ${selectedTemplate.templateDisplayName}`}
                width={selectedVisual.width}
                height={selectedVisual.height}
                className="h-auto w-full object-contain"
                priority
              />
            </div>
            <div className="self-start border border-slate-200 bg-white p-4">
              <p className="text-sm leading-6 text-slate-600">{copy.addDescription}</p>
              <dl className="mt-5 divide-y divide-slate-200 border-y border-slate-200 text-sm">
                <div className="flex items-center justify-between gap-3 py-3">
                  <dt className="font-semibold text-slate-500">{copy.application}</dt>
                  <dd className="font-black text-slate-950">{selectedTemplate.companyDisplayName}</dd>
                </div>
                <div className="flex items-center justify-between gap-3 py-3">
                  <dt className="font-semibold text-slate-500">{copy.sourceVersion}</dt>
                  <dd className="font-black text-slate-950">{selectedInstall ? `v${selectedInstall.sourceVersionNumber}` : "-"}</dd>
                </div>
              </dl>
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}
