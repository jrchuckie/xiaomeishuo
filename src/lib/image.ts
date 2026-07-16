async function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("IMAGE_COMPRESSION_FAILED")),
      "image/jpeg",
      quality,
    );
  });
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
    return blob;
  } finally {
    bitmap?.close();
  }
}

export async function optimizeImageFile(file: File, maxDimension = 1440, quality = 0.86): Promise<File> {
  const optimized = await resizeImageBlob(file, maxDimension, quality);
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
