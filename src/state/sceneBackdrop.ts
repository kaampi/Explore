import type { Session } from "./StateSchema";
import { beatLocation, sideRoomStage } from "./playerDestination";
import { matchSceneRoom } from "./roomMatch";
import {
  collectPlacePictures,
  picturePlayOf,
  type PlacePicture,
  type PicturePlay
} from "./placePictures";

export { matchSceneRoom } from "./roomMatch";

export type SceneBackdrop = {
  thumbDataUrl?: string;
  imageDataUrl?: string;
  pictures: PlacePicture[];
  picturePlay: PicturePlay;
};

function fromVisual(visual: {
  thumbDataUrl?: string | undefined;
  imageDataUrl?: string | undefined;
  gallery?: PlacePicture[] | undefined;
  picturePlay?: PicturePlay | undefined;
} | undefined): SceneBackdrop {
  const pictures = collectPlacePictures(visual);
  const first = pictures[0];
  return {
    pictures,
    picturePlay: pictures.length > 1 ? picturePlayOf(visual) : "fade",
    ...(first ? { thumbDataUrl: first.thumbDataUrl, imageDataUrl: first.imageDataUrl } : {})
  };
}

/**
 * Chat/Cast picture for the current beat. A named room uses only that
 * room's image (missing = no backdrop). The venue image is for the
 * public place, not a side room — never keep the bar photo in Emma's room.
 */
export function sceneBackdrop(session: Session): SceneBackdrop {
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
  if (venue.pictures.length > 0) return venue;
  return fromVisual(session.scene?.realmVisual);
}
