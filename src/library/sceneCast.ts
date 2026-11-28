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
  const copy = { ...pick };
  delete copy[key];
  return copy;
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
 * both make them peaceful. This never changes trust: a saved value (even 20) is the author's.
 * The suggestion for a stance is `suggestedTrust`, and the author takes it explicitly.
 */
export function setStance(
  scene: CampaignScene,
  characterId: string,
  stance: Stance,
): CampaignScene {
  requireCast(scene, characterId);
  const next = setAttitude(scene, characterId, stance === "hostile" ? "hostile" : "neutral");
  return withCast(next, characterId, (entry) => ({ ...entry, stance }));
}

/** The trust to suggest for a stance, or nothing for a hostile one. */
export function suggestedTrust(stance: Stance): string | undefined {
  return stance === "hostile" ? undefined : STANCE_TRUST[stance];
}

/** The author takes the suggested trust for the person's stance. */
export function takeSuggestedTrust(scene: CampaignScene, characterId: string): CampaignScene {
  requireCast(scene, characterId);
  const suggestion = suggestedTrust(stanceOf(scene, characterId));
  return suggestion
    ? withCast(scene, characterId, (entry) => ({ ...entry, trust: suggestion }))
    : scene;
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

/** Where an outcome can be named as what reveals a person. */
export type RevealOutcome = "success" | "failure";

/** Which action and outcome of the scene set a fact, if any does. */
export function outcomeSetting(
  scene: CampaignScene,
  fact: string,
): { actionId: string; outcome: RevealOutcome } | undefined {
  for (const action of scene.encounter?.definition.interactions ?? [])
    for (const outcome of ["success", "failure"] as const)
      if (action[outcome].effects.some((e) => e.kind === "flag" && e.flag === fact))
        return { actionId: action.id, outcome };
}

/** The fact this tool makes for a person in one scene. Scoped to the scene, so it never reveals them elsewhere. */
export const discoveryFact = (scene: CampaignScene, characterId: string) =>
  `found:${characterId}:${scene.id}`;

/**
 * Hide a person until one outcome of one action of this scene happens, for example "Undersök
 * taket · lyckas". The fact that outcome already sets is used; if it sets none, one is made for
 * this person in this scene. Choosing again moves the binding: the made fact is taken off every
 * other outcome of the scene, so only the last choice reveals the person. The author's own
 * facts are never touched. A failed attempt sets nothing, so the person stays hidden.
 */
export function hideUntilOutcome(
  scene: CampaignScene,
  characterId: string,
  actionId: string,
  outcome: RevealOutcome = "success",
): CampaignScene {
  const current = requireGame(scene);
  requireCast(scene, characterId);
  const game = structuredClone(current.encounter);
  const action = game.definition.interactions.find((item) => item.id === actionId);
  if (!action) throw new Error("That action is not in this scene.");
  if (outcome === "failure" && !action.check)
    throw new Error("Only an action that rolls can fail.");
  const made = discoveryFact(scene, characterId);
  for (const other of game.definition.interactions)
    for (const side of ["success", "failure"] as const)
      other[side].effects = other[side].effects.filter(
        (effect) => !(effect.kind === "flag" && effect.flag === made),
      );
  const existing = action[outcome].effects.find((effect) => effect.kind === "flag");
  let fact = existing?.kind === "flag" ? existing.flag : undefined;
  if (!fact) {
    fact = made;
    action[outcome].effects.push({ kind: "flag", flag: fact });
  }
  validateEncounter(game);
  return setHidden({ ...scene, encounter: game }, characterId, fact);
}

/** What the guide or another writer may say about a person in a scene. `undefined` removes it. */
export type CastWrite = Partial<Omit<SceneCast, "characterId">>;

/**
 * The one way to write a person's cast entry, for the guide and for Storyboard. Everything in the
 * write is applied in step with the engine, in this order:
 *  1. position: a `positionId` that exists wins; otherwise a name finds the position of that
 *     name, or makes a new one when no position has it (the only place a position is made);
 *  2. stance, 3. hidden (a key set to undefined makes the person visible and drops `onReveal`),
 *  4. onReveal, 5. the plain fields (mood, clothing, holding, trust, familiarity, tension).
 * What the write does not mention is left as it was.
 */
export function writeCast(
  scene: CampaignScene,
  characterId: string,
  write: CastWrite,
): CampaignScene {
  requireCast(scene, characterId);
  let next = scene;
  const id = write.positionId;
  const places = requireGame(next).encounter.definition.places;
  if (id && places.some((place) => place.id === id))
    next = placePerson(next, characterId, { positionId: id });
  else if (write.position?.trim()) next = placePerson(next, characterId, { name: write.position });
  if (write.stance) next = setStance(next, characterId, write.stance);
  if ("hidden" in write)
    next = setHidden(next, characterId, write.hidden ? write.hidden.revealedBy : null);
  if (write.onReveal) next = setOnReveal(next, characterId, write.onReveal);
  const plain = (
    ["mood", "clothing", "holding", "trust", "familiarity", "tension"] as const
  ).flatMap((key) => (write[key] === undefined ? [] : [[key, write[key]] as const]));
  return plain.length
    ? withCast(next, characterId, (entry) => ({ ...entry, ...Object.fromEntries(plain) }))
    : next;
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
    // The cast is the source: no `hidden` there means visible, so an old condition is dropped.
    if (latest.hidden) target.requiresFlags = [latest.hidden.revealedBy];
    else delete target.requiresFlags;
    // "Attack when found" only means something for a hostile person who is hidden.
    const attack = latest.onReveal === "attack" && !!latest.hidden && isHostile(copy, target);
    if (attack) target.onReveal = "attack";
    else delete target.onReveal;
    if (
      JSON.stringify([live.requiresFlags, live.onReveal]) !==
      JSON.stringify([target.requiresFlags, target.onReveal])
    )
      next = { ...next, encounter: copy };
  }
  return next;
}
