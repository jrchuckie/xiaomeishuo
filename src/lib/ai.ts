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
  engine: "gpt-image" | "seedream";
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

  const result = await postFormJson<{
    image: string;
    model: string;
    generatedAt: string;
    assumptions: string[];
  }>("/api/ai/simulate", form);
  return {
    id: crypto.randomUUID(),
    stageId: input.scenario.id,
    angle: input.target.kind,
    engine: input.engine,
    image: await dataUrlToBlob(result.image),
    generatedAt: result.generatedAt,
    model: result.model,
    assumptions: result.assumptions,
  } satisfies SimulationResult;
}
