import { CaseObjectPreview, type PreviewMode } from "@/components/ui-gov-003-preview/case-object-preview";

type CheckpointPageProps = {
  searchParams?: Promise<{ mode?: string }>;
};

function resolveMode(value?: string): PreviewMode {
  return value === "quick" ? "quick" : "overview";
}

export default async function UiGov003CheckpointAPage({ searchParams }: CheckpointPageProps) {
  const params = searchParams ? await searchParams : {};

  return <CaseObjectPreview initialMode={resolveMode(params.mode)} />;
}
