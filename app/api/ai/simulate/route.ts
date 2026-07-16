import { apiError, readJsonField } from "../_lib/common";
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

async function imageAspectRatio(image: Blob) {
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

  if (!width || !height) return "图1原始宽高比";
  const ratio = width / height;
  const closest = COMMON_ASPECT_RATIOS.reduce((best, candidate) => (
    Math.abs(Math.log(candidate.value / ratio)) < Math.abs(Math.log(best.value / ratio)) ? candidate : best
  ));
  return `${width > height ? "横向" : "纵向"}${closest.label}`;
}

function simulationPrompt(context: Record<string, unknown>, referenceCount: number, aspectRatio: string) {
  const changes = stringList(context.changes, 4).join("；") || "按方案保守改善面部轮廓";
  const unchanged = stringList(context.unchanged, 5).join("、") || "身份与个人特征";
  const preserve = stringList(context.preserve, 5).join("、");
  const avoid = stringList(context.avoid, 6).join("、");
  const stageId = typeof context.stageId === "string" ? context.stageId : "stage-2";
  const intensity = stageId === "stage-1"
    ? "轻微：变化克制，需要对比才能看出"
    : stageId === "stage-3"
      ? "明显：差异一眼可见，但仍自然可信"
      : "标准：差异清楚可见，不夸张";
  const identityNote = referenceCount > 0
    ? `图2至图${referenceCount + 1}仅用于确认图1中同一人物的身份特征，不采用它们的角度、光线或背景。`
    : "";

  return `编辑图1，生成一张真实的审美方向模拟照。输出必须保持图1的${aspectRatio}、原始取景、相机位置、透视和人物占画面比例；严禁裁剪、扩图、缩放、旋转、移动人物或重新构图。严格保留同一人物身份、年龄、性别呈现、头部角度、视线、表情、镜头透视、构图、发型、胡须、眼镜、耳朵、服装、背景、皮肤纹理、痣与光线。${identityNote}变化强度为${intensity}。仅改变：${changes}。必须保留：${unchanged}${preserve ? `、${preserve}` : ""}。禁止：${avoid ? `${avoid}、` : ""}美白、磨皮、自动瘦脸、放大眼睛、修改眉毛、尖下巴、网红填充感、换脸。不要添加文字、箭头、线条或拼图。`;
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
    const result = await generateSeedreamImage(
      simulationPrompt(context, identityReferences.length, await imageAspectRatio(target)),
      [target, ...identityReferences],
    );

    return Response.json({
      image: result.image,
      model: result.model,
      generatedAt: new Date().toISOString(),
      assumptions: stringList(context.changes, 6),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
