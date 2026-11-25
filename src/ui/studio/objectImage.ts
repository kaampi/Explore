const objectImageTypes = ["image/png", "image/jpeg", "image/webp"];

export function objectImageFileAllowed(file: File): boolean {
  return objectImageTypes.includes(file.type) && file.size <= 4 * 1024 * 1024;
}

export function objectImageFromFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the picture."));
    reader.readAsDataURL(file);
  });
}
