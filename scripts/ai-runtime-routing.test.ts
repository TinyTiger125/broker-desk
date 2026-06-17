import assert from "node:assert/strict";
import { resolveAiRuntimeConfig, resolveAiTaskRoute } from "../src/lib/ai/model-routing";
import { AiRuntimeUnavailableError, createAiResponse } from "../src/lib/ai/responses-client";

function env(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  const merged = { ...process.env, ...overrides };
  for (const key of Object.keys(overrides)) {
    if (overrides[key] === undefined) delete merged[key];
  }
  return merged as NodeJS.ProcessEnv;
}

async function main() {
  const missingKeyConfig = resolveAiRuntimeConfig(env({ OPENAI_API_KEY: undefined }));
  assert.equal(missingKeyConfig.enabled, false);
  assert.equal(missingKeyConfig.hasApiKey, false);
  assert.equal(missingKeyConfig.disabledReason, "missing_api_key");

  const disabledConfig = resolveAiRuntimeConfig(env({
    OPENAI_API_KEY: "sk-test",
    BROKER_DESK_AI_DISABLED: "true",
  }));
  assert.equal(disabledConfig.enabled, false);
  assert.equal(disabledConfig.disabledReason, "disabled_by_env");

  const enabledConfig = resolveAiRuntimeConfig(env({
    OPENAI_API_KEY: "sk-test",
  }));
  assert.equal(enabledConfig.enabled, true);
  assert.equal(enabledConfig.models.highAccuracy, "gpt-5.5");
  assert.equal(enabledConfig.models.mini, "gpt-5.4-mini");
  assert.equal(enabledConfig.models.nano, "gpt-5.4-nano");
  assert.equal(enabledConfig.models.pro, "gpt-5.5-pro");
  assert.equal(enabledConfig.models.embedding, "text-embedding-3-large");

  const preflightRoute = resolveAiTaskRoute("guarantee_application_preflight", enabledConfig);
  assert.equal(preflightRoute.model, "gpt-5.5");
  assert.equal(preflightRoute.reasoningEffort, "medium");
  assert.equal(preflightRoute.requiresHumanConfirmation, true);

  const prematchRoute = resolveAiTaskRoute("template_field_prematch", enabledConfig);
  assert.equal(prematchRoute.model, "gpt-5.5");
  assert.equal(prematchRoute.reasoningEffort, "medium");
  assert.equal(prematchRoute.requiresHumanConfirmation, true);

  const classificationRoute = resolveAiTaskRoute("document_type_classification", enabledConfig);
  assert.equal(classificationRoute.model, "gpt-5.4-mini");
  assert.equal(classificationRoute.reasoningEffort, "low");

  const prefilterRoute = resolveAiTaskRoute("template_family_prefilter", enabledConfig);
  assert.equal(prefilterRoute.model, "gpt-5.4-nano");
  assert.equal(prefilterRoute.reasoningEffort, "none");

  const overrideConfig = resolveAiRuntimeConfig(env({
    OPENAI_API_KEY: "sk-test",
    BROKER_DESK_AI_MODEL_HIGH_ACCURACY: "custom-high",
    BROKER_DESK_AI_MODEL_MINI: "custom-mini",
    BROKER_DESK_AI_EMBEDDING_MODEL: "custom-embedding",
  }));
  assert.equal(resolveAiTaskRoute("conflict_explanation", overrideConfig).model, "custom-high");
  assert.equal(resolveAiTaskRoute("workbench_review_guidance", overrideConfig).model, "custom-mini");
  assert.equal(overrideConfig.models.embedding, "custom-embedding");

  await assert.rejects(
    () => createAiResponse({ taskId: "conflict_explanation", input: "test" }, { env: env({ OPENAI_API_KEY: undefined }) }),
    AiRuntimeUnavailableError
  );

  let capturedPayload: Record<string, unknown> | undefined;
  const result = await createAiResponse<{ ok: boolean }>(
    {
      taskId: "document_type_classification",
      input: "重要事項説明書",
      jsonSchema: {
        name: "DocumentTypeClassification",
        schema: {
          type: "object",
          properties: {
            ok: { type: "boolean" },
          },
          required: ["ok"],
          additionalProperties: false,
        },
      },
    },
    {
      env: env({
        OPENAI_API_KEY: "sk-test",
        OPENAI_BASE_URL: "https://example.test/v1/",
      }),
      fetchImpl: async (url, init) => {
        assert.equal(String(url), "https://example.test/v1/responses");
        const headers = new Headers(init?.headers);
        assert.equal(headers.get("authorization"), "Bearer sk-test");
        capturedPayload = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(JSON.stringify({ output_text: "{\"ok\":true}" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    }
  );

  assert.equal(result.model, "gpt-5.4-mini");
  assert.deepEqual(result.parsed, { ok: true });
  assert.equal(capturedPayload?.model, "gpt-5.4-mini");
  assert.deepEqual(capturedPayload?.reasoning, { effort: "low" });
  assert.equal((capturedPayload?.metadata as { brokerDeskTaskId?: string }).brokerDeskTaskId, "document_type_classification");

  const text = capturedPayload?.text as {
    verbosity?: string;
    format?: { type?: string; name?: string; strict?: boolean };
  };
  assert.equal(text.verbosity, "low");
  assert.equal(text.format?.type, "json_schema");
  assert.equal(text.format?.name, "DocumentTypeClassification");
  assert.equal(text.format?.strict, true);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
