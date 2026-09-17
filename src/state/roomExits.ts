import type { Session } from "./StateSchema";
import {
  ROOM_FROM_LANDMARK,
  canWalkToLandmark,
  roomIsReachable,
  sideRoomStage,
  venueBuildingName,
  venueFloorToken
} from "./playerDestination";
import { foldPlace } from "./roomMatch";
import { roomGateAllowsEntry, roomIsVisible } from "./roomGate";

export type MapExit = {
  id: string;
  label: string;
  dest: string;
  enabled: boolean;
  kind: "landmark" | "room";
};

/** Go buttons from Here: only focals linked on the place card. */
export function mapExits(session: Session): MapExit[] {
  const out: MapExit[] = [];
  const stage = sideRoomStage(session);
  if (stage && canWalkToLandmark(session)) {
    const name = venueBuildingName(session.scene?.location).trim() || "the landmark";
    out.push({
      id: ROOM_FROM_LANDMARK,
      label: name,
      dest: venueFloorToken(session),
      enabled: true,
      kind: "landmark"
    });
  }
  for (const room of session.scene?.rooms ?? []) {
    const label = room.label.trim();
    if (!label) continue;
    if (stage && foldPlace(label) === foldPlace(stage)) continue;
    if (!roomIsReachable(room, session)) continue;
    if (!roomIsVisible(session, room)) continue;
    out.push({
      id: room.id,
      label,
      dest: label,
      enabled: roomGateAllowsEntry(session, room),
      kind: "room"
    });
  }
  return out;
}
