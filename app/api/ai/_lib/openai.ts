export const OPENAI_PLAN_MODEL = process.env.OPENAI_PLAN_MODEL || "gpt-5.4";

export type OpenAIContentPart =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string; detail: "high" | "low" | "auto" };

type OpenAIResponse = {
  status?: string;
  incomplete_details?: { reason?: string };
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string; refusal?: string }>;
  }>;
  error?: { code?: string; message?: string; type?: string };
};

export async function blobToOpenAIImage(blob: Blob, detail: "high" | "low" = "high"): Promise<OpenAIContentPart> {
  const mimeType = blob.type || "image/jpeg";
  const data = Buffer.from(await blob.arrayBuffer()).toString("base64");
  return { type: "input_image", image_url: `data:${mimeType};base64,${data}`, detail };
}

export async function createStructuredPlan(
  instructions: string,
  content: OpenAIContentPart[],
  schema: Record<string, unknown>,
) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY_NOT_CONFIGURED");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_PLAN_MODEL,
      store: false,
      instructions,
      input: [{ role: "user", content }],
      reasoning: { effort: "medium" },
      max_output_tokens: 28000,
      text: {
        verbosity: "medium",
        format: {
          type: "json_schema",
          name: "xiaomeishuo_personal_plan",
          description: "Personal aesthetic decision report grounded in user references, face photos, treatment history and boundaries.",
          strict: true,
          schema,
        },
      },
    }),
    cache: "no-store",
  });

  const payload = await response.json() as OpenAIResponse;
  if (!response.ok) {
    const code = payload.error?.code || payload.error?.type || "UNKNOWN";
    const message = payload.error?.message || `HTTP ${response.status}`;
    throw new Error(`OPENAI_${response.status}_${code}: ${message}`);
  }
  if (payload.status === "incomplete") {
    throw new Error(`OPENAI_INCOMPLETE: ${payload.incomplete_details?.reason || "unknown"}`);
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
