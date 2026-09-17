import { describe, it, expect } from "vitest";
import {
  collectPlacePictures,
  copyPictureFields,
  MAX_PLACE_PICTURES,
  persistPlacePictures
} from "@state/placePictures";

const a = { thumbDataUrl: "data:thumb-a", imageDataUrl: "data:image-a" };
const b = { thumbDataUrl: "data:thumb-b", imageDataUrl: "data:image-b" };
const c = { thumbDataUrl: "data:thumb-c", imageDataUrl: "data:image-c" };

describe("placePictures", () => {
  it("merges the first slot with extras and skips duplicates", () => {
    expect(
      collectPlacePictures({
        thumbDataUrl: a.thumbDataUrl,
        imageDataUrl: a.imageDataUrl,
        gallery: [a, b]
      })
    ).toEqual([a, b]);
  });

  it("saves extras after the first and keeps play only when there are several", () => {
    expect(persistPlacePictures([a], "random")).toEqual(a);
    expect(persistPlacePictures([a, b], "random")).toEqual({
      ...a,
      gallery: [b],
      picturePlay: "random"
    });
    expect(persistPlacePictures([a, b], "fade")).toEqual({
      ...a,
      gallery: [b],
      picturePlay: "fade"
    });
  });

  it("caps at six pictures", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      thumbDataUrl: `data:thumb-${i}`,
      imageDataUrl: `data:image-${i}`
    }));
    expect(collectPlacePictures({ gallery: many })).toHaveLength(MAX_PLACE_PICTURES);
    expect(persistPlacePictures(many).gallery).toHaveLength(MAX_PLACE_PICTURES - 1);
  });

  it("round-trips a venue with extras for Start", () => {
    expect(copyPictureFields({ ...a, gallery: [b, c], picturePlay: "random" })).toEqual({
      ...a,
      gallery: [b, c],
      picturePlay: "random"
    });
  });
});
