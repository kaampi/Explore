import { reachableFromStart } from "../library/adventureReach";
import {
  applyPatch,
  type AuthoringPatch,
  type PatchLibrary,
  type Requirement,
} from "../library/authoringPatch";
import type { CampaignScene, CampaignTemplate, StoryboardLink } from "../library/LibrarySchema";
import { adventureFacts } from "../library/playableCampaign";

/**
 * Checks on what an AI helper proposes. They are plain functions of the adventure and the patch:
 * the model never decides whether something can be reached or is locked. See
 * docs/storyboard-ai.sv.md.
 *
 * A finding says what it is with `kind` and `params`, so the panel can write the sentence in the
 * author's language. `message` and a fix's `label` are the same sentence in English, a fallback.
 */

export type FindingKind =
  "unreachable" | "bypassesLock" | "deadEnd" | "unusedFact" | "missingThing";

/**
 * The values a sentence is made from. Names and texts are the author's own words, never internal
 * ids: a discovery is shown as its text, a door as its name, a scene as its name.
 */
export type FindingParams = Record<string, string | string[]>;

export type FixKey =
  "requireLockToo" | "shortcutOnPurpose" | "isEnding" | "addAsItem" | "rewriteWithout";

/** What the author can do about a finding. A fix with no patch means "leave it as it is". */
export type Fix = { key: FixKey; params: FindingParams; label: string; patch?: AuthoringPatch };

export type Finding = {
  kind: FindingKind;
  /** "problem" should be looked at; "note" is only information. */
  severity: "problem" | "note";
  params: FindingParams;
  /** The sentence in English. */
  message: string;
  /** The operation in the patch that this is about, when there is one. */
  opIndex?: number;
  sceneId?: string;
  linkId?: string;
  fixes: Fix[];
};

type Lib = PatchLibrary;

function itemName(campaign: CampaignTemplate, library: Lib, id: string): string {
  return (
    library.objects.find((object) => object.id === id)?.name ??
    campaign.scenes
      .flatMap((scene) => scene.encounter?.definition.items ?? [])
      .find((item) => item.id === id)?.name ??
    id
  );
}

/** A discovery as the author knows it: the sentence an action gives it, else where it comes from. */
function factText(campaign: CampaignTemplate, flag: string): string {
  for (const scene of campaign.scenes)
    for (const action of scene.encounter?.definition.interactions ?? [])
      for (const outcome of [action.success, action.failure])
        if (outcome.learned && outcome.effects.some((e) => e.kind === "flag" && e.flag === flag))
          return outcome.learned;
  return adventureFacts(campaign).find(({ id }) => id === flag)?.label ?? flag;
}

const sceneName = (scene: CampaignScene | undefined) => scene?.name.trim() || "Untitled scene";
const quoted = (names: string[]) => names.map((name) => `“${name}”`).join(" and ");

type Need = { token: string; label: string; requirement?: Requirement };

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
  for (const doorId of link.requiresOpenBarriers ?? []) {
    const door = from?.encounter?.state.barriers[doorId];
    if (door?.keyId)
      needs.push({
        token: `key:${door.keyId}`,
        label: door.name,
        requirement: { kind: "item", itemId: door.keyId },
      });
    else needs.push({ token: `door:${doorId}`, label: door?.name ?? doorId });
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

/**
 * Check a proposed patch against the adventure as it would be once the patch is applied.
 * Throws when the patch itself cannot be applied.
 */
export function checkPatch(
  campaign: CampaignTemplate,
  library: Lib,
  patch: AuthoringPatch,
): Finding[] {
  const { campaign: after, library: afterLibrary, created } = applyPatch(campaign, library, patch);
  const findings: Finding[] = [];
  const reach = reachableFromStart(after);
  const newScenes = new Set(created.scenes.map(({ id }) => id));
  const sceneOf = (id: string) => after.scenes.find((scene) => scene.id === id);
  /** The first thing a route asks for that nobody can get, by name. */
  const unobtainable = (needs: Need[]): string | undefined =>
    needs.find(
      ({ token }) =>
        (token.startsWith("fact:") && !reach.flags.has(token.slice(5))) ||
        (token.startsWith("key:") && !reach.items.has(token.slice(4))),
    )?.label;

  // A new scene nobody can get to.
  for (const { id, opIndex } of created.scenes) {
    if (reach.scenes.has(id)) continue;
    const incoming = after.sceneLinks.filter((link) => link.toSceneId === id);
    const thing = unobtainable(incoming.flatMap((link) => lockOf(after, link)));
    const why = thing ? "unobtainable" : incoming.length === 0 ? "noRoute" : "none";
    const name = sceneName(sceneOf(id));
    const reason = {
      unobtainable: `, because “${thing}” cannot be had anywhere`,
      noRoute: ", because no route leads to it",
      none: "",
    }[why];
    findings.push({
      kind: "unreachable",
      severity: "problem",
      params: { what: "scene", name, why, ...(thing ? { thing } : {}) },
      message: `“${name}” cannot be reached from the start${reason}.`,
      opIndex,
      sceneId: id,
      fixes: [],
    });
  }

  // A new route or action that asks for something nobody can get.
  for (const { id, opIndex } of created.links) {
    const link = after.sceneLinks.find((item) => item.id === id)!;
    if (newScenes.has(link.toSceneId) && !reach.scenes.has(link.toSceneId)) continue;
    const thing = unobtainable(lockOf(after, link));
    if (!thing) continue;
    const name = link.label || "Untitled route";
    findings.push({
      kind: "unreachable",
      severity: "problem",
      params: { what: "route", name, why: "unobtainable", thing },
      message: `The route “${name}” asks for “${thing}”, which cannot be had anywhere.`,
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
    if (!thing) continue;
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

  // A new route that gets to a scene which was locked, without the lock.
  const wasThere = new Set(campaign.scenes.map(({ id }) => id));
  for (const { id, opIndex } of created.links) {
    const link = after.sceneLinks.find((item) => item.id === id)!;
    if (!wasThere.has(link.toSceneId) || !reach.scenes.has(link.fromSceneId)) continue;
    const before = campaign.sceneLinks.filter((item) => item.toSceneId === link.toSceneId);
    const locks = before.map((item) => lockOf(campaign, item));
    if (locks.length === 0 || locks.some((needs) => needs.length === 0)) continue;
    const mine = new Set(lockOf(after, link).map(({ token }) => token));
    if (locks.some((needs) => needs.every(({ token }) => mine.has(token)))) continue;
    const lock = locks[0]!;
    const names = lock.map(({ label }) => label);
    const op = patch.ops[opIndex];
    const requirements = lock.flatMap(({ requirement }) => (requirement ? [requirement] : []));
    const fixes: Fix[] = [];
    if (op?.op === "addLink" && requirements.length === lock.length)
      fixes.push({
        key: "requireLockToo",
        params: { locks: names },
        label: `Make this route need ${quoted(names)} too`,
        patch: {
          ops: patch.ops.map((item, index) =>
            index === opIndex && item.op === "addLink"
              ? { ...item, requires: [...(item.requires ?? []), ...requirements] }
              : item,
          ),
        },
      });
    fixes.push({ key: "shortcutOnPurpose", params: {}, label: "Shortcut on purpose" });
    findings.push({
      kind: "bypassesLock",
      severity: "problem",
      params: { locks: names },
      message: `This route goes past the lock ${quoted(names)}.`,
      opIndex,
      linkId: id,
      sceneId: link.toSceneId,
      fixes,
    });
  }

  // A new scene with no way on, which is not an ending.
  const goal = new Set(after.goal?.requiresFlags ?? []);
  for (const { id, opIndex } of created.scenes) {
    if (after.sceneLinks.some((link) => link.fromSceneId === id)) continue;
    const ends = (sceneOf(id)?.encounter?.definition.interactions ?? []).some((action) =>
      [...action.success.effects, ...action.failure.effects].some(
        (effect) => effect.kind === "flag" && goal.has(effect.flag),
      ),
    );
    if (ends) continue;
    const name = sceneName(sceneOf(id));
    findings.push({
      kind: "deadEnd",
      severity: "problem",
      params: { name },
      message: `“${name}” has no way on, and it is not an ending.`,
      opIndex,
      sceneId: id,
      fixes: [{ key: "isEnding", params: {}, label: "It is an ending" }],
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
export type MentionLibrary = Lib & {
  characters?: { name: string }[];
  places?: { name: string }[];
};

const normal = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();
const sameThing = (name: string, wanted: string) =>
  !!name && (name === wanted || name.includes(wanted) || wanted.includes(name));

/** The names of one kind of thing in a scene. */
function namesIn(scene: CampaignScene, kind: MentionKind): string[] {
  const game = scene.encounter;
  if (!game) return [];
  const names =
    kind === "person"
      ? Object.values(game.state.actors).map((actor) => actor.name)
      : kind === "item"
        ? game.definition.items.map((item) => item.name)
        : [scene.name, ...game.definition.places.map((place) => place.name)];
  return names.map(normal).filter(Boolean);
}

/**
 * A text says it mentions people, things or places. Check that each exists in the scene, and if
 * not, say whether it exists elsewhere in the adventure or the library. The list comes from the
 * model's answer; with no model it is empty and nothing is found. Only a missing item can be added
 * from here: a person or a place is the author's to bring in.
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
    if (namesIn(scene, mention.kind).some((here) => sameThing(here, wanted))) continue;
    const elsewhere = campaign.scenes
      .filter((other) => other.id !== sceneId)
      .filter((other) => namesIn(other, mention.kind).some((there) => sameThing(there, wanted)))
      .map(sceneName);
    const catalogue =
      mention.kind === "item"
        ? library.objects
        : mention.kind === "person"
          ? (library.characters ?? [])
          : (library.places ?? []);
    const inLibrary = catalogue.some((entry) => sameThing(normal(entry.name), wanted));
    const where = elsewhere.length || inLibrary ? "elsewhere" : "nowhere";
    const here = sceneName(scene);
    const kindWord = { person: "person", item: "thing", place: "place" }[mention.kind];
    const fixes: Fix[] = [];
    if (mention.kind === "item" && where === "nowhere")
      fixes.push({
        key: "addAsItem",
        params: { name },
        label: `Add “${name}” as an item`,
        patch: {
          ops: [
            {
              op: "addItem",
              tempId: `new:${wanted.replace(/[^\p{L}\p{N}]+/gu, "-")}`,
              name,
              description: "",
              inSceneId: sceneId,
            },
          ],
        },
      });
    fixes.push({ key: "rewriteWithout", params: {}, label: "Write the text without it" });
    findings.push({
      kind: "missingThing",
      severity: "problem",
      params: {
        name,
        thingKind: mention.kind,
        where,
        scene: here,
        scenes: elsewhere,
        inLibrary: inLibrary ? "yes" : "no",
      },
      message:
        where === "nowhere"
          ? `The text mentions “${name}”, but there is no such ${kindWord} in the adventure or the library.`
          : `“${name}” is ${elsewhere.length ? `in ${quoted(elsewhere)}` : "in the library"}, but not in “${here}”.`,
      sceneId,
      fixes,
    });
  }
  return findings;
}
