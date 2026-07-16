import { ImageOff, ScanFace } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { FeatureKey, FeatureSelections } from "../types";

type Point = { x: number; y: number };
type PreviewMode = "compare" | "after";

type Props = {
  source?: Blob;
  landmarks?: Point[];
  selections: FeatureSelections;
};

const FEATURE_NAMES: Record<FeatureKey, string> = {
  eyes: "眼睛",
  nose: "鼻子",
  contour: "轮廓",
  brows: "眉毛",
  lips: "嘴唇",
  skin: "肤色质感",
  hair: "发型",
};

const STRENGTHS = [
  { label: "轻微", value: 0.72 },
  { label: "标准", value: 1 },
  { label: "明显", value: 1.28 },
] as const;

function midpoint(a: Point, b: Point) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function radialMap(x: number, y: number, center: Point, radiusX: number, radiusY: number, scaleX: number, scaleY: number) {
  const dx = (x - center.x) / radiusX;
  const dy = (y - center.y) / radiusY;
  const distance = Math.sqrt(dx * dx + dy * dy);
  if (distance >= 1) return { x, y };
  const weight = (1 - distance) ** 2;
  return {
    x: center.x + (x - center.x) * (1 + (scaleX - 1) * weight),
    y: center.y + (y - center.y) * (1 + (scaleY - 1) * weight),
  };
}

function getPoint(landmarks: Point[] | undefined, index: number, fallback: Point) {
  return landmarks?.[index] ?? fallback;
}

function clampChannel(value: number) {
  return Math.max(0, Math.min(255, value));
}

function drawLipDefinition(context: CanvasRenderingContext2D, landmarks: Point[] | undefined, width: number, height: number, strength: number) {
  const lipPoints = [61, 40, 37, 0, 267, 270, 291, 321, 314, 17, 84, 91]
    .map((index) => landmarks?.[index])
    .filter((point): point is Point => Boolean(point));
  context.save();
  context.strokeStyle = `rgba(105, 47, 50, ${0.22 + strength * 0.2})`;
  context.lineWidth = Math.max(1.2, width * 0.0035 * strength);
  context.lineJoin = "round";
  if (lipPoints.length >= 8) {
    context.beginPath();
    lipPoints.forEach((point, index) => {
      if (index === 0) context.moveTo(point.x * width, point.y * height);
      else context.lineTo(point.x * width, point.y * height);
    });
    context.closePath();
    context.stroke();
  } else {
    context.beginPath();
    context.ellipse(width * 0.5, height * 0.68, width * 0.09, height * 0.025, 0, 0, Math.PI * 2);
    context.stroke();
  }
  context.restore();
}

export function renderFaceSimulation(
  image: HTMLImageElement,
  landmarks: Point[] | undefined,
  selections: FeatureSelections,
  maxWidth = 720,
  maxHeight = 960,
  intensity = 1,
) {
  const strength = Math.max(0.55, Math.min(1.4, intensity));
  const tune = (target: number) => 1 + (target - 1) * strength;
  const scale = Math.min(1, maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.drawImage(image, 0, 0, width, height);
  const source = context.getImageData(0, 0, width, height);
  const output = context.createImageData(width, height);

  const normalized = landmarks;
  const leftEye = midpoint(
    getPoint(normalized, 33, { x: 0.36, y: 0.41 }),
    getPoint(normalized, 133, { x: 0.43, y: 0.41 }),
  );
  const rightEye = midpoint(
    getPoint(normalized, 362, { x: 0.57, y: 0.41 }),
    getPoint(normalized, 263, { x: 0.64, y: 0.41 }),
  );
  const nose = getPoint(normalized, 1, { x: 0.5, y: 0.56 });
  const chin = getPoint(normalized, 152, { x: 0.5, y: 0.79 });
  const leftCheek = getPoint(normalized, 234, { x: 0.27, y: 0.58 });
  const rightCheek = getPoint(normalized, 454, { x: 0.73, y: 0.58 });
  const upperLip = getPoint(normalized, 13, { x: 0.5, y: 0.66 });
  const lowerLip = getPoint(normalized, 14, { x: 0.5, y: 0.69 });
  const lip = midpoint(upperLip, lowerLip);
  const faceWidth = Math.max(0.25, Math.abs(rightCheek.x - leftCheek.x));

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let point = { x, y };
      const eyeScaleX = selections.eyes === "轻微放大" ? tune(0.68) : selections.eyes === "拉长眼尾" ? tune(0.6) : 1;
      const eyeScaleY = selections.eyes === "轻微放大" ? tune(0.7) : selections.eyes === "拉长眼尾" ? tune(0.94) : 1;
      if (eyeScaleX !== 1) {
        point = radialMap(point.x, point.y, { x: leftEye.x * width, y: leftEye.y * height }, faceWidth * width * 0.19, faceWidth * width * 0.13, eyeScaleX, eyeScaleY);
        point = radialMap(point.x, point.y, { x: rightEye.x * width, y: rightEye.y * height }, faceWidth * width * 0.19, faceWidth * width * 0.13, eyeScaleX, eyeScaleY);
      }

      if (selections.nose === "鼻尖精致") {
        point = radialMap(point.x, point.y, { x: nose.x * width, y: (nose.y + 0.035) * height }, faceWidth * width * 0.18, faceWidth * width * 0.22, tune(1.32), 1);
      } else if (selections.nose === "直线鼻背") {
        point = radialMap(point.x, point.y, { x: nose.x * width, y: (nose.y - 0.075) * height }, faceWidth * width * 0.17, faceWidth * width * 0.38, tune(1.25), tune(0.98));
      }

      if (selections.contour === "收窄下颌") {
        point = radialMap(point.x, point.y, { x: chin.x * width, y: (chin.y - 0.1) * height }, faceWidth * width * 0.72, faceWidth * width * 0.62, tune(1.2), 1);
      } else if (selections.contour === "下巴舒展") {
        point = radialMap(point.x, point.y, { x: chin.x * width, y: (chin.y - 0.035) * height }, faceWidth * width * 0.44, faceWidth * width * 0.48, 1, tune(0.75));
      }

      if (selections.lips === "轻微丰润") {
        point = radialMap(point.x, point.y, { x: lip.x * width, y: lip.y * height }, faceWidth * width * 0.25, faceWidth * width * 0.14, tune(0.74), tune(0.7));
      }

      const sampleX = Math.max(0, Math.min(width - 1, Math.round(point.x)));
      const sampleY = Math.max(0, Math.min(height - 1, Math.round(point.y)));
      const sourceIndex = (sampleY * width + sampleX) * 4;
      const outputIndex = (y * width + x) * 4;
      let red = source.data[sourceIndex];
      let green = source.data[sourceIndex + 1];
      let blue = source.data[sourceIndex + 2];

      if (selections.skin === "均匀透亮") {
        const average = (red + green + blue) / 3;
        const blend = 0.08 * strength;
        red = red * (1 - blend) + average * blend + 8 * strength;
        green = green * (1 - blend) + average * blend + 8 * strength;
        blue = blue * (1 - blend) + average * blend + 8 * strength;
      } else if (selections.skin === "健康暖调") {
        red = red * (1 + 0.055 * strength) + 4 * strength;
        green = green * (1 - 0.012 * strength);
        blue = blue * (1 - 0.075 * strength);
      }

      const lipDx = (x - lip.x * width) / (faceWidth * width * 0.25);
      const lipDy = (y - lip.y * height) / (faceWidth * width * 0.14);
      const lipDistance = Math.sqrt(lipDx * lipDx + lipDy * lipDy);
      if (selections.lips === "边界清晰" && lipDistance < 1.08) {
        const emphasis = Math.max(0, 1 - lipDistance) * strength;
        red += 10 * emphasis;
        green -= 4 * emphasis;
        blue -= 3 * emphasis;
      } else if (selections.lips === "轻微丰润" && lipDistance < 0.9) {
        red += 7 * strength;
        green -= 2 * strength;
      }

      output.data[outputIndex] = clampChannel(red);
      output.data[outputIndex + 1] = clampChannel(green);
      output.data[outputIndex + 2] = clampChannel(blue);
      output.data[outputIndex + 3] = source.data[sourceIndex + 3];
    }
  }
  context.putImageData(output, 0, 0);

  if (selections.nose === "直线鼻背") {
    context.save();
    context.strokeStyle = `rgba(255, 240, 226, ${0.08 + 0.06 * strength})`;
    context.lineWidth = Math.max(1.4, width * 0.005);
    context.lineCap = "round";
    context.beginPath();
    context.moveTo(nose.x * width, (nose.y - 0.17) * height);
    context.lineTo(nose.x * width, (nose.y + 0.025) * height);
    context.stroke();
    context.restore();
  }

  if (selections.brows !== "保留原生") {
    const leftBrow = [70, 63, 105, 66, 107].map((index, pointIndex) => getPoint(normalized, index, { x: 0.31 + pointIndex * 0.035, y: 0.35 - Math.sin(pointIndex / 4 * Math.PI) * 0.008 }));
    const rightBrow = [336, 296, 334, 293, 300].map((index, pointIndex) => getPoint(normalized, index, { x: 0.55 + pointIndex * 0.035, y: 0.35 - Math.sin(pointIndex / 4 * Math.PI) * 0.008 }));
    context.save();
    context.strokeStyle = `rgba(48, 34, 30, ${0.42 + 0.18 * strength})`;
    context.lineWidth = Math.max(2, width * 0.0075 * strength);
    context.lineCap = "round";
    context.lineJoin = "round";
    for (const brow of [leftBrow, rightBrow]) {
      context.beginPath();
      brow.forEach((point, index) => {
        const lift = selections.brows === "轻挑眉峰" && index >= 2 ? -height * 0.012 * strength * (index === 2 ? 1 : 0.45) : 0;
        if (index === 0) context.moveTo(point.x * width, point.y * height + lift);
        else context.lineTo(point.x * width, point.y * height + lift);
      });
      context.stroke();
    }
    context.restore();
  }

  if (selections.lips === "边界清晰") {
    drawLipDefinition(context, normalized, width, height, strength);
  }

  return canvas.toDataURL("image/jpeg", 0.92);
}

export default function FaceSimulation({ source, landmarks, selections }: Props) {
  const [beforeUrl, setBeforeUrl] = useState("");
  const [afterUrl, setAfterUrl] = useState("");
  const [compare, setCompare] = useState(50);
  const [mode, setMode] = useState<PreviewMode>("compare");
  const [intensity, setIntensity] = useState(1);
  const [loading, setLoading] = useState(false);
  const activeDirections = useMemo(() => (
    (Object.entries(selections) as [FeatureKey, string][])
      .filter(([key, value]) => key !== "hair" && value !== "保留原生")
      .map(([key, value]) => `${FEATURE_NAMES[key]} · ${value}`)
  ), [selections]);

  useEffect(() => {
    if (!source) {
      setBeforeUrl("");
      setAfterUrl("");
      return;
    }
    let cancelled = false;
    const url = URL.createObjectURL(source);
    setBeforeUrl(url);
    setAfterUrl("");
    setLoading(true);
    const image = new Image();
    image.src = url;
    image.decode().then(() => {
      if (!cancelled) setAfterUrl(renderFaceSimulation(image, landmarks, selections, 720, 960, intensity));
    }).catch(() => undefined).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [source, landmarks, selections, intensity]);

  if (!source) {
    return <div className="simulation-empty"><ImageOff size={28} /><strong>先拍一张合格正脸</strong><span>完成面部基线后，这里会出现本人前后对比。</span></div>;
  }

  return (
    <div className="simulation-wrap">
      <div className="simulation-controls">
        <div className="simulation-segment" role="group" aria-label="预览方式">
          <button type="button" className={mode === "compare" ? "active" : ""} onClick={() => setMode("compare")}>前后对比</button>
          <button type="button" className={mode === "after" ? "active" : ""} onClick={() => setMode("after")}>只看模拟后</button>
        </div>
        <div className="simulation-strength" role="group" aria-label="变化强度">
          <span>变化强度</span>
          {STRENGTHS.map((option) => (
            <button type="button" key={option.label} className={intensity === option.value ? "active" : ""} onClick={() => setIntensity(option.value)}>{option.label}</button>
          ))}
        </div>
      </div>
      <div className="simulation-stage">
        <img src={beforeUrl} alt="原始照片" />
        {afterUrl && (
          <div className="simulation-after" style={{ clipPath: mode === "after" ? "inset(0)" : `inset(0 ${100 - compare}% 0 0)` }}>
            <img src={afterUrl} alt="方向模拟后" />
          </div>
        )}
        {mode === "compare" && <div className="compare-line" style={{ left: `${compare}%` }}><span /></div>}
        {mode === "compare" && <span className="before-label">原始</span>}
        <span className="after-label">模拟后</span>
        {loading && <div className="simulation-loading"><ScanFace size={22} />正在生成本人预览</div>}
      </div>
      {mode === "compare" && <input className="compare-slider" type="range" min="0" max="100" value={compare} onChange={(event) => setCompare(Number(event.target.value))} aria-label="拖动比较原始照片和方向模拟" />}
      {activeDirections.length > 0 ? (
        <div className="simulation-changes">{activeDirections.map((direction) => <span key={direction}>{direction}</span>)}</div>
      ) : (
        <div className="simulation-no-change">当前五官均选择保留原生；请在下方选择改变方向后比较。</div>
      )}
      <p>这是审美方向模拟，不是术后效果承诺。发型进入完整方案，不参与面部结构变形。</p>
    </div>
  );
}
