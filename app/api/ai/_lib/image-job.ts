import { createHmac, timingSafeEqual } from "node:crypto";

function jobSecret() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY_NOT_CONFIGURED");
  return apiKey;
}

export function signImageJob(jobId: string) {
  return createHmac("sha256", jobSecret()).update(`xiaomeishuo-image:${jobId}`).digest("hex");
}

export function verifyImageJob(jobId: string, token: string) {
  if (!/^resp_[A-Za-z0-9_-]{8,}$/.test(jobId) || !/^[a-f0-9]{64}$/.test(token)) return false;
  const expected = Buffer.from(signImageJob(jobId), "hex");
  const received = Buffer.from(token, "hex");
  return expected.length === received.length && timingSafeEqual(expected, received);
}
