import { apiError, readJsonField, streamImageTask, streamJsonTask } from "../_lib/common";
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

const FEATURE_MATCHERS: Record<string, RegExp> = {
  eyes: /眼|眼尾|眼型|双眼皮/,
  nose: /鼻/,
  contour: /轮廓|下颌|下巴|颏|颧|面中|面颊|脸型|骨相/,
  brows: /眉/,
  lips: /唇|嘴/,
  skin: /肤色|皮肤|美白|提亮|透亮|光泽|磨皮|纹理/,
  hair: /头发|发型|发量|发际线|短发|长发|刘海/,
};

const DIRECTION_INSTRUCTIONS: Record<string, string> = {
  "轻微放大": "只调整眼裂视觉开度，保留原始眼距、双眼皮形态、瞳孔大小和眼神",
  "拉长眼尾": "只轻微延长眼尾走向，不放大瞳孔、不新增双眼皮、不改变眉形",
  "鼻尖精致": "只轻微整理鼻尖轮廓，保留原鼻背高度、鼻翼宽度和鼻部辨识度",
  "直线鼻背": "只轻微顺直鼻背线条，不抬高鼻根、不缩鼻翼、不改变鼻尖投射",
  "颧下过渡平顺": "重点降低颧骨的视觉突兀感：在颧骨下方至中面、下颌之间建立清楚但克制的支撑过渡；保留颧骨骨点，不削颧骨，不把面中填成饱满苹果肌，正脸与侧脸都应一眼看出过渡更连贯",
  "下颌线强化": "只强化耳下至下巴之间的下颌缘边界与连接，保留男性宽度，不做尖脸、不让颧骨更突出",
  "下巴舒展": "只让下巴中线轻微前移并纵向舒展，保持方中带钝，不做尖、翘或横向加宽",
  "清晰眉尾": "只整理眉尾边界，不增加眉毛密度、不抬眉、不改变眼型",
  "轻挑眉峰": "只轻微调整眉峰走向，不增加眉毛密度、不改变眉色与眼型",
  "边界清晰": "只整理唇缘边界，保持原始唇厚、唇色和嘴角位置",
  "轻微丰润": "只做克制的唇部体积变化，保持原始唇色和嘴角，不做嘟唇",
  "均匀透亮": "只改善局部色泽均匀度，不提高整体曝光，不改变黑白或冷暖肤色，不磨皮",
  "健康暖调": "只在保持原始明度的前提下呈现更健康的暖调，不美白、不提亮曝光、不磨皮",
  "短发利落": "只调整发型轮廓，严格保持原始发量、发际线、密度和头顶高度",
  "中长层次": "只调整长度与层次，严格保持原始发量、发际线、密度和头顶高度",
  "长发柔和": "只调整长度与层次，严格保持原始发量、发际线、密度和头顶高度",
};

function selectedDirectionEntries(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .filter(([, direction]) => !direction.includes("保留原生"));
}

function selectedDirectionList(value: unknown) {
  return selectedDirectionEntries(value).map(([key, direction]) => (
    `${FEATURE_LABELS[key] || key}：${direction}。${DIRECTION_INSTRUCTIONS[direction] || "只改这一项，不联动美化其他区域"}`
  ));
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function allowedScenarioChanges(value: unknown, selectedKeys: Set<string>) {
  return stringList(value, 8).filter((change) => {
    const matchedKeys = Object.entries(FEATURE_MATCHERS)
      .filter(([, matcher]) => matcher.test(change))
      .map(([key]) => key);
    return matchedKeys.length > 0 && matchedKeys.some((key) => selectedKeys.has(key));
  });
}

export function simulationPrompt(context: Record<string, unknown>, referenceCount: number, aspectRatio: string) {
  const stageId = typeof context.stageId === "string" ? context.stageId : "stage-2";
  const selectedEntries = selectedDirectionEntries(context.selectedDirections);
  const selectedKeys = new Set(selectedEntries.map(([key]) => key));
  const selectedDirections = selectedDirectionList(context.selectedDirections);
  const scenarioChanges = allowedScenarioChanges(context.changes, selectedKeys);
  const changes = [...selectedDirections, ...scenarioChanges].filter((item, index, list) => list.indexOf(item) === index).join("；") || "没有已授权改动，保持图1原样";
  const unchanged = stringList(context.unchanged, 5).join("、") || "身份与个人特征";
  const preserve = stringList(context.preserve, 5).join("、");
  const avoid = stringList(context.avoid, 6).join("、");
  const userConstraints = context.userConstraints && typeof context.userConstraints === "object" && !Array.isArray(context.userConstraints)
    ? context.userConstraints as Record<string, unknown>
    : {};
  const mustPreserve = stringList(userConstraints.mustPreserve, 8).join("、");
  const excluded = stringList(userConstraints.excluded, 8).join("、");
  const personalGoal = stringValue(userConstraints.personalGoal);
  const currentConcerns = stringValue(userConstraints.currentConcerns);
  const skinLocked = !selectedKeys.has("skin") || /原生肤色/.test(`${preserve}${mustPreserve}`) || /美白/.test(`${avoid}${excluded}`);
  const hairLocked = !selectedKeys.has("hair");
  const intensity = stageId === "stage-1"
    ? "方向验证：只呈现已授权变化约 35–45% 的保守幅度；差异可辨，但不加入任何未授权妆发、肤色或五官美化"
    : stageId === "stage-3"
      ? "完整方向：把已经确认的变化组合呈现，差异一眼可见，同时保持自然、真实和同一人物"
      : "保守结构：轮廓或五官变化应清楚可见，像合理完成后的稳定状态，不夸张、不肿胀";
  const untouchedFeatures = Object.entries(FEATURE_LABELS)
    .filter(([key]) => !selectedKeys.has(key))
    .map(([, label]) => label)
    .join("、");
  const identityNote = referenceCount > 0
    ? `图2至图${referenceCount + 1}仅用于确认图1中同一人物的身份特征，不采用它们的角度、光线或背景。`
    : "";

  return `任务类型：严格局部编辑，不是重新拍摄，不是通用美化。
以图1为不可替换的唯一原始底图。前后必须是同一人物、同一角度、同一表情、同一光线方向、同一构图比例；只能编辑下方“逐项授权”的区域。

成功标准：
1. 在正常手机尺寸下，不拖动对比条也能清楚看见已授权结构变化；若目标涉及颧下、下颌或下巴，必须真实改变对应几何轮廓，不能用美白、磨皮、增发或锐化冒充改善。
2. 人物必须仍然是图1中的本人，不生成相似人物，不重拍，不换脸。
3. 输出保持图1的${aspectRatio}、原始取景、相机位置、头部角度、视线、表情、透视和人物占画面比例；不裁剪、不扩图、不移动人物、不重新构图。

变化强度：${intensity}。
逐项授权，只能改变：${changes}。
未授权并锁定：${untouchedFeatures || "所有未列出的区域"}。
用户目标：${personalGoal || "以已授权方向为准"}。
用户当前最在意：${currentConcerns || "以已授权方向为准"}。

绝对锁定：
- ${skinLocked ? "肤色、曝光、白平衡、黑色素/晒黑程度、雀斑痣、毛孔与真实纹理必须与图1一致；绝对不美白、不提亮、不磨皮。" : "肤色仅可按已授权方向调整，曝光、白平衡、雀斑痣和皮肤纹理保持不变。"}
- ${hairLocked ? "发量、发际线、头发长度、密度、头顶高度、胡须与发型必须与图1一致；绝对不增发、不补发际线。" : "只按已授权发型方向调整，发量、发际线、密度和头顶高度保持不变。"}
- 未授权的眼睛、眉毛、鼻子、嘴唇、耳朵与面部不对称必须像素级保持原状，不自动做对称化或精致化。
- 必须保留身份、年龄、性别呈现、眼镜、服装、背景、原始光线、真实皮肤纹理、痣与自然不对称、${unchanged}${preserve ? `、${preserve}` : ""}${mustPreserve ? `、${mustPreserve}` : ""}。
- 用户明确禁区：${[avoid, excluded].filter(Boolean).join("、") || "无额外禁区"}。禁区优先于一切改动。

禁止生成塑料感、过度填充感、磨皮美白、擅自增发、夸张比例、手术肿胀、文字、箭头、标记线、拼图或前后对比排版。若任何授权变化与锁定项冲突，宁可减少变化，也不得改动锁定项。${identityNote}`;
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
    const task = async () => {
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
    };
    return request.headers.get("X-XMS-Image-Protocol") === "binary-v1"
      ? streamImageTask(task)
      : streamJsonTask(task);
  } catch (error) {
    return apiError(error);
  }
}
