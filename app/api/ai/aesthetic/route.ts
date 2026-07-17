import { apiError, readJsonField, streamJsonTask } from "../_lib/common";
import { blobToOpenAIImage, createStructuredPlan, OPENAI_PLAN_MODEL, type OpenAIContentPart } from "../_lib/openai";

export const runtime = "nodejs";

const STYLE_NAMES: Record<string, string> = {
  natural: "自然原生",
  cool: "冷感利落",
  soft: "柔和清透",
  hongkong: "港风明艳",
  sun: "健康阳光",
  youthful: "幼态轻盈",
  sculptural: "骨相立体",
  androgynous: "中性先锋",
};

const FEATURE_NAMES: Record<string, string> = {
  face: "脸型与轮廓",
  eyes: "眼睛",
  nose: "鼻子",
  lips: "嘴唇",
  brows: "眉毛",
  skin: "肤色与质感",
  hair: "发型",
};

const AESTHETIC_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["styles", "evidence", "features", "naturality", "sharpness", "warmth", "confidence"],
  properties: {
    styles: {
      type: "array",
      minItems: 5,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "score"],
        properties: {
          key: { type: "string", enum: Object.keys(STYLE_NAMES) },
          score: { type: "number", minimum: 0, maximum: 1 },
        },
      },
    },
    evidence: {
      type: "array",
      minItems: 3,
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["referenceIndex", "dominantStyle", "trust", "trustScore", "reason"],
        properties: {
          referenceIndex: { type: "integer", minimum: 1, maximum: 12 },
          dominantStyle: { type: "string" },
          trust: { type: "string", enum: ["较可信", "疑似合成", "疑似重修", "待人工核实"] },
          trustScore: { type: "number", minimum: 0, maximum: 1 },
          reason: { type: "string" },
        },
      },
    },
    features: {
      type: "array",
      minItems: 7,
      maxItems: 7,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "choice", "alternatives", "confidence", "reason"],
        properties: {
          key: { type: "string", enum: Object.keys(FEATURE_NAMES) },
          choice: { type: "string" },
          alternatives: { type: "array", items: { type: "string" }, minItems: 0, maxItems: 3 },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          reason: { type: "string" },
        },
      },
    },
    naturality: { type: "integer", minimum: 0, maximum: 100 },
    sharpness: { type: "integer", minimum: 0, maximum: 100 },
    warmth: { type: "integer", minimum: 0, maximum: 100 },
    confidence: { type: "string", enum: ["高", "中", "待校准"] },
  },
} as const;

const SYSTEM_INSTRUCTION = `你是“小美说”的个人审美研究引擎。你要从用户主动收藏的参考图中，提炼这个用户眼中的美，而不是按照主流标准给人打分。

必须遵守：
1. 逐张读取参考图，再总结反复出现的整体气质、轮廓、眼睛、鼻子、嘴唇、眉毛、肤色质感与发型信号；不要把单张图片的偶然妆造当成稳定偏好。
2. 用户的主动校准只能作为辅助，不能盖过图片证据。输出五个最强审美聚类，score 之和应接近 1。
3. “疑似合成/疑似重修”只是风险提示，不是取证结论。只有出现明确的结构、纹理、光影、边缘或重复细节异常时才这样标；无法可靠判断时必须写“待人工核实”。
4. 对 AI、重修、滤镜、妆容、拍摄角度和极端体型带来的干扰要具体说明。疑似合成或重修的图不应主导审美画像。
5. 肤色偏好不能默认等于美白；发型、眉形、胡须或妆容也属于整体审美。不得默认推荐幼态、瘦脸、大眼、高鼻或网红模板。
6. 每个五官判断要写得能让用户在自己的样本里认出来：说明哪些共性支持它，以及仍有哪些替代方向。不要诊断，不要给治疗建议。
7. 语言自然、具体、克制。不要声称仅凭图片可以确认图片真伪，也不要使用“黄金比例”“审美分数”等伪科学话术。`;

type ReferenceContext = { index?: number; id?: string; name?: string };

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const context = readJsonField(form, "context");
    const references = Array.isArray(context.references) ? context.references as ReferenceContext[] : [];
    const content: OpenAIContentPart[] = [{
      type: "input_text",
      text: `请生成个人审美画像。实际收到 ${references.length} 张参考图；evidence 必须逐张覆盖实际提供的编号，不能虚构编号。用户主动校准为：${JSON.stringify(context.calibration ?? [])}。`,
    }];

    for (let index = 0; index < Math.min(12, references.length); index += 1) {
      const value = form.get(`reference_${index}`);
      if (!(value instanceof Blob) || value.size === 0) continue;
      content.push({ type: "input_text", text: `REFERENCE_${index + 1}（用户收藏的审美参考图，不是用户本人）` });
      content.push(await blobToOpenAIImage(value, "low"));
    }

    return streamJsonTask(async () => {
      const result = await createStructuredPlan(
        SYSTEM_INSTRUCTION,
        content,
        AESTHETIC_SCHEMA as unknown as Record<string, unknown>,
        {
          formatName: "xiaomeishuo_aesthetic_profile",
          formatDescription: "Evidence-grounded personal aesthetic profile inferred from the user's own reference images.",
          maxOutputTokens: 7000,
          reasoningEffort: "low",
          verbosity: "low",
        },
      );

      const evidence = Array.isArray(result.evidence) ? result.evidence.map((item) => {
        const entry = item as Record<string, unknown>;
        const referenceIndex = Number(entry.referenceIndex || 0);
        const reference = references[referenceIndex - 1];
        return {
          sourceId: reference?.id || `reference-${referenceIndex}`,
          sourceName: reference?.name || `参考图 ${referenceIndex}`,
          dominantStyle: String(entry.dominantStyle || "信息不足"),
          trust: entry.trust,
          trustScore: entry.trustScore,
          reason: String(entry.reason || "需要人工核对来源"),
        };
      }) : [];
      const styles = Array.isArray(result.styles) ? result.styles.map((item) => {
        const entry = item as Record<string, unknown>;
        const key = String(entry.key || "natural");
        return { key, label: STYLE_NAMES[key] || key, score: Number(entry.score || 0) };
      }) : [];
      const features = Array.isArray(result.features) ? result.features.map((item) => {
        const entry = item as Record<string, unknown>;
        const key = String(entry.key || "face");
        return { ...entry, key, label: FEATURE_NAMES[key] || key };
      }) : [];
      const usableCount = evidence.filter((item) => item.trust !== "疑似合成" && item.trust !== "疑似重修").length;

      return {
        styles,
        evidence,
        features,
        naturality: result.naturality,
        sharpness: result.sharpness,
        warmth: result.warmth,
        confidence: result.confidence,
        sourceCount: references.length,
        usableCount,
        localModel: false,
        generatedBy: OPENAI_PLAN_MODEL,
        generatedAt: new Date().toISOString(),
      };
    });
  } catch (error) {
    return apiError(error);
  }
}
