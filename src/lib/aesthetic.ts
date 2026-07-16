import type { AestheticProfile, FeaturePreference, SourceImage } from "../types";

const STYLE_LABELS = [
  { key: "natural", label: "自然原生" },
  { key: "cool", label: "冷感利落" },
  { key: "soft", label: "柔和清透" },
  { key: "hongkong", label: "港风明艳" },
  { key: "sun", label: "健康阳光" },
  { key: "youthful", label: "幼态轻盈" },
  { key: "sculptural", label: "骨相立体" },
  { key: "androgynous", label: "中性先锋" },
] as const;

function fallbackFeatures(calibration: string[]): FeaturePreference[] {
  const sharp = calibration.includes("cool") || calibration.includes("sculptural");
  const soft = calibration.includes("soft") || calibration.includes("youthful");
  const warm = calibration.includes("sun") || calibration.includes("hongkong");
  return [
    ["face", "脸型与轮廓", sharp ? "利落骨相" : soft ? "柔和圆润" : "均衡椭圆"],
    ["eyes", "眼睛", sharp ? "细长眼型" : soft ? "圆润有神" : "原生克制"],
    ["nose", "鼻子", sharp ? "直线清晰" : "自然柔和"],
    ["lips", "嘴唇", soft ? "柔和弧线" : "自然克制"],
    ["brows", "眉毛", sharp ? "清晰眉尾" : "自然平直"],
    ["skin", "肤色与质感", warm ? "健康暖调" : "真实原生质感"],
    ["hair", "发型", sharp ? "短发利落" : "中长层次"],
  ].map(([key, label, choice]) => ({
    key: key as FeaturePreference["key"],
    label,
    choice,
    alternatives: [],
    confidence: 0.35,
    reason: "云端分析未完成，当前只保留你主动选择的校准方向。",
  }));
}

export async function analyzeAesthetic(
  images: SourceImage[],
  calibration: string[],
  onProgress?: (message: string, progress?: number) => void,
  _options?: { useClassifier?: boolean },
): Promise<AestheticProfile> {
  const selected = images.slice(0, 12);
  const raw = STYLE_LABELS.map((style, index) => ({
    key: style.key,
    label: style.label,
    score: 1 + (calibration.includes(style.key) ? 1.6 : 0) + Math.max(0, 0.35 - index * 0.04),
  })).sort((a, b) => b.score - a.score).slice(0, 5);
  const total = raw.reduce((sum, item) => sum + item.score, 0) || 1;
  onProgress?.("云端分析暂未完成，已保留样本和所有进度", 1);

  return {
    styles: raw.map((item) => ({ ...item, score: item.score / total })),
    evidence: selected.map((image) => ({
      sourceId: image.id,
      sourceName: image.name,
      dominantStyle: "待重新分析",
      trust: "待人工核实",
      trustScore: 0,
      reason: "云端视觉分析未完成，本地不伪造图片真伪结论",
    })),
    features: fallbackFeatures(calibration),
    naturality: calibration.includes("natural") ? 72 : 55,
    sharpness: calibration.includes("cool") || calibration.includes("sculptural") ? 70 : 50,
    warmth: calibration.includes("sun") || calibration.includes("hongkong") ? 68 : 50,
    confidence: "待校准",
    sourceCount: selected.length,
    usableCount: selected.length,
    localModel: false,
  };
}

export const STYLE_OPTIONS = STYLE_LABELS.map(({ key, label }) => ({ key, label }));
