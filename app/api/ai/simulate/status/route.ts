import { apiError, streamImageTask } from "../../_lib/common";
import { retrieveBackgroundOpenAIImageEdit } from "../../_lib/gpt-image";
import { verifyImageJob } from "../../_lib/image-job";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { jobId?: string; token?: string };
    const jobId = typeof body.jobId === "string" ? body.jobId : "";
    const token = typeof body.token === "string" ? body.token : "";
    if (!verifyImageJob(jobId, token)) {
      return Response.json({ error: "效果图任务凭证无效，请重新生成" }, { status: 403 });
    }

    const job = await retrieveBackgroundOpenAIImageEdit(jobId);
    if (job.status === "completed") {
      return streamImageTask(async () => ({
        image: job.image,
        model: job.model,
        generatedAt: new Date().toISOString(),
      }));
    }
    return Response.json({ status: job.status }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
