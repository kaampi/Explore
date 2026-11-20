import {
  AdventureRunSchema,
  AdventureTransitionSchema,
  type AdventureRun,
  type AdventureTransition,
} from "./AdventureSchema";
import { EncounterGameSchema, type EncounterGame } from "./EncounterSchema";
import { validateEncounter } from "./EncounterEngine";
import type { Session } from "../state/StateSchema";
import { INITIAL_GAME_MINUTES } from "../state/gameClock";
export function validateAdventure(run: AdventureRun) {
  const ids = run.scenes.map((scene) => scene.id);
  if (
    new Set(ids).size !== ids.length ||
    !ids.includes(run.currentSceneId) ||
    new Set(run.links.map((l) => l.id)).size !== run.links.length
  )
    throw Error("The adventure needs unique scenes, connections and a valid starting scene.");
  const playerId = run.scenes[0]!.game.definition.playerId;
  for (const scene of run.scenes) {
    validateEncounter(scene.game);
    if (scene.game.definition.id !== scene.id || scene.game.definition.playerId !== playerId)
      throw Error("Every scene must use its own ID and the same player.");
  }
  if (run.geography)
    for (const scene of run.scenes) {
      const node = run.geography.map.nodes.find((n) => n.id === scene.mapNodeId);
      if (!node || node.isJunction || (node.placeId ?? node.id) !== scene.placeId)
        throw Error("Every mapped scene must refer to its pinned map place.");
    }
  for (const [id, game] of Object.entries(run.savedScenes)) {
    if (!ids.includes(id) || game.definition.id !== id || game.definition.playerId !== playerId)
      throw Error("A saved scene must belong to this adventure and use the same player.");
    validateEncounter(game);
  }
  for (const [id, actor] of Object.entries(run.actors))
    if (actor.id !== id) throw Error("A persistent character must use its own ID.");
  for (const link of run.links)
    if (
      !ids.includes(link.fromSceneId) ||
      !ids.includes(link.toSceneId) ||
      link.fromSceneId === link.toSceneId
    )
      throw Error("A connection must lead to another existing scene.");
  for (const link of run.links) {
    const from = run.scenes.find((s) => s.id === link.fromSceneId)!;
    for (const id of link.requiresOpenBarriers ?? [])
      if (!from.game.state.barriers[id]) throw Error("A connection requires an unknown door.");
  }
  const shared = new Map<string, string | undefined>();
  for (const scene of run.scenes)
    for (const barrier of Object.values(scene.game.state.barriers))
      if (barrier.shared) {
        if (shared.has(barrier.id) && shared.get(barrier.id) !== barrier.keyId)
          throw Error("A shared door must use the same key.");
        shared.set(barrier.id, barrier.keyId);
      }
  for (const [id, barrier] of Object.entries(run.barriers ?? {}))
    if (id !== barrier.id || !barrier.shared || !shared.has(id) || shared.get(id) !== barrier.keyId)
      throw Error("An unknown persistent door cannot be restored.");
  return run;
}
export function adventureBarriers(session: Session) {
  return { ...session.adventure?.barriers, ...session.encounter?.state.barriers };
}
export function adventureOptions(session: Session) {
  const run = session.adventure;
  if (!run) return [];
  const doors = adventureBarriers(session);
  const flags = new Set([...session.storyFlags, ...(session.encounter?.state.flags ?? [])]);
  return run.links
    .filter(
      (link) =>
        link.fromSceneId === run.currentSceneId &&
        link.requiresFlags.every((f) => flags.has(f)) &&
        link.requiresAbsentFlags.every((f) => !flags.has(f)) &&
        (link.requiresOpenBarriers ?? []).every(
          (id) => doors[id]?.open && !doors[id]?.locked && !doors[id]?.blocked,
        ),
    )
    .map((link) => ({
      id: link.id,
      label: link.label || run.scenes.find((s) => s.id === link.toSceneId)!.name,
      ...(link.minutes !== undefined ? { minutes: link.minutes } : {}),
    }));
}
export function adventureHasClock(run: AdventureRun): boolean {
  return (
    run.links.some((link) => link.minutes !== undefined) ||
    run.cutscenes.some((cutscene) => cutscene.minutes !== undefined)
  );
}

export function adventureCompleted(session: Session) {
  const goal = session.adventure?.goal,
    flags = new Set([...session.storyFlags, ...(session.encounter?.state.flags ?? [])]);
  return !!goal && goal.requiresFlags.every((flag) => flags.has(flag));
}
/** Pure, revision-checked transition. The live encounter is the latest truth for the departing scene. */
export function advanceAdventure(session: Session, raw: AdventureTransition) {
  const request = AdventureTransitionSchema.parse(raw),
    run = validateAdventure(AdventureRunSchema.parse(structuredClone(session.adventure))),
    current = session.encounter;
  if (!current || current.definition.id !== run.currentSceneId)
    throw Error("This adventure has no active scene.");
  if (run.transitions.some((t) => t.id === request.id))
    throw Error("This connection has already been taken.");
  if (request.expectedStateVersion !== session.stateVersion)
    throw Error("The adventure changed. Choose a connection again.");
  if (
    current.state.phase === "combat" ||
    current.state.phase === "defeated" ||
    current.state.actors[current.definition.playerId]!.hp === 0
  )
    throw Error("Resolve the current encounter before continuing.");
  const link = run.links.find((l) => l.id === request.linkId);
  if (!link || !adventureOptions(session).some((l) => l.id === link.id))
    throw Error("That connection is not available from this scene.");
  const target = run.scenes.find((s) => s.id === link.toSceneId)!;
  run.savedScenes[run.currentSceneId] = structuredClone(current);
  run.barriers ??= {};
  for (const [id, b] of Object.entries(current.state.barriers))
    if (b.shared) run.barriers[id] = structuredClone(b);
  for (const actor of Object.values(current.state.actors))
    run.actors[actor.id] = structuredClone(actor);
  const game = EncounterGameSchema.parse(
    structuredClone(run.savedScenes[target.id] ?? target.game),
  );
  const owners = new Map(
    Object.entries(run.actors).flatMap(([id, a]) => a.inventory.map((item) => [item, id] as const)),
  );
  for (const [id, authored] of Object.entries(game.state.actors)) {
    const carried = run.actors[id];
    if (carried)
      game.state.actors[id] = {
        ...structuredClone(carried),
        position: authored.position,
        actionsLeft: game.definition.rules.actionsPerTurn,
        movesLeft: game.definition.rules.movesPerTurn,
        defending: false,
      };
    game.state.actors[id]!.inventory = game.state.actors[id]!.inventory.filter(
      (item) => !owners.has(item) || owners.get(item) === id,
    );
  }
  for (const item of Object.keys(game.state.itemLocations))
    if (owners.has(item)) delete game.state.itemLocations[item];
  for (const [id, b] of Object.entries(game.state.barriers)) {
    const shared = run.barriers[id];
    if (b.shared && shared)
      game.state.barriers[id] = {
        ...b,
        open: shared.open,
        locked: shared.locked,
        blocked: shared.blocked,
      };
  }
  const flags = [...new Set([...session.storyFlags, ...current.state.flags, ...link.setsFlags])];
  game.state.flags = [...new Set([...game.state.flags, ...flags])];
  validateEncounter(game);
  const from = run.currentSceneId;
  run.currentSceneId = target.id;
  run.clockMinutes += link.minutes ?? 0;
  run.transitions.push({
    id: request.id,
    linkId: link.id,
    from,
    to: target.id,
    stateVersion: session.stateVersion + 1,
    clockMinutes: run.clockMinutes,
  });
  return { run, game, flags: game.state.flags, target, label: link.label || target.name };
}
export function adventureHistoryEntry(
  session: Session,
  turn: { actionId?: string; actionSceneId?: string },
  index: number,
) {
  if (!session.adventure) return session.encounter?.history[Math.floor((index - 1) / 2)];
  if (!turn.actionId) return undefined;
  const game =
    turn.actionSceneId === session.adventure.currentSceneId
      ? session.encounter
      : session.adventure.savedScenes[turn.actionSceneId ?? ""];
  return game?.history.find((entry) => entry.id === turn.actionId);
}
/** Shared equipment definitions keep carried weapons usable after a scene change. */
export function unifyAdventureEquipment(run: AdventureRun) {
  const weapons = new Map<string, EncounterGame["definition"]["weapons"][number]>(),
    items = new Map<string, EncounterGame["definition"]["items"][number]>();
  for (const scene of run.scenes) {
    for (const weapon of scene.game.definition.weapons) {
      const old = weapons.get(weapon.id);
      if (old && JSON.stringify(old) !== JSON.stringify(weapon))
        throw Error("A shared weapon must have the same rules in every scene.");
      weapons.set(weapon.id, weapon);
    }
    for (const item of scene.game.definition.items)
      items.set(item.id, { ...items.get(item.id), ...item });
  }
  const scale = (scene: AdventureRun["scenes"][number]) =>
    JSON.stringify([
      scene.game.definition.rules.attributes,
      scene.game.definition.rules.playerHealth,
    ]);
  const first = run.scenes[0];
  if (first && run.scenes.some((scene) => scale(scene) !== scale(first)))
    throw Error("Every scene in an adventure must use the same attributes and player health.");
  for (const scene of run.scenes) {
    scene.game.definition.weapons = [...weapons.values()];
    scene.game.definition.items = [...items.values()];
  }
  return validateAdventure(run);
}

/** The flags that are set now: the story's and the live scene's. */
export function currentFlags(session: Session): Set<string> {
  return new Set([...session.storyFlags, ...(session.encounter?.state.flags ?? [])]);
}

export type SceneWay = {
  id: string;
  label: string;
  toSceneId: string;
  /** Travel time in minutes, when the way has one. */
  minutes?: number;
  /**
   * A door holds it shut, and the player can still see that it is there: "locked" (it needs a key
   * or another way of opening), "closed" (unlocked, but not opened yet) or "blocked" (something is
   * in the way).
   */
  status: "available" | "locked" | "closed" | "blocked";
  /** The name of the first door that is shut, for a way that is not available. */
  blockedBy?: string;
};

/** Why a door holds a way shut: locked first, then blocked, and otherwise just closed. */
function doorState(door: { locked?: boolean; blocked?: boolean } | undefined) {
  return door?.locked
    ? ("locked" as const)
    : door?.blocked
      ? ("blocked" as const)
      : ("closed" as const);
}

/**
 * Every way out of the scene the player is in. A way held shut by a door is shown as locked, so the
 * player knows it is there. A way that needs something the player has not found out yet is left out,
 * so that nothing is given away.
 */
export function sceneWays(session: Session): SceneWay[] {
  const run = session.adventure;
  if (!run) return [];
  const doors = adventureBarriers(session);
  const flags = currentFlags(session);
  return run.links
    .filter(
      (link) =>
        link.fromSceneId === run.currentSceneId &&
        link.requiresFlags.every((flag) => flags.has(flag)) &&
        link.requiresAbsentFlags.every((flag) => !flags.has(flag)),
    )
    .map((link) => {
      const shut = (link.requiresOpenBarriers ?? []).find((id) => {
        const door = doors[id];
        return !door?.open || door.locked || door.blocked;
      });
      return {
        id: link.id,
        label: link.label || run.scenes.find((s) => s.id === link.toSceneId)!.name,
        toSceneId: link.toSceneId,
        ...(link.minutes !== undefined ? { minutes: link.minutes } : {}),
        status: shut === undefined ? ("available" as const) : doorState(doors[shut]),
        ...(shut !== undefined ? { blockedBy: doors[shut]?.name ?? shut } : {}),
      };
    });
}

/** The scenes the player has been in, in the order they first came to them, with the time then. */
function visitedScenes(run: AdventureRun, startingScene: string) {
  const order: { sceneId: string; minutes: number }[] = [];
  let clock = INITIAL_GAME_MINUTES;
  const note = (sceneId: string) => {
    if (!order.some((entry) => entry.sceneId === sceneId)) order.push({ sceneId, minutes: clock });
  };
  note(startingScene);
  for (const move of run.transitions) {
    clock =
      move.clockMinutes ??
      clock + (run.links.find((link) => link.id === move.linkId)?.minutes ?? 0);
    note(move.to);
  }
  note(run.currentSceneId);
  return order;
}

/** The scene's game as it is now: the live one for this scene, the saved one for an earlier scene. */
function gameOfScene(session: Session, sceneId: string): EncounterGame | undefined {
  const run = session.adventure;
  if (!run) return undefined;
  if (sceneId === run.currentSceneId && session.encounter?.definition.id === sceneId)
    return session.encounter;
  return run.savedScenes[sceneId] ?? run.scenes.find((scene) => scene.id === sceneId)?.game;
}

/**
 * Whether an outcome sets a discovery: it sets a flag. A flag named `failed:` is how Storyboard
 * marks "it did not work", which is not something the player has found out.
 */
function setsDiscovery(effects: { kind: string; flag?: string }[]): boolean {
  return effects.some((e) => e.kind === "flag" && !e.flag?.startsWith("failed:"));
}

/**
 * Whether an outcome changes the world in a way the game already shows: it hands the player
 * something, or unlocks or opens a door. That is told by the pack and the marks, and is not a
 * discovery unless the author wrote what is learned.
 */
function showsItself(
  effects: { kind: string; locked?: boolean | undefined; open?: boolean | undefined }[],
): boolean {
  return effects.some(
    (e) =>
      e.kind === "take-item" ||
      e.kind === "transfer-item" ||
      (e.kind === "set-barrier" && (e.locked === false || e.open === true)),
  );
}

/** The first sentence of a text, at most 200 characters. */
function firstSentence(text: string): string {
  const sentence = /^[\s\S]*?[.!?…](?=\s|$)/.exec(text.trim())?.[0] ?? text.trim();
  return sentence.slice(0, 200).trim();
}

export type KnownThing = {
  /** What the player found out: the outcome's `learned`, or else its first sentence. Never a flag name. */
  text: string;
  sceneId: string;
  place: string;
  /** Game time when the player first came to the place, in minutes. */
  minutes: number;
};

/**
 * What the player has found out in this game, newest first: the outcomes of the conversations and
 * actions they went through that set a discovery. Time is when they first came to the place.
 */
export function knownThings(session: Session): KnownThing[] {
  const run = session.adventure;
  if (!run) return [];
  const first = run.scenes.find((scene) => scene.id === run.currentSceneId) ?? run.scenes[0]!;
  const start = run.transitions[0]?.from ?? first.id;
  const found: KnownThing[] = [];
  for (const { sceneId, minutes } of visitedScenes(run, start)) {
    const game = gameOfScene(session, sceneId);
    if (!game) continue;
    const place = run.scenes.find((scene) => scene.id === sceneId)?.name ?? sceneId;
    for (const entry of game.history)
      for (const event of entry.events) {
        if (event.kind !== "interaction") continue;
        const interaction = game.definition.interactions.find((i) => i.id === event.interactionId);
        const outcome = [interaction?.success, interaction?.failure].find(
          (candidate) =>
            candidate?.text === event.text &&
            setsDiscovery(candidate.effects) &&
            // An outcome that gives a thing or opens a way is a discovery only when the author
            // wrote what is learned.
            (!showsItself(candidate.effects) || !!candidate.learned?.trim()),
        );
        if (!outcome) continue;
        const text = outcome.learned?.replace(/\s+/g, " ").trim() || firstSentence(outcome.text);
        if (text && !found.some((thing) => thing.text === text))
          found.push({ text, sceneId, place, minutes });
      }
  }
  return found.reverse();
}

export type PlaceVisited = {
  sceneId: string;
  place: string;
  /** Game time when the player first came to the place, in minutes. */
  minutes: number;
};

/** The places the player has been to, in the order they first came to them, with the time then. */
export function placesVisited(session: Session): PlaceVisited[] {
  const run = session.adventure;
  if (!run) return [];
  const first = run.scenes.find((scene) => scene.id === run.currentSceneId) ?? run.scenes[0]!;
  const start = run.transitions[0]?.from ?? first.id;
  return visitedScenes(run, start).map(({ sceneId, minutes }) => ({
    sceneId,
    place: run.scenes.find((scene) => scene.id === sceneId)?.name ?? sceneId,
    minutes,
  }));
}

export type ItemOrigin = {
  sceneId: string;
  place: string;
  /** Game time when the player first came to the place, in minutes. Missing outside an adventure. */
  minutes?: number;
};

/**
 * Where and when the player got a thing: the place of the first action that handed it over, with
 * the time they came to the place. A thing the player started with, or one with no history, has no
 * origin.
 */
export function itemOrigin(session: Session, itemId: string): ItemOrigin | null {
  const handedOver = (game: EncounterGame): boolean =>
    game.history.some((entry) =>
      entry.events.some((event) => {
        if (event.kind !== "interaction") return false;
        const interaction = game.definition.interactions.find((i) => i.id === event.interactionId);
        const outcome = [interaction?.success, interaction?.failure].find(
          (candidate) => candidate?.text === event.text,
        );
        return !!outcome?.effects.some(
          (effect) =>
            (effect.kind === "take-item" && effect.itemId === itemId) ||
            (effect.kind === "transfer-item" &&
              effect.itemId === itemId &&
              effect.to === game.definition.playerId),
        );
      }),
    );
  const run = session.adventure;
  if (!run) {
    const game = session.encounter;
    return game && handedOver(game)
      ? { sceneId: game.definition.id, place: game.definition.title }
      : null;
  }
  const first = run.scenes.find((scene) => scene.id === run.currentSceneId) ?? run.scenes[0]!;
  const start = run.transitions[0]?.from ?? first.id;
  for (const { sceneId, minutes } of visitedScenes(run, start)) {
    const game = gameOfScene(session, sceneId);
    if (game && handedOver(game))
      return {
        sceneId,
        place: run.scenes.find((scene) => scene.id === sceneId)?.name ?? sceneId,
        minutes,
      };
  }
  return null;
}

export type PersonMet = {
  actorId: string;
  name: string;
  /** The scene where the player first met them. */
  sceneId: string;
  place: string;
  portraitDataUrl?: string;
};

/**
 * Everyone the player has met: the people in every scene they have been in, and anyone who has
 * spoken to them, in the order they were first met.
 */
export function peopleMet(session: Session): PersonMet[] {
  const run = session.adventure;
  if (!run) return [];
  const first = run.scenes.find((scene) => scene.id === run.currentSceneId) ?? run.scenes[0]!;
  const start = run.transitions[0]?.from ?? first.id;
  const met: PersonMet[] = [];
  for (const { sceneId } of visitedScenes(run, start)) {
    const game = gameOfScene(session, sceneId);
    if (!game) continue;
    const place = run.scenes.find((scene) => scene.id === sceneId)?.name ?? sceneId;
    const speakers = game.history.flatMap((entry) =>
      entry.events.flatMap((event) => (event.kind === "speech-reply" ? [event.actorId] : [])),
    );
    const here = Object.values(game.state.actors).filter(
      (actor) => actor.control === "npc" || speakers.includes(actor.id),
    );
    for (const actor of here) {
      if (actor.id === game.definition.playerId || met.some((m) => m.actorId === actor.id))
        continue;
      const portrait = run.cast[actor.id]?.portraitDataUrl;
      met.push({
        actorId: actor.id,
        name: actor.name,
        sceneId,
        place,
        ...(portrait ? { portraitDataUrl: portrait } : {}),
      });
    }
  }
  return met;
}

export type StorySegment = {
  sceneId: string;
  place: string;
  /** Game time when the player came to the place, in minutes. */
  minutes: number;
  /** The turns of the conversation that belong to this place: from the first, up to but not including the last. */
  from: number;
  to: number;
};

/**
 * The conversation cut into the places the player has been in, in order. A place starts at the
 * first turn, or at the turn that tells of an arrival, and runs until the next arrival. Each has
 * the game time of the arrival. Outside an adventure there is one segment of everything.
 */
export function storySegments(session: Session): StorySegment[] {
  const turns = session.conversation as { adventureSceneId?: unknown }[];
  const run = session.adventure;
  const nameOf = (sceneId: string) =>
    run?.scenes.find((scene) => scene.id === sceneId)?.name ??
    session.encounter?.definition.title ??
    sceneId;
  const firstScene = run
    ? (run.transitions[0]?.from ?? run.currentSceneId)
    : (session.sceneId ?? "");
  const starts: { index: number; sceneId: string }[] = [{ index: 0, sceneId: firstScene }];
  turns.forEach((turn, index) => {
    if (index > 0 && typeof turn?.adventureSceneId === "string")
      starts.push({ index, sceneId: turn.adventureSceneId });
  });
  let clock = INITIAL_GAME_MINUTES;
  return starts.map((start, position) => {
    if (position > 0) {
      const move = run?.transitions[position - 1];
      clock =
        move?.clockMinutes ??
        clock + (run?.links.find((link) => link.id === move?.linkId)?.minutes ?? 0);
    }
    return {
      sceneId: start.sceneId,
      place: nameOf(start.sceneId),
      minutes: clock,
      from: start.index,
      to: starts[position + 1]?.index ?? turns.length,
    };
  });
}
