import type { PicturePlay } from "./StateSchema";

export type { PicturePlay };

export type PlacePicture = {
  thumbDataUrl: string;
  imageDataUrl: string;
};

export const MAX_PLACE_PICTURES = 6;

type Visual = {
  thumbDataUrl?: string | undefined;
  imageDataUrl?: string | undefined;
  gallery?: PlacePicture[] | undefined;
  picturePlay?: PicturePlay | undefined;
};

function asPicture(thumb?: string, image?: string): PlacePicture | undefined {
  const t = thumb?.trim() ?? "";
  const i = image?.trim() ?? "";
  const picture = i || t;
  if (!picture) return undefined;
  return { thumbDataUrl: t || picture, imageDataUrl: picture };
}

/** First slot plus extras. UI only — never sent to the model. */
export function collectPlacePictures(visual: Visual | undefined): PlacePicture[] {
  if (!visual) return [];
  const out: PlacePicture[] = [];
  const seen = new Set<string>();
  const push = (picture: PlacePicture | undefined) => {
    if (!picture) return;
    const key = picture.imageDataUrl;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(picture);
  };
  push(asPicture(visual.thumbDataUrl, visual.imageDataUrl));
  for (const extra of visual.gallery ?? []) {
    push(asPicture(extra.thumbDataUrl, extra.imageDataUrl));
  }
  return out.slice(0, MAX_PLACE_PICTURES);
}

export function persistPlacePictures(
  pictures: PlacePicture[],
  play: PicturePlay = "fade"
): Pick<Visual, "thumbDataUrl" | "imageDataUrl" | "gallery" | "picturePlay"> {
  const cleaned = collectPlacePictures({
    gallery: pictures
  });
  const first = cleaned[0];
  const rest = cleaned.slice(1);
  return {
    ...(first ? { thumbDataUrl: first.thumbDataUrl, imageDataUrl: first.imageDataUrl } : {}),
    ...(rest.length > 0 ? { gallery: rest } : {}),
    ...(cleaned.length > 1 ? { picturePlay: play } : {})
  };
}

export function picturePlayOf(visual: Visual | undefined): PicturePlay {
  return visual?.picturePlay === "random" ? "random" : "fade";
}

/** Round-trip first picture + extras for Start / save. */
export function copyPictureFields(visual: Visual | undefined) {
  return persistPlacePictures(collectPlacePictures(visual), picturePlayOf(visual));
}
