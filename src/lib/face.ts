import type { CaptureKind, FaceCapture, FaceProfile, PhotoQuality } from "../types";
import { classifyImageLabels } from "./aesthetic";

let landmarkerPromise: Promise<any> | null = null;

async function getLandmarker() {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
      const fileset = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm",
      );
      return FaceLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task",
          delegate: "CPU",
        },
        runningMode: "IMAGE",
        numFaces: 2,
      });
    })();
  }
  return landmarkerPromise;
}

async function blobToImage(blob: Blob) {
  const image = new Image();
  const url = URL.createObjectURL(blob);
  image.src = url;
  await image.decode();
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

function classifyPose(landmarks: { x: number; y: number }[]) {
  const leftEye = landmarks[33];
  const rightEye = landmarks[263];
  const nose = landmarks[1];
  const eyeWidth = distance(leftEye, rightEye) || 1;
  const offset = Math.abs(nose.x - (leftEye.x + rightEye.x) / 2) / eyeWidth;
  if (offset < 0.12) return "正脸" as const;
  if (offset > 0.27) return "侧脸" as const;
  return "角度不标准" as const;
}

export async function inspectFacePhoto(blob: Blob, expected: CaptureKind): Promise<{ quality: PhotoQuality; landmarks?: { x: number; y: number; z?: number }[] }> {
  const { image, release } = await blobToImage(blob);
  try {
    const pixels = pixelQuality(image);
    const eyewearPromise = classifyImageLabels(blob, ["a face wearing eyeglasses", "a face without eyewear"]).catch(() => undefined);
    const sideProfilePromise = expected === "front"
      ? Promise.resolve(undefined)
      : classifyImageLabels(blob, ["a person's face photographed in full side profile", "a person's face photographed from the front"]).catch(() => undefined);
    const landmarker = await getLandmarker();
    const result = landmarker.detect(image);
    const [eyewearResult, sideProfileResult] = await Promise.all([eyewearPromise, sideProfilePromise]);
    const eyewear = eyewearResult?.[0]?.label === "a face wearing eyeglasses" && eyewearResult[0].score >= 0.55;
    const landmarks = result.faceLandmarks?.[0] as { x: number; y: number; z?: number }[] | undefined;
    const sideProfile = sideProfileResult?.[0]?.label === "a person's face photographed in full side profile" && sideProfileResult[0].score >= 0.65;
    let faceCount = result.faceLandmarks?.length ?? 0;
    let pose: PhotoQuality["pose"] = landmarks ? classifyPose(landmarks) : "未检测";
    if (expected !== "front" && sideProfile && faceCount === 0) {
      faceCount = 1;
      pose = "侧脸";
    }
    const messages: string[] = [];

    if (faceCount !== 1) messages.push(faceCount === 0 ? "没有检测到完整面部" : "画面中只能出现一个人");
    if (pixels.brightness < 32) messages.push("光线偏暗，请面向自然光");
    if (pixels.brightness > 86) messages.push("面部过曝，请避开直射光");
    if (pixels.sharpness < 7) messages.push("照片不够清晰，请固定手机重拍");
    if (image.naturalWidth < 900) messages.push("分辨率偏低，建议使用原相机拍摄");
    if (expected === "front" && pose !== "正脸") messages.push("请保持正脸，不要仰头或转头");
    if (expected !== "front" && pose === "正脸") messages.push("需要补拍完整侧脸");
    if (eyewear) messages.push("检测到可能佩戴眼镜，请摘掉后重拍");

    return {
      quality: {
        usable: messages.length === 0,
        brightness: pixels.brightness,
        sharpness: pixels.sharpness,
        faceCount,
        eyewear,
        pose,
        messages,
      },
      landmarks,
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
          : "面部比例仍在后台计算，不影响继续设置预算与边界",
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
