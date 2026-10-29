export const ANATOMY_IMAGE_EDGE = 1600;
export const ANATOMY_IMAGE_MAX_CHARS = 6_000_000;

/** Preserve transparent line art while bounding the stored illustration. */
export async function anatomyImageFromFile(file: File): Promise<string> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    throw new Error("Choose a PNG, JPEG or WebP image.");
  }
  if (file.size > 10 * 1024 * 1024) throw new Error("Choose an image smaller than 10 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, ANATOMY_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not read this image.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL("image/png");
    if (data.length > ANATOMY_IMAGE_MAX_CHARS) throw new Error("This image is too detailed to store. Try a simpler or smaller image.");
    return data;
  } finally {
    bitmap.close();
  }
}
