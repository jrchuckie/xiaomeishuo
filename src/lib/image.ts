async function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("IMAGE_COMPRESSION_FAILED")),
      "image/jpeg",
      quality,
    );
  });
}

async function imageElementFromBlob(blob: Blob) {
  const image = new Image();
  const url = URL.createObjectURL(blob);
  image.decoding = "async";
  image.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error("IMAGE_DECODE_TIMEOUT")), 8000);
      image.onload = () => {
        window.clearTimeout(timer);
        resolve();
      };
      image.onerror = () => {
        window.clearTimeout(timer);
        reject(new Error("IMAGE_DECODE_FAILED"));
      };
    });
    return { image, release: () => URL.revokeObjectURL(url) };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

async function resizeWithImageElement(blob: Blob, maxDimension: number, quality: number) {
  const { image, release } = await imageElementFromBlob(blob);
  try {
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("CANVAS_UNAVAILABLE");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await canvasToBlob(canvas, quality);
  } finally {
    release();
  }
}

export async function resizeImageBlob(blob: Blob, maxDimension = 1440, quality = 0.86): Promise<Blob> {
  if ((blob.type && !blob.type.startsWith("image/")) || blob.type === "image/svg+xml") return blob;

  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return blob;
    context.drawImage(bitmap, 0, 0, width, height);
    return await canvasToBlob(canvas, quality);
  } catch {
    try {
      // iOS Safari can decode HEIC through an image element even when createImageBitmap fails.
      return await resizeWithImageElement(blob, maxDimension, quality);
    } catch {
      return blob;
    }
  } finally {
    bitmap?.close();
  }
}

export async function optimizeImageFile(file: File, maxDimension = 1440, quality = 0.86): Promise<File> {
  const optimized = await resizeImageBlob(file, maxDimension, quality);
  if (optimized === file && file.size > 12 * 1024 * 1024) {
    throw new Error("IMAGE_TOO_LARGE_TO_OPTIMIZE");
  }
  if (optimized === file) return file;
  const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
  return new File([optimized], `${baseName}.jpg`, {
    type: "image/jpeg",
    lastModified: file.lastModified,
  });
}

export function releasePreview(url?: string) {
  if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
}
