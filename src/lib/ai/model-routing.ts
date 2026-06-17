export type AiTaskId =
  | "unknown_template_understanding"
  | "document_type_classification"
  | "template_family_prefilter"
  | "identity_document_extraction_assist"
  | "template_field_prematch"
  | "workbench_review_guidance"
  | "conflict_explanation"
  | "guarantee_application_preflight"
  | "correction_experience_draft"
  | "layout_risk_analysis"
  | "regression_diagnosis";

export type AiModelTier = "highAccuracy" | "mini" | "nano" | "pro";
export type AiReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh";
export type AiTextVerbosity = "low" | "medium" | "high";

export type AiModelSet = {
  highAccuracy: string;
  mini: string;
  nano: string;
  pro: string;
  embedding: string;
};

export type AiRuntimeConfig = {
  enabled: boolean;
  hasApiKey: boolean;
  disabledReason?: "disabled_by_env" | "missing_api_key";
  baseUrl: string;
  models: AiModelSet;
};

export type AiTaskRoute = {
  taskId: AiTaskId;
  modelTier: AiModelTier;
  model: string;
  reasoningEffort: AiReasoningEffort;
  textVerbosity: AiTextVerbosity;
  requiresHumanConfirmation: boolean;
  notes: string;
};

type AiTaskRouteDefinition = Omit<AiTaskRoute, "model">;

export const DEFAULT_AI_BASE_URL = "https://api.openai.com/v1";

export const DEFAULT_AI_MODELS: AiModelSet = {
  highAccuracy: "gpt-5.5",
  mini: "gpt-5.4-mini",
  nano: "gpt-5.4-nano",
  pro: "gpt-5.5-pro",
  embedding: "text-embedding-3-large",
};

export const AI_TASK_ROUTES: Record<AiTaskId, AiTaskRouteDefinition> = {
  unknown_template_understanding: {
    taskId: "unknown_template_understanding",
    modelTier: "highAccuracy",
    reasoningEffort: "medium",
    textVerbosity: "low",
    requiresHumanConfirmation: true,
    notes: "Variant or unknown input templates need evidence-backed field candidates.",
  },
  document_type_classification: {
    taskId: "document_type_classification",
    modelTier: "mini",
    reasoningEffort: "low",
    textVerbosity: "low",
    requiresHumanConfirmation: false,
    notes: "Low-risk routing only; must not confirm business facts.",
  },
  template_family_prefilter: {
    taskId: "template_family_prefilter",
    modelTier: "nano",
    reasoningEffort: "none",
    textVerbosity: "low",
    requiresHumanConfirmation: false,
    notes: "Cheap prefilter before deterministic or higher-accuracy review.",
  },
  identity_document_extraction_assist: {
    taskId: "identity_document_extraction_assist",
    modelTier: "highAccuracy",
    reasoningEffort: "medium",
    textVerbosity: "low",
    requiresHumanConfirmation: true,
    notes: "Residence card and driver license fields are candidates until reviewed.",
  },
  template_field_prematch: {
    taskId: "template_field_prematch",
    modelTier: "highAccuracy",
    reasoningEffort: "medium",
    textVerbosity: "low",
    requiresHumanConfirmation: true,
    notes: "Suggest PDF template overlay field bindings from box geometry and field catalog; template maintainer must review before saving.",
  },
  workbench_review_guidance: {
    taskId: "workbench_review_guidance",
    modelTier: "mini",
    reasoningEffort: "low",
    textVerbosity: "low",
    requiresHumanConfirmation: true,
    notes: "Summarize missing and needs-review fields without changing facts.",
  },
  conflict_explanation: {
    taskId: "conflict_explanation",
    modelTier: "highAccuracy",
    reasoningEffort: "medium",
    textVerbosity: "low",
    requiresHumanConfirmation: true,
    notes: "Explain source conflicts and preserve evidence; user chooses final fact.",
  },
  guarantee_application_preflight: {
    taskId: "guarantee_application_preflight",
    modelTier: "highAccuracy",
    reasoningEffort: "medium",
    textVerbosity: "low",
    requiresHumanConfirmation: true,
    notes: "Flag missing, inconsistent, and output-risk fields before official PDF export.",
  },
  correction_experience_draft: {
    taskId: "correction_experience_draft",
    modelTier: "highAccuracy",
    reasoningEffort: "medium",
    textVerbosity: "low",
    requiresHumanConfirmation: true,
    notes: "Draft scoped lessons from correction events; never promote global rules by itself.",
  },
  layout_risk_analysis: {
    taskId: "layout_risk_analysis",
    modelTier: "highAccuracy",
    reasoningEffort: "medium",
    textVerbosity: "low",
    requiresHumanConfirmation: true,
    notes: "Explain long-text, split-field, date, phone, postal-code, and money layout risks.",
  },
  regression_diagnosis: {
    taskId: "regression_diagnosis",
    modelTier: "pro",
    reasoningEffort: "high",
    textVerbosity: "low",
    requiresHumanConfirmation: true,
    notes: "Offline PM/QA diagnosis only; avoid normal user-facing runtime use.",
  },
};

function valueFromEnv(env: NodeJS.ProcessEnv, key: string, fallback: string) {
  const value = env[key]?.trim();
  return value ? value : fallback;
}

function isTruthyEnv(value: string | undefined) {
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

export function resolveAiRuntimeConfig(env: NodeJS.ProcessEnv = process.env): AiRuntimeConfig {
  const hasApiKey = Boolean(env.OPENAI_API_KEY?.trim());
  const disabledByEnv = isTruthyEnv(env.BROKER_DESK_AI_DISABLED);
  const enabled = hasApiKey && !disabledByEnv;

  const disabledReason = disabledByEnv ? "disabled_by_env" : hasApiKey ? undefined : "missing_api_key";

  return {
    enabled,
    hasApiKey,
    disabledReason,
    baseUrl: valueFromEnv(env, "OPENAI_BASE_URL", DEFAULT_AI_BASE_URL).replace(/\/+$/, ""),
    models: {
      highAccuracy: valueFromEnv(env, "BROKER_DESK_AI_MODEL_HIGH_ACCURACY", DEFAULT_AI_MODELS.highAccuracy),
      mini: valueFromEnv(env, "BROKER_DESK_AI_MODEL_MINI", DEFAULT_AI_MODELS.mini),
      nano: valueFromEnv(env, "BROKER_DESK_AI_MODEL_NANO", DEFAULT_AI_MODELS.nano),
      pro: valueFromEnv(env, "BROKER_DESK_AI_MODEL_PRO", DEFAULT_AI_MODELS.pro),
      embedding: valueFromEnv(env, "BROKER_DESK_AI_EMBEDDING_MODEL", DEFAULT_AI_MODELS.embedding),
    },
  };
}

export function resolveAiTaskRoute(
  taskId: AiTaskId,
  config: AiRuntimeConfig = resolveAiRuntimeConfig()
): AiTaskRoute {
  const route = AI_TASK_ROUTES[taskId];
  return {
    ...route,
    model: config.models[route.modelTier],
  };
}

export function listAiTaskRoutes(config: AiRuntimeConfig = resolveAiRuntimeConfig()): AiTaskRoute[] {
  return (Object.keys(AI_TASK_ROUTES) as AiTaskId[]).map((taskId) => resolveAiTaskRoute(taskId, config));
}
