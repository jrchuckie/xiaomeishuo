export const OPENAI_PLAN_MODEL = process.env.OPENAI_PLAN_MODEL || "gpt-5.4";

export type OpenAIContentPart =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string; detail: "high" | "low" | "auto" };

type OpenAIResponse = {
  id?: string;
  status?: string;
  incomplete_details?: { reason?: string };
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string; refusal?: string }>;
  }>;
  error?: { code?: string; message?: string; type?: string };
};

type StructuredPlanOptions = {
  formatName?: string;
  formatDescription?: string;
  maxOutputTokens?: number;
  reasoningEffort?: "low" | "medium" | "high";
  verbosity?: "low" | "medium" | "high";
};

export type BackgroundPlanStatus =
  | { id: string; status: "queued" | "in_progress" }
  | { id: string; status: "completed"; result: Record<string, unknown> };

export async function blobToOpenAIImage(blob: Blob, detail: "high" | "low" = "high"): Promise<OpenAIContentPart> {
  const mimeType = blob.type || "image/jpeg";
  const data = Buffer.from(await blob.arrayBuffer()).toString("base64");
  return { type: "input_image", image_url: `data:${mimeType};base64,${data}`, detail };
}

function structuredPlanBody(
  instructions: string,
  content: OpenAIContentPart[],
  schema: Record<string, unknown>,
  options?: StructuredPlanOptions,
) {
  return {
    model: OPENAI_PLAN_MODEL,
    store: false,
    instructions,
    input: [{ role: "user", content }],
    reasoning: { effort: options?.reasoningEffort ?? "medium" },
    max_output_tokens: options?.maxOutputTokens ?? 28000,
    text: {
      verbosity: options?.verbosity ?? "medium",
      format: {
        type: "json_schema",
        name: options?.formatName ?? "xiaomeishuo_personal_plan",
        description: options?.formatDescription ?? "Personal aesthetic decision report grounded in user references, face photos, treatment history and boundaries.",
        strict: true,
        schema,
      },
    },
  };
}

function openAIHeaders() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY_NOT_CONFIGURED");
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

function assertOpenAIResponse(response: Response, payload: OpenAIResponse) {
  if (!response.ok) {
    const code = payload.error?.code || payload.error?.type || "UNKNOWN";
    const message = payload.error?.message || `HTTP ${response.status}`;
    throw new Error(`OPENAI_${response.status}_${code}: ${message}`);
  }
}

function parseStructuredResponse(payload: OpenAIResponse) {
  if (payload.status === "incomplete") {
    throw new Error(`OPENAI_INCOMPLETE: ${payload.incomplete_details?.reason || "unknown"}`);
  }
  if (payload.status === "failed" || payload.status === "cancelled") {
    throw new Error(`OPENAI_${payload.status.toUpperCase()}: ${payload.error?.message || "background response ended"}`);
  }
  const refusal = payload.output
    ?.flatMap((item) => item.content || [])
    .find((item) => item.type === "refusal")?.refusal;
  if (refusal) throw new Error(`OPENAI_REFUSAL: ${refusal}`);
  const text = payload.output
    ?.flatMap((item) => item.content || [])
    .filter((item) => item.type === "output_text" && item.text)
    .map((item) => item.text)
    .join("\n");
  if (!text) throw new Error("EMPTY_OPENAI_PLAN_RESPONSE");
  return JSON.parse(text) as Record<string, unknown>;
}

export async function createStructuredPlan(
  instructions: string,
  content: OpenAIContentPart[],
  schema: Record<string, unknown>,
  options?: StructuredPlanOptions,
) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: openAIHeaders(),
    body: JSON.stringify(structuredPlanBody(instructions, content, schema, options)),
    cache: "no-store",
  });
  const payload = await response.json() as OpenAIResponse;
  assertOpenAIResponse(response, payload);
  return parseStructuredResponse(payload);
}

export async function startBackgroundStructuredPlan(
  instructions: string,
  content: OpenAIContentPart[],
  schema: Record<string, unknown>,
  options?: StructuredPlanOptions,
): Promise<BackgroundPlanStatus> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: openAIHeaders(),
    body: JSON.stringify({
      ...structuredPlanBody(instructions, content, schema, options),
      background: true,
    }),
    cache: "no-store",
  });
  const payload = await response.json() as OpenAIResponse;
  assertOpenAIResponse(response, payload);
  if (!payload.id) throw new Error("OPENAI_BACKGROUND_ID_MISSING");
  if (payload.status === "completed") {
    return { id: payload.id, status: "completed", result: parseStructuredResponse(payload) };
  }
  if (payload.status !== "queued" && payload.status !== "in_progress") {
    parseStructuredResponse(payload);
    throw new Error(`OPENAI_BACKGROUND_UNEXPECTED_STATUS: ${payload.status || "unknown"}`);
  }
  return { id: payload.id, status: payload.status };
}

export async function retrieveBackgroundStructuredPlan(id: string): Promise<BackgroundPlanStatus> {
  if (!/^resp_[A-Za-z0-9_-]{8,}$/.test(id)) throw new Error("INVALID_OPENAI_RESPONSE_ID");
  const response = await fetch(`https://api.openai.com/v1/responses/${encodeURIComponent(id)}`, {
    headers: openAIHeaders(),
    cache: "no-store",
  });
  const payload = await response.json() as OpenAIResponse;
  assertOpenAIResponse(response, payload);
  if (payload.status === "completed") {
    return { id, status: "completed", result: parseStructuredResponse(payload) };
  }
  if (payload.status !== "queued" && payload.status !== "in_progress") {
    parseStructuredResponse(payload);
    throw new Error(`OPENAI_BACKGROUND_UNEXPECTED_STATUS: ${payload.status || "unknown"}`);
  }
  return { id, status: payload.status };
}
