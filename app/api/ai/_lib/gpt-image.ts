export const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";
const OPENAI_IMAGE_ORCHESTRATOR_MODEL = process.env.OPENAI_IMAGE_ORCHESTRATOR_MODEL
  || process.env.OPENAI_PLAN_MODEL
  || "gpt-5.4";

type OpenAIImageEditResponse = {
  data?: Array<{ b64_json?: string }>;
  error?: { code?: string; message?: string; type?: string };
};

type OpenAIBackgroundImageResponse = {
  id?: string;
  status?: string;
  incomplete_details?: { reason?: string };
  output?: Array<{ type?: string; result?: string }>;
  error?: { code?: string; message?: string; type?: string };
};

export type BackgroundImageStatus =
  | { id: string; status: "queued" | "in_progress" }
  | { id: string; status: "completed"; image: string; model: string; size: string };

function openAIHeaders() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY_NOT_CONFIGURED");
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

function responseImageSize(size: string) {
  const [width, height] = size.split("x").map(Number);
  if (!width || !height) return "auto";
  if (width / height > 1.12) return "1536x1024";
  if (height / width > 1.12) return "1024x1536";
  return "1024x1024";
}

async function blobToImageInput(blob: Blob) {
  const mimeType = blob.type || "image/jpeg";
  const data = Buffer.from(await blob.arrayBuffer()).toString("base64");
  return {
    type: "input_image" as const,
    image_url: `data:${mimeType};base64,${data}`,
    detail: "high" as const,
  };
}

function assertBackgroundResponse(response: Response, payload: OpenAIBackgroundImageResponse) {
  if (response.ok) return;
  const code = payload.error?.code || payload.error?.type || "UNKNOWN";
  const message = payload.error?.message || `HTTP ${response.status}`;
  throw new Error(`OPENAI_IMAGE_${response.status}_${code}: ${message}`);
}

function parseBackgroundImage(payload: OpenAIBackgroundImageResponse, size: string): BackgroundImageStatus {
  if (!payload.id) throw new Error("OPENAI_BACKGROUND_IMAGE_ID_MISSING");
  if (payload.status === "queued" || payload.status === "in_progress") {
    return { id: payload.id, status: payload.status };
  }
  if (payload.status === "incomplete") {
    throw new Error(`OPENAI_IMAGE_INCOMPLETE: ${payload.incomplete_details?.reason || "unknown"}`);
  }
  if (payload.status === "failed" || payload.status === "cancelled") {
    throw new Error(`OPENAI_IMAGE_${payload.status.toUpperCase()}: ${payload.error?.message || "background image ended"}`);
  }
  if (payload.status !== "completed") {
    throw new Error(`OPENAI_BACKGROUND_IMAGE_UNEXPECTED_STATUS: ${payload.status || "unknown"}`);
  }
  const image = payload.output?.find((item) => item.type === "image_generation_call" && item.result)?.result;
  if (!image) throw new Error("EMPTY_OPENAI_IMAGE_RESPONSE");
  return {
    id: payload.id,
    status: "completed",
    image: `data:image/jpeg;base64,${image}`,
    model: OPENAI_IMAGE_MODEL,
    size,
  };
}

/**
 * Starts image editing through Responses background mode. The browser receives
 * a small job id immediately and can poll without holding a mobile connection
 * open for the full image generation time.
 */
export async function startBackgroundOpenAIImageEdit(
  prompt: string,
  images: Blob[],
  requestedSize: string,
): Promise<BackgroundImageStatus> {
  if (!images.length) throw new Error("OPENAI_IMAGE_INPUT_REQUIRED");
  const size = responseImageSize(requestedSize);
  const imageInputs = await Promise.all(images.slice(0, 3).map(blobToImageInput));
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: openAIHeaders(),
    body: JSON.stringify({
      model: OPENAI_IMAGE_ORCHESTRATOR_MODEL,
      background: true,
      store: false,
      input: [{
        role: "user",
        content: [{ type: "input_text", text: prompt }, ...imageInputs],
      }],
      tools: [{
        type: "image_generation",
        model: OPENAI_IMAGE_MODEL,
        action: "edit",
        quality: "medium",
        size,
        output_format: "jpeg",
        output_compression: 92,
      }],
      tool_choice: { type: "image_generation" },
    }),
    cache: "no-store",
  });
  const payload = await response.json() as OpenAIBackgroundImageResponse;
  assertBackgroundResponse(response, payload);
  return parseBackgroundImage(payload, size);
}

export async function retrieveBackgroundOpenAIImageEdit(id: string): Promise<BackgroundImageStatus> {
  if (!/^resp_[A-Za-z0-9_-]{8,}$/.test(id)) throw new Error("INVALID_OPENAI_RESPONSE_ID");
  const response = await fetch(`https://api.openai.com/v1/responses/${encodeURIComponent(id)}`, {
    headers: openAIHeaders(),
    cache: "no-store",
  });
  const payload = await response.json() as OpenAIBackgroundImageResponse;
  assertBackgroundResponse(response, payload);
  return parseBackgroundImage(payload, "auto");
}

export async function generateOpenAIImageEdit(
  prompt: string,
  images: Blob[],
  size: string,
) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY_NOT_CONFIGURED");
  if (!images.length) throw new Error("OPENAI_IMAGE_INPUT_REQUIRED");

  const form = new FormData();
  form.set("model", OPENAI_IMAGE_MODEL);
  form.set("prompt", prompt);
  form.set("size", size);
  form.set("quality", "medium");
  form.set("output_format", "jpeg");
  form.set("output_compression", "92");
  const selectedImages = images.slice(0, 3);
  selectedImages.forEach((image, index) => {
    const extension = image.type === "image/png" ? "png" : "jpg";
    form.append(selectedImages.length === 1 ? "image" : "image[]", image, `reference-${index + 1}.${extension}`);
  });

  const response = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    cache: "no-store",
  });
  const payload = await response.json() as OpenAIImageEditResponse;
  if (!response.ok) {
    const code = payload.error?.code || payload.error?.type || "UNKNOWN";
    const message = payload.error?.message || `HTTP ${response.status}`;
    throw new Error(`OPENAI_IMAGE_${response.status}_${code}: ${message}`);
  }

  const image = payload.data?.[0]?.b64_json;
  if (!image) throw new Error("EMPTY_OPENAI_IMAGE_RESPONSE");
  return {
    image: `data:image/jpeg;base64,${image}`,
    model: OPENAI_IMAGE_MODEL,
    size,
  };
}
