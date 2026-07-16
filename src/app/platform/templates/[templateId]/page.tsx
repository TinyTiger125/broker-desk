import {
  GuaranteeApplicationPreviewPage,
  type GuaranteeApplicationPreviewMode,
} from "@/app/guarantee-applications/friends-guarantee/preview/preview-page-content";

export const dynamic = "force-dynamic";

type PlatformTemplateAuthoringPageProps = {
  params: Promise<{ templateId: string }>;
  searchParams?: Promise<{
    caseId?: string;
    flash?: string;
  }>;
};

export default async function PlatformTemplateAuthoringPage({
  params,
  searchParams,
}: PlatformTemplateAuthoringPageProps) {
  const { templateId } = await params;
  const mode: GuaranteeApplicationPreviewMode = "authoring";
  return GuaranteeApplicationPreviewPage({
    mode,
    templateId,
    searchParams,
  });
}
