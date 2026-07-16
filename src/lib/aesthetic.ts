import type {
  AestheticEvidence,
  AestheticProfile,
  EvidenceTrust,
  FeaturePreference,
  SourceImage,
  StyleScore,
} from "../types";

const STYLE_LABELS = [
  { key: "natural", label: "自然原生", prompt: "natural understated beauty, authentic face, minimal styling" },
  { key: "cool", label: "冷感利落", prompt: "cool sharp minimalist beauty, clean lines, restrained expression" },
  { key: "soft", label: "柔和清透", prompt: "soft gentle beauty, low contrast, delicate harmonious features" },
  { key: "hongkong", label: "港风明艳", prompt: "glamorous Hong Kong cinema beauty, expressive and high contrast" },
  { key: "sun", label: "健康阳光", prompt: "healthy sun-kissed beauty, warm skin, energetic and athletic" },
  { key: "youthful", label: "幼态轻盈", prompt: "youthful sweet beauty, light and playful, rounded soft features" },
  { key: "sculptural", label: "骨相立体", prompt: "sculptural high-contrast beauty, defined facial structure" },
  { key: "androgynous", label: "中性先锋", prompt: "artistic androgynous beauty, experimental editorial style" },
] as const;

const TRUST_LABELS = [
  { prompt: "a real minimally retouched portrait photograph", trust: "较可信" as const, reason: "更接近真实拍摄，可作为方向参考；仍建议核对原始来源" },
  { prompt: "an AI generated synthetic portrait", trust: "疑似合成" as const, reason: "多项视觉信号更接近合成图，建议排除或核对原始来源" },
  { prompt: "a heavily retouched beauty filter portrait", trust: "疑似重修" as const, reason: "可能存在磨皮、液化或滤镜，不适合作为效果边界" },
] as const;

const FEATURE_CATEGORIES = [
  {
    key: "face" as const,
    label: "脸型与轮廓",
    options: [
      ["balanced oval face contour", "均衡椭圆"],
      ["defined angular face contour", "利落骨相"],
      ["soft rounded face contour", "柔和圆润"],
    ],
    reason: "综合样本中的下颌边界、面中留白与整体线条判断。",
  },
  {
    key: "eyes" as const,
    label: "眼睛",
    options: [
      ["natural understated eyes", "原生克制"],
      ["elongated almond shaped eyes", "细长眼型"],
      ["round open expressive eyes", "圆润有神"],
    ],
    reason: "你偏好的重点是眼型气质，不等于把眼睛统一放大。",
  },
  {
    key: "nose" as const,
    label: "鼻子",
    options: [
      ["a natural soft nose bridge", "自然柔和"],
      ["a straight defined nose bridge", "直线清晰"],
      ["a small refined nose tip", "鼻尖精致"],
    ],
    reason: "从鼻背起点、鼻尖存在感和侧面转折提炼，而不是复制同款鼻。",
  },
  {
    key: "lips" as const,
    label: "嘴唇",
    options: [
      ["natural restrained lips", "自然克制"],
      ["full defined lips", "饱满清晰"],
      ["soft curved lips", "柔和弧线"],
    ],
    reason: "综合唇部体量、唇峰边界与整体妆感判断。",
  },
  {
    key: "brows" as const,
    label: "眉毛",
    options: [
      ["straight natural eyebrows", "自然平直"],
      ["defined sharp eyebrow tails", "清晰眉尾"],
      ["arched lifted eyebrows", "轻挑眉峰"],
    ],
    reason: "眉形是成本最低、最适合先试戴的整体气质变量。",
  },
  {
    key: "skin" as const,
    label: "肤色与质感",
    options: [
      ["natural medium skin tone with real texture", "真实原生质感"],
      ["healthy sun kissed warm skin", "健康暖调"],
      ["fair cool toned luminous skin", "冷调透亮"],
    ],
    reason: "区分你喜欢的是肤色、均匀度还是滤镜感，避免默认推荐美白。",
  },
  {
    key: "hair" as const,
    label: "发型",
    options: [
      ["a short clean structured haircut", "短发利落"],
      ["layered medium length hair framing the face", "中长层次"],
      ["long soft flowing hair", "长发柔和"],
    ],
    reason: "发型决定脸周留白和轮廓重心，应在医美前先验证。",
  },
] as const;

let classifierPromise: Promise<any> | null = null;

async function loadClassifier(onProgress?: (message: string) => void) {
  if (!classifierPromise) {
    classifierPromise = (async () => {
      onProgress?.("首次使用：正在下载本地审美模型");
      const transformers = await import("@huggingface/transformers");
      transformers.env.allowLocalModels = false;
      transformers.env.useBrowserCache = true;
      return transformers.pipeline(
        "zero-shot-image-classification",
        "Xenova/clip-vit-base-patch32",
        { dtype: "q8" },
      );
    })();
  }
  return classifierPromise;
}

export async function classifyImageLabels(blob: Blob, labels: string[]) {
  const classifier = await loadClassifier();
  const url = URL.createObjectURL(blob);
  try {
    return (await classifier(url, labels)) as { label: string; score: number }[];
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function imageStats(blob: Blob) {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  const size = 96;
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.drawImage(bitmap, 0, 0, size, size);
  bitmap.close();
  const data = context.getImageData(0, 0, size, size).data;
  let r = 0;
  let b = 0;
  let saturation = 0;
  let brightness = 0;

  for (let i = 0; i < data.length; i += 4) {
    const red = data[i] / 255;
    const green = data[i + 1] / 255;
    const blue = data[i + 2] / 255;
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    r += red;
    b += blue;
    saturation += max === 0 ? 0 : (max - min) / max;
    brightness += max;
  }

  const count = data.length / 4;
  return {
    warmth: ((r - b) / count + 1) / 2,
    saturation: saturation / count,
    brightness: brightness / count,
  };
}

async function contactSheet(images: SourceImage[]) {
  const selected = images.slice(0, 12);
  const bitmaps = await Promise.all(selected.map((image) => createImageBitmap(image.blob)));
  const columns = 3;
  const rows = Math.ceil(bitmaps.length / columns);
  const cell = 256;
  const canvas = document.createElement("canvas");
  canvas.width = columns * cell;
  canvas.height = Math.max(cell, rows * cell);
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#f2f2f2";
  context.fillRect(0, 0, canvas.width, canvas.height);
  bitmaps.forEach((bitmap, index) => {
    const x = (index % columns) * cell;
    const y = Math.floor(index / columns) * cell;
    const scale = Math.max(cell / bitmap.width, cell / bitmap.height);
    const width = bitmap.width * scale;
    const height = bitmap.height * scale;
    context.drawImage(bitmap, x + (cell - width) / 2, y + (cell - height) / 2, width, height);
    bitmap.close();
  });
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("CONTACT_SHEET_FAILED")), "image/jpeg", 0.88));
}

function fallbackScores(stats: Awaited<ReturnType<typeof imageStats>>[]): StyleScore[] {
  const average = stats.reduce(
    (total, current) => ({
      warmth: total.warmth + current.warmth / stats.length,
      saturation: total.saturation + current.saturation / stats.length,
      brightness: total.brightness + current.brightness / stats.length,
    }),
    { warmth: 0, saturation: 0, brightness: 0 },
  );
  const raw: Record<string, number> = {
    natural: 0.56 + (1 - average.saturation) * 0.2,
    cool: 0.42 + (1 - average.warmth) * 0.28,
    soft: 0.48 + average.brightness * 0.22 - average.saturation * 0.08,
    hongkong: 0.32 + average.saturation * 0.34,
    sun: 0.36 + average.warmth * 0.34,
    youthful: 0.35 + average.brightness * 0.2,
    sculptural: 0.38 + average.saturation * 0.18,
    androgynous: 0.31 + (1 - average.brightness) * 0.18,
  };
  return STYLE_LABELS.map((style) => ({ key: style.key, label: style.label, score: raw[style.key] })).sort((a, b) => b.score - a.score);
}

function fallbackFeatures(calibration: string[], warmth: number): FeaturePreference[] {
  const sharp = calibration.includes("cool") || calibration.includes("sculptural");
  const soft = calibration.includes("soft") || calibration.includes("youthful");
  return [
    ["face", "脸型与轮廓", sharp ? "利落骨相" : soft ? "柔和圆润" : "均衡椭圆"],
    ["eyes", "眼睛", sharp ? "细长眼型" : soft ? "圆润有神" : "原生克制"],
    ["nose", "鼻子", sharp ? "直线清晰" : "自然柔和"],
    ["lips", "嘴唇", soft ? "柔和弧线" : "自然克制"],
    ["brows", "眉毛", sharp ? "清晰眉尾" : "自然平直"],
    ["skin", "肤色与质感", warmth > 0.54 ? "健康暖调" : "真实原生质感"],
    ["hair", "发型", sharp ? "短发利落" : "中长层次"],
  ].map(([key, label, choice]) => ({
    key: key as FeaturePreference["key"],
    label,
    choice,
    alternatives: [],
    confidence: 0.45,
    reason: "当前为轻量分析结果，建议增加样本后重新校准。",
  }));
}

function trustFromOutput(output: { label: string; score: number }[]): { trust: EvidenceTrust; score: number; reason: string } {
  const scores = Object.fromEntries(output.map((item) => [item.label, item.score]));
  const real = scores[TRUST_LABELS[0].prompt] ?? 0;
  const synthetic = scores[TRUST_LABELS[1].prompt] ?? 0;
  const retouched = scores[TRUST_LABELS[2].prompt] ?? 0;
  if (synthetic >= 0.7 && synthetic - real >= 0.18 && synthetic - retouched >= 0.08) {
    return { trust: "疑似合成", score: synthetic, reason: TRUST_LABELS[1].reason };
  }
  if (retouched >= 0.64 && retouched - real >= 0.14) {
    return { trust: "疑似重修", score: retouched, reason: TRUST_LABELS[2].reason };
  }
  if (real >= 0.48 && real - Math.max(synthetic, retouched) >= 0.06) {
    return { trust: "较可信", score: real, reason: TRUST_LABELS[0].reason };
  }
  return {
    trust: "待人工核实",
    score: Math.max(real, synthetic, retouched),
    reason: "仅凭画面无法可靠确认是否为 AI、重修或真实拍摄，请人工核对来源",
  };
}

export async function analyzeAesthetic(
  images: SourceImage[],
  calibration: string[],
  onProgress?: (message: string, progress?: number) => void,
): Promise<AestheticProfile> {
  const selected = images.slice(0, 12);
  const stats = await Promise.all(selected.map((image) => imageStats(image.blob)));
  let scores = fallbackScores(stats);
  let evidence: AestheticEvidence[] = selected.map((image) => ({
    sourceId: image.id,
    sourceName: image.name,
    dominantStyle: "待校准",
    trust: "待人工核实",
    trustScore: 0,
    reason: "本地视觉模型暂未完成真实性检查",
  }));
  let features: FeaturePreference[] = [];
  let localModel = false;

  try {
    const classifier = await loadClassifier((message) => onProgress?.(message, 0.05));
    const totals = Object.fromEntries(STYLE_LABELS.map((style) => [style.key, 0])) as Record<string, number>;
    const nextEvidence: AestheticEvidence[] = [];
    let includedCount = 0;

    for (let index = 0; index < selected.length; index += 1) {
      onProgress?.(`正在核验并理解第 ${index + 1} / ${selected.length} 张样本`, 0.1 + (index / selected.length) * 0.58);
      const url = URL.createObjectURL(selected[index].blob);
      try {
        const [styleOutput, trustOutput] = await Promise.all([
          classifier(url, STYLE_LABELS.map((style) => style.prompt)) as Promise<{ label: string; score: number }[]>,
          classifier(url, TRUST_LABELS.map((item) => item.prompt)) as Promise<{ label: string; score: number }[]>,
        ]);
        const dominant = STYLE_LABELS.find((item) => item.prompt === styleOutput[0]?.label);
        const trust = trustFromOutput(trustOutput);
        const excludedByTrust = trust.trust === "疑似合成" || trust.trust === "疑似重修";
        if (!excludedByTrust) {
          includedCount += 1;
          for (const result of styleOutput) {
            const style = STYLE_LABELS.find((item) => item.prompt === result.label);
            if (style) totals[style.key] += result.score;
          }
        }
        nextEvidence.push({
          sourceId: selected[index].id,
          sourceName: selected[index].name,
          dominantStyle: dominant?.label ?? "信息不足",
          trust: trust.trust,
          trustScore: trust.score,
          reason: trust.reason,
        });
      } finally {
        URL.revokeObjectURL(url);
      }
    }

    if (includedCount > 0) {
      scores = STYLE_LABELS.map((style) => ({ key: style.key, label: style.label, score: totals[style.key] / includedCount })).sort((a, b) => b.score - a.score);
    }
    evidence = nextEvidence;

    const trustedSelection = selected.filter((image) => !nextEvidence.some((item) => item.sourceId === image.id && (item.trust === "疑似合成" || item.trust === "疑似重修")));
    const sheet = await contactSheet(trustedSelection.length ? trustedSelection : selected);
    const sheetUrl = URL.createObjectURL(sheet);
    try {
      const nextFeatures: FeaturePreference[] = [];
      for (let index = 0; index < FEATURE_CATEGORIES.length; index += 1) {
        const category = FEATURE_CATEGORIES[index];
        onProgress?.(`正在提炼${category.label}偏好`, 0.7 + (index / FEATURE_CATEGORIES.length) * 0.24);
        const output = await classifier(sheetUrl, category.options.map(([prompt]) => prompt)) as { label: string; score: number }[];
        const ranked = output.map((result) => {
          const option = category.options.find(([prompt]) => prompt === result.label);
          return { choice: option?.[1] ?? result.label, score: result.score };
        });
        nextFeatures.push({
          key: category.key,
          label: category.label,
          choice: ranked[0]?.choice ?? "信息不足",
          alternatives: ranked.slice(1).map((item) => item.choice),
          confidence: ranked[0]?.score ?? 0,
          reason: category.reason,
        });
      }
      features = nextFeatures;
    } finally {
      URL.revokeObjectURL(sheetUrl);
    }
    localModel = true;
  } catch {
    onProgress?.("本地模型暂不可用，已切换到轻量分析与人工校准", 0.86);
  }

  const boosted = scores
    .map((current) => ({ ...current, score: current.score + (calibration.includes(current.key) ? 0.18 : 0) }))
    .sort((a, b) => b.score - a.score);
  const top = boosted.slice(0, 5);
  const total = top.reduce((sum, current) => sum + current.score, 0) || 1;
  const normalized = top.map((current) => ({ ...current, score: current.score / total }));
  const averageStats = stats.reduce(
    (acc, current) => ({
      warmth: acc.warmth + current.warmth / stats.length,
      saturation: acc.saturation + current.saturation / stats.length,
      brightness: acc.brightness + current.brightness / stats.length,
    }),
    { warmth: 0, saturation: 0, brightness: 0 },
  );
  if (!features.length) features = fallbackFeatures(calibration, averageStats.warmth);

  onProgress?.("个人审美画像已生成", 1);
  return {
    styles: normalized,
    evidence,
    features,
    naturality: Math.round(Math.min(100, 52 + (boosted.find((item) => item.key === "natural")?.score ?? 0) * 48)),
    sharpness: Math.round(Math.min(100, 35 + ((boosted.find((item) => item.key === "cool")?.score ?? 0) + (boosted.find((item) => item.key === "sculptural")?.score ?? 0)) * 35)),
    warmth: Math.round(averageStats.warmth * 100),
    confidence: selected.length >= 12 ? "高" : selected.length >= 6 ? "中" : "待校准",
    sourceCount: selected.length,
    usableCount: evidence.filter((item) => item.trust !== "疑似合成" && item.trust !== "疑似重修").length,
    localModel,
  };
}

export const STYLE_OPTIONS = STYLE_LABELS.map(({ key, label }) => ({ key, label }));
