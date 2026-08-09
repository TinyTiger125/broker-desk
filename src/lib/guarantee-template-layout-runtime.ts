import {
  getActiveGuaranteeTemplateLayoutVersion,
  getActiveTenantGuaranteeTemplateInstall,
} from "@/lib/data";
import {
  getFriendsGuaranteeTemplateLayoutSnapshot,
  getGuaranteeTemplateAssetFingerprint,
  normalizeFriendsGuaranteeTemplateLayoutSnapshot,
  type FriendsGuaranteeTemplateLayoutSnapshot,
} from "@/lib/friends-guarantee-pdf";
import { isProductionRuntime } from "@/lib/production-readiness";

export type ResolvedGuaranteeTemplateLayout = {
  versionId: string;
  versionNumber: number;
  source: "tenant_install" | "published" | "legacy_development";
  snapshot: FriendsGuaranteeTemplateLayoutSnapshot;
};

export async function resolveGuaranteeTemplateLayout(
  templateId: string,
  tenantId?: string,
): Promise<ResolvedGuaranteeTemplateLayout> {
  const assetFingerprint = getGuaranteeTemplateAssetFingerprint(templateId);
  const tenantInstall = tenantId
    ? await getActiveTenantGuaranteeTemplateInstall({ tenantId, templateId })
    : null;
  if (tenantInstall) {
    if (tenantInstall.sourceAssetFingerprint !== assetFingerprint) {
      throw new Error("The installed tenant template does not match the deployed template image.");
    }
    return {
      versionId: tenantInstall.id,
      versionNumber: tenantInstall.revisionNumber,
      source: "tenant_install",
      snapshot: normalizeFriendsGuaranteeTemplateLayoutSnapshot({
        templateId,
        snapshot: tenantInstall.layoutSnapshot,
        expectedAssetFingerprint: assetFingerprint,
      }),
    };
  }

  const published = await getActiveGuaranteeTemplateLayoutVersion(templateId);
  if (published) {
    if (published.assetFingerprint !== assetFingerprint) {
      throw new Error("The active template layout does not match the deployed template image.");
    }
    return {
      versionId: published.id,
      versionNumber: published.versionNumber,
      source: "published",
      snapshot: normalizeFriendsGuaranteeTemplateLayoutSnapshot({
        templateId,
        snapshot: published.layoutSnapshot,
        expectedAssetFingerprint: assetFingerprint,
      }),
    };
  }

  if (isProductionRuntime()) {
    throw new Error(`No published layout version exists for template ${templateId}.`);
  }

  // Local files remain available only to keep development fixtures usable.
  // Production never reaches this branch.
  return {
    versionId: "legacy_development",
    versionNumber: 0,
    source: "legacy_development",
    snapshot: getFriendsGuaranteeTemplateLayoutSnapshot(templateId),
  };
}
