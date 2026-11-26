import type { GuideImageTarget } from "../../library/guideImages";
import { objectImageFileAllowed, objectImageFromFile } from "./objectImage";
import {
  portraitDataUrlFromFile,
  portraitSrc,
  sceneImagesFromFile,
  type SceneImagePair,
} from "./portrait";

export async function prepareGuideImage(
  kind: GuideImageTarget["kind"],
  file: File,
): Promise<SceneImagePair> {
  if (kind === "character" || kind === "player") {
    const portrait = portraitSrc(await portraitDataUrlFromFile(file));
    if (!portrait) throw new Error("Invalid portrait");
    return { imageDataUrl: portrait, thumbDataUrl: portrait };
  }
  if (kind === "object") {
    if (!objectImageFileAllowed(file)) throw new Error("Invalid object image");
    // Decode before preview so a corrupt file cannot be saved to the card.
    const bitmap = await createImageBitmap(file);
    bitmap.close();
    const imageDataUrl = await objectImageFromFile(file);
    return { imageDataUrl, thumbDataUrl: imageDataUrl };
  }
  return sceneImagesFromFile(file);
}
