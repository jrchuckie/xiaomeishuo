import { ImageOff, ScanFace } from "lucide-react";
import { useEffect, useState } from "react";
import type { FeatureSelections } from "../types";

type Point = { x: number; y: number };

type Props = {
  source?: Blob;
  landmarks?: Point[];
  selections: FeatureSelections;
};

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

export function renderFaceSimulation(
  image: HTMLImageElement,
  landmarks: Point[] | undefined,
  selections: FeatureSelections,
  maxWidth = 720,
  maxHeight = 960,
) {
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
      const eyeScaleX = selections.eyes === "轻微放大" ? 0.78 : selections.eyes === "拉长眼尾" ? 0.72 : 1;
      const eyeScaleY = selections.eyes === "轻微放大" ? 0.8 : selections.eyes === "拉长眼尾" ? 0.94 : 1;
      if (eyeScaleX !== 1) {
        point = radialMap(point.x, point.y, { x: leftEye.x * width, y: leftEye.y * height }, faceWidth * width * 0.18, faceWidth * width * 0.12, eyeScaleX, eyeScaleY);
        point = radialMap(point.x, point.y, { x: rightEye.x * width, y: rightEye.y * height }, faceWidth * width * 0.18, faceWidth * width * 0.12, eyeScaleX, eyeScaleY);
      }
      if (selections.nose === "鼻尖精致") {
        point = radialMap(point.x, point.y, { x: nose.x * width, y: (nose.y + 0.035) * height }, faceWidth * width * 0.18, faceWidth * width * 0.22, 1.18, 1);
      }
      if (selections.contour === "收窄下颌") {
        point = radialMap(point.x, point.y, { x: chin.x * width, y: (chin.y - 0.08) * height }, faceWidth * width * 0.66, faceWidth * width * 0.58, 1.1, 1);
      } else if (selections.contour === "下巴舒展") {
        point = radialMap(point.x, point.y, { x: chin.x * width, y: (chin.y - 0.04) * height }, faceWidth * width * 0.42, faceWidth * width * 0.45, 1, 0.88);
      }
      if (selections.lips === "轻微丰润") {
        point = radialMap(point.x, point.y, { x: lip.x * width, y: lip.y * height }, faceWidth * width * 0.24, faceWidth * width * 0.13, 0.86, 0.83);
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
        red = red * 0.94 + average * 0.06 + 5;
        green = green * 0.94 + average * 0.06 + 5;
        blue = blue * 0.94 + average * 0.06 + 5;
      } else if (selections.skin === "健康暖调") {
        red = red * 1.035 + 3;
        green = green * 0.99;
        blue = blue * 0.94;
      }
      output.data[outputIndex] = Math.min(255, red);
      output.data[outputIndex + 1] = Math.min(255, green);
      output.data[outputIndex + 2] = Math.min(255, blue);
      output.data[outputIndex + 3] = source.data[sourceIndex + 3];
    }
  }
  context.putImageData(output, 0, 0);

  if (selections.brows !== "保留原生") {
    const leftBrow = [70, 63, 105, 66, 107].map((index) => getPoint(normalized, index, { x: 0.35 + (index % 5) * 0.025, y: 0.34 }));
    const rightBrow = [336, 296, 334, 293, 300].map((index) => getPoint(normalized, index, { x: 0.55 + (index % 5) * 0.025, y: 0.34 }));
    context.strokeStyle = "rgba(48, 34, 30, 0.34)";
    context.lineWidth = Math.max(2, width * 0.007);
    context.lineCap = "round";
    for (const brow of [leftBrow, rightBrow]) {
      context.beginPath();
      brow.forEach((point, index) => {
        const lift = selections.brows === "轻挑眉峰" && index === 2 ? -height * 0.012 : 0;
        if (index === 0) context.moveTo(point.x * width, point.y * height + lift);
        else context.lineTo(point.x * width, point.y * height + lift);
      });
      context.stroke();
    }
  }
  return canvas.toDataURL("image/jpeg", 0.91);
}

export default function FaceSimulation({ source, landmarks, selections }: Props) {
  const [beforeUrl, setBeforeUrl] = useState("");
  const [afterUrl, setAfterUrl] = useState("");
  const [compare, setCompare] = useState(56);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!source) {
      setBeforeUrl("");
      setAfterUrl("");
      return;
    }
    const url = URL.createObjectURL(source);
    setBeforeUrl(url);
    setLoading(true);
    const image = new Image();
    image.src = url;
    image.decode().then(() => {
      setAfterUrl(renderFaceSimulation(image, landmarks, selections));
      setLoading(false);
    }).catch(() => setLoading(false));
    return () => URL.revokeObjectURL(url);
  }, [source, landmarks, selections]);

  if (!source) {
    return <div className="simulation-empty"><ImageOff size={28} /><strong>先拍一张合格正脸</strong><span>完成面部基线后，这里会出现本人前后对比。</span></div>;
  }

  return (
    <div className="simulation-wrap">
      <div className="simulation-stage">
        <img src={beforeUrl} alt="调整前" />
        {afterUrl && <div className="simulation-after" style={{ clipPath: `inset(0 ${100 - compare}% 0 0)` }}><img src={afterUrl} alt="方向预览" /></div>}
        <div className="compare-line" style={{ left: `${compare}%` }}><span /></div>
        <span className="before-label">调整前</span>
        <span className="after-label">方向预览</span>
        {loading && <div className="simulation-loading"><ScanFace size={22} />正在生成本人预览</div>}
      </div>
      <input className="compare-slider" type="range" min="0" max="100" value={compare} onChange={(event) => setCompare(Number(event.target.value))} aria-label="拖动比较调整前后" />
      <p>本图用于比较审美方向，采用局部几何与色彩变换，不代表材料或治疗后的真实结果。</p>
    </div>
  );
}
