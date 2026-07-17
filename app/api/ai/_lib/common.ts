function redactSecrets(value: string) {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(/(?:sk|ark-|AIza)[A-Za-z0-9._-]{12,}/g, "[redacted]");
}

export function apiError(error: unknown) {
  const raw = redactSecrets(error instanceof Error ? error.message : String(error));
  console.error("[AI service]", raw.slice(0, 1400));
  const missingKey = /(?:OPENAI|ARK)_API_KEY_NOT_CONFIGURED/.test(raw);
  const blocked = /safety|blocked|prohibited|policy|refusal/i.test(raw);
  const overloaded = /429|quota|resource exhausted|overloaded|rate_limit/i.test(raw);
  const unauthorized = /(?:OPENAI|SEEDREAM)_(401|403)/.test(raw);
  const tooLarge = /413|body exceeded|payload too large|request too large/i.test(raw);
  const message = missingKey
    ? "AI 服务尚未配置"
    : unauthorized
      ? "AI 服务授权失效，请更新服务配置"
      : blocked
        ? "这次请求未通过模型安全检查，请调整目标后重试"
        : overloaded
          ? "AI 服务当前繁忙或额度不足，请稍后重试"
          : tooLarge
            ? "本次照片体积过大，请减少参考图后重试"
            : "AI 生成没有完成，请稍后重试";
  const status = missingKey ? 503 : unauthorized ? 502 : overloaded ? 429 : tooLarge ? 413 : 500;
  return Response.json({ error: message }, { status });
}

export function streamJsonTask(task: () => Promise<unknown>) {
  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let cancelled = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const push = (value: string) => {
        if (!cancelled) controller.enqueue(encoder.encode(value));
      };

      // Flush response headers immediately so long AI calls stay connected on mobile.
      push(" ".repeat(2048));
      heartbeat = setInterval(() => push(" ".repeat(2048)), 4000);

      void task()
        .then((result) => push(JSON.stringify(result)))
        .catch(async (error) => {
          const response = apiError(error);
          push(await response.text());
        })
        .finally(() => {
          if (heartbeat) clearInterval(heartbeat);
          if (!cancelled) controller.close();
        });
    },
    cancel() {
      cancelled = true;
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-store, no-transform",
      "Content-Type": "application/json; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}

const IMAGE_FRAME_MARKER = "XMS_IMAGE_V1\n";
const ERROR_FRAME_MARKER = "XMS_ERROR_V1\n";
const STREAM_CHUNK_SIZE = 64 * 1024;

function decodeDataImage(image: string) {
  const match = image.match(/^data:([^;,]+);base64,(.+)$/s);
  if (!match) throw new Error("INVALID_GENERATED_IMAGE");
  return {
    mimeType: match[1],
    bytes: new Uint8Array(Buffer.from(match[2], "base64")),
  };
}

/**
 * Keeps long image generations connected while sending the final image as raw
 * bytes. This avoids wrapping a large base64 image in JSON, which is fragile on
 * mobile networks and adds roughly 33% transport overhead.
 */
export function streamImageTask<T extends { image: string }>(task: () => Promise<T>) {
  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let cancelled = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const stopHeartbeat = () => {
        if (heartbeat) clearInterval(heartbeat);
        heartbeat = undefined;
      };
      const pushBytes = (bytes: Uint8Array) => {
        if (cancelled) return;
        for (let offset = 0; offset < bytes.byteLength; offset += STREAM_CHUNK_SIZE) {
          controller.enqueue(bytes.slice(offset, offset + STREAM_CHUNK_SIZE));
        }
      };
      const pushText = (value: string) => pushBytes(encoder.encode(value));

      // Flush response headers immediately so long AI calls stay connected on mobile.
      pushText(" ".repeat(2048));
      heartbeat = setInterval(() => pushText(" ".repeat(2048)), 4000);

      void task()
        .then((result) => {
          stopHeartbeat();
          const { image, ...metadata } = result;
          const decoded = decodeDataImage(image);
          const header = encoder.encode(JSON.stringify({
            ...metadata,
            mimeType: decoded.mimeType,
            byteLength: decoded.bytes.byteLength,
          }));
          pushText(IMAGE_FRAME_MARKER);
          pushText(`${header.byteLength}\n`);
          pushBytes(header);
          pushBytes(decoded.bytes);
        })
        .catch(async (error) => {
          stopHeartbeat();
          const response = apiError(error);
          const payload = await response.text();
          pushText(ERROR_FRAME_MARKER);
          pushText(payload);
        })
        .finally(() => {
          stopHeartbeat();
          if (!cancelled) controller.close();
        });
    },
    cancel() {
      cancelled = true;
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-store, no-transform",
      "Content-Type": "application/octet-stream",
      "X-Accel-Buffering": "no",
      "X-XMS-Image-Protocol": "binary-v1",
    },
  });
}

export function readJsonField(form: FormData, key: string) {
  const value = form.get(key);
  if (typeof value !== "string") throw new Error(`MISSING_${key.toUpperCase()}`);
  return JSON.parse(value) as Record<string, unknown>;
}
