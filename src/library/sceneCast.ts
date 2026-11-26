import type { CampaignScene, SceneCast } from "./LibrarySchema";
import type { EncounterGame } from "../game/EncounterSchema";
import { validateEncounter } from "../game/EncounterEngine";
import {
  actorIdFor,
  addPosition,
  isHostile,
  setAttitude,
  type PositionDistance,
} from "./sceneParts";

/** How a person feels about the player. Hostile makes them the engine's opponent. */
export type Stance = NonNullable<SceneCast["stance"]>;

/** Suggested trust when a person first gets a stance. The author can change it. */
export const STANCE_TRUST: Record<Exclude<Stance, "hostile">, string> = {
  friendly: "60",
  neutral: "20",
};

type SceneWithGame = CampaignScene & { encounter: EncounterGame };

function requireGame(scene: CampaignScene): SceneWithGame {
  if (!scene.encounter) throw new Error("Make the scene playable first.");
  return scene as SceneWithGame;
}

function requireCast(scene: CampaignScene, characterId: string): SceneCast {
  const pick = scene.people.find((entry) => entry.characterId === characterId);
  if (!pick || !requireGame(scene).encounter.state.actors[actorIdFor(characterId)])
    throw new Error("That person is not in this scene.");
  return pick;
}

function withCast(
  scene: CampaignScene,
  characterId: string,
  change: (pick: SceneCast) => SceneCast,
): CampaignScene {
  return {
    ...scene,
    people: scene.people.map((pick) => (pick.characterId === characterId ? change(pick) : pick)),
  };
}

/** Leave a field out instead of writing `undefined`. */
function without<K extends keyof SceneCast>(pick: SceneCast, key: K): SceneCast {
  const { [key]: _gone, ...rest } = pick;
  return rest as SceneCast;
}

/** What a person's stance is: the one written, else the engine's law. */
export function stanceOf(scene: CampaignScene, characterId: string): Stance {
  const written = scene.people.find((pick) => pick.characterId === characterId)?.stance;
  if (written) return written;
  const game = scene.encounter;
  const actor = game?.state.actors[actorIdFor(characterId)];
  return game && actor && isHostile(game, actor) ? "hostile" : "neutral";
}

/**
 * Set how a person feels about the player. Hostile makes them an opponent; friendly and neutral
 * both make them peaceful. The suggested trust (friendly 60) is written only the first time a
 * stance is set, and only if the author has not set another value. Changing it later never
 * changes trust.
 */
export function setStance(
  scene: CampaignScene,
  characterId: string,
  stance: Stance,
): CampaignScene {
  const pick = requireCast(scene, characterId);
  const first = pick.stance === undefined;
  const peaceful = setAttitude(scene, characterId, stance === "hostile" ? "hostile" : "neutral");
  return withCast(peaceful, characterId, (entry) => {
    const next: SceneCast = { ...entry, stance };
    if (first && stance !== "hostile" && entry.trust === "20") next.trust = STANCE_TRUST[stance];
    return next;
  });
}

/** Hide a person until a fact is set, or show them from the start (null). */
export function setHidden(
  scene: CampaignScene,
  characterId: string,
  revealedBy: string | null,
): CampaignScene {
  const current = requireGame(scene);
  requireCast(scene, characterId);
  const game = structuredClone(current.encounter);
  const actor = game.state.actors[actorIdFor(characterId)]!;
  const fact = revealedBy?.trim();
  if (fact) actor.requiresFlags = [fact];
  else {
    delete actor.requiresFlags;
    delete actor.onReveal;
  }
  validateEncounter(game);
  return withCast({ ...scene, encounter: game }, characterId, (entry) =>
    fact
      ? { ...entry, hidden: { revealedBy: fact } }
      : without(without(entry, "hidden"), "onReveal"),
  );
}

/** What a hostile, hidden person does when found. */
export function setOnReveal(
  scene: CampaignScene,
  characterId: string,
  mode: "wait" | "attack",
): CampaignScene {
  const current = requireGame(scene);
  requireCast(scene, characterId);
  const game = structuredClone(current.encounter);
  const actor = game.state.actors[actorIdFor(characterId)]!;
  if (mode === "attack" && actor.requiresFlags?.length) actor.onReveal = "attack";
  else delete actor.onReveal;
  validateEncounter(game);
  return withCast({ ...scene, encounter: game }, characterId, (entry) => ({
    ...entry,
    onReveal: mode,
  }));
}

function placeNamed(game: EncounterGame, name: string) {
  const wanted = name.trim().toLowerCase();
  return wanted ? game.definition.places.find((p) => p.name.toLowerCase() === wanted) : undefined;
}

/**
 * Put a person on a position of the scene, by id (the position stays theirs even if renamed)
 * or by name. A name that is not in the scene makes a new position, next to where the person
 * stands now. The cast gets both the name and the id.
 */
export function placePerson(
  scene: CampaignScene,
  characterId: string,
  where: { positionId: string } | { name: string },
  distance: PositionDistance = "close",
): CampaignScene {
  requireCast(scene, characterId);
  let current = requireGame(scene);
  let id: string | undefined;
  if ("positionId" in where) {
    if (!current.encounter.definition.places.some((p) => p.id === where.positionId))
      throw new Error("That position is not in this scene.");
    id = where.positionId;
  } else {
    const name = where.name.trim();
    if (!name) throw new Error("Name the position.");
    id = placeNamed(current.encounter, name)?.id;
    if (!id) {
      const standing = current.encounter.state.actors[actorIdFor(characterId)]!.position;
      const made = addPosition(scene, { name, from: standing, distance });
      current = made.scene as SceneWithGame;
      id = made.positionId;
    }
  }
  const game = structuredClone(current.encounter);
  game.state.actors[actorIdFor(characterId)]!.position = id;
  validateEncounter(game);
  const name = game.definition.places.find((p) => p.id === id)!.name;
  return withCast({ ...current, encounter: game }, characterId, (entry) => ({
    ...entry,
    position: name,
    positionId: id,
  }));
}

/**
 * Bring the engine in step with what the cast says, when a scene is saved or opened. Nothing is
 * written for a person whose cast says nothing new: a person without a stance keeps the engine's
 * law, and a person with neither position id nor name stays where the engine has them.
 * A name that matches no position is left alone here; a new position is made by `placePerson`.
 * Running it twice gives the same result.
 */
export function tuneCast(scene: CampaignScene): CampaignScene {
  if (!scene.encounter) return scene;
  let next = scene;
  for (const pick of scene.people) {
    const id = actorIdFor(pick.characterId);
    let game = next.encounter!;
    const actor = game.state.actors[id];
    if (!actor) continue;
    // 1. The id wins, even if the position was renamed. 2. Otherwise a name that exists.
    const byId = pick.positionId
      ? game.definition.places.find((p) => p.id === pick.positionId)
      : undefined;
    const place = byId ?? placeNamed(game, pick.position);
    if (place) {
      if (
        actor.position !== place.id ||
        pick.position !== place.name ||
        pick.positionId !== place.id
      ) {
        game = structuredClone(game);
        game.state.actors[id]!.position = place.id;
        next = withCast({ ...next, encounter: game }, pick.characterId, (entry) => ({
          ...entry,
          position: place.name,
          positionId: place.id,
        }));
      }
    }
    if (pick.stance) {
      const hostile = isHostile(next.encounter!, next.encounter!.state.actors[id]!);
      if (pick.stance === "hostile" && !hostile)
        next = setAttitude(next, pick.characterId, "hostile");
      if (pick.stance !== "hostile" && hostile)
        next = setAttitude(next, pick.characterId, "neutral");
    }
    const live = next.encounter!.state.actors[id]!;
    const latest = next.people.find((entry) => entry.characterId === pick.characterId)!;
    const copy = structuredClone(next.encounter!);
    const target = copy.state.actors[id]!;
    if (latest.hidden) target.requiresFlags = [latest.hidden.revealedBy];
    const hostileNow = isHostile(copy, target);
    const attack = latest.onReveal === "attack" && !!latest.hidden && hostileNow;
    if (attack) target.onReveal = "attack";
    else if (live.onReveal && latest.onReveal !== undefined) delete target.onReveal;
    if (
      JSON.stringify([live.requiresFlags, live.onReveal]) !==
      JSON.stringify([target.requiresFlags, target.onReveal])
    )
      next = { ...next, encounter: copy };
  }
  return next;
}
