export const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";

type OpenAIImageEditResponse = {
  data?: Array<{ b64_json?: string }>;
  error?: { code?: string; message?: string; type?: string };
};

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
