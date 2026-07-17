import { apiError, readJsonField, streamJsonTask } from "../_lib/common";
import { generateOpenAIImageEdit } from "../_lib/gpt-image";
import { generateSeedreamImage } from "../_lib/seedream";

export const runtime = "nodejs";

function stringList(value: unknown, limit: number) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).slice(0, limit)
    : [];
}

const COMMON_ASPECT_RATIOS = [
  { label: "1:1", value: 1 },
  { label: "2:3", value: 2 / 3 },
  { label: "3:4", value: 3 / 4 },
  { label: "4:5", value: 4 / 5 },
  { label: "9:16", value: 9 / 16 },
  { label: "3:2", value: 3 / 2 },
  { label: "4:3", value: 4 / 3 },
  { label: "5:4", value: 5 / 4 },
  { label: "16:9", value: 16 / 9 },
];

async function imageGeometry(image: Blob) {
  const data = Buffer.from(await image.arrayBuffer());
  let width = 0;
  let height = 0;

  if (data.length >= 24 && data.toString("ascii", 1, 4) === "PNG") {
    width = data.readUInt32BE(16);
    height = data.readUInt32BE(20);
  } else if (data.length >= 4 && data[0] === 0xff && data[1] === 0xd8) {
    let offset = 2;
    const startOfFrame = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
    while (offset + 8 < data.length) {
      if (data[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      while (offset < data.length && data[offset] === 0xff) offset += 1;
      const marker = data[offset];
      offset += 1;
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > data.length) break;
      const length = data.readUInt16BE(offset);
      if (startOfFrame.has(marker) && offset + 7 < data.length) {
        height = data.readUInt16BE(offset + 3);
        width = data.readUInt16BE(offset + 5);
        break;
      }
      if (length < 2) break;
      offset += length;
    }
  }

  if (!width || !height) return { description: "图1原始宽高比", outputSize: "1024x1536" };
  const ratio = width / height;
  const closest = COMMON_ASPECT_RATIOS.reduce((best, candidate) => (
    Math.abs(Math.log(candidate.value / ratio)) < Math.abs(Math.log(best.value / ratio)) ? candidate : best
  ));
  const longEdge = 1536;
  const roundTo16 = (value: number) => Math.max(672, Math.round(value / 16) * 16);
  const outputWidth = ratio >= 1 ? longEdge : roundTo16(longEdge * ratio);
  const outputHeight = ratio >= 1 ? roundTo16(longEdge / ratio) : longEdge;
  return {
    description: `${width > height ? "横向" : "纵向"}${closest.label}`,
    outputSize: `${outputWidth}x${outputHeight}`,
  };
}

const FEATURE_LABELS: Record<string, string> = {
  eyes: "眼睛",
  nose: "鼻子",
  contour: "轮廓",
  brows: "眉毛",
  lips: "嘴唇",
  skin: "肤色质感",
  hair: "发型",
};

function selectedDirectionList(value: unknown, stageId: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const entries = Object.entries(value as Record<string, unknown>)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .filter(([, direction]) => !direction.includes("保留原生"));
  const allowedKeys = stageId === "stage-1" ? new Set(["brows", "skin", "hair"]) : new Set(Object.keys(FEATURE_LABELS));
  return entries
    .filter(([key]) => allowedKeys.has(key))
    .map(([key, direction]) => `${FEATURE_LABELS[key] || key}：${direction}`);
}

export function simulationPrompt(context: Record<string, unknown>, referenceCount: number, aspectRatio: string) {
  const stageId = typeof context.stageId === "string" ? context.stageId : "stage-2";
  const selectedDirections = selectedDirectionList(context.selectedDirections, stageId);
  const changes = [...stringList(context.changes, 5), ...selectedDirections].filter((item, index, list) => list.indexOf(item) === index).join("；") || "按方案保守改善面部轮廓";
  const unchanged = stringList(context.unchanged, 5).join("、") || "身份与个人特征";
  const preserve = stringList(context.preserve, 5).join("、");
  const avoid = stringList(context.avoid, 6).join("、");
  const intensity = stageId === "stage-1"
    ? "方向验证：改动必须在正常手机尺寸下一眼可辨，但只使用可逆的眉形、发型、胡须或肤色质感表达，不改变骨性结构"
    : stageId === "stage-3"
      ? "完整方向：把已经确认的变化组合呈现，差异一眼可见，同时保持自然、真实和同一人物"
      : "保守结构：轮廓或五官变化应清楚可见，像合理完成后的稳定状态，不夸张、不肿胀";
  const selectedKeys = new Set(Object.entries(context.selectedDirections && typeof context.selectedDirections === "object" ? context.selectedDirections as Record<string, unknown> : {})
    .filter(([, direction]) => typeof direction === "string" && !direction.includes("保留原生"))
    .map(([key]) => key));
  const untouchedFeatures = Object.entries(FEATURE_LABELS)
    .filter(([key]) => !selectedKeys.has(key))
    .map(([, label]) => label)
    .join("、");
  const identityNote = referenceCount > 0
    ? `图2至图${referenceCount + 1}仅用于确认图1中同一人物的身份特征，不采用它们的角度、光线或背景。`
    : "";

  return `以图1为唯一原始底图，生成同一人物、同一时刻的单张真实审美方向模拟照。

成功标准：
1. 在正常手机尺寸下，不拖动对比条也能清楚看见“允许改变”中的差异；不能只做色调、锐化或几乎不可见的微调。
2. 人物必须仍然是图1中的本人，不生成相似人物，不重拍，不换脸。
3. 输出保持图1的${aspectRatio}、原始取景、相机位置、头部角度、视线、表情、透视和人物占画面比例；不裁剪、不扩图、不移动人物、不重新构图。

变化强度：${intensity}。
允许改变，而且需要真实呈现：${changes}。
其余五官默认不改：${untouchedFeatures || "未进入本阶段的区域"}。
必须保留：身份、年龄、性别呈现、眼镜、耳朵、服装、背景、原始光线、真实皮肤纹理、痣与自然不对称、${unchanged}${preserve ? `、${preserve}` : ""}。
用户明确禁区：${avoid || "无额外禁区"}。禁区优先于改动要求。
禁止生成塑料感、过度填充感、磨皮美白、夸张比例、手术肿胀、文字、箭头、标记线、拼图或前后对比排版。${identityNote}`;
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const context = readJsonField(form, "context");
    const target = form.get("target");
    if (!(target instanceof Blob) || target.size === 0) {
      return Response.json({ error: "缺少需要模拟的原始照片" }, { status: 400 });
    }
    const identityReferences: Blob[] = [];
    for (let index = 0; index < 2; index += 1) {
      const reference = form.get(`identity_${index}`);
      if (reference instanceof Blob && reference.size > 0) identityReferences.push(reference);
    }
    const engine = context.engine === "seedream" ? "seedream" : "gpt-image";
    const geometry = await imageGeometry(target);
    const prompt = simulationPrompt(context, identityReferences.length, geometry.description);
    return streamJsonTask(async () => {
      const result = engine === "seedream"
        ? await generateSeedreamImage(prompt, [target, ...identityReferences])
        : await generateOpenAIImageEdit(prompt, [target, ...identityReferences], geometry.outputSize);
      return {
        image: result.image,
        model: result.model,
        engine,
        generatedAt: new Date().toISOString(),
        assumptions: stringList(context.changes, 6),
      };
    });
  } catch (error) {
    return apiError(error);
  }
}
