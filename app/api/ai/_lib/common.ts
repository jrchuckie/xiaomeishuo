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

export function readJsonField(form: FormData, key: string) {
  const value = form.get(key);
  if (typeof value !== "string") throw new Error(`MISSING_${key.toUpperCase()}`);
  return JSON.parse(value) as Record<string, unknown>;
}
