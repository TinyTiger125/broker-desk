import GuaranteeApplicationPreviewPage from "../../friends-guarantee/preview/page";

export const dynamic = "force-dynamic";

type GuaranteeTemplatePreviewPageProps = {
  params: Promise<{
    templateId: string;
  }>;
  searchParams?: Promise<{
    caseId?: string;
    engine?: string;
    flash?: string;
  }>;
};

export default async function GuaranteeTemplatePreviewPage({
  params,
  searchParams,
}: GuaranteeTemplatePreviewPageProps) {
  const routeParams = await params;
  const query = searchParams ? await searchParams : {};
  return GuaranteeApplicationPreviewPage({
    searchParams: Promise.resolve({
      ...query,
      templateId: routeParams.templateId,
    }),
  });
}
