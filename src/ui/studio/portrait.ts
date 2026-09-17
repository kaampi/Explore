const MAX_EDGE = 512;
const THUMB_EDGE = 256;
const SCENE_EDGE = 1600;
const JPEG_QUALITY = 0.85;
const SCENE_JPEG_QUALITY = 0.82;

export class PortraitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PortraitError";
  }
}

function jpegFromBitmap(bitmap: ImageBitmap, maxEdge: number, quality: number): string {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new PortraitError("Could not read that image.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
}

async function bitmapFromImageFile(file: File): Promise<ImageBitmap> {
  const namedPng = file.name.toLowerCase().endsWith(".png");
  if (!file.type.startsWith("image/") && !namedPng) {
    throw new PortraitError("Choose an image file.");
  }
  return createImageBitmap(file);
}

/**
 * Resize a picked image to a small JPEG data URL for the character card.
 * The model never sees this; it is Studio / Cast only.
 */
export async function portraitDataUrlFromFile(file: File): Promise<string> {
  const bitmap = await bitmapFromImageFile(file);
  try {
    return jpegFromBitmap(bitmap, MAX_EDGE, JPEG_QUALITY);
  } finally {
    bitmap.close();
  }
}

const MAX_PORTRAIT_CHARS = 800_000;

/** Drop empty, non-image, or oversized data URLs so the sheet does not lock up. */
export function portraitSrc(url: string | undefined): string | undefined {
  if (typeof url !== "string") return undefined;
  if (url.length < 20 || url.length > MAX_PORTRAIT_CHARS) return undefined;
  if (!url.startsWith("data:image/")) return undefined;
  return url;
}

export type SceneImagePair = {
  thumbDataUrl: string;
  imageDataUrl: string;
};

/** One upload → list thumb + chat/backdrop JPEG. Never sent to the model. */
export async function sceneImagesFromFile(file: File): Promise<SceneImagePair> {
  const bitmap = await bitmapFromImageFile(file);
  try {
    return {
      thumbDataUrl: jpegFromBitmap(bitmap, THUMB_EDGE, SCENE_JPEG_QUALITY),
      imageDataUrl: jpegFromBitmap(bitmap, SCENE_EDGE, SCENE_JPEG_QUALITY)
    };
  } finally {
    bitmap.close();
  }
}
