import type { CampaignScene, CampaignTemplate, PlaceTemplate } from "../../library/LibrarySchema";
import { mapPlaceForScene, type AdventureMapPlace } from "../../library/adventureMap";
import { adventureFacts } from "../../library/playableCampaign";
import { openingScene, reachableFromStart } from "../../library/adventureReach";
import { isOpenDraft, sceneFormat } from "../../library/sceneFormat";

export { reachableFromStart };
import { isHostile, reachablePositions } from "../../library/sceneParts";

export type SceneField = "name" | "place" | "playable" | "arrival" | "action" | "reach" | "parts";
export type ActionField = "label" | "success" | "failure";
export type StoryboardIssue = { message: string } & (
  | { kind: "scene"; id: string; field: SceneField; action?: { id: string; field: ActionField } }
  | { kind: "link"; id: string }
  | { kind: "objective" }
  | { kind: "rules" }
);

export function storyboardIssues(
  campaign: CampaignTemplate,
  places: PlaceTemplate[],
  facts: ReadonlySet<string>,
  mapPlaces?: AdventureMapPlace[],
  library?: {
    objects: { id: string; name: string; weapon?: unknown }[];
    rulesets?: { id: string }[] | undefined;
  },
): StoryboardIssue[] {
  const issues: StoryboardIssue[] = [];
  issues.push(...weaponMisuseIssues(campaign, library));
  issues.push(...ruleIssues(campaign, library?.rulesets));
  const placeIds = new Set(places.map((place) => place.id));
  const sceneIds = new Set(campaign.scenes.map((scene) => scene.id));
  for (const scene of campaign.scenes) {
    // Scenes in the earlier format are built and started elsewhere. Storyboard does not judge them.
    if (sceneFormat(scene) === "earlier") continue;
    // A draft from a manuscript is a note, not an unfinished scene: it is a warning, not an error.
    if (isOpenDraft(scene)) continue;
    const name = scene.name.trim() || "Untitled scene";
    const mapPlace = mapPlaces ? mapPlaceForScene(scene, mapPlaces) : undefined;
    const hasPlace = mapPlaces ? !!mapPlace : placeIds.has(scene.placeId);
    const add = (field: SceneField, message: string, action?: { id: string; field: ActionField }) =>
      issues.push({
        kind: "scene",
        id: scene.id,
        field,
        message,
        ...(action ? { action } : {}),
      });
    if (!scene.name.trim()) add("name", "Name the untitled scene.");
    if (!hasPlace) add("place", `Choose a place for “${name}”.`);
    if (!scene.encounter) {
      if (hasPlace) add("playable", `Make “${name}” playable.`);
      continue;
    }
    const arrival =
      scene.usePlaceIntro && mapPlaces
        ? (mapPlace?.place.note ?? "")
        : scene.encounter.definition.description;
    if (!arrival.trim() || arrival === "Describe what the player sees on arrival.")
      add("arrival", `Describe the arrival in “${name}”.`);
    for (const actor of Object.values(scene.encounter.state.actors))
      if (
        actor.id !== scene.encounter.definition.playerId &&
        isHostile(scene.encounter, actor) &&
        actor.weapons.length === 0
      )
        add(
          "parts",
          `“${actor.name}” in “${name}” is hostile but has no weapon. Give them one, or make them neutral.`,
        );
    const fightStarters = scene.encounter.definition.interactions.filter((action) =>
      [...action.success.effects, ...action.failure.effects].some(
        (effect) => effect.kind === "start-combat",
      ),
    );
    const anyoneHostile = Object.values(scene.encounter.state.actors).some(
      (actor) =>
        actor.id !== scene.encounter!.definition.playerId && isHostile(scene.encounter!, actor),
    );
    if (fightStarters.length > 0 && !anyoneHostile)
      add(
        "parts",
        `“${fightStarters[0]!.label.trim() || "An action"}” in “${name}” starts a fight, but no one in the scene is hostile.`,
      );
    for (const door of Object.values(scene.encounter.state.barriers))
      if (door.locked && !door.keyId && campaign.goal && !someActionOpens(campaign, door.id))
        add("parts", `“${door.name}” in “${name}” is locked, but nothing opens it. Choose a key.`);
    for (const action of scene.encounter.definition.interactions) {
      const actionName = action.label.trim() || "Untitled action";
      if (!action.label.trim())
        add("action", `Name the untitled action in “${name}”.`, { id: action.id, field: "label" });
      if (
        !action.success.text.trim() ||
        action.success.text === "Describe what the player discovers."
      ) {
        add("action", `Write the success outcome for “${actionName}” in “${name}”.`, {
          id: action.id,
          field: "success",
        });
      }
      if (action.check && !action.failure.text.trim()) {
        add("action", `Write the failure outcome for “${actionName}” in “${name}”.`, {
          id: action.id,
          field: "failure",
        });
      }
    }
  }
  issues.push(...duplicateItemIssues(campaign));
  for (const link of campaign.sceneLinks) {
    if (
      link.fromSceneId === link.toSceneId ||
      !sceneIds.has(link.fromSceneId) ||
      !sceneIds.has(link.toSceneId)
    ) {
      issues.push({
        kind: "link",
        id: link.id,
        message: `Choose two different scenes for “${link.label || "Continue"}”.`,
      });
    }
    if (link.requiresFlags.some((flag) => link.requiresAbsentFlags.includes(flag))) {
      issues.push({
        kind: "link",
        id: link.id,
        message: `Resolve the conflicting conditions on “${link.label || "Continue"}”.`,
      });
    }
  }
  if (campaign.goal && !campaign.goal.title.trim())
    issues.push({ kind: "objective", message: "Name the adventure objective." });
  if (campaign.goal?.requiresFlags.some((flag) => !facts.has(flag))) {
    issues.push({
      kind: "objective",
      message: "Replace the missing discovery in the adventure objective.",
    });
  }
  return issues;
}

/**
 * The adventure's rule-set must exist, and an action may only roll against a skill the scene's
 * scales know. Scenes with no scales roll against whatever values the player has, as before.
 */
function ruleIssues(campaign: CampaignTemplate, rulesets?: { id: string }[]): StoryboardIssue[] {
  const issues: StoryboardIssue[] = [];
  if (rulesets && campaign.rulesetId && !rulesets.some((set) => set.id === campaign.rulesetId))
    issues.push({
      kind: "rules",
      message:
        "The rule-set chosen for this adventure is gone. Choose another one in World, or none to use the basic skills.",
    });
  for (const scene of campaign.scenes) {
    if (sceneFormat(scene) !== "playable") continue;
    const game = scene.encounter!;
    const scales = game.definition.rules.attributes;
    if (scales.length === 0) continue;
    const sceneName = scene.name.trim() || "Untitled scene";
    for (const action of game.definition.interactions) {
      if (!action.check || scales.some((scale) => scale.id === action.check!.stat)) continue;
      issues.push({
        kind: "scene",
        id: scene.id,
        field: "action",
        action: { id: action.id, field: "label" },
        message: `“${action.label.trim() || "An untitled action"}” in “${sceneName}” rolls against “${action.check.stat}”, which is not a skill in the rule-set. Choose another skill.`,
      });
    }
  }
  return issues;
}

/**
 * A thing with a weapon on its card is carried among weapons, not in the pack. Doors look for
 * their key in the pack and a handover takes from it, so a weapon cannot be either. This
 * looks at the cards too, so it is caught before the scene is next brought up to date.
 */
function weaponMisuseIssues(
  campaign: CampaignTemplate,
  library?: { objects: { id: string; name: string; weapon?: unknown }[] },
): StoryboardIssue[] {
  const issues: StoryboardIssue[] = [];
  for (const scene of campaign.scenes) {
    if (sceneFormat(scene) !== "playable") continue;
    const game = scene.encounter!;
    const sceneName = scene.name.trim() || "Untitled scene";
    const isWeapon = (id: string) =>
      game.definition.weapons.some((weapon) => weapon.id === id) ||
      Boolean(library?.objects.find((object) => object.id === id)?.weapon);
    const nameOf = (id: string) =>
      game.definition.items.find((item) => item.id === id)?.name ??
      library?.objects.find((object) => object.id === id)?.name ??
      "A thing";
    const report = (id: string, use: string) =>
      issues.push({
        kind: "scene",
        id: scene.id,
        field: "parts",
        message: `“${nameOf(id)}” in “${sceneName}” is a weapon, so it cannot be ${use}. Use another thing, or take the weapon off its card.`,
      });
    for (const door of Object.values(game.state.barriers))
      if (door.keyId && isWeapon(door.keyId)) report(door.keyId, `the key to “${door.name}”`);
    for (const action of game.definition.interactions)
      for (const effect of [...action.success.effects, ...action.failure.effects])
        if (effect.kind === "transfer-item" && isWeapon(effect.itemId))
          report(effect.itemId, `handed over in “${action.label.trim() || "an action"}”`);
  }
  return issues;
}

/** People and things placed in a scene whose cards are gone. The scene keeps their last details. */
function missingCardIssues(
  campaign: CampaignTemplate,
  library: { characters: { id: string }[]; objects: { id: string }[] },
): StoryboardIssue[] {
  const issues: StoryboardIssue[] = [];
  for (const scene of campaign.scenes) {
    if (sceneFormat(scene) !== "playable") continue;
    const game = scene.encounter!;
    const sceneName = scene.name.trim() || "Untitled scene";
    for (const pick of scene.people) {
      if (library.characters.some((card) => card.id === pick.characterId)) continue;
      const name = game.state.actors[`npc:${pick.characterId}`]?.name ?? "A person";
      issues.push({
        kind: "scene",
        id: scene.id,
        field: "parts",
        message: `${name} in “${sceneName}” has no card in your library any more. The scene keeps their last details.`,
      });
    }
    for (const objectId of scene.objectIds) {
      if (library.objects.some((card) => card.id === objectId)) continue;
      const name = game.definition.items.find((item) => item.id === objectId)?.name ?? "A thing";
      issues.push({
        kind: "scene",
        id: scene.id,
        field: "parts",
        message: `${name} in “${sceneName}” has no card in your library any more. The scene keeps its last details.`,
      });
    }
  }
  return issues;
}

/**
 * A weapon from a thing's card uses a skill. If the scene's rule-set has no such skill the
 * holder will rarely hit. If it has one but the player or a hostile person has no value of
 * their own, the middle of the scale counts. Both are worth knowing before a fight.
 */
function missingSkillIssues(campaign: CampaignTemplate): StoryboardIssue[] {
  const issues: StoryboardIssue[] = [];
  const hasValue = (sheet: Record<string, string> | undefined, skill: string) => {
    const text = sheet?.[skill];
    return text !== undefined && text.trim() !== "" && Number.isFinite(Number(text));
  };
  for (const scene of campaign.scenes) {
    if (sceneFormat(scene) !== "playable") continue;
    const game = scene.encounter!;
    const sceneName = scene.name.trim() || "Untitled scene";
    const cardIds = new Set(game.definition.items.map((item) => item.id));
    const scales = game.definition.rules.attributes;
    const reported = new Set<string>();
    for (const action of game.definition.interactions) {
      const scale = scales.find((item) => item.id === action.check?.stat);
      if (!action.check || !scale || hasValue(campaign.player?.stats, scale.id)) continue;
      issues.push({
        kind: "scene",
        id: scene.id,
        field: "parts",
        message: `You have no value for “${scale.name}”, so the middle of its scale counts for “${action.label.trim() || "an action"}” in “${sceneName}”.`,
      });
    }
    for (const actor of Object.values(game.state.actors)) {
      const isPlayer = actor.id === game.definition.playerId;
      if (!isPlayer && !(actor.id.startsWith("npc:") && isHostile(game, actor))) continue;
      const sheet = isPlayer
        ? campaign.player?.stats
        : campaign.people.find((person) => person.characterId === actor.id.slice(4))?.stats;
      for (const weaponId of actor.weapons) {
        const weapon = game.definition.weapons.find((item) => item.id === weaponId);
        if (!weapon || !cardIds.has(weaponId)) continue;
        const scale = scales.find((item) => item.id === weapon.skill);
        if (scales.length > 0 && !scale) {
          if (reported.has(weapon.id)) continue;
          reported.add(weapon.id);
          issues.push({
            kind: "scene",
            id: scene.id,
            field: "parts",
            message: `${weapon.name} in “${sceneName}” uses “${weapon.skill}”, which is not a skill in the rule-set, so whoever holds it will rarely hit.`,
          });
        } else if (scale && !hasValue(sheet, scale.id)) {
          issues.push({
            kind: "scene",
            id: scene.id,
            field: "parts",
            message: `${actor.name} has no value for “${scale.name}”, so the middle of its scale counts for ${weapon.name} in “${sceneName}”.`,
          });
        } else if (scales.length === 0 && actor.stats[weapon.skill] === undefined) {
          issues.push({
            kind: "scene",
            id: scene.id,
            field: "parts",
            message: `${actor.name} has no value for “${weapon.skill}”, so ${weapon.name} in “${sceneName}” will rarely hit.`,
          });
        }
      }
    }
  }
  return issues;
}

/** A position the player can never walk to is probably a connection that was forgotten. */
function unreachablePositionIssues(campaign: CampaignTemplate): StoryboardIssue[] {
  const issues: StoryboardIssue[] = [];
  for (const scene of campaign.scenes) {
    if (sceneFormat(scene) !== "playable") continue;
    const reachable = reachablePositions(scene);
    for (const place of scene.encounter!.definition.places)
      if (!reachable.has(place.id))
        issues.push({
          kind: "scene",
          id: scene.id,
          field: "parts",
          message: `“${place.name}” in “${scene.name.trim() || "Untitled scene"}” cannot be reached from where the player starts. Connect it.`,
        });
  }
  return issues;
}

/** A card that says a thing is too heavy to carry, and an action that lets the player take it. */
export const HEAVY_WEIGHT = 30;
function heavyPickUpIssues(
  campaign: CampaignTemplate,
  objects: { id: string; portable?: boolean | undefined; weight?: number | undefined }[],
): StoryboardIssue[] {
  const issues: StoryboardIssue[] = [];
  for (const scene of campaign.scenes) {
    if (sceneFormat(scene) !== "playable") continue;
    const game = scene.encounter!;
    for (const action of game.definition.interactions)
      for (const effect of [...action.success.effects, ...action.failure.effects]) {
        if (effect.kind !== "take-item") continue;
        const card = objects.find((object) => object.id === effect.itemId);
        if (!card || card.portable === true || (card.weight ?? 0) <= HEAVY_WEIGHT) continue;
        const name =
          game.definition.items.find((item) => item.id === effect.itemId)?.name ?? "A thing";
        issues.push({
          kind: "scene",
          id: scene.id,
          field: "action",
          action: { id: action.id, field: "label" },
          message: `The card says ${name} is too heavy to carry, but “${action.label.trim() || "an action"}” in “${scene.name.trim() || "Untitled scene"}” lets the player take it.`,
        });
      }
  }
  return issues;
}

/**
 * Whether an action in the adventure unlocks or opens the door. A locked door nothing can open is
 * only a fault when the adventure has an aim to reach; free play in a world just has locked doors.
 */
function someActionOpens(campaign: CampaignTemplate, doorId: string): boolean {
  return campaign.scenes.some((scene) =>
    scene.encounter?.definition.interactions.some((action) =>
      [...action.success.effects, ...action.failure.effects].some(
        (effect) =>
          effect.kind === "set-barrier" &&
          effect.barrierId === doorId &&
          (effect.locked === false || effect.open === true),
      ),
    ),
  );
}

/** A key that is nowhere in the adventure cannot be found, so its door stays shut. */
function missingKeyIssues(campaign: CampaignTemplate): StoryboardIssue[] {
  const known = new Set<string>(campaign.objectIds);
  for (const scene of campaign.scenes)
    for (const item of scene.encounter?.definition.items ?? []) known.add(item.id);
  const issues: StoryboardIssue[] = [];
  for (const scene of campaign.scenes) {
    if (sceneFormat(scene) !== "playable") continue;
    for (const door of Object.values(scene.encounter!.state.barriers))
      if (door.locked && door.keyId && !known.has(door.keyId))
        issues.push({
          kind: "scene",
          id: scene.id,
          field: "parts",
          message: `The key to “${door.name}” in “${scene.name.trim() || "Untitled scene"}” is not in this adventure.`,
        });
  }
  return issues;
}

/** An item starts in one place in the whole adventure, not once per scene. */
function duplicateItemIssues(campaign: CampaignTemplate): StoryboardIssue[] {
  const issues: StoryboardIssue[] = [];
  const firstSeen = new Map<string, CampaignScene>();
  for (const scene of campaign.scenes) {
    const game = scene.encounter;
    if (!game || sceneFormat(scene) === "earlier") continue;
    const placed = new Set<string>(Object.keys(game.state.itemLocations));
    for (const actor of Object.values(game.state.actors))
      if (actor.id !== game.definition.playerId)
        for (const itemId of actor.inventory) placed.add(itemId);
    for (const itemId of placed) {
      const earlier = firstSeen.get(itemId);
      if (!earlier) {
        firstSeen.set(itemId, scene);
        continue;
      }
      const name = game.definition.items.find((item) => item.id === itemId)?.name ?? "An item";
      issues.push({
        kind: "scene",
        id: scene.id,
        field: "parts",
        message: `“${name}” is placed in both “${earlier.name.trim() || "Untitled scene"}” and “${scene.name.trim() || "Untitled scene"}”. An item starts in only one place.`,
      });
    }
  }
  return issues;
}

/**
 * Things worth checking that do not stop the player testing: scenes nothing leads to, and
 * conditions nothing can meet. Each scene can still be tested on its own from "Start from".
 */
/** A draft nothing has been built in yet is left out of the test, and the author is told. */
function draftWarning(scene: CampaignScene): StoryboardIssue {
  return {
    kind: "scene",
    id: scene.id,
    field: "playable",
    message: `“${scene.name.trim() || "Untitled event"}” is a draft${scene.draft ? " from the manuscript" : " from the guide"} with nothing built yet, so it is left out of the test. Choose a place and make it playable when you are ready.`,
  };
}

/**
 * The author's own arrival text names a person who is hidden when the scene starts. The text is
 * the author's choice and is never changed; this only says so.
 */
function hiddenNameIssues(campaign: CampaignTemplate): StoryboardIssue[] {
  const found: StoryboardIssue[] = [];
  for (const scene of campaign.scenes) {
    const game = scene.encounter;
    if (!game || sceneFormat(scene) === "earlier" || isOpenDraft(scene)) continue;
    const text = ` ${game.definition.description.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ")} `;
    for (const actor of Object.values(game.state.actors)) {
      if (
        !actor.requiresFlags?.length ||
        actor.requiresFlags.every((f) => game.state.flags.includes(f))
      )
        continue;
      // A name also counts in another form: "Jättespindeln" is named by "en jättespindel".
      const words = actor.name
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter(Boolean)
        .map((word) => (word.length > 4 ? word.replace(/(en|et|na|n|s)$/, "") : word));
      if (words.length === 0 || !words.every((word) => text.includes(` ${word}`))) continue;
      found.push({
        kind: "scene",
        id: scene.id,
        field: "arrival",
        message: `The arrival text mentions ${actor.name}, who is hidden when the scene starts. Change the text, or let the person be seen from the start.`,
      });
    }
  }
  return found;
}

export function storyboardWarnings(
  campaign: CampaignTemplate,
  facts: ReadonlySet<string>,
  library?: {
    characters: { id: string }[];
    objects: { id: string; portable?: boolean | undefined; weight?: number | undefined }[];
  },
): StoryboardIssue[] {
  const first = openingScene(campaign);
  const drafts = campaign.scenes.filter(isOpenDraft);
  if (!first) return drafts.map(draftWarning);
  const issues: StoryboardIssue[] = [
    ...drafts.map(draftWarning),
    ...(library ? missingCardIssues(campaign, library) : []),
    ...(library ? heavyPickUpIssues(campaign, library.objects) : []),
    ...missingKeyIssues(campaign),
    ...unreachablePositionIssues(campaign),
    ...missingSkillIssues(campaign),
    ...hiddenNameIssues(campaign),
  ];
  const reach = reachableFromStart(campaign);
  const labels = new Map(adventureFacts(campaign).map((fact) => [fact.id, fact.label]));
  const discovery = (flag: string) => (labels.has(flag) ? `“${labels.get(flag)}”` : `“${flag}”`);
  const openingName = first.name.trim() || "Untitled scene";
  for (const scene of campaign.scenes) {
    if (sceneFormat(scene) === "earlier" || isOpenDraft(scene)) continue;
    const name = scene.name.trim() || "Untitled scene";
    if (!reach.scenes.has(scene.id)) {
      issues.push({
        kind: "scene",
        id: scene.id,
        field: "reach",
        message: `The player cannot reach “${name}” from “${openingName}”. Connect it, or check the conditions on the routes leading to it.`,
      });
      continue;
    }
    for (const action of scene.encounter?.definition.interactions ?? []) {
      const actionName = action.label.trim() || "Untitled action";
      const lacks = action.requiresItems.find((id) => !reach.items.has(id));
      if (lacks) {
        const game = scene.encounter!;
        const itemName =
          game.definition.items.find((i) => i.id === lacks)?.name ??
          game.definition.weapons.find((w) => w.id === lacks)?.name ??
          lacks;
        issues.push({
          kind: "scene",
          id: scene.id,
          field: "action",
          action: { id: action.id, field: "label" },
          message: `“${actionName}” in “${name}” needs “${itemName}”, which the player cannot get, so it can never be done.`,
        });
      }
      const missing = action.requiresFlags.find((flag) => !reach.flags.has(flag));
      if (!missing) continue;
      issues.push({
        kind: "scene",
        id: scene.id,
        field: "action",
        action: { id: action.id, field: "label" },
        message: `“${actionName}” in “${name}” needs ${discovery(missing)}, which nothing the player can reach creates, so it never appears.`,
      });
    }
  }
  for (const link of campaign.sceneLinks) {
    if (!reach.scenes.has(link.fromSceneId)) continue;
    const from = campaign.scenes.find((item) => item.id === link.fromSceneId);
    const shut = (link.requiresOpenBarriers ?? [])
      .map((id) => from?.encounter?.state.barriers[id])
      .find(
        (door) =>
          door &&
          (door.blocked ||
            (door.locked &&
              !reach.doors.has(door.id) &&
              !(door.keyId && reach.items.has(door.keyId)))),
      );
    if (shut)
      issues.push({
        kind: "link",
        id: link.id,
        message: `“${link.label || "Continue"}” needs “${shut.name}” open, but the player cannot get the key that opens it.`,
      });
    const missing = link.requiresFlags.find((flag) => !reach.flags.has(flag));
    if (!missing) continue;
    issues.push({
      kind: "link",
      id: link.id,
      message: `“${link.label || "Continue"}” needs ${discovery(missing)}, which nothing the player can reach creates.`,
    });
  }
  const unreachableGoal = campaign.goal?.requiresFlags.find(
    (flag) => facts.has(flag) && !reach.flags.has(flag),
  );
  if (unreachableGoal)
    issues.push({
      kind: "objective",
      message: `The objective needs ${discovery(unreachableGoal)}, which nothing the player can reach creates.`,
    });
  return issues;
}
