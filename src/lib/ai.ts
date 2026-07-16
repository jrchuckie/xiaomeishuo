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

async function apiFailure(response: Response) {
  const body = await response.json().catch(() => ({})) as { error?: string };
  throw new Error(body.error || `AI 服务返回 ${response.status}`);
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

export async function generatePersonalPlanWithAI(input: {
  profile: AestheticProfile;
  faceProfile: FaceProfile;
  preferences: UserPreferences;
  selections: FeatureSelections;
  captures: FaceCapture[];
  references: SourceImage[];
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
  const compactCaptures = await Promise.all(input.captures.map(async (capture) => ({
    capture,
    blob: await resizeImageBlob(capture.blob, 1280, 0.78),
  })));
  const compactReferences = await Promise.all(input.references.slice(0, 6).map(async (reference) => ({
    reference,
    blob: await resizeImageBlob(reference.blob, 1024, 0.74),
  })));
  compactCaptures.forEach(({ capture, blob }) => form.set(capture.kind, blob, capture.name));
  compactReferences.forEach(({ reference, blob }, index) => {
    form.set(`reference_${index}`, blob, reference.name);
  });

  const response = await fetch("/api/ai/plan", { method: "POST", body: form });
  if (!response.ok) await apiFailure(response);
  return await response.json() as PersonalPlan;
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

  const response = await fetch("/api/ai/simulate", { method: "POST", body: form });
  if (!response.ok) await apiFailure(response);
  const result = await response.json() as {
    image: string;
    model: string;
    generatedAt: string;
    assumptions: string[];
  };
  return {
    id: crypto.randomUUID(),
    stageId: input.scenario.id,
    angle: input.target.kind,
    image: await dataUrlToBlob(result.image),
    generatedAt: result.generatedAt,
    model: result.model,
    assumptions: result.assumptions,
  } satisfies SimulationResult;
}
