import type { Session } from "./StateSchema";
import { beatLocation } from "./playerDestination";
import { matchSceneRoom } from "./roomMatch";

export type PlaceIntro = {
  title: string;
  body: string;
  /** True when this is a named room, not the public venue. */
  room: boolean;
};

/**
 * Establishing text for where the player is now. A named room uses only
 * that room's intro (missing = no venue fallback). The venue note is for
 * the public place. Player-facing — chat typewriter and Cast.
 */
export function hereIntro(session: Session): PlaceIntro | undefined {
  return placeCopy(session, "intro");
}

/**
 * Compact Here text for Pass 1. Uses `brief` when set; otherwise the intro.
 * Pictures and the long typewriter copy stay out of the prompt when a brief exists.
 */
export function herePrompt(session: Session): PlaceIntro | undefined {
  return placeCopy(session, "prompt");
}

function placeCopy(session: Session, kind: "intro" | "prompt"): PlaceIntro | undefined {
  const here = beatLocation(session) ?? "";
  const rooms = session.scene?.rooms ?? [];
  const room = matchSceneRoom(here, rooms);
  if (room) {
    const intro = room.description?.trim();
    const body = kind === "prompt" ? room.brief?.trim() || intro : intro;
    if (!body) return undefined;
    return { title: room.label, body, room: true };
  }
  const intro = session.scene?.note?.trim();
  const body = kind === "prompt" ? session.scene?.brief?.trim() || intro : intro;
  if (!body) return undefined;
  return {
    title: here || session.scene?.location?.trim() || "here",
    body,
    room: false
  };
}
