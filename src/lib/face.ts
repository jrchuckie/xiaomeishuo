import type { CaptureKind, FaceCapture, FaceProfile, PhotoQuality } from "../types";

function withTimeout<T>(promise: Promise<T>, milliseconds: number, code: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(code)), milliseconds);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function blobToImage(blob: Blob) {
  const image = new Image();
  const url = URL.createObjectURL(blob);
  image.src = url;
  await withTimeout(image.decode(), 5000, "IMAGE_DECODE_TIMEOUT");
  return { image, release: () => URL.revokeObjectURL(url) };
}

function pixelQuality(image: HTMLImageElement) {
  const canvas = document.createElement("canvas");
  const width = 160;
  const height = Math.max(100, Math.round((image.naturalHeight / image.naturalWidth) * width));
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;
  const gray = new Float32Array(width * height);
  let brightness = 0;
  for (let i = 0; i < gray.length; i += 1) {
    const offset = i * 4;
    gray[i] = pixels[offset] * 0.299 + pixels[offset + 1] * 0.587 + pixels[offset + 2] * 0.114;
    brightness += gray[i];
  }
  let edges = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      edges += Math.abs(gray[index] * 4 - gray[index - 1] - gray[index + 1] - gray[index - width] - gray[index + width]);
    }
  }
  return {
    brightness: Math.round((brightness / gray.length / 255) * 100),
    sharpness: Math.min(100, Math.round(edges / ((width - 2) * (height - 2)) / 1.8)),
  };
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export async function inspectFacePhoto(blob: Blob, expected: CaptureKind): Promise<{ quality: PhotoQuality; landmarks?: { x: number; y: number; z?: number }[] }> {
  const { image, release } = await blobToImage(blob);
  try {
    const pixels = pixelQuality(image);
    const blockingMessages: string[] = [];
    if (pixels.brightness < 32) blockingMessages.push("光线偏暗，请面向自然光");
    if (pixels.brightness > 86) blockingMessages.push("面部过曝，请避开直射光");
    if (pixels.sharpness < 7) blockingMessages.push("照片不够清晰，请固定手机重拍");
    if (image.naturalWidth < 900) blockingMessages.push("分辨率偏低，建议使用原相机拍摄");

    return {
      quality: {
        usable: blockingMessages.length === 0,
        brightness: pixels.brightness,
        sharpness: pixels.sharpness,
        faceCount: 1,
        pose: expected === "front" ? "正脸" : "侧脸",
        messages: [...blockingMessages, "照片已保存；面部结构将在生成方案时结合正侧脸分析"],
      },
    };
  } finally {
    release();
  }
}

export function createFaceProfile(captures: FaceCapture[], frontLandmarks?: { x: number; y: number }[]): FaceProfile {
  const hasFront = captures.some((capture) => capture.kind === "front");
  const hasSide = captures.some((capture) => capture.kind === "left" || capture.kind === "right");
  const ready = hasFront && hasSide;
  const warningCount = captures.filter((capture) => capture.quality && !capture.quality.usable).length;
  if (!frontLandmarks || frontLandmarks.length <= 454) {
    return {
      captureReady: ready,
      summary: [
        ready ? "已获取正脸与侧脸，可以进入下一步" : "至少需要一张正脸和任一侧脸",
        warningCount > 0
          ? `${warningCount} 张照片有质量提醒；本次可继续，正式建议前应复核或重拍`
          : "照片基线已保存；面部结构将在生成方案时结合正侧脸分析",
      ],
    };
  }

  const faceHeight = distance(frontLandmarks[10], frontLandmarks[152]);
  const faceWidth = distance(frontLandmarks[234], frontLandmarks[454]);
  const jawWidth = distance(frontLandmarks[172], frontLandmarks[397]);
  const faceRatio = faceHeight / Math.max(faceWidth, 0.001);
  const jawRatio = jawWidth / Math.max(faceWidth, 0.001);
  const left = distance(frontLandmarks[1], frontLandmarks[33]);
  const right = distance(frontLandmarks[1], frontLandmarks[263]);
  const balance = 1 - Math.min(1, Math.abs(left - right) / Math.max(left, right, 0.001));
  const summary = [
    faceRatio > 1.48 ? "纵向比例偏长，适合保留横向留白" : faceRatio < 1.25 ? "纵向比例偏短，适合用发型与眉形增加舒展感" : "长宽比例较均衡，不需要追逐单一模板",
    jawRatio > 0.78 ? "下颌存在感较强，可优先优化面颈边界" : "下颌过渡相对柔和，优先保护原生轮廓",
    balance > 0.9 ? "正面左右平衡度良好" : "存在自然不对称，建议在标准拍摄后再判断",
    ...(warningCount > 0 ? [`${warningCount} 张照片有质量提醒，正式建议前应复核或重拍`] : []),
  ];

  return { faceRatio, jawRatio, balance, landmarks: frontLandmarks, summary, captureReady: ready };
}
