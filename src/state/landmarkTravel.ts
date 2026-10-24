import type { Layer, SceneRoom, Session } from "./StateSchema";
import { copyAudioFields } from "./placeAudio";
import { copyPictureFields } from "./placePictures";
import { travelingPartyIds } from "./party";
import { sideRoomStage, venueBuildingName } from "./playerDestination";
import { foldPlace } from "./roomMatch";

export type LandmarkRef = {
  id: string;
  name: string;
  realmId: string;
};

export type LandmarkTravelPatch = {
  placeId: string;
  location: string;
  lighting?: string;
  noise?: string;
  music?: boolean;
  note?: string;
  brief?: string;
  rooms?: SceneRoom[];
  thumbDataUrl?: string | undefined;
  imageDataUrl?: string | undefined;
  gallery?: NonNullable<Session["scene"]>["gallery"];
  picturePlay?: NonNullable<Session["scene"]>["picturePlay"];
  audioDataUrl?: string | undefined;
  audioGallery?: string[] | undefined;
  audioPlay?: NonNullable<Session["scene"]>["audioPlay"];
  placeLayers: Array<Pick<Layer, "id" | "type" | "priority" | "content" | "active" | "aiGenerated"> & {
    keywords?: string[];
  }>;
};

export type LandmarkExit = {
  id: string;
  label: string;
  dest: string;
  enabled: boolean;
  kind: "travel";
};

function currentLandmark(session: Session, places: LandmarkRef[]): LandmarkRef | undefined {
  const placeId = session.scene?.placeId?.trim();
  if (placeId) {
    const hit = places.find((item) => item.id === placeId);
    if (hit) return hit;
  }
  const loc = session.scene?.location ?? "";
  const venue = venueBuildingName(loc);
  return places.find(
    (item) =>
      foldPlace(item.name) === foldPlace(loc) ||
      (venue !== undefined && foldPlace(item.name).includes(foldPlace(venue)))
  );
}

function landmarkLabel(name: string): string {
  const venue = venueBuildingName(name).trim();
  if (venue) return venue;
  const dash = name.split("—")[0]?.trim();
  return dash || name;
}

/** Other landmarks in this realm. Only from the public floor — leave the building first. */
export function mapLandmarkTravels(session: Session, places: LandmarkRef[]): LandmarkExit[] {
  if (sideRoomStage(session)) return [];
  const here = currentLandmark(session, places);
  if (!here) return [];
  return places
    .filter((item) => item.realmId === here.realmId && item.id !== here.id)
    .map((item) => ({
      id: item.id,
      label: landmarkLabel(item.name),
      dest: item.id,
      enabled: true,
      kind: "travel" as const
    }));
}

export function applyLandmarkTravel(session: Session, patch: LandmarkTravelPatch): void {
  const previous = session.scene;
  session.scene = {
    location: patch.location,
    placeId: patch.placeId,
    environment: {
      ...(patch.lighting?.trim() ? { lighting: patch.lighting.trim() } : {}),
      ...(patch.noise?.trim() ? { noise: patch.noise.trim() } : {}),
      ...(patch.music !== undefined ? { music: patch.music } : {})
    },
    ...(previous?.realm ? { realm: previous.realm } : {}),
    ...(previous?.realmNote ? { realmNote: previous.realmNote } : {}),
    ...(previous?.realmBrief ? { realmBrief: previous.realmBrief } : {}),
    ...(previous?.realmVisual ? { realmVisual: previous.realmVisual } : {}),
    ...(patch.note?.trim() ? { note: patch.note.trim() } : {}),
    ...(patch.brief?.trim() ? { brief: patch.brief.trim() } : {}),
    ...copyPictureFields(patch),
    ...copyAudioFields(patch),
    ...((patch.rooms ?? []).length > 0 ? { rooms: patch.rooms } : {})
  };
  session.openedRoomIds = [];
  session.whatNow = undefined;
  session.whatNowOpen = false;
  session.whatNowActiveSetId = undefined;
  session.whatNowKeywords = undefined;

  session.layers = [
    ...session.layers.filter((layer) => !layer.id.startsWith("layer-place")),
    ...patch.placeLayers
  ];

  const here = patch.location;
  if (session.player && session.player.position.lock === "unlocked") {
    session.player.position = { ...session.player.position, value: here };
  }
  for (const id of travelingPartyIds(session)) {
    const character = session.characters[id];
    if (character && character.position.lock === "unlocked") {
      character.position = { ...character.position, value: here };
    }
  }
}

