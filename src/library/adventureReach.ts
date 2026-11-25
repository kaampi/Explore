import type { CampaignTemplate } from "./LibrarySchema";
import { isOpenDraft, savedAdventureStart, sceneFormat } from "./sceneFormat";

export type Reach = {
  scenes: Set<string>;
  flags: Set<string>;
  items: Set<string>;
  /** Things the player can hold in the pack. A weapon the player has equipped is in `items`, not here: it cannot unlock a door. */
  keys: Set<string>;
  /** Doors an action the player can reach unlocks or opens. */
  doors: Set<string>;
  /** Discoveries that are made on every way to a scene, by what the ways require and set. */
  guaranteed: Map<string, Set<string>>;
};

/**
 * The playthroughs of the adventure, followed one by one. Each action is a choice the player may make
 * or leave, and needs what it asks for: the flags, the things in the pack (or the weapons they hold,
 * for an action), and a door a route needs must be open, which only the key in the pack can do. An
 * action that happens once is done once. A player never has the discoveries of two different
 * playthroughs. A larger adventure is cut short, which claims less rather than more.
 *
 * `reached` holds, for each scene, the discoveries of each playthrough standing there. `takable` holds
 * the ids of the ways that some playthrough takes.
 */
function playthroughs(campaign: CampaignTemplate) {
  const first = openingScene(campaign);
  const reached = new Map<string, Set<string>[]>();
  const takable = new Set<string>();
  if (!first) return { reached, takable };
  const sceneOf = (id: string) => campaign.scenes.find((scene) => scene.id === id);
  type State = {
    scene: string;
    flags: Set<string>;
    /** Things the player can use for an action: the pack and the weapons held. */
    items: Set<string>;
    /** Things the player can open a door with: the pack only, as the engine checks it. */
    keys: Set<string>;
    done: Set<string>;
    opened: Set<string>;
  };
  const player = first.encounter?.state.actors[first.encounter.definition.playerId];
  const queue: State[] = [
    {
      scene: first.id,
      flags: new Set([...campaign.storyFlags, ...(first.encounter?.state.flags ?? [])]),
      items: new Set([...(player?.inventory ?? []), ...(player?.weapons ?? [])]),
      keys: new Set(player?.inventory ?? []),
      done: new Set(),
      opened: new Set(),
    },
  ];
  const seen = new Set<string>();
  const sorted = (set: Set<string>) => [...set].sort().join(",");
  while (queue.length && seen.size < 5000) {
    const state = queue.shift()!;
    const key = [state.scene, state.flags, state.items, state.keys, state.done, state.opened]
      .map((part) => (part instanceof Set ? sorted(part) : part))
      .join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    const list = reached.get(state.scene) ?? [];
    list.push(state.flags);
    reached.set(state.scene, list);
    const game = sceneOf(state.scene)?.encounter;
    const playerId = game?.definition.playerId;
    // Each action the player can do here, as its own next step.
    for (const action of game?.definition.interactions ?? []) {
      const doneKey = `${state.scene}:${action.id}`;
      if (action.once && state.done.has(doneKey)) continue;
      if (!action.requiresFlags.every((flag) => state.flags.has(flag))) continue;
      if (action.excludesFlags.some((flag) => state.flags.has(flag))) continue;
      if (!action.requiresItems.every((id) => state.items.has(id))) continue;
      const outcomes = action.check ? [action.success, action.failure] : [action.success];
      for (const outcome of outcomes) {
        const flags = new Set(state.flags);
        const items = new Set(state.items);
        const keys = new Set(state.keys);
        const opened = new Set(state.opened);
        for (const effect of outcome.effects) {
          if (effect.kind === "flag") flags.add(effect.flag);
          if (effect.kind === "take-item") {
            items.add(effect.itemId);
            keys.add(effect.itemId);
          }
          if (effect.kind === "transfer-item" && effect.to === playerId) {
            items.add(effect.itemId);
            keys.add(effect.itemId);
          }
          if (effect.kind === "transfer-item" && effect.from === playerId) {
            items.delete(effect.itemId);
            keys.delete(effect.itemId);
          }
          if (effect.kind === "set-barrier" && (effect.locked === false || effect.open === true))
            opened.add(effect.barrierId);
        }
        queue.push({
          scene: state.scene,
          flags,
          items,
          keys,
          opened,
          done: new Set([...state.done, doneKey]),
        });
      }
    }
    // Each way on that can be taken now.
    for (const link of campaign.sceneLinks) {
      if (link.fromSceneId !== state.scene) continue;
      if (!link.requiresFlags.every((flag) => state.flags.has(flag))) continue;
      if (link.requiresAbsentFlags.some((flag) => state.flags.has(flag))) continue;
      const doorsOpen = (link.requiresOpenBarriers ?? []).every((id) => {
        const door = game?.state.barriers[id];
        if (!door || door.blocked) return false;
        if (state.opened.has(id)) return true;
        return !door.locked || (!!door.keyId && state.keys.has(door.keyId));
      });
      if (!doorsOpen) continue;
      const target = sceneOf(link.toSceneId);
      if (!target) continue;
      takable.add(link.id);
      const flags = new Set([
        ...state.flags,
        ...link.setsFlags,
        ...(target.encounter?.state.flags ?? []),
      ]);
      queue.push({ ...state, scene: link.toSceneId, flags });
    }
  }
  return { reached, takable };
}

/**
 * What has certainly happened on arrival in each scene: the discoveries the start already has, and
 * what every way in that some playthrough can take requires or sets. A scene no way leads to is left
 * out. A way that no playthrough can take brings nothing, and so cannot take a discovery away from
 * the ways that can. An action the player may do is a choice, so it never counts as certain.
 */
export function guaranteedFlags(campaign: CampaignTemplate): Map<string, Set<string>> {
  const first = openingScene(campaign);
  const initial = (sceneId: string) =>
    campaign.scenes.find((scene) => scene.id === sceneId)?.encounter?.state.flags ?? [];
  const start = new Map<string, Set<string>>();
  if (!first) return start;
  start.set(first.id, new Set([...campaign.storyFlags, ...initial(first.id)]));
  const { takable } = playthroughs(campaign);
  const pass = (known: Map<string, Set<string>>) => {
    const next = new Map<string, Set<string>>([[first.id, start.get(first.id)!]]);
    for (const link of campaign.sceneLinks) {
      const from = known.get(link.fromSceneId);
      if (!from || link.toSceneId === first.id) continue;
      if (!takable.has(link.id)) continue;
      if (link.requiresAbsentFlags.some((flag) => from.has(flag))) continue;
      const arrival = new Set([
        ...from,
        ...link.requiresFlags,
        ...link.setsFlags,
        ...initial(link.toSceneId),
      ]);
      const before = next.get(link.toSceneId);
      next.set(
        link.toSceneId,
        before ? new Set([...before].filter((flag) => arrival.has(flag))) : arrival,
      );
    }
    return next;
  };
  let known = start;
  for (let round = 0; round < 100; round++) {
    const next = pass(known);
    const same =
      next.size === known.size &&
      [...next].every(([id, flags]) => {
        const old = known.get(id);
        return !!old && old.size === flags.size && [...flags].every((flag) => old.has(flag));
      });
    if (same) return next;
    known = next;
  }
  // The ways depend on each other in a loop that does not settle: claim nothing.
  return new Map([[first.id, start.get(first.id)!]]);
}

/** The discoveries each playthrough has standing in each scene. See `playthroughs`. */
export function playthroughFlags(campaign: CampaignTemplate): Map<string, Set<string>[]> {
  return playthroughs(campaign).reached;
}

export function openingScene(campaign: CampaignTemplate) {
  if (campaign.startSceneId !== undefined) return savedAdventureStart(campaign);
  return campaign.scenes.find((scene) => sceneFormat(scene) !== "earlier" && !isOpenDraft(scene));
}

/** Estimate which scenes and discoveries a player can reach from the adventure's start. */
export function reachableFromStart(campaign: CampaignTemplate): Reach {
  const first = openingScene(campaign);
  const scenes = new Set<string>();
  const flags = new Set<string>(campaign.storyFlags);
  const items = new Set<string>();
  const keys = new Set<string>();
  const doors = new Set<string>();
  const guaranteed = guaranteedFlags(campaign);
  if (!first) return { scenes, flags, items, keys, doors, guaranteed };
  const enter = (sceneId: string) => {
    scenes.add(sceneId);
    const scene = campaign.scenes.find((item) => item.id === sceneId);
    for (const flag of scene?.encounter?.state.flags ?? []) flags.add(flag);
    const game = scene?.encounter;
    for (const itemId of game?.state.actors[game.definition.playerId]?.inventory ?? []) {
      items.add(itemId);
      keys.add(itemId);
    }
    for (const weaponId of game?.state.actors[game.definition.playerId]?.weapons ?? [])
      items.add(weaponId);
  };
  /** A door lets the player through when it can be opened: not barricaded, and unlocked or its key can be had. */
  const doorCanOpen = (sceneId: string, doorId: string) => {
    const door = campaign.scenes.find((item) => item.id === sceneId)?.encounter?.state.barriers[
      doorId
    ];
    if (!door || door.blocked) return false;
    return !door.locked || doors.has(doorId) || (!!door.keyId && keys.has(door.keyId));
  };
  enter(first.id);
  const has = (needed: readonly string[]) => needed.every((flag) => flags.has(flag));
  const films = new Set(campaign.cutsceneFilms?.map(({ id }) => id));
  const reachedLinks = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const scene of campaign.scenes) {
      if (!scenes.has(scene.id)) continue;
      for (const action of scene.encounter?.definition.interactions ?? []) {
        if (!has(action.requiresFlags)) continue;
        // Something that has certainly happened on the way here shuts an action that needs it not to have.
        if (action.excludesFlags.some((flag) => guaranteed.get(scene.id)?.has(flag))) continue;
        if (!action.requiresItems.every((id) => items.has(id))) continue;
        const outcomes = action.check ? [action.success, action.failure] : [action.success];
        for (const outcome of outcomes)
          for (const effect of outcome.effects) {
            if (
              effect.kind === "set-barrier" &&
              (effect.locked === false || effect.open === true) &&
              !doors.has(effect.barrierId)
            ) {
              doors.add(effect.barrierId);
              changed = true;
            }
            if (effect.kind === "flag" && !flags.has(effect.flag)) {
              flags.add(effect.flag);
              changed = true;
            }
            const gets =
              effect.kind === "take-item" ||
              (effect.kind === "transfer-item" &&
                effect.to === scene.encounter?.definition.playerId);
            if (gets && !keys.has(effect.itemId)) {
              items.add(effect.itemId);
              keys.add(effect.itemId);
              changed = true;
            }
          }
      }
    }
    for (const link of campaign.sceneLinks) {
      if (!scenes.has(link.fromSceneId)) continue;
      if (link.requiresFlags.some((flag) => link.requiresAbsentFlags.includes(flag))) continue;
      if (!has(link.requiresFlags)) continue;
      if ((link.requiresOpenBarriers ?? []).some((id) => !doorCanOpen(link.fromSceneId, id)))
        continue;
      if (link.requiresAbsentFlags.some((flag) => campaign.storyFlags.includes(flag))) continue;
      if (link.requiresAbsentFlags.some((flag) => guaranteed.get(link.fromSceneId)?.has(flag)))
        continue;
      if (!campaign.scenes.some((item) => item.id === link.toSceneId)) continue;
      reachedLinks.add(link.id);
      for (const flag of link.setsFlags)
        if (!flags.has(flag)) {
          flags.add(flag);
          changed = true;
        }
      if (!scenes.has(link.toSceneId)) {
        enter(link.toSceneId);
        changed = true;
      }
    }
    for (const { filmId, trigger, setsFlags } of campaign.cutscenes) {
      if (!films.has(filmId)) continue;
      const ready =
        trigger.kind === "scene"
          ? scenes.has(trigger.sceneId)
          : trigger.kind === "link"
            ? reachedLinks.has(trigger.linkId)
            : has(trigger.flags);
      if (!ready) continue;
      for (const flag of setsFlags) {
        if (flags.has(flag)) continue;
        flags.add(flag);
        changed = true;
      }
    }
  }
  return { scenes, flags, items, keys, doors, guaranteed };
}
