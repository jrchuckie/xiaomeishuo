import { createHmac, timingSafeEqual } from "node:crypto";
import { OPENAI_PLAN_MODEL } from "./openai";

function jobSecret() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY_NOT_CONFIGURED");
  return apiKey;
}

export function signPlanJob(jobId: string) {
  return createHmac("sha256", jobSecret()).update(`xiaomeishuo-plan:${jobId}`).digest("hex");
}

export function verifyPlanJob(jobId: string, token: string) {
  if (!/^resp_[A-Za-z0-9_-]{8,}$/.test(jobId) || !/^[a-f0-9]{64}$/.test(token)) return false;
  const expected = Buffer.from(signPlanJob(jobId), "hex");
  const received = Buffer.from(token, "hex");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function finalizePersonalPlan(plan: Record<string, unknown>) {
  if (!Array.isArray(plan.phases) || plan.phases.length < 3) throw new Error("INCOMPLETE_PLAN_PHASES");
  if (!Array.isArray(plan.visualScenarios) || plan.visualScenarios.length !== 3) throw new Error("INCOMPLETE_VISUAL_SCENARIOS");
  if (typeof plan.headline !== "string" || !plan.headline.trim()) throw new Error("INCOMPLETE_PLAN_HEADLINE");
  return {
    ...plan,
    generatedBy: OPENAI_PLAN_MODEL,
    generatedAt: new Date().toISOString(),
  };
}
