import { describe, it, expect } from "vitest";
import {
  collectPlaceAudio,
  copyAudioFields,
  MAX_PLACE_AUDIO,
  persistPlaceAudio
} from "@state/placeAudio";

describe("placeAudio", () => {
  it("merges the first loop with extras and skips duplicates", () => {
    expect(
      collectPlaceAudio({
        audioDataUrl: "data:audio-a",
        audioGallery: ["data:audio-a", "data:audio-b"]
      })
    ).toEqual(["data:audio-a", "data:audio-b"]);
  });

  it("saves extras after the first and keeps play only when there are several", () => {
    expect(persistPlaceAudio(["data:audio-a"], "random")).toEqual({ audioDataUrl: "data:audio-a" });
    expect(persistPlaceAudio(["data:audio-a", "data:audio-b"], "random")).toEqual({
      audioDataUrl: "data:audio-a",
      audioGallery: ["data:audio-b"],
      audioPlay: "random"
    });
  });

  it("caps at four loops", () => {
    const many = Array.from({ length: 6 }, (_, i) => `data:audio-${i}`);
    expect(collectPlaceAudio({ audioGallery: many })).toHaveLength(MAX_PLACE_AUDIO);
    expect(persistPlaceAudio(many).audioGallery).toHaveLength(MAX_PLACE_AUDIO - 1);
  });

  it("round-trips extras for Start", () => {
    expect(
      copyAudioFields({
        audioDataUrl: "data:audio-a",
        audioGallery: ["data:audio-b"],
        audioPlay: "fade"
      })
    ).toEqual({
      audioDataUrl: "data:audio-a",
      audioGallery: ["data:audio-b"],
      audioPlay: "fade"
    });
  });
});
