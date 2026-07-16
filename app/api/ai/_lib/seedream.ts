export const SEEDREAM_MODEL = process.env.SEEDREAM_MODEL || "doubao-seedream-5-0-pro-260628";
const SEEDREAM_ENDPOINT = "https://ark.cn-beijing.volces.com/api/v3/images/generations";

type SeedreamResponse = {
  model?: string;
  data?: Array<{ url?: string; b64_json?: string; size?: string }>;
  error?: { code?: string; message?: string };
};

async function blobToDataUrl(blob: Blob) {
  const mimeType = blob.type || "image/jpeg";
  const data = Buffer.from(await blob.arrayBuffer()).toString("base64");
  return `data:${mimeType};base64,${data}`;
}

async function remoteImageToDataUrl(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`SEEDREAM_IMAGE_DOWNLOAD_${response.status}`);
  const mimeType = response.headers.get("content-type") || "image/jpeg";
  const data = Buffer.from(await response.arrayBuffer()).toString("base64");
  return `data:${mimeType};base64,${data}`;
}

export async function generateSeedreamImage(prompt: string, images: Blob[]) {
  const apiKey = process.env.ARK_API_KEY;
  if (!apiKey) throw new Error("ARK_API_KEY_NOT_CONFIGURED");
  if (!images.length) throw new Error("SEEDREAM_INPUT_IMAGE_REQUIRED");

  const encodedImages = await Promise.all(images.slice(0, 3).map(blobToDataUrl));
  const response = await fetch(SEEDREAM_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: SEEDREAM_MODEL,
      prompt,
      image: encodedImages.length === 1 ? encodedImages[0] : encodedImages,
      response_format: "url",
      size: "2K",
      stream: false,
      watermark: true,
    }),
    cache: "no-store",
  });

  const payload = await response.json() as SeedreamResponse;
  if (!response.ok) {
    const code = payload.error?.code || "UNKNOWN";
    const message = payload.error?.message || `HTTP ${response.status}`;
    throw new Error(`SEEDREAM_${response.status}_${code}: ${message}`);
  }

  const result = payload.data?.[0];
  if (!result) throw new Error("EMPTY_SEEDREAM_RESPONSE");
  const image = result.b64_json
    ? `data:image/jpeg;base64,${result.b64_json}`
    : result.url
      ? await remoteImageToDataUrl(result.url)
      : null;
  if (!image) throw new Error("EMPTY_SEEDREAM_IMAGE");
  return { image, model: payload.model || SEEDREAM_MODEL, size: result.size };
}
