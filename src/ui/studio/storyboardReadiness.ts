import type { CampaignScene, CampaignTemplate, PlaceTemplate } from "../../library/LibrarySchema";
import { mapPlaceForScene, type AdventureMapPlace } from "../../library/adventureMap";
import { adventureFacts } from "../../library/playableCampaign";
import { sceneFormat } from "../../library/sceneFormat";

export type SceneField = "name" | "place" | "playable" | "arrival" | "action" | "reach" | "parts";
export type ActionField = "label" | "success" | "failure";
export type StoryboardIssue = { message: string } & (
  | { kind: "scene"; id: string; field: SceneField; action?: { id: string; field: ActionField } }
  | { kind: "link"; id: string }
  | { kind: "objective" }
);

export function storyboardIssues(
  campaign: CampaignTemplate,
  places: PlaceTemplate[],
  facts: ReadonlySet<string>,
  mapPlaces?: AdventureMapPlace[],
): StoryboardIssue[] {
  const issues: StoryboardIssue[] = [];
  const placeIds = new Set(places.map((place) => place.id));
  const sceneIds = new Set(campaign.scenes.map((scene) => scene.id));
  for (const scene of campaign.scenes) {
    // Scenes in the earlier format are built and started elsewhere. Storyboard does not judge them.
    if (sceneFormat(scene) === "earlier") continue;
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

type Reach = { scenes: Set<string>; flags: Set<string> };

/**
 * What a player can reach from the first scene, step by step. A route works once its
 * discoveries can be made, an action works once its own conditions can be met, and a
 * scene counts once a working route leads to it. A failure outcome only exists for an
 * action that rolls. This follows the same rules as play, but does not run the engine.
 */
export function reachableFromStart(campaign: CampaignTemplate): Reach {
  const first = campaign.scenes.find((scene) => sceneFormat(scene) !== "earlier");
  const scenes = new Set<string>();
  const flags = new Set<string>(campaign.storyFlags);
  if (!first) return { scenes, flags };
  const enter = (sceneId: string) => {
    scenes.add(sceneId);
    const scene = campaign.scenes.find((item) => item.id === sceneId);
    for (const flag of scene?.encounter?.state.flags ?? []) flags.add(flag);
  };
  enter(first.id);
  const has = (needed: readonly string[]) => needed.every((flag) => flags.has(flag));
  let changed = true;
  while (changed) {
    changed = false;
    for (const scene of campaign.scenes) {
      if (!scenes.has(scene.id)) continue;
      for (const action of scene.encounter?.definition.interactions ?? []) {
        if (!has(action.requiresFlags)) continue;
        const outcomes = action.check ? [action.success, action.failure] : [action.success];
        for (const outcome of outcomes)
          for (const effect of outcome.effects)
            if (effect.kind === "flag" && !flags.has(effect.flag)) {
              flags.add(effect.flag);
              changed = true;
            }
      }
    }
    for (const link of campaign.sceneLinks) {
      if (!scenes.has(link.fromSceneId)) continue;
      if (link.requiresFlags.some((flag) => link.requiresAbsentFlags.includes(flag))) continue;
      if (!has(link.requiresFlags)) continue;
      if (link.requiresAbsentFlags.some((flag) => campaign.storyFlags.includes(flag))) continue;
      if (!campaign.scenes.some((item) => item.id === link.toSceneId)) continue;
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
  }
  return { scenes, flags };
}

/**
 * Things worth checking that do not stop the player testing: scenes nothing leads to, and
 * conditions nothing can meet. Each scene can still be tested on its own from "Start from".
 */
export function storyboardWarnings(
  campaign: CampaignTemplate,
  facts: ReadonlySet<string>,
): StoryboardIssue[] {
  const first = campaign.scenes.find((scene) => sceneFormat(scene) !== "earlier");
  if (!first) return [];
  const issues: StoryboardIssue[] = [];
  const reach = reachableFromStart(campaign);
  const labels = new Map(adventureFacts(campaign).map((fact) => [fact.id, fact.label]));
  const discovery = (flag: string) => (labels.has(flag) ? `“${labels.get(flag)}”` : `“${flag}”`);
  const openingName = first.name.trim() || "Untitled scene";
  for (const scene of campaign.scenes) {
    if (sceneFormat(scene) === "earlier") continue;
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
      const missing = action.requiresFlags.find((flag) => !reach.flags.has(flag));
      if (!missing) continue;
      const actionName = action.label.trim() || "Untitled action";
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
