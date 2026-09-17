const MAX_BYTES = 6 * 1024 * 1024;
const ACCEPT = /^(audio\/(mpeg|mp3|ogg|wav|webm|mp4|x-m4a|aac)|video\/ogg)$/i;

export class AmbientAudioError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AmbientAudioError";
  }
}

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string" || !result.startsWith("data:")) {
        reject(new AmbientAudioError("Could not read that sound."));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(new AmbientAudioError("Could not read that sound."));
    reader.readAsDataURL(file);
  });
}

/** Looping place/room audio as a data URL. Never sent to the model. */
export async function ambientAudioFromFile(file: File): Promise<string> {
  const type = file.type || "";
  const name = file.name.toLowerCase();
  const byExt = /\.(mp3|ogg|wav|m4a|aac|webm)$/.test(name);
  if (!ACCEPT.test(type) && !byExt) {
    throw new AmbientAudioError("Choose an mp3, ogg, wav, or m4a loop.");
  }
  if (file.size > MAX_BYTES) {
    throw new AmbientAudioError("Keep the loop under 6 MB.");
  }
  return readDataUrl(file);
}
