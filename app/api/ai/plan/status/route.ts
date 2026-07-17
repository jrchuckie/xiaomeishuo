import { apiError } from "../../_lib/common";
import { retrieveBackgroundStructuredPlan } from "../../_lib/openai";
import { finalizePersonalPlan, verifyPlanJob } from "../../_lib/plan-job";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { jobId?: string; token?: string };
    const jobId = typeof body.jobId === "string" ? body.jobId : "";
    const token = typeof body.token === "string" ? body.token : "";
    if (!verifyPlanJob(jobId, token)) {
      return Response.json({ error: "方案任务凭证无效，请重新生成" }, { status: 403 });
    }

    const job = await retrieveBackgroundStructuredPlan(jobId);
    if (job.status === "completed") {
      return Response.json({ status: "completed", plan: finalizePersonalPlan(job.result) }, {
        headers: { "Cache-Control": "no-store" },
      });
    }
    return Response.json({ status: job.status }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
