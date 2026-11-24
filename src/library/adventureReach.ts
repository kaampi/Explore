import type { CampaignTemplate } from "./LibrarySchema";
import { isOpenDraft, savedAdventureStart, sceneFormat } from "./sceneFormat";

export type Reach = {
  scenes: Set<string>;
  flags: Set<string>;
  items: Set<string>;
  /** Doors an action the player can reach unlocks or opens. */
  doors: Set<string>;
};

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
  const doors = new Set<string>();
  if (!first) return { scenes, flags, items, doors };
  const enter = (sceneId: string) => {
    scenes.add(sceneId);
    const scene = campaign.scenes.find((item) => item.id === sceneId);
    for (const flag of scene?.encounter?.state.flags ?? []) flags.add(flag);
    const game = scene?.encounter;
    for (const itemId of game?.state.actors[game.definition.playerId]?.inventory ?? [])
      items.add(itemId);
    for (const weaponId of game?.state.actors[game.definition.playerId]?.weapons ?? [])
      items.add(weaponId);
  };
  /** A door lets the player through when it can be opened: not barricaded, and unlocked or its key can be had. */
  const doorCanOpen = (sceneId: string, doorId: string) => {
    const door = campaign.scenes.find((item) => item.id === sceneId)?.encounter?.state.barriers[
      doorId
    ];
    if (!door || door.blocked) return false;
    return !door.locked || doors.has(doorId) || (!!door.keyId && items.has(door.keyId));
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
            if (gets && !items.has(effect.itemId)) {
              items.add(effect.itemId);
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
  return { scenes, flags, items, doors };
}
