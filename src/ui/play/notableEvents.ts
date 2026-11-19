import { adventureBarriers, adventureCompleted, knownThings } from "../../game/AdventureEngine";
import { playerInventory } from "../../session/playerInventory";
import type { Session } from "../../state/StateSchema";

/** Something worth a short mark: the player found out something, got something, opened the way. */
export type Notice =
  | { kind: "learned"; text: string }
  | { kind: "item"; text: string }
  | { kind: "unlocked"; text: string }
  | { kind: "goal"; text: string };

/** The player came to another place. `minutes` is the game time the way took. */
export type Arrival = { place: string; minutes: number };

/**
 * What happened between two moments of the same game that the player should notice: a new
 * discovery, a new thing in the pack, a door unlocked, the goal reached. Things that were already
 * so are not repeated. Two different games have nothing to compare.
 */
export function notableEvents(before: Session, after: Session): Notice[] {
  if (before.id !== after.id) return [];
  const notices: Notice[] = [];
  const knownBefore = new Set(knownThings(before).map((thing) => thing.text));
  for (const thing of knownThings(after).reverse())
    if (!knownBefore.has(thing.text)) notices.push({ kind: "learned", text: thing.text });
  const packBefore = new Map(playerInventory(before).map((entry) => [entry.key, entry.quantity]));
  for (const entry of playerInventory(after))
    if (entry.quantity > (packBefore.get(entry.key) ?? 0))
      notices.push({ kind: "item", text: entry.name });
  const doorsBefore = adventureBarriers(before);
  for (const [id, door] of Object.entries(adventureBarriers(after))) {
    const was = doorsBefore[id];
    if (was && was.locked && !door.locked) notices.push({ kind: "unlocked", text: door.name });
  }
  const goal = after.adventure?.goal;
  if (goal && !adventureCompleted(before) && adventureCompleted(after))
    notices.push({ kind: "goal", text: goal.title });
  return notices;
}

/** Where the player came to between two moments of the same game, if they came to a new place. */
export function arrivalBetween(before: Session, after: Session): Arrival | null {
  const was = before.adventure;
  const now = after.adventure;
  if (before.id !== after.id || !was || !now || was.currentSceneId === now.currentSceneId)
    return null;
  return {
    place: now.scenes.find((scene) => scene.id === now.currentSceneId)?.name ?? "",
    minutes: Math.max(0, now.clockMinutes - was.clockMinutes),
  };
}
