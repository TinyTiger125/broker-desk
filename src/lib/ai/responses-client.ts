import {
  resolveAiRuntimeConfig,
  resolveAiTaskRoute,
  type AiReasoningEffort,
  type AiRuntimeConfig,
  type AiTaskId,
  type AiTextVerbosity,
} from "./model-routing";

export type AiResponseInput = string | Array<Record<string, unknown>>;

export type AiJsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type CreateAiResponseArgs = {
  taskId: AiTaskId;
  input: AiResponseInput;
  jsonSchema?: AiJsonSchema;
  reasoningEffort?: AiReasoningEffort;
  textVerbosity?: AiTextVerbosity;
  /** Hard ceiling for provider output, especially important for page-indexed PDF reads. */
  maxOutputTokens?: number;
  metadata?: Record<string, string>;
};

export type CreateAiResponseOptions = {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
};

export type AiResponseResult<T = unknown> = {
  taskId: AiTaskId;
  model: string;
  reasoningEffort: AiReasoningEffort;
  textVerbosity: AiTextVerbosity;
  outputText: string;
  parsed?: T;
  raw: unknown;
};

export class AiRuntimeUnavailableError extends Error {
  readonly code = "ai_runtime_unavailable";
  readonly reason: AiRuntimeConfig["disabledReason"];

  constructor(reason: AiRuntimeConfig["disabledReason"]) {
    super(reason === "disabled_by_env" ? "AI runtime is disabled by environment." : "OPENAI_API_KEY is not configured.");
    this.name = "AiRuntimeUnavailableError";
    this.reason = reason;
  }
}

export class AiResponseError extends Error {
  readonly code = "ai_response_failed";
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "AiResponseError";
    this.status = status;
  }
}

export class AiTemporaryFileError extends Error {
  readonly code = "ai_temporary_file_failed";
  readonly operation: "upload" | "cleanup";
  readonly status?: number;

  constructor(operation: "upload" | "cleanup", status?: number) {
    super(`OpenAI temporary file ${operation} failed.`);
    this.name = "AiTemporaryFileError";
    this.operation = operation;
    this.status = status;
  }
}

function isAbortError(error: unknown) {
  return Boolean(error && typeof error === "object" && "name" in error && (error as { name?: unknown }).name === "AbortError");
}

function getApiKey(env: NodeJS.ProcessEnv) {
  return env.OPENAI_API_KEY?.trim() ?? "";
}

function buildTextConfig(args: CreateAiResponseArgs, textVerbosity: AiTextVerbosity) {
  const text: Record<string, unknown> = {
    verbosity: args.textVerbosity ?? textVerbosity,
  };

  if (args.jsonSchema) {
    text.format = {
      type: "json_schema",
      name: args.jsonSchema.name,
      schema: args.jsonSchema.schema,
      strict: args.jsonSchema.strict ?? true,
    };
  }

  return text;
}

function extractOutputText(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "";
  const response = raw as { output_text?: unknown; output?: unknown };
  if (typeof response.output_text === "string") return response.output_text;

  if (!Array.isArray(response.output)) return "";

  const chunks: string[] = [];
  for (const item of response.output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const text = (part as { text?: unknown }).text;
      if (typeof text === "string") chunks.push(text);
    }
  }
  return chunks.join("");
}

function parseStructuredOutput<T>(outputText: string, schema?: AiJsonSchema): T | undefined {
  if (!schema) return undefined;
  if (!outputText.trim()) return undefined;
  return JSON.parse(outputText) as T;
}

/**
 * Upload one source through the Files API for a single Responses request.
 * The file has a short provider-side expiry and is deleted in finally; the
 * callback never receives the bytes, only the opaque file id.
 */
export async function withTemporaryOpenAiFile<T>(
  input: { buffer: Buffer; filename: string; mimeType: string },
  callback: (fileId: string) => Promise<T>,
  options: CreateAiResponseOptions = {},
): Promise<T> {
  const env = options.env ?? process.env;
  const config = resolveAiRuntimeConfig(env);
  if (!config.enabled) throw new AiRuntimeUnavailableError(config.disabledReason);
  const apiKey = getApiKey(env);
  const fetchImpl = options.fetchImpl ?? fetch;
  const form = new FormData();
  form.set("purpose", "user_data");
  form.set("expires_after[anchor]", "created_at");
  // OpenAI's minimum expiry is one hour; explicit DELETE in finally normally
  // removes the file sooner, while this remains a bounded privacy fallback.
  form.set("expires_after[seconds]", "3600");
  form.append("file", new Blob([new Uint8Array(input.buffer)], { type: input.mimeType }), input.filename);

  let fileId: string | undefined;
  try {
    let upload: Response;
    try {
      upload = await fetchImpl(`${config.baseUrl}/files`, {
        method: "POST",
        signal: options.signal,
        headers: { authorization: `Bearer ${apiKey}` },
        body: form,
      });
    } catch (error) {
      if (isAbortError(error)) throw error;
      throw new AiTemporaryFileError("upload");
    }
    if (!upload.ok) throw new AiTemporaryFileError("upload", upload.status);
    let payload: unknown;
    try { payload = await upload.json(); } catch { throw new AiTemporaryFileError("upload", upload.status); }
    const candidate = payload && typeof payload === "object" ? (payload as { id?: unknown }).id : undefined;
    if (typeof candidate !== "string" || !candidate.trim()) throw new AiTemporaryFileError("upload", upload.status);
    fileId = candidate.trim();
    return await callback(fileId);
  } finally {
    if (fileId) {
      const cleanupController = new AbortController();
      const cleanupTimer = setTimeout(() => cleanupController.abort(), 10_000);
      try {
        let cleanup: Response;
        try {
          cleanup = await fetchImpl(`${config.baseUrl}/files/${encodeURIComponent(fileId)}`, {
            method: "DELETE",
            signal: cleanupController.signal,
            headers: { authorization: `Bearer ${apiKey}` },
          });
        } catch {
          throw new AiTemporaryFileError("cleanup");
        }
        // A prior cleanup or expiry is already a safe terminal state.
        if (!cleanup.ok && cleanup.status !== 404) throw new AiTemporaryFileError("cleanup", cleanup.status);
      } finally {
        clearTimeout(cleanupTimer);
      }
    }
  }
}

export async function createAiResponse<T = unknown>(
  args: CreateAiResponseArgs,
  options: CreateAiResponseOptions = {}
): Promise<AiResponseResult<T>> {
  const env = options.env ?? process.env;
  const config = resolveAiRuntimeConfig(env);
  if (!config.enabled) {
    throw new AiRuntimeUnavailableError(config.disabledReason);
  }

  const apiKey = getApiKey(env);
  const route = resolveAiTaskRoute(args.taskId, config);
  const reasoningEffort = args.reasoningEffort ?? route.reasoningEffort;
  const textVerbosity = args.textVerbosity ?? route.textVerbosity;
  const fetchImpl = options.fetchImpl ?? fetch;

  const response = await fetchImpl(`${config.baseUrl}/responses`, {
    method: "POST",
    signal: options.signal,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: route.model,
      input: args.input,
      store: false,
      ...(args.maxOutputTokens === undefined ? {} : { max_output_tokens: args.maxOutputTokens }),
      reasoning: {
        effort: reasoningEffort,
      },
      text: buildTextConfig(args, textVerbosity),
      metadata: {
        brokerDeskTaskId: args.taskId,
        ...args.metadata,
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new AiResponseError(response.status, body ? `OpenAI Responses API failed: ${body}` : "OpenAI Responses API failed.");
  }

  const raw = (await response.json()) as unknown;
  const outputText = extractOutputText(raw);

  return {
    taskId: args.taskId,
    model: route.model,
    reasoningEffort,
    textVerbosity,
    outputText,
    parsed: parseStructuredOutput<T>(outputText, args.jsonSchema),
    raw,
  };
}
