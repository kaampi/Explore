import {
  applyPatch,
  type AuthoringPatch,
  type PatchLibrary,
  type Requirement,
} from "../library/authoringPatch";
import type { CampaignScene, CampaignTemplate, StoryboardLink } from "../library/LibrarySchema";
import { reachableFromStart } from "../ui/studio/storyboardReadiness";

/**
 * Checks on what an AI helper proposes. They are plain functions of the adventure and the patch:
 * the model never decides whether something can be reached or is locked. See
 * docs/storyboard-ai.sv.md.
 */

export type FindingKind =
  "unreachable" | "bypassesLock" | "deadEnd" | "unusedFact" | "missingThing";

/** What the author can do about a finding. A fix with no patch means "leave it as it is". */
export type Fix = { label: string; patch?: AuthoringPatch };

export type Finding = {
  kind: FindingKind;
  /** "problem" should be looked at; "note" is only information. */
  severity: "problem" | "note";
  /** One sentence for the author. */
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

const sceneTitle = (scene: CampaignScene | undefined) =>
  `“${scene?.name.trim() || "Untitled scene"}”`;

/** What a route asks for, as comparable tokens, with a name for each that the author recognises. */
function lockOf(campaign: CampaignTemplate, library: Lib, link: StoryboardLink) {
  const from = campaign.scenes.find((scene) => scene.id === link.fromSceneId);
  const needs: { token: string; label: string; requirement?: Requirement }[] = [];
  for (const flag of link.requiresFlags)
    needs.push({ token: `fact:${flag}`, label: flag, requirement: { kind: "fact", fact: flag } });
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
  void library;
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

  // A new scene nobody can get to.
  for (const { id, opIndex } of created.scenes) {
    if (reach.scenes.has(id)) continue;
    const incoming = after.sceneLinks.filter((link) => link.toSceneId === id);
    const blockedBy = incoming
      .flatMap((link) => lockOf(after, afterLibrary, link))
      .find(
        ({ token }) =>
          (token.startsWith("fact:") && !reach.flags.has(token.slice(5))) ||
          (token.startsWith("key:") && !reach.items.has(token.slice(4))),
      );
    const why = blockedBy
      ? `, because “${blockedBy.token.startsWith("key:") ? itemName(after, afterLibrary, blockedBy.token.slice(4)) : blockedBy.label}” cannot be had anywhere`
      : incoming.length === 0
        ? ", because no route leads to it"
        : "";
    findings.push({
      kind: "unreachable",
      severity: "problem",
      message: `${sceneTitle(sceneOf(id))} cannot be reached from the start${why}.`,
      opIndex,
      sceneId: id,
      fixes: [],
    });
  }

  // A new route or action that asks for something nobody can get.
  for (const { id, opIndex } of created.links) {
    const link = after.sceneLinks.find((item) => item.id === id)!;
    if (newScenes.has(link.toSceneId) && !reach.scenes.has(link.toSceneId)) continue;
    const missing = lockOf(after, afterLibrary, link).find(
      ({ token }) =>
        (token.startsWith("fact:") && !reach.flags.has(token.slice(5))) ||
        (token.startsWith("key:") && !reach.items.has(token.slice(4))),
    );
    if (missing)
      findings.push({
        kind: "unreachable",
        severity: "problem",
        message: `The route “${link.label || "Untitled route"}” asks for “${missing.token.startsWith("key:") ? itemName(after, afterLibrary, missing.token.slice(4)) : missing.label}”, which cannot be had anywhere.`,
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
    const missing = missingFlag ?? (missingItem && itemName(after, afterLibrary, missingItem));
    if (missing)
      findings.push({
        kind: "unreachable",
        severity: "problem",
        message: `The action “${action.label}” asks for “${missing}”, which cannot be had anywhere.`,
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
    const locks = before.map((item) => lockOf(campaign, library, item));
    if (locks.length === 0 || locks.some((needs) => needs.length === 0)) continue;
    const mine = new Set(lockOf(after, afterLibrary, link).map(({ token }) => token));
    if (locks.some((needs) => needs.every(({ token }) => mine.has(token)))) continue;
    const lock = locks[0]!;
    const op = patch.ops[opIndex];
    const requirements = lock.flatMap(({ requirement }) => (requirement ? [requirement] : []));
    const fixes: Fix[] = [];
    if (op?.op === "addLink" && requirements.length === lock.length)
      fixes.push({
        label: `Make this route need ${lock.map(({ label }) => `“${label}”`).join(" and ")} too`,
        patch: {
          ops: patch.ops.map((item, index) =>
            index === opIndex && item.op === "addLink"
              ? { ...item, requires: [...(item.requires ?? []), ...requirements] }
              : item,
          ),
        },
      });
    fixes.push({ label: "Shortcut on purpose" });
    findings.push({
      kind: "bypassesLock",
      severity: "problem",
      message: `This route goes past the lock ${lock.map(({ label }) => `“${label}”`).join(" and ")}.`,
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
    findings.push({
      kind: "deadEnd",
      severity: "problem",
      message: `${sceneTitle(sceneOf(id))} has no way on, and it is not an ending.`,
      opIndex,
      sceneId: id,
      fixes: [{ label: "It is an ending" }],
    });
  }

  // A discovery that is set and never used. Only information.
  const used = factsUsed(after);
  for (const { sceneId, id, opIndex } of created.actions) {
    const action = sceneOf(sceneId)?.encounter?.definition.interactions.find(
      (item) => item.id === id,
    );
    for (const effect of action?.success.effects ?? [])
      if (effect.kind === "flag" && !used.has(effect.flag))
        findings.push({
          kind: "unusedFact",
          severity: "note",
          message: `The discovery “${effect.flag}” is set by “${action!.label}”, but nothing asks for it.`,
          opIndex,
          sceneId,
          fixes: [],
        });
  }
  return findings;
}

const normal = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * A text says it mentions people, things or places. Check that each exists in the scene. The list
 * comes from the model's answer; with no model it is empty and nothing is found.
 */
export function checkMentions(
  campaign: CampaignTemplate,
  library: Lib,
  sceneId: string,
  text: string,
  mentions: string[],
): Finding[] {
  void library;
  void text;
  const scene = campaign.scenes.find((item) => item.id === sceneId);
  const game = scene?.encounter;
  if (!scene || !game) return [];
  const here = [
    scene.name,
    ...Object.values(game.state.actors).map((actor) => actor.name),
    ...game.definition.items.map((item) => item.name),
    ...game.definition.places.map((place) => place.name),
  ]
    .map(normal)
    .filter(Boolean);
  const findings: Finding[] = [];
  for (const mention of mentions) {
    const wanted = normal(mention);
    if (!wanted) continue;
    if (here.some((name) => name === wanted || name.includes(wanted) || wanted.includes(name)))
      continue;
    findings.push({
      kind: "missingThing",
      severity: "problem",
      message: `The text mentions “${mention.trim()}”, but there is no such thing in ${sceneTitle(scene)}.`,
      sceneId,
      fixes: [
        {
          label: `Add “${mention.trim()}” to the scene`,
          patch: {
            ops: [
              {
                op: "addItem",
                tempId: `new:${wanted.replace(/[^\p{L}\p{N}]+/gu, "-")}`,
                name: mention.trim(),
                description: "",
                inSceneId: sceneId,
              },
            ],
          },
        },
        { label: "Write the text without it" },
      ],
    });
  }
  return findings;
}
