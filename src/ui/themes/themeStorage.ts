import { ThemeLibrarySchema, type ThemeLibrary } from "./theme";

// Separate UI database: appearance never changes session/library migrations.
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("sandboxai-appearance", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("preferences");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Could not open appearance storage."));
    request.onblocked = () =>
      reject(new Error("Appearance storage is blocked by another tab."));
  });
}
export async function loadThemeLibrary(): Promise<ThemeLibrary | null> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction("preferences", "readonly");
      const request = transaction.objectStore("preferences").get("library");
      let result: ThemeLibrary | null = null;
      request.onsuccess = () => {
        if (request.result === undefined) return;
        const parsed = ThemeLibrarySchema.safeParse(request.result);
        if (parsed.success) result = parsed.data;
        else
          reject(
            new Error(
              "Saved appearance could not be read. Your scene is unaffected.",
            ),
          );
      };
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("Could not load appearance."));
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}
export async function saveThemeLibrary(value: ThemeLibrary): Promise<void> {
  const parsed = ThemeLibrarySchema.parse(value);
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("preferences", "readwrite");
      transaction.objectStore("preferences").put(parsed, "library");
      transaction.oncomplete = () => resolve();
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("Could not save appearance."));
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

export async function backgroundFromFile(file: File): Promise<string> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    throw new Error("Choose a PNG, JPEG, or WebP image.");
  }
  if (file.size > 10 * 1024 * 1024)
    throw new Error("Choose an image smaller than 10 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser could not prepare the image.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/webp", 0.85);
    if (dataUrl.length > 5_600_000)
      throw new Error(
        "The prepared image is too large. Choose a smaller background.",
      );
    return dataUrl;
  } finally {
    bitmap.close();
  }
}
