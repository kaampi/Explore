import { z } from "zod";

const key = z.string().regex(/^[a-z][a-z0-9-]*$/);
const reference = z.string().min(1).optional();
const name = z.string().trim().min(1);
const coordinates = z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100) });
const action = z.object({
  id: key,
  label: name,
  requiresFlags: z.array(key).default([]),
  excludesFlags: z.array(key).default([]),
  requiresItems: z.array(key).default([]),
  outcome: name,
  learned: z.string().max(200).optional(),
  setsFlags: z.array(key).default([]),
});

const GuidePlanSchema = z
  .object({
    title: name,
    playerName: name,
    playerCharacterId: reference,
    playerIntro: name,
    world: z.object({
      name,
      note: z.string(),
      characters: z
        .array(z.object({ id: key, name, note: z.string(), existingId: reference }))
        .default([]),
      factions: z
        .array(z.object({ id: key, name, note: z.string(), existingId: reference }))
        .default([]),
    }),
    startSceneId: key,
    places: z
      .array(
        z.object({
          id: key,
          name,
          position: coordinates,
          visibility: z.enum(["visible", "arrival", "hidden"]).optional(),
        }),
      )
      .min(1),
    items: z
      .array(
        z.object({
          id: key,
          name,
          description: z.string(),
          readableContent: z.string().optional(),
          existingId: reference,
        }),
      )
      .default([]),
    scenes: z
      .array(
        z.discriminatedUnion("kind", [
          z.object({
            kind: z.literal("playable"),
            id: key,
            name,
            placeId: key,
            arrival: name,
            actions: z.array(action).default([]),
          }),
          z.object({ kind: z.literal("draft"), id: key, name, note: name }),
        ]),
      )
      .min(1),
    links: z
      .array(
        z.object({
          id: key,
          fromSceneId: key,
          toSceneId: key,
          label: name,
          requiresFlags: z.array(key).default([]),
          requiresAbsentFlags: z.array(key).default([]),
          setsFlags: z.array(key).default([]),
        }),
      )
      .default([]),
  })
  .superRefine((plan, context) => {
    const issue = (path: (string | number)[], message: string) =>
      context.addIssue({ code: "custom", path, message });
    for (const field of ["places", "items", "scenes", "links"] as const) {
      const ids = new Set(plan[field].map(({ id }) => id));
      if (ids.size !== plan[field].length) issue([field], "IDs must be unique.");
    }
    const playable = plan.scenes.filter((scene) => scene.kind === "playable");
    const playableIds = new Set(playable.map(({ id }) => id));
    const placeIds = new Set(plan.places.map(({ id }) => id));
    const itemIds = new Set(plan.items.map(({ id }) => id));
    if (!playableIds.has(plan.startSceneId))
      issue(["startSceneId"], "Choose a playable start scene.");
    for (const scene of playable) {
      if (!placeIds.has(scene.placeId))
        issue(["scenes", scene.id, "placeId"], "Choose a plan place.");
      if (new Set(scene.actions.map(({ id }) => id)).size !== scene.actions.length)
        issue(["scenes", scene.id, "actions"], "Action IDs must be unique within a scene.");
      for (const action of scene.actions) {
        if (action.requiresItems.some((id) => !itemIds.has(id)))
          issue(["scenes", scene.id, "actions", action.id], "Choose a plan item.");
      }
    }
    for (const link of plan.links) {
      if (link.fromSceneId === link.toSceneId) {
        issue(["links", link.id], "A link must lead to a different scene.");
      } else if (!playableIds.has(link.fromSceneId) || !playableIds.has(link.toSceneId)) {
        issue(["links", link.id], "A link must connect playable scenes.");
      }
    }
  });

export type GuidePlanInput = z.input<typeof GuidePlanSchema>;

export const AdventureGuideDraftSchema = z.object({
  id: z.string().min(1),
  revision: z.number().int().positive(),
  answers: z.object({ premise: z.string().min(1), authorNote: z.string() }),
  plan: GuidePlanSchema,
  map: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("new") }),
    z.object({
      kind: z.literal("places"),
      realmId: z.string().min(1),
      sites: z.record(key, z.string().min(1)),
    }),
    z.object({
      kind: z.literal("existing"),
      realmId: z.string().min(1),
      sites: z.record(
        key,
        z.object({
          nodeId: z.string().min(1),
          placeId: z.string().min(1),
          placeCardId: z.string().min(1).optional(),
        }),
      ),
    }),
  ]),
  applied: z
    .object({
      revision: z.number().int().positive(),
      campaignId: z.string().min(1),
      startSceneId: z.string().min(1),
    })
    .optional(),
});

export type AdventureGuideDraft = z.infer<typeof AdventureGuideDraftSchema>;

export function newAdventureGuideDraft(
  plan: GuidePlanInput,
  answers: AdventureGuideDraft["answers"],
  map: AdventureGuideDraft["map"] = { kind: "new" },
): AdventureGuideDraft {
  return AdventureGuideDraftSchema.parse({
    id: crypto.randomUUID(),
    revision: 1,
    plan,
    answers,
    map,
  });
}

export class GuideMapChoiceError extends Error {
  constructor(
    readonly site: string,
    readonly referenceId: string | undefined,
    message: string,
  ) {
    super(message);
    this.name = "GuideMapChoiceError";
  }
}
