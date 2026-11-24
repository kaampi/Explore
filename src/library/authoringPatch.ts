import { validateEncounter } from "../game/EncounterEngine";
import { InteractionSchema, type EncounterGame } from "../game/EncounterSchema";
import {
  emptyCampaignScene,
  newObjectTemplate,
  type CampaignScene,
  type CampaignTemplate,
  type ObjectTemplate,
  type StoryboardLink,
} from "./LibrarySchema";
import { makePlayableScene } from "./playableCampaign";
import { addDoor, attachDoorToRoute, placeItem } from "./sceneParts";

/**
 * A change an AI helper proposes to an adventure that already exists. It only adds, or replaces a
 * text. It never removes anything. `applyPatch` is pure: it returns new records and leaves the
 * ones it is given alone. See docs/storyboard-ai.sv.md.
 */

/** A scene or an item that does not exist yet. The patch names it, `applyPatch` gives it an id. */
export type TempId = `new:${string}`;
export type SceneRef = string | TempId;
export type ItemRef = string | TempId;

/** Something a route or an action asks for: a discovery, or a thing the player holds. */
export type Requirement = { kind: "fact"; fact: string } | { kind: "item"; itemId: ItemRef };

export type TextRef =
  | { sceneId: string; field: "arrival" }
  | { sceneId: string; actionId: string; field: "label" | "outcome" };

/** What an action gives. `learned` is the discovery in a sentence for the player; `fact` is its name. */
export type Gives = { itemTempId?: TempId; itemId?: string; fact?: string; learned?: string };

export type AuthoringOp =
  | { op: "addScene"; tempId: TempId; name: string; placeId?: string; arrival: string }
  | {
      op: "addLink";
      from: SceneRef;
      to: SceneRef;
      label: string;
      requires?: Requirement[];
      /** What the player sees the door called when a route needs a thing, in the author's language. Missing: the route's label. */
      lockName?: string;
    }
  | {
      op: "addAction";
      sceneId: SceneRef;
      label: string;
      outcome: string;
      requires?: Requirement[];
      gives?: Gives[];
    }
  | { op: "addItem"; tempId: TempId; name: string; description: string; inSceneId: SceneRef }
  | { op: "setText"; target: TextRef; text: string };

export type AuthoringPatch = { ops: AuthoringOp[] };

/** The part of the library a patch reads and adds to. Anything else on it is passed through. */
export type PatchLibrary = { objects: ObjectTemplate[] };

/** What a patch made, with the index of the operation that made it. Used by the checks. */
export type PatchCreated = {
  scenes: { opIndex: number; id: string }[];
  links: { opIndex: number; id: string }[];
  actions: { opIndex: number; sceneId: string; id: string }[];
  items: { opIndex: number; id: string }[];
};

export type PatchResult<L extends PatchLibrary> = {
  campaign: CampaignTemplate;
  library: L;
  newSceneIds: string[];
  created: PatchCreated;
};

const isTemp = (ref: string): ref is TempId => ref.startsWith("new:");

function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "x"
  );
}

function freshId(base: string, taken: Set<string>): string {
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  taken.add(id);
  return id;
}

function gameOf(scene: CampaignScene): EncounterGame {
  if (!scene.encounter) throw new Error(`“${scene.name || scene.id}” is not a playable scene.`);
  return scene.encounter;
}

function playerPosition(scene: CampaignScene): string {
  const game = gameOf(scene);
  return game.state.actors[game.definition.playerId]!.position;
}

/** Turn a patch into new records. Throws, and changes nothing, when the patch cannot be applied. */
export function applyPatch<L extends PatchLibrary>(
  campaign: CampaignTemplate,
  library: L,
  patch: AuthoringPatch,
): PatchResult<L> {
  let next: CampaignTemplate = {
    ...campaign,
    scenes: [...campaign.scenes],
    sceneLinks: [...campaign.sceneLinks],
    objectIds: [...campaign.objectIds],
  };
  const lib: L = { ...library, objects: [...library.objects] };
  const created: PatchCreated = { scenes: [], links: [], actions: [], items: [] };

  const takenIds = new Set<string>([
    ...next.scenes.map(({ id }) => id),
    ...next.sceneLinks.map(({ id }) => id),
    ...lib.objects.map(({ id }) => id),
    ...next.objectIds,
  ]);
  const sceneIds = new Map<string, string>();
  const itemIds = new Map<string, string>();

  // Every new scene and item gets its id first, so an operation can name one that comes later.
  patch.ops.forEach((op) => {
    if (op.op !== "addScene" && op.op !== "addItem") return;
    const map = op.op === "addScene" ? sceneIds : itemIds;
    if (!isTemp(op.tempId) || map.has(op.tempId))
      throw new Error(`The name ${op.tempId} is not a new, unused name.`);
    const kind = op.op === "addScene" ? "scene" : "item";
    map.set(op.tempId, freshId(`${next.id}:${kind}:${slug(op.tempId.slice(4))}`, takenIds));
  });

  const sceneId = (ref: SceneRef): string => {
    const id = isTemp(ref) ? sceneIds.get(ref) : ref;
    if (!id || !next.scenes.some((scene) => scene.id === id))
      throw new Error(`There is no scene ${ref}.`);
    return id;
  };
  const itemId = (ref: ItemRef): string => {
    const id = isTemp(ref) ? itemIds.get(ref) : ref;
    if (!id) throw new Error(`There is no item ${ref}.`);
    if (!isTemp(ref) && !lib.objects.some((object) => object.id === id))
      throw new Error(`There is no item ${ref}.`);
    return id;
  };
  const object = (id: string): ObjectTemplate => {
    const found = lib.objects.find((item) => item.id === id);
    if (!found) throw new Error(`There is no item ${id}.`);
    return found;
  };
  const sceneNow = (id: string): CampaignScene => {
    const found = next.scenes.find((scene) => scene.id === id);
    if (!found) throw new Error(`There is no scene ${id}.`);
    return found;
  };
  const replaceScene = (scene: CampaignScene) => {
    next = { ...next, scenes: next.scenes.map((item) => (item.id === scene.id ? scene : item)) };
  };
  const ensureItemIn = (scene: CampaignScene, id: string): CampaignScene =>
    gameOf(scene).definition.items.some((item) => item.id === id)
      ? scene
      : placeItem(scene, object(id), { position: playerPosition(scene) });

  // Pass 1: scenes.
  patch.ops.forEach((op, opIndex) => {
    if (op.op !== "addScene") return;
    const id = sceneIds.get(op.tempId)!;
    const base: CampaignScene = {
      ...emptyCampaignScene(),
      id,
      name: op.name,
      ...(op.placeId ? { placeId: op.placeId } : {}),
    };
    const built = makePlayableScene(next, base, [], [], lib.objects);
    gameOf(built).definition.description = op.arrival;
    validateEncounter(gameOf(built));
    next = { ...next, scenes: [...next.scenes, built] };
    created.scenes.push({ opIndex, id });
  });

  // Pass 2: items.
  patch.ops.forEach((op, opIndex) => {
    if (op.op !== "addItem") return;
    const id = itemIds.get(op.tempId)!;
    const where = sceneNow(sceneId(op.inSceneId));
    const item = newObjectTemplate({
      id,
      name: op.name,
      source: "player",
      tags: [],
      note: op.description,
    });
    lib.objects.push(item);
    next = { ...next, objectIds: [...next.objectIds, id] };
    replaceScene(placeItem(where, item, { position: playerPosition(where) }));
    created.items.push({ opIndex, id });
  });

  /** A requirement, split into what the engine reads on an action or a route. */
  const split = (requires: Requirement[] | undefined) => ({
    flags: (requires ?? []).flatMap((r) => (r.kind === "fact" ? [r.fact] : [])),
    items: (requires ?? []).flatMap((r) => (r.kind === "item" ? [itemId(r.itemId)] : [])),
  });

  // Pass 3: everything else, in order.
  patch.ops.forEach((op, opIndex) => {
    if (op.op === "addLink") {
      const from = sceneId(op.from);
      const to = sceneId(op.to);
      const need = split(op.requires);
      const id = freshId(`${next.id}:link:${slug(op.label)}`, takenIds);
      const link: StoryboardLink = {
        id,
        fromSceneId: from,
        toSceneId: to,
        requiresFlags: need.flags,
        requiresAbsentFlags: [],
        setsFlags: [],
        label: op.label,
      };
      next = { ...next, sceneLinks: [...next.sceneLinks, link] };
      created.links.push({ opIndex, id });
      // The engine has no "needs this thing" on a route, but it has doors with a key: a locked
      // door in the scene the route leaves, shared with the scene it leads to.
      need.items.forEach((keyId, index) => {
        const source = sceneNow(from);
        const doorId = `${id}:door-${index + 1}`;
        const { scene } = addDoor(
          ensureItemIn(source, keyId),
          {
            name: op.lockName?.trim() || op.label,
            position: playerPosition(source),
            locked: true,
            keyId,
          },
          doorId,
        );
        replaceScene(scene);
        next = attachDoorToRoute(next, from, doorId, id);
      });
      return;
    }
    if (op.op === "addAction") {
      const id = sceneId(op.sceneId);
      let scene = sceneNow(id);
      const need = split(op.requires);
      const effects: ({ kind: "take-item"; itemId: string } | { kind: "flag"; flag: string })[] =
        [];
      let learned: string | undefined;
      for (const gift of op.gives ?? []) {
        const giftId = gift.itemTempId ?? gift.itemId;
        if (giftId) {
          const resolved = itemId(giftId);
          scene = ensureItemIn(scene, resolved);
          effects.push({ kind: "take-item", itemId: resolved });
        }
        if (gift.fact) effects.push({ kind: "flag", flag: gift.fact });
        if (gift.fact && gift.learned && !learned) learned = gift.learned;
      }
      const game = structuredClone(gameOf(scene));
      const actionId = freshId(
        `${id}:action:${slug(op.label)}`,
        new Set(game.definition.interactions.map((action) => action.id)),
      );
      game.definition.interactions.push(
        InteractionSchema.parse({
          id: actionId,
          label: op.label,
          description: "",
          requiresFlags: need.flags,
          requiresItems: need.items,
          success: { text: op.outcome, effects, ...(learned ? { learned } : {}) },
          // Until an action has a roll, a failure has nothing of its own to say: it reads as the outcome.
          failure: { text: op.outcome },
        }),
      );
      validateEncounter(game);
      replaceScene({ ...scene, encounter: game });
      created.actions.push({ opIndex, sceneId: id, id: actionId });
      return;
    }
    if (op.op === "setText") {
      const scene = sceneNow(sceneId(op.target.sceneId));
      const game = structuredClone(gameOf(scene));
      if (op.target.field === "arrival") game.definition.description = op.text;
      else {
        const { actionId, field } = op.target;
        const action = game.definition.interactions.find((item) => item.id === actionId);
        if (!action) throw new Error(`There is no action ${actionId} in “${scene.name}”.`);
        if (field === "label") action.label = op.text;
        else action.success.text = op.text;
      }
      validateEncounter(game);
      replaceScene({ ...scene, encounter: game });
    }
  });

  return { campaign: next, library: lib, newSceneIds: created.scenes.map(({ id }) => id), created };
}
