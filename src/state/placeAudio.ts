import type { PicturePlay } from "./StateSchema";

export type { PicturePlay as AudioPlay };

export const MAX_PLACE_AUDIO = 4;

type Sound = {
  audioDataUrl?: string | undefined;
  audioGallery?: string[] | undefined;
  audioPlay?: PicturePlay | undefined;
};

function asClip(value?: string): string | undefined {
  const clip = value?.trim() ?? "";
  return clip || undefined;
}

/** First loop plus extras. UI only — never sent to the model. */
export function collectPlaceAudio(sound: Sound | undefined): string[] {
  if (!sound) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (clip: string | undefined) => {
    if (!clip || seen.has(clip)) return;
    seen.add(clip);
    out.push(clip);
  };
  push(asClip(sound.audioDataUrl));
  for (const extra of sound.audioGallery ?? []) {
    push(asClip(extra));
  }
  return out.slice(0, MAX_PLACE_AUDIO);
}

export function persistPlaceAudio(
  clips: string[],
  play: PicturePlay = "fade"
): Pick<Sound, "audioDataUrl" | "audioGallery" | "audioPlay"> {
  const cleaned = collectPlaceAudio({ audioGallery: clips });
  const first = cleaned[0];
  const rest = cleaned.slice(1);
  return {
    ...(first ? { audioDataUrl: first } : {}),
    ...(rest.length > 0 ? { audioGallery: rest } : {}),
    ...(cleaned.length > 1 ? { audioPlay: play } : {})
  };
}

export function audioPlayOf(sound: Sound | undefined): PicturePlay {
  return sound?.audioPlay === "random" ? "random" : "fade";
}

/** Round-trip first loop + extras for Start / save. */
export function copyAudioFields(sound: Sound | undefined) {
  return persistPlaceAudio(collectPlaceAudio(sound), audioPlayOf(sound));
}
