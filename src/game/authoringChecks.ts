import { openingScene, reachableFromStart } from "../library/adventureReach";
import { adventureMapPlaces, mapPlaceForScene } from "../library/adventureMap";
import {
  applyPatch,
  itemPlaces,
  patchOpProblem,
  type AuthoringOp,
  type AuthoringPatch,
  type PatchCreated,
  type PatchLibrary,
  type Requirement,
} from "../library/authoringPatch";
import type {
  CampaignScene,
  CampaignTemplate,
  CharacterTemplate,
  PlaceTemplate,
  RealmTemplate,
  RulesetTemplate,
  StoryboardLink,
  VoiceTemplate,
} from "../library/LibrarySchema";
import { startPlayableCampaign } from "../session/adventureStart";
import { applyEffects, interactionBlock } from "./interactions";

/**
 * Checks on what an AI helper proposes. They are plain functions of the adventure and the patch:
 * the model never decides whether something can be reached, is locked, or can be started. See
 * docs/storyboard-ai.sv.md.
 *
 * A finding says what it is with `kind` and `params`, so the panel can write the sentence in the
 * author's language. The params hold only words the author knows: names, labels and the text of a
 * discovery, never an id. `message` and a fix's `label` are the same sentence in English, as a
 * fallback. An empty name means the thing has none.
 */

/** What each kind of finding carries. */
export type FindingParams = {
  /** Something nobody can get to, or get what it asks for. `thing` is what cannot be had. */
  unreachable: {
    what: "scene" | "route" | "action";
    name: string;
    why: "noRoute" | "unobtainable" | "happened" | "none";
    thing?: string;
  };
  /** A route that gets past what locks a scene. `notYet` are discoveries that must not be made. */
  bypassesLock: { locks: string[]; notYet: string[] };
  deadEnd: { name: string };
  unusedFact: { fact: string; action: string };
  /** A text mentions something that is not in the scene. */
  missingThing: {
    name: string;
    thingKind: "person" | "item" | "place";
    where: "elsewhere" | "library" | "nowhere";
    scene: string;
    /** The scenes it is in, when it is elsewhere. */
    scenes: string[];
  };
  /** The adventure cannot be started once the patch is applied. */
  cannotStart: {
    why: "noStartScene" | "scenePlace" | "mapPlace" | "mapMissing" | "noArrival" | "other";
    scene: string;
  };
  /** A new scene has no place to be at, or no node on the adventure's map. */
  needsPlace: { name: string; map: "yes" | "no" };
  selfLink: { name: string };
  /** An action gives something that cannot be taken where the action is. */
  cannotReceive: {
    action: string;
    thing: string;
    why: "elsewhere" | "owned" | "notThere";
    scenes: string[];
  };
  oneDiscoveryPerAction: { action: string };
};

export type FindingKind = keyof FindingParams;

type FindingBase = {
  /** "problem" should be looked at; "note" is only information. */
  severity: "problem" | "note";
  /** The sentence in English. */
  message: string;
  /** The operation in the patch that this is about, when there is one. */
  opIndex?: number;
  sceneId?: string;
  linkId?: string;
};

export type Finding = {
  [K in FindingKind]: FindingBase & { kind: K; params: FindingParams[K]; fixes: Fix[] };
}[FindingKind];

export type FixParams = {
  requireLockToo: { locks: string[]; notYet: string[] };
  shortcutOnPurpose: Record<string, never>;
  isEnding: Record<string, never>;
  addAsItem: { name: string };
  rewriteWithout: Record<string, never>;
  /** Use the place of the scene the new scene is reached from. */
  usePlaceOf: { scene: string };
};

export type FixKey = keyof FixParams;

/** What taking a fix does to the proposal. */
type FixEffects = {
  /** The new patch is the whole proposal, in place of the old one. */
  requireLockToo: { apply: "replace"; patch: AuthoringPatch };
  usePlaceOf: { apply: "replace"; patch: AuthoringPatch };
  /** These operations are added to the end of the proposal. */
  addAsItem: { apply: "append"; ops: AuthoringOp[] };
  /** The author accepts it as it is. */
  shortcutOnPurpose: { apply: "none" };
  isEnding: { apply: "none" };
  rewriteWithout: { apply: "none" };
};

export type Fix = {
  [K in FixKey]: { key: K; params: FixParams[K]; label: string } & FixEffects[K];
}[FixKey];

/** What the checks can read besides the adventure. A list that is missing is empty. */
export type CheckLibrary = PatchLibrary & {
  places?: PlaceTemplate[];
  worlds?: RealmTemplate[];
  characters?: CharacterTemplate[];
  voices?: VoiceTemplate[];
  rulesets?: RulesetTemplate[];
};

/**
 * Is there a place for the scene to be played at? Looked up as the start looks it up: on a map the
 * places are the nodes of the map, which need no card of their own; otherwise a card in the library.
 */
function hasPlace(
  scene: CampaignScene,
  campaign: CampaignTemplate,
  library: CheckLibrary,
): boolean {
  if (!scene.placeId) return false;
  const known = library.places;
  const world = campaign.mapWorldId
    ? library.worlds?.find((item) => item.id === campaign.mapWorldId)
    : undefined;
  if (world?.worldMap && known)
    return mapPlaceForScene(scene, adventureMapPlaces(world, known)) !== undefined;
  return known === undefined || known.some((place) => place.id === scene.placeId);
}

function itemName(campaign: CampaignTemplate, library: PatchLibrary, id: string): string {
  return (
    library.objects.find((object) => object.id === id)?.name ??
    campaign.scenes
      .flatMap((scene) => scene.encounter?.definition.items ?? [])
      .find((item) => item.id === id)?.name ??
    id
  );
}

/**
 * A discovery as the author knows it: the sentence an action gives it, else the name of the action
 * or the route that makes it, else the name the proposal gave it.
 */
function factText(campaign: CampaignTemplate, flag: string): string {
  let byAction: string | undefined;
  for (const scene of campaign.scenes)
    for (const action of scene.encounter?.definition.interactions ?? [])
      for (const outcome of [action.success, action.failure])
        if (outcome.effects.some((effect) => effect.kind === "flag" && effect.flag === flag)) {
          if (outcome.learned) return outcome.learned;
          byAction ??= action.label.trim() || undefined;
        }
  if (byAction) return byAction;
  const route = campaign.sceneLinks.find((link) => link.setsFlags.includes(flag));
  return route?.label.trim() || flag;
}

const named = (name: string, fallback: string) => name.trim() || fallback;
const quoted = (names: string[]) => names.map((name) => `“${name}”`).join(" and ");

type Need = {
  token: string;
  label: string;
  /** Must NOT have happened. */
  absent?: boolean;
  requirement?: Requirement;
};

/** What a route asks for, as comparable tokens, each with a name the author recognises. */
function lockOf(campaign: CampaignTemplate, link: StoryboardLink): Need[] {
  const from = campaign.scenes.find((scene) => scene.id === link.fromSceneId);
  const needs: Need[] = [];
  for (const flag of link.requiresFlags)
    needs.push({
      token: `fact:${flag}`,
      label: factText(campaign, flag),
      requirement: { kind: "fact", fact: flag },
    });
  for (const flag of link.requiresAbsentFlags)
    needs.push({
      token: `absent:${flag}`,
      label: factText(campaign, flag),
      absent: true,
      requirement: { kind: "noFact", fact: flag },
    });
  for (const doorId of link.requiresOpenBarriers ?? []) {
    const door = from?.encounter?.state.barriers[doorId];
    if (door?.keyId)
      needs.push({
        token: `key:${door.keyId}`,
        label: door.name,
        requirement: { kind: "item", itemId: door.keyId },
      });
    else needs.push({ token: `door:${doorId}`, label: door?.name ?? "" });
  }
  return needs;
}

/** Everything in the adventure that asks for a discovery. */
function factsUsed(campaign: CampaignTemplate): Set<string> {
  const used = new Set<string>(campaign.goal?.requiresFlags ?? []);
  for (const link of campaign.sceneLinks)
    for (const flag of [...link.requiresFlags, ...link.requiresAbsentFlags]) used.add(flag);
  for (const scene of campaign.scenes) {
    const definition = scene.encounter?.definition;
    for (const action of definition?.interactions ?? [])
      for (const flag of [...action.requiresFlags, ...action.excludesFlags]) used.add(flag);
    for (const text of definition?.descriptions ?? [])
      for (const flag of [...text.requiresFlags, ...text.excludesFlags]) used.add(flag);
    for (const item of definition?.items ?? [])
      for (const flag of item.requiresFlags) used.add(flag);
    for (const trigger of scene.triggers)
      for (const flag of [...trigger.requiresFlags, ...trigger.requiresAbsentFlags]) used.add(flag);
  }
  for (const placement of campaign.cutscenes) {
    const trigger = placement.trigger;
    if (trigger.kind === "facts") for (const flag of trigger.flags) used.add(flag);
  }
  return used;
}

type StartProblem = FindingParams["cannotStart"];

/** Start the adventure the way a real start does, and say what stopped it, if anything. */
function startProblem(campaign: CampaignTemplate, library: CheckLibrary): StartProblem | undefined {
  const start = openingScene(campaign);
  if (!start) return { why: "noStartScene", scene: "" };
  try {
    startPlayableCampaign(
      campaign,
      start,
      library.places ?? [],
      "authoring-check",
      library.worlds ?? [],
      {
        objects: library.objects,
        ...(library.characters ? { characters: library.characters } : {}),
        ...(library.voices ? { voices: library.voices } : {}),
        ...(library.rulesets ? { rulesets: library.rulesets } : {}),
      },
    );
    return undefined;
  } catch (error) {
    const text = error instanceof Error ? error.message : "";
    const scene = (pattern: RegExp) => pattern.exec(text)?.[1] ?? "";
    if (/Choose a place and make/.test(text))
      return { why: "scenePlace", scene: scene(/Choose a place and make “(.*?)”/) };
    if (/Choose an existing map place for/.test(text))
      return { why: "mapPlace", scene: scene(/map place for “(.*?)”/) };
    if (/world map is unavailable/.test(text)) return { why: "mapMissing", scene: "" };
    if (/Add an arrival introduction for/.test(text))
      return { why: "noArrival", scene: scene(/introduction for “(.*?)”/) };
    return { why: "other", scene: "" };
  }
}

/** Could the player take what the action gives, where the action is? */
function receiveProblem(
  campaign: CampaignTemplate,
  scene: CampaignScene,
  actionId: string,
  library: PatchLibrary,
): FindingParams["cannotReceive"] | undefined {
  const game = structuredClone(scene.encounter!);
  const { definition: d, state: s } = game;
  const action = d.interactions.find((item) => item.id === actionId);
  if (!action) return undefined;
  const player = s.actors[d.playerId]!;
  // Judge the gift as if what the action asks for has already been had.
  for (const flag of action.requiresFlags) if (!s.flags.includes(flag)) s.flags.push(flag);
  for (const item of action.requiresItems)
    if (!player.inventory.includes(item)) player.inventory.push(item);
  s.attempts = [];
  if (!interactionBlock(d, s, actionId)) return undefined;
  for (const effect of action.success.effects) {
    if (effect.kind !== "take-item") continue;
    try {
      applyEffects(d, structuredClone(s), [effect]);
    } catch {
      const known = itemPlaces(campaign, effect.itemId);
      const elsewhere = known.placedIn.filter((id) => id !== scene.id);
      const why = elsewhere.length > 0 ? "elsewhere" : known.carried ? "owned" : "notThere";
      return {
        action: action.label,
        thing: itemName(campaign, library, effect.itemId),
        why,
        scenes: elsewhere.map(
          (id) => campaign.scenes.find((item) => item.id === id)?.name.trim() ?? "",
        ),
      };
    }
  }
  return { action: action.label, thing: "", why: "notThere", scenes: [] };
}

/**
 * Check a proposed patch against the adventure as it would be once the patch is applied. Throws
 * when what is left of the patch cannot be applied. An operation that can never be part of a
 * proposal (a route from a scene to itself, an action that teaches two discoveries) is reported
 * and left out of the rest of the checking.
 */
export function checkPatch(
  campaign: CampaignTemplate,
  library: CheckLibrary,
  patch: AuthoringPatch,
): Finding[] {
  const findings: Finding[] = [];
  // Operations that never get through. The rest keep their place in the proposal.
  const kept: number[] = [];
  patch.ops.forEach((op, opIndex) => {
    const problem = patchOpProblem(op);
    if (problem === "selfLink" && op.op === "addLink") {
      const name = op.label.trim();
      findings.push({
        kind: "selfLink",
        severity: "problem",
        params: { name },
        message: `The route “${named(name, "Untitled route")}” leads from a scene to itself.`,
        opIndex,
        fixes: [],
      });
    } else if (problem === "oneDiscoveryPerAction" && op.op === "addAction") {
      const name = op.label.trim();
      findings.push({
        kind: "oneDiscoveryPerAction",
        severity: "problem",
        params: { action: name },
        message: `The action “${named(name, "Untitled action")}” teaches more than one discovery. An action can teach one.`,
        opIndex,
        fixes: [],
      });
    } else kept.push(opIndex);
  });
  const {
    campaign: after,
    library: afterLibrary,
    created: made,
  } = applyPatch(campaign, library, { ops: kept.map((index) => patch.ops[index]!) });
  const at = (index: number) => kept[index]!;
  const created: PatchCreated = {
    scenes: made.scenes.map((item) => ({ ...item, opIndex: at(item.opIndex) })),
    links: made.links.map((item) => ({ ...item, opIndex: at(item.opIndex) })),
    actions: made.actions.map((item) => ({ ...item, opIndex: at(item.opIndex) })),
    items: made.items.map((item) => ({ ...item, opIndex: at(item.opIndex) })),
  };

  const reach = reachableFromStart(after);
  const newScenes = new Set(created.scenes.map(({ id }) => id));
  const sceneOf = (id: string) => after.scenes.find((scene) => scene.id === id);
  /** The first thing a route asks for that nobody can get, by name. */
  const unobtainable = (needs: Need[]): string | undefined =>
    needs.find(
      ({ token }) =>
        (token.startsWith("fact:") && !reach.flags.has(token.slice(5))) ||
        (token.startsWith("key:") && !reach.keys.has(token.slice(4))),
    )?.label;
  /** Routes that ask for a discovery not to have happened, when it certainly has by then. */
  const happenedNeeds = (link: StoryboardLink): string[] =>
    lockOf(after, link)
      .filter(
        (need) =>
          need.absent &&
          reach.guaranteed.get(link.fromSceneId)?.has(need.token.slice("absent:".length)),
      )
      .map((need) => need.label);
  const itemLabel = (token: string, label: string) =>
    token.startsWith("key:") ? itemName(after, afterLibrary, token.slice(4)) : label;

  // A new scene with no place, or no node on the map.
  const needPlace = new Set<string>();
  for (const { id, opIndex } of created.scenes) {
    const scene = sceneOf(id)!;
    if (hasPlace(scene, after, library)) continue;
    needPlace.add(id);
    const name = scene.name.trim();
    const op = patch.ops[opIndex];
    const anchor = after.sceneLinks
      .filter((link) => link.toSceneId === id)
      .map((link) => sceneOf(link.fromSceneId))
      .find((from) => from && !newScenes.has(from.id) && from.placeId);
    findings.push({
      kind: "needsPlace",
      severity: "problem",
      params: { name, map: after.mapWorldId ? "yes" : "no" },
      message: `“${named(name, "Untitled scene")}” needs a place${after.mapWorldId ? " on the adventure's map" : ""}, or it cannot be played.`,
      opIndex,
      sceneId: id,
      fixes:
        anchor && op?.op === "addScene"
          ? [
              {
                key: "usePlaceOf",
                params: { scene: anchor.name.trim() },
                label: `Use the place of “${named(anchor.name, "Untitled scene")}”`,
                apply: "replace",
                patch: {
                  ops: patch.ops.map((item, index) =>
                    index === opIndex && item.op === "addScene"
                      ? {
                          ...item,
                          placeId: anchor.placeId,
                          ...(anchor.mapNodeId ? { mapNodeId: anchor.mapNodeId } : {}),
                        }
                      : item,
                  ),
                },
              },
            ]
          : [],
    });
  }

  // The adventure can no longer be started. What was already wrong before is not the patch's doing.
  const was = startProblem(campaign, library);
  const now = startProblem(after, library);
  const sameProblem = was && now && was.why === now.why && was.scene === now.scene;
  const explained =
    (now?.why === "scenePlace" || now?.why === "mapPlace") &&
    created.scenes.some(
      ({ id }) => needPlace.has(id) && sceneOf(id)!.name.trim() === now.scene.trim(),
    );
  if (now && !sameProblem && !explained)
    findings.push({
      kind: "cannotStart",
      severity: "problem",
      params: now,
      message: `The adventure cannot be started${now.scene ? ` (“${now.scene}”)` : ""}: ${
        {
          noStartScene: "it has no scene to start in",
          scenePlace: "a scene has no place or is not playable",
          mapPlace: "a scene has no place on the adventure's map",
          mapMissing: "the adventure's map is missing",
          noArrival: "a scene has no arrival text",
          other: "something in it cannot be started",
        }[now.why]
      }.`,
      fixes: [],
    });

  // A new scene nobody can get to.
  for (const { id, opIndex } of created.scenes) {
    if (reach.scenes.has(id)) continue;
    const incoming = after.sceneLinks.filter((link) => link.toSceneId === id);
    const lacking = unobtainable(incoming.flatMap((link) => lockOf(after, link)));
    const done = incoming.flatMap((link) => happenedNeeds(link)).at(0);
    const thing = lacking ?? done;
    const why = lacking
      ? "unobtainable"
      : done
        ? "happened"
        : incoming.length === 0
          ? "noRoute"
          : "none";
    const name = sceneOf(id)!.name.trim();
    const reason = {
      unobtainable: `, because “${thing}” cannot be had anywhere`,
      happened: `, because “${thing}” has always happened by then, and the way in asks for it not to have`,
      noRoute: ", because no route leads to it",
      none: "",
    }[why];
    findings.push({
      kind: "unreachable",
      severity: "problem",
      params: { what: "scene", name, why, ...(thing ? { thing } : {}) },
      message: `“${named(name, "Untitled scene")}” cannot be reached from the start${reason}.`,
      opIndex,
      sceneId: id,
      fixes: [],
    });
  }

  // A new route or action that asks for something nobody can get.
  for (const { id, opIndex } of created.links) {
    const link = after.sceneLinks.find((item) => item.id === id)!;
    if (newScenes.has(link.toSceneId) && !reach.scenes.has(link.toSceneId)) continue;
    const needs = lockOf(after, link);
    const lacking = needs.find(
      ({ token }) =>
        (token.startsWith("fact:") && !reach.flags.has(token.slice(5))) ||
        (token.startsWith("key:") && !reach.keys.has(token.slice(4))),
    );
    const name = link.label.trim();
    if (!lacking) {
      const done = happenedNeeds(link)[0];
      if (done)
        findings.push({
          kind: "unreachable",
          severity: "problem",
          params: { what: "route", name, why: "happened", thing: done },
          message: `The route “${named(name, "Untitled route")}” asks for “${done}” not to have happened, but it has always happened by then.`,
          opIndex,
          linkId: id,
          fixes: [],
        });
      continue;
    }
    const thing = itemLabel(lacking.token, lacking.label);
    findings.push({
      kind: "unreachable",
      severity: "problem",
      params: { what: "route", name, why: "unobtainable", thing },
      message: `The route “${named(name, "Untitled route")}” asks for “${thing}”, which cannot be had anywhere.`,
      opIndex,
      linkId: id,
      fixes: [],
    });
  }
  for (const { sceneId, id, opIndex } of created.actions) {
    if (!reach.scenes.has(sceneId)) continue;
    const action = sceneOf(sceneId)?.encounter?.definition.interactions.find(
      (item) => item.id === id,
    );
    if (!action) continue;
    const missingFlag = action.requiresFlags.find((flag) => !reach.flags.has(flag));
    const missingItem = action.requiresItems.find((item) => !reach.items.has(item));
    const thing = missingFlag
      ? factText(after, missingFlag)
      : missingItem && itemName(after, afterLibrary, missingItem);
    if (!thing) {
      const happened = action.excludesFlags.find((flag) =>
        reach.guaranteed.get(sceneId)?.has(flag),
      );
      if (happened)
        findings.push({
          kind: "unreachable",
          severity: "problem",
          params: {
            what: "action",
            name: action.label,
            why: "happened",
            thing: factText(after, happened),
          },
          message: `The action “${action.label}” asks for “${factText(after, happened)}” not to have happened, but it has always happened by then.`,
          opIndex,
          sceneId,
          fixes: [],
        });
      continue;
    }
    findings.push({
      kind: "unreachable",
      severity: "problem",
      params: { what: "action", name: action.label, why: "unobtainable", thing },
      message: `The action “${action.label}” asks for “${thing}”, which cannot be had anywhere.`,
      opIndex,
      sceneId,
      fixes: [],
    });
  }

  // An action that gives something the player cannot take where the action is.
  for (const { sceneId, id, opIndex } of created.actions) {
    const scene = sceneOf(sceneId);
    if (!scene?.encounter) continue;
    const problem = receiveProblem(after, scene, id, afterLibrary);
    if (!problem) continue;
    findings.push({
      kind: "cannotReceive",
      severity: "problem",
      params: problem,
      message: `The action “${problem.action}” gives ${problem.thing ? `“${problem.thing}”` : "something"}, but it cannot be taken here${
        problem.why === "elsewhere"
          ? `: it lies in ${quoted(problem.scenes.map((name) => named(name, "Untitled scene")))}`
          : problem.why === "owned"
            ? ": the player already has it"
            : ""
      }.`,
      opIndex,
      sceneId,
      fixes: [],
    });
  }

  // A new route that gets to a scene which was locked, without the lock.
  const wasThere = new Set(campaign.scenes.map(({ id }) => id));
  for (const { id, opIndex } of created.links) {
    const link = after.sceneLinks.find((item) => item.id === id)!;
    if (!wasThere.has(link.toSceneId)) continue;
    // The scene the player starts in is not behind anything.
    if (link.toSceneId === openingScene(after)?.id) continue;
    const before = campaign.sceneLinks.filter((item) => item.toSceneId === link.toSceneId);
    const locks = before.map((item) => lockOf(campaign, item));
    if (locks.length === 0 || locks.some((needs) => needs.length === 0)) continue;
    const mine = new Set(lockOf(after, link).map(({ token }) => token));
    if (locks.some((needs) => needs.every(({ token }) => mine.has(token)))) continue;
    // Only a route that can be taken without passing the lock first is a way round it. One that
    // leaves a room which is only reachable through the lock is not.
    const without = reachableFromStart({
      ...after,
      sceneLinks: after.sceneLinks.filter((item) => item.toSceneId !== link.toSceneId),
    });
    if (!without.scenes.has(link.fromSceneId)) continue;
    const lock = locks[0]!;
    const names = lock.filter(({ absent }) => !absent).map(({ label }) => label);
    const notYet = lock.filter(({ absent }) => absent).map(({ label }) => label);
    const op = patch.ops[opIndex];
    const requirements = lock.flatMap(({ requirement }) => (requirement ? [requirement] : []));
    const fixes: Fix[] = [];
    if (op?.op === "addLink" && requirements.length === lock.length)
      fixes.push({
        key: "requireLockToo",
        params: { locks: names, notYet },
        label: `Make this route need ${quoted([...names, ...notYet])} too`,
        apply: "replace",
        patch: {
          ops: patch.ops.map((item, index) =>
            index === opIndex && item.op === "addLink"
              ? { ...item, requires: [...(item.requires ?? []), ...requirements] }
              : item,
          ),
        },
      });
    fixes.push({
      key: "shortcutOnPurpose",
      params: {},
      label: "Shortcut on purpose",
      apply: "none",
    });
    findings.push({
      kind: "bypassesLock",
      severity: "problem",
      params: { locks: names, notYet },
      message: `This route goes past ${[
        ...(names.length ? [`the lock ${quoted(names)}`] : []),
        ...(notYet.length ? [`the condition that ${quoted(notYet)} has not happened`] : []),
      ].join(" and ")}.`,
      opIndex,
      linkId: id,
      sceneId: link.toSceneId,
      fixes,
    });
  }

  // A new scene with no way on, which is not an ending. An ending is a scene where the player can
  // set a discovery the goal asks for, and where the player can have made every discovery the goal
  // asks for on the way there. A player who has ended up in another scene with no way on cannot
  // go and make the rest, so that scene's discoveries do not count.
  const goal = new Set(after.goal?.requiresFlags ?? []);
  const noWayOn = after.scenes
    .filter((scene) => !after.sceneLinks.some((link) => link.fromSceneId === scene.id))
    .map(({ id }) => id);
  const endsGoal = (sceneId: string): boolean => {
    if (goal.size === 0) return false;
    const sets = (sceneOf(sceneId)?.encounter?.definition.interactions ?? []).some((action) =>
      [...action.success.effects, ...action.failure.effects].some(
        (effect) => effect.kind === "flag" && goal.has(effect.flag),
      ),
    );
    if (!sets) return false;
    const others = new Set(noWayOn.filter((id) => id !== sceneId));
    const here = reachableFromStart({
      ...after,
      sceneLinks: after.sceneLinks.filter((link) => !others.has(link.toSceneId)),
    });
    return [...goal].every((flag) => here.flags.has(flag));
  };
  for (const { id, opIndex } of created.scenes) {
    if (after.sceneLinks.some((link) => link.fromSceneId === id)) continue;
    if (endsGoal(id)) continue;
    const name = sceneOf(id)!.name.trim();
    findings.push({
      kind: "deadEnd",
      severity: "problem",
      params: { name },
      message: `“${named(name, "Untitled scene")}” has no way on, and it is not an ending.`,
      opIndex,
      sceneId: id,
      fixes: [{ key: "isEnding", params: {}, label: "It is an ending", apply: "none" }],
    });
  }

  // A discovery that is set and never used. Only information.
  const used = factsUsed(after);
  for (const { sceneId, id, opIndex } of created.actions) {
    const action = sceneOf(sceneId)?.encounter?.definition.interactions.find(
      (item) => item.id === id,
    );
    for (const effect of action?.success.effects ?? [])
      if (effect.kind === "flag" && !used.has(effect.flag)) {
        const fact = factText(after, effect.flag);
        findings.push({
          kind: "unusedFact",
          severity: "note",
          params: { fact, action: action!.label },
          message: `The discovery “${fact}” is set by “${action!.label}”, but nothing asks for it.`,
          opIndex,
          sceneId,
          fixes: [],
        });
      }
  }
  return findings;
}

/** What kind of thing the model says a text mentions. */
export type MentionKind = "person" | "item" | "place";
export type Mention = { name: string; kind: MentionKind };

/** What `checkMentions` can look in besides the adventure. A list that is missing is empty. */
export type MentionLibrary = PatchLibrary & {
  characters?: { name: string }[];
  places?: PlaceTemplate[];
  /** The adventure's map, when it has one: its places are the nodes on it. */
  worlds?: RealmTemplate[];
};

const normal = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();
const sameThing = (name: string, wanted: string) =>
  !!name && (name === wanted || name.includes(wanted) || wanted.includes(name));

/** The names of people or places in a scene. Things are looked at on their own, by where they lie. */
function namesIn(
  scene: CampaignScene,
  kind: "person" | "place",
  campaign: CampaignTemplate,
  library: MentionLibrary,
): string[] {
  const game = scene.encounter;
  if (!game) return [];
  const names =
    kind === "person"
      ? Object.values(game.state.actors).map((actor) => actor.name)
      : [
          scene.name,
          ...game.definition.places.map((place) => place.name),
          ...placeCardNames(scene, campaign, library),
        ];
  return names.map(normal).filter(Boolean);
}

/** The scene's own place: the card it is at, and the node on the map when the adventure has one. */
function placeCardNames(
  scene: CampaignScene,
  campaign: CampaignTemplate,
  library: MentionLibrary,
): string[] {
  const names: string[] = [];
  const card = library.places?.find((place) => place.id === scene.placeId);
  if (card) names.push(card.name);
  const world = campaign.mapWorldId
    ? library.worlds?.find((item) => item.id === campaign.mapWorldId)
    : undefined;
  if (world?.worldMap && library.places) {
    const entry = mapPlaceForScene(scene, adventureMapPlaces(world, library.places));
    if (entry) names.push(entry.place.name, entry.node.name);
  }
  return names;
}

/**
 * Where a thing is, in three different ways: it is in the library, it lies in a scene, or the
 * player carries it. Only the last two make it part of the story.
 */
function whereIsItem(
  campaign: CampaignTemplate,
  library: PatchLibrary,
  sceneId: string,
  wanted: string,
): { state: "here" | "carried" | "elsewhere" | "library" | "nowhere"; scenes: string[] } {
  const ids = new Set<string>();
  for (const object of library.objects)
    if (sameThing(normal(object.name), wanted)) ids.add(object.id);
  for (const scene of campaign.scenes)
    for (const item of scene.encounter?.definition.items ?? [])
      if (sameThing(normal(item.name), wanted)) ids.add(item.id);
  if (ids.size === 0) return { state: "nowhere", scenes: [] };
  const elsewhere = new Set<string>();
  let carried = false;
  for (const id of ids) {
    const known = itemPlaces(campaign, id);
    if (known.placedIn.includes(sceneId)) return { state: "here", scenes: [] };
    if (known.carried) carried = true;
    for (const other of known.placedIn) elsewhere.add(other);
  }
  if (carried) return { state: "carried", scenes: [] };
  if (elsewhere.size > 0)
    return {
      state: "elsewhere",
      scenes: [...elsewhere].map(
        (id) => campaign.scenes.find((scene) => scene.id === id)?.name.trim() ?? "",
      ),
    };
  return { state: "library", scenes: [] };
}

/**
 * A text says it mentions people, things or places. Check that each is in the scene, and if not,
 * say where it is instead: in another scene, in the library only, or nowhere. A thing is in a
 * scene when it lies there, not when it is only described there. The list comes from the model's
 * answer; with no model it is empty and nothing is found. Only a thing that is nowhere can be
 * added from here: a person or a place is the author's to bring in.
 */
export function checkMentions(
  campaign: CampaignTemplate,
  library: MentionLibrary,
  sceneId: string,
  text: string,
  mentions: Mention[],
): Finding[] {
  void text;
  const scene = campaign.scenes.find((item) => item.id === sceneId);
  if (!scene?.encounter) return [];
  const findings: Finding[] = [];
  for (const mention of mentions) {
    const name = mention.name.trim();
    const wanted = normal(name);
    if (!wanted) continue;
    let where: FindingParams["missingThing"]["where"];
    let scenes: string[];
    const kind = mention.kind;
    if (kind === "item") {
      const found = whereIsItem(campaign, library, sceneId, wanted);
      if (found.state === "here" || found.state === "carried") continue;
      where = found.state;
      scenes = found.scenes;
    } else {
      if (namesIn(scene, kind, campaign, library).some((here) => sameThing(here, wanted))) continue;
      scenes = campaign.scenes
        .filter((other) => other.id !== sceneId)
        .filter((other) =>
          namesIn(other, kind, campaign, library).some((there) => sameThing(there, wanted)),
        )
        .map((other) => other.name.trim());
      const catalogue = kind === "person" ? (library.characters ?? []) : (library.places ?? []);
      const inLibrary = catalogue.some((entry) => sameThing(normal(entry.name), wanted));
      where = scenes.length ? "elsewhere" : inLibrary ? "library" : "nowhere";
    }
    const here = scene.name.trim();
    const kindWord = { person: "person", item: "thing", place: "place" }[mention.kind];
    const fixes: Fix[] = [];
    if (mention.kind === "item" && where === "nowhere")
      fixes.push({
        key: "addAsItem",
        params: { name },
        label: `Add “${name}” as an item`,
        apply: "append",
        ops: [
          {
            op: "addItem",
            tempId: `new:${wanted.replace(/[^\p{L}\p{N}]+/gu, "-")}`,
            name,
            description: "",
            inSceneId: sceneId,
          },
        ],
      });
    fixes.push({
      key: "rewriteWithout",
      params: {},
      label: "Write the text without it",
      apply: "none",
    });
    findings.push({
      kind: "missingThing",
      severity: "problem",
      params: { name, thingKind: mention.kind, where, scene: here, scenes },
      message:
        where === "nowhere"
          ? `The text mentions “${name}”, but there is no such ${kindWord} in the adventure or the library.`
          : where === "elsewhere"
            ? `“${name}” is in ${quoted(scenes.map((item) => named(item, "an untitled scene")))}, but not in “${named(here, "this scene")}”.`
            : `“${name}” is in the library, but not in “${named(here, "this scene")}”.`,
      sceneId,
      fixes,
    });
  }
  return findings;
}
