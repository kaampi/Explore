import type { Session } from "./StateSchema";
import { beatLocation, sideRoomStage } from "./playerDestination";
import { matchSceneRoom } from "./roomMatch";
import { audioPlayOf, collectPlaceAudio } from "./placeAudio";
import type { PicturePlay } from "./StateSchema";

export type SceneSound = {
  clips: string[];
  audioPlay: PicturePlay;
};

function fromVisual(
  visual:
    | {
        audioDataUrl?: string | undefined;
        audioGallery?: string[] | undefined;
        audioPlay?: PicturePlay | undefined;
      }
    | undefined
): SceneSound {
  const clips = collectPlaceAudio(visual);
  return {
    clips,
    audioPlay: clips.length > 1 ? audioPlayOf(visual) : "fade"
  };
}

/**
 * Looping ambient for the current beat. A named room uses only that
 * room's sound (missing = silence). The venue loop is for the public
 * place, not a side room.
 */
export function sceneAudio(session: Session): SceneSound {
  const rooms = session.scene?.rooms ?? [];
  const stage = sideRoomStage(session);
  if (stage) {
    const room = matchSceneRoom(stage, rooms);
    return fromVisual(room);
  }
  const here = beatLocation(session) ?? "";
  const room = matchSceneRoom(here, rooms);
  if (room) return fromVisual(room);
  const venue = fromVisual(session.scene);
  if (venue.clips.length > 0) return venue;
  return fromVisual(session.scene?.realmVisual);
}
