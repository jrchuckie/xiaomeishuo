import type {
  AestheticProfile,
  FaceCapture,
  FaceProfile,
  FeatureSelections,
  PersonalPlan,
  SimulationResult,
  SourceImage,
  UserPreferences,
  VisualScenario,
} from "../types";
import { resizeImageBlob } from "./image";

const IMAGE_FRAME_MARKER = new TextEncoder().encode("XMS_IMAGE_V1\n");
const ERROR_FRAME_MARKER = new TextEncoder().encode("XMS_ERROR_V1\n");

function findBytes(buffer: Uint8Array, needle: Uint8Array, start = 0) {
  outer: for (let index = start; index <= buffer.byteLength - needle.byteLength; index += 1) {
    for (let offset = 0; offset < needle.byteLength; offset += 1) {
      if (buffer[index + offset] !== needle[offset]) continue outer;
    }
    return index;
  }
  return -1;
}

function findLineEnd(buffer: Uint8Array, start: number) {
  for (let index = start; index < buffer.byteLength; index += 1) {
    if (buffer[index] === 10) return index;
  }
  return -1;
}

async function postFormJson<T>(endpoint: string, form: FormData) {
  let response: Response;
  try {
    response = await fetch(endpoint, { method: "POST", body: form });
  } catch {
    throw new Error("网络连接中断。照片和当前选择已保存，请保持页面开启后重试。");
  }

  const body = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (!response.ok) throw new Error(body?.error || `AI 服务返回 ${response.status}`);
  if (!body) throw new Error("AI 返回内容没有完整送达，请重试。");
  if (body.error) throw new Error(body.error);
  return body as T;
}

async function readImageResponse<T extends Record<string, unknown>>(response: Response) {
  let payload: Uint8Array;
  try {
    payload = new Uint8Array(await response.arrayBuffer());
  } catch {
    throw new Error("效果图下载中断，后台任务仍然保留，正在重新连接。");
  }
  const decoder = new TextDecoder();
  if (!response.ok) {
    const text = decoder.decode(payload).trim();
    let message = `AI 服务返回 ${response.status}`;
    try {
      const body = JSON.parse(text) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // Preserve the status-based fallback when an intermediary returns HTML.
    }
    throw new Error(message);
  }

  const imageMarker = findBytes(payload, IMAGE_FRAME_MARKER);
  const errorMarker = findBytes(payload, ERROR_FRAME_MARKER);
  if (errorMarker >= 0 && (imageMarker < 0 || errorMarker < imageMarker)) {
    const text = decoder.decode(payload.slice(errorMarker + ERROR_FRAME_MARKER.byteLength)).trim();
    let body: { error?: string } | null = null;
    try {
      body = JSON.parse(text) as { error?: string };
    } catch {
      // The frame itself can also be interrupted; keep the user-facing fallback stable.
    }
    throw new Error(body?.error || "AI 生成没有完成，请稍后重试");
  }

  if (imageMarker >= 0) {
    const lengthStart = imageMarker + IMAGE_FRAME_MARKER.byteLength;
    const lengthEnd = findLineEnd(payload, lengthStart);
    if (lengthEnd < 0) throw new Error("效果图传输中断。照片和方案已保留，请重试生成。");
    const headerLength = Number(decoder.decode(payload.slice(lengthStart, lengthEnd)));
    const headerStart = lengthEnd + 1;
    const headerEnd = headerStart + headerLength;
    if (!Number.isSafeInteger(headerLength) || headerLength <= 0 || headerEnd > payload.byteLength) {
      throw new Error("效果图传输中断。照片和方案已保留，请重试生成。");
    }
    const metadata = JSON.parse(decoder.decode(payload.slice(headerStart, headerEnd))) as T & {
      mimeType?: string;
      byteLength?: number;
      error?: string;
    };
    if (metadata.error) throw new Error(metadata.error);
    const expectedBytes = Number(metadata.byteLength);
    const imageEnd = headerEnd + expectedBytes;
    if (!Number.isSafeInteger(expectedBytes) || expectedBytes <= 0 || imageEnd > payload.byteLength) {
      throw new Error("效果图传输中断。照片和方案已保留，请重试生成。");
    }
    const imageBytes = payload.slice(headerEnd, imageEnd);
    return {
      ...metadata,
      image: new Blob([imageBytes], { type: metadata.mimeType || "image/jpeg" }),
    } as T & { image: Blob };
  }

  // During a rolling deployment, a new client can briefly reach the legacy JSON route.
  const legacyText = decoder.decode(payload).trim();
  let legacy: (T & { image?: string; error?: string }) | null = null;
  try {
    legacy = JSON.parse(legacyText) as T & { image?: string; error?: string };
  } catch {
    throw new Error("效果图传输中断。照片和方案已保留，请重试生成。");
  }
  if (legacy.error) throw new Error(legacy.error);
  if (!legacy.image) throw new Error("效果图传输中断。照片和方案已保留，请重试生成。");
  return {
    ...legacy,
    image: await dataUrlToBlob(legacy.image),
  } as T & { image: Blob };
}

async function postFormImage<T extends Record<string, unknown>>(endpoint: string, form: FormData) {
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "X-XMS-Image-Protocol": "binary-v1" },
      body: form,
    });
  } catch {
    throw new Error("网络连接中断。照片和当前选择已保存，请保持页面开启后重试。");
  }
  return readImageResponse<T>(response);
}

async function pollImageJob<T extends Record<string, unknown>>(
  endpoint: string,
  payload: { jobId: string; token: string },
) {
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("网络短暂中断，效果图仍在后台生成。");
  }

  if (response.headers.get("X-XMS-Image-Protocol") === "binary-v1") {
    return { status: "completed" as const, result: await readImageResponse<T>(response) };
  }
  const body = await response.json().catch(() => null) as {
    status?: "queued" | "in_progress";
    error?: string;
  } | null;
  if (!response.ok) throw new Error(body?.error || `AI 服务返回 ${response.status}`);
  if (!body?.status) throw new Error("效果图状态没有完整送达。");
  return { status: body.status };
}

async function postJson<T>(endpoint: string, payload: unknown) {
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("网络连接短暂中断，正在保留当前方案任务。");
  }

  const body = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (!response.ok) throw new Error(body?.error || `AI 服务返回 ${response.status}`);
  if (!body) throw new Error("方案状态没有完整送达。");
  if (body.error) throw new Error(body.error);
  return body as T;
}

function delay(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

function compactProfile(profile: AestheticProfile) {
  return {
    styles: profile.styles,
    features: profile.features,
    naturality: profile.naturality,
    sharpness: profile.sharpness,
    warmth: profile.warmth,
    confidence: profile.confidence,
    sourceCount: profile.sourceCount,
    usableCount: profile.usableCount,
    evidence: profile.evidence.map(({ thumbnail: _thumbnail, ...evidence }) => evidence),
  };
}

export async function generateAestheticProfileWithAI(input: {
  images: SourceImage[];
  calibration: string[];
  onProgress?: (message: string, progress?: number) => void;
}) {
  const selected = input.images.slice(0, 12);
  const form = new FormData();
  form.set("context", JSON.stringify({
    calibration: input.calibration,
    references: selected.map((image, index) => ({
      index: index + 1,
      id: image.id,
      name: image.name,
    })),
  }));

  input.onProgress?.("正在压缩并安全上传参考图", 0.12);
  for (let index = 0; index < selected.length; index += 1) {
    const image = selected[index];
    const compact = await resizeImageBlob(image.blob, 768, 0.68);
    form.set(`reference_${index}`, compact, image.name);
    input.onProgress?.(`正在准备第 ${index + 1} / ${selected.length} 张参考图`, 0.12 + ((index + 1) / selected.length) * 0.2);
  }

  input.onProgress?.("OpenAI 正在提炼审美共性与不真实样本", 0.38);
  const profile = await postFormJson<AestheticProfile>("/api/ai/aesthetic", form);
  input.onProgress?.("正在整理五官、肤色、眉形与发型偏好", 0.9);
  const evidence = profile.evidence.map((item) => {
    const source = selected.find((image) => image.id === item.sourceId)
      ?? selected.find((image) => image.name === item.sourceName);
    return {
      ...item,
      sourceId: source?.id ?? item.sourceId,
      sourceName: source?.name ?? item.sourceName,
    };
  });
  input.onProgress?.("个人审美画像已生成", 1);
  return { ...profile, evidence };
}

export async function generatePersonalPlanWithAI(input: {
  profile: AestheticProfile;
  faceProfile: FaceProfile;
  preferences: UserPreferences;
  selections: FeatureSelections;
  captures: FaceCapture[];
  references: SourceImage[];
  onProgress?: (message: string) => void;
}) {
  const form = new FormData();
  form.set("context", JSON.stringify({
    aestheticProfile: compactProfile(input.profile),
    faceBaseline: {
      summary: input.faceProfile.summary,
      captureReady: input.faceProfile.captureReady,
    },
    preferences: input.preferences,
    selectedDirections: input.selections,
  }));
  const primaryCaptures = [
    input.captures.find((capture) => capture.kind === "front"),
    input.captures.find((capture) => capture.kind === "left") ?? input.captures.find((capture) => capture.kind === "right"),
  ].filter((capture): capture is FaceCapture => Boolean(capture));
  const compactCaptures = await Promise.all(primaryCaptures.map(async (capture) => ({
    capture,
    blob: await resizeImageBlob(capture.blob, 1024, 0.72),
  })));
  const compactReferences = await Promise.all(input.references.slice(0, 3).map(async (reference) => ({
    reference,
    blob: await resizeImageBlob(reference.blob, 768, 0.68),
  })));
  compactCaptures.forEach(({ capture, blob }) => form.set(capture.kind, blob, capture.name));
  compactReferences.forEach(({ reference, blob }, index) => {
    form.set(`reference_${index}`, blob, reference.name);
  });

  input.onProgress?.("正在安全提交完整方案任务");
  const started = await postFormJson<
    | { status: "queued" | "in_progress"; jobId: string; token: string }
    | { status: "completed"; plan: PersonalPlan }
  >("/api/ai/plan", form);
  if (started.status === "completed") return started.plan;

  input.onProgress?.("任务已提交，正在综合审美、面部条件与治疗史");
  let consecutiveFailures = 0;
  const startedAt = Date.now();
  for (let attempt = 0; attempt < 180; attempt += 1) {
    await delay(3000);
    try {
      const status = await postJson<
        | { status: "queued" | "in_progress" }
        | { status: "completed"; plan: PersonalPlan }
      >("/api/ai/plan/status", { jobId: started.jobId, token: started.token });
      consecutiveFailures = 0;
      if (status.status === "completed") {
        input.onProgress?.("方案已完成，正在整理页面");
        return status.plan;
      }

      const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);
      input.onProgress?.(
        elapsedSeconds < 30
          ? "正在核对参考样本与个人审美"
          : elapsedSeconds < 75
            ? "正在形成分阶段方案与材料比较"
            : `正在完成详细报告，已分析约 ${elapsedSeconds} 秒`,
      );
    } catch (error) {
      consecutiveFailures += 1;
      if (consecutiveFailures >= 5) throw error;
      input.onProgress?.("网络有短暂波动，方案仍在后台生成，正在重新连接");
    }
  }
  throw new Error("完整方案生成时间超过 9 分钟，请稍后重新进入本页重试。");
}

async function dataUrlToBlob(dataUrl: string) {
  const response = await fetch(dataUrl);
  return response.blob();
}

export async function generateSimulationWithAI(input: {
  target: FaceCapture;
  identityReferences: FaceCapture[];
  scenario: VisualScenario;
  plan: PersonalPlan;
  selections: FeatureSelections;
  preferences: UserPreferences;
  engine: "gpt-image" | "seedream";
  onProgress?: (message: string) => void;
}) {
  const form = new FormData();
  form.set("context", JSON.stringify({
    angle: input.target.kind,
    stageId: input.scenario.id,
    stageLabel: input.scenario.label,
    title: input.scenario.title,
    summary: input.scenario.summary,
    changes: input.scenario.changes,
    unchanged: input.scenario.unchanged,
    aestheticGoal: input.plan.aestheticGoal,
    preserve: input.plan.preserve,
    avoid: input.plan.avoid,
    selectedDirections: input.selections,
    userConstraints: {
      personalGoal: input.preferences.personalGoal,
      currentConcerns: input.preferences.currentConcerns,
      priorities: input.preferences.priorities,
      mustPreserve: input.preferences.mustPreserve,
      excluded: input.preferences.excluded,
      doctorProposal: input.preferences.doctorProposal,
      treatmentHistory: input.preferences.treatmentHistory.map((item) => ({
        category: item.category,
        product: item.product,
        amount: item.amount,
        areas: item.areas,
        date: item.date,
        outcome: item.outcome,
      })),
    },
    engine: input.engine,
  }));
  const target = await resizeImageBlob(input.target.blob, 1536, 0.82);
  const identityReferences = await Promise.all(input.identityReferences.slice(0, 2).map(async (reference) => ({
    reference,
    blob: await resizeImageBlob(reference.blob, 1024, 0.76),
  })));
  form.set("target", target, input.target.name);
  identityReferences.forEach(({ reference, blob }, index) => {
    form.set(`identity_${index}`, blob, reference.name);
  });

  let result: {
    image: Blob;
    model: string;
    generatedAt: string;
    assumptions?: string[];
  };
  if (input.engine === "gpt-image") {
    input.onProgress?.("正在提交图片任务");
    const started = await postFormJson<{
      status: "queued" | "in_progress" | "completed";
      jobId: string;
      token: string;
    }>("/api/ai/simulate", form);

    input.onProgress?.("任务已提交，GPT Image 2 正在后台生成");
    let consecutiveFailures = 0;
    const startedAt = Date.now();
    let completed: { image: Blob; model: string; generatedAt: string } | undefined;
    for (let attempt = 0; attempt < 180; attempt += 1) {
      await delay(attempt === 0 ? 800 : 3000);
      try {
        const status = await pollImageJob<{ model: string; generatedAt: string }>(
          "/api/ai/simulate/status",
          { jobId: started.jobId, token: started.token },
        );
        consecutiveFailures = 0;
        if (status.status === "completed") {
          completed = status.result;
          break;
        }
        const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);
        input.onProgress?.(
          elapsedSeconds < 30
            ? "正在锁定本人身份、肤色与未选择区域"
            : elapsedSeconds < 80
              ? "正在生成已选择的局部结构变化"
              : `正在完成高清效果图，已生成约 ${elapsedSeconds} 秒`,
        );
      } catch (error) {
        consecutiveFailures += 1;
        if (consecutiveFailures >= 6) throw error;
        input.onProgress?.("网络有短暂波动，后台任务未丢失，正在重新连接");
      }
    }
    if (!completed) throw new Error("效果图生成超过 9 分钟，请稍后重新进入本页重试。");
    result = { ...completed, assumptions: input.scenario.changes };
  } else {
    input.onProgress?.("Seedream 正在局部编辑原图");
    result = await postFormImage<{
      model: string;
      generatedAt: string;
      assumptions: string[];
    }>("/api/ai/simulate", form);
  }
  return {
    id: crypto.randomUUID(),
    stageId: input.scenario.id,
    angle: input.target.kind,
    engine: input.engine,
    image: result.image,
    generatedAt: result.generatedAt,
    model: result.model,
    assumptions: result.assumptions ?? input.scenario.changes,
  } satisfies SimulationResult;
}
