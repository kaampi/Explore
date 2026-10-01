import { usesGameRules } from "./playMode";
import type { SceneRoom, Session } from "./StateSchema";
import { keywordHitsText } from "@layers/keywords";

export type RoomGate = "open" | "locked" | "hidden";

export function roomGate(room: { gate?: string } | undefined): RoomGate {
  if (room?.gate === "locked" || room?.gate === "hidden") return room.gate;
  return "open";
}

export function roomIsOpened(session: Session, roomId: string): boolean {
  return (session.openedRoomIds ?? []).includes(roomId);
}

export function roomIsVisible(session: Session, room: Pick<SceneRoom, "id" | "gate">): boolean {
  if (!usesGameRules(session)) return true;
  const gate = roomGate(room);
  if (gate !== "hidden") return true;
  return roomIsOpened(session, room.id);
}

/** Graph may still refuse. This is only the lock/hidden gate. */
export function roomGateAllowsEntry(session: Session, room: Pick<SceneRoom, "id" | "gate">): boolean {
  if (!usesGameRules(session)) return true;
  const gate = roomGate(room);
  if (gate === "open") return true;
  return roomIsOpened(session, room.id);
}

export function roomLookTokens(room: Pick<SceneRoom, "label" | "keywords">): string[] {
  return [room.label, ...(room.keywords ?? [])].map((word) => word.trim()).filter(Boolean);
}

export function roomIdsNamedInText(session: Session, text: string): string[] {
  const stripped = text.replace(/\*+/g, " ");
  if (!stripped.trim()) return [];
  const ids: string[] = [];
  for (const room of session.scene?.rooms ?? []) {
    if (roomGate(room) === "open") continue;
    if (roomIsOpened(session, room.id)) continue;
    if (keywordHitsText(stripped, roomLookTokens(room))) ids.push(room.id);
  }
  return ids;
}

export function roomIdForDest(session: Session, dest: string | undefined): string | undefined {
  const needle = dest?.trim();
  if (!needle) return undefined;
  const rooms = session.scene?.rooms ?? [];
  const hit = rooms.find((room) => room.label.trim().toLowerCase() === needle.toLowerCase());
  return hit?.id;
}

