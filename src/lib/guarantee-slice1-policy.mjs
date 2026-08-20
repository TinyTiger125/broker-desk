const PREVIEW_DEPLOYMENT_NAMES = new Set(["preview", "staging"]);

export function normalizeDeploymentEnvironment(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function isSupportedPreviewDeployment(value) {
  return PREVIEW_DEPLOYMENT_NAMES.has(normalizeDeploymentEnvironment(value));
}

export function isGuaranteeSlice1TenantEnabled({ enabled, deploymentEnvironment, tenantId, allowlist }) {
  if (!isSupportedPreviewDeployment(deploymentEnvironment)) return false;
  if (String(enabled ?? "").trim().toLowerCase() !== "true") return false;
  return new Set(String(allowlist ?? "").split(",").map((item) => item.trim()).filter(Boolean)).has(tenantId);
}

// New calls should pass a boolean. Legacy values are deliberately narrow: an
// unknown phrase must not become legal consent by string guessing.
const TRUE_VALUES = new Set(["true", "確認済み"]);
const FALSE_VALUES = new Set(["false", "未確認"]);

/** One server-side interpretation shared by preview and final PDF rendering. */
export function interpretGuaranteeBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  return undefined;
}

export function resolveGuaranteeFieldValue({ fieldType, sourceFieldKey, fieldId, storageScope, confirmedValue, confirmedData, supplement }) {
  const isSupplementField = storageScope === "template_option" || storageScope === "output_process" || sourceFieldKey.startsWith("company_option.") || sourceFieldKey.startsWith("guarantee.");
  const supplementValue = supplement?.[fieldId] ?? supplement?.[sourceFieldKey];
  if (fieldType === "checkbox") return interpretGuaranteeBoolean(isSupplementField ? supplementValue : (confirmedValue ?? confirmedData?.[sourceFieldKey]));
  return isSupplementField ? String(supplementValue ?? "") : String(confirmedValue ?? "");
}

export function canPublishMaskVersion({ testedAt, testConfirmedAt }) {
  return Boolean(testedAt && testConfirmedAt);
}

/** Minimal deterministic state model used by the executable slice contract. */
export function publishMaskAtomically(state) {
  if (!canPublishMaskVersion(state)) return { ...state, published: false, matchStatus: state.matchStatus };
  return { ...state, published: true, activeVersionId: state.maskVersionId, matchStatus: "exact" };
}

export function claimConfirmation(state, token) {
  if (state.status === "consumed") return { ...state, idempotent: true };
  if (state.status !== "issued") return undefined;
  return { ...state, status: "processing", processingToken: token, idempotent: false };
}

export function finalizeConfirmation(state, outputId) {
  if (state.status !== "processing" || !state.processingToken) return undefined;
  return { ...state, status: "consumed", generatedOutputId: state.generatedOutputId ?? outputId, idempotent: Boolean(state.generatedOutputId) };
}
