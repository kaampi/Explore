import { z } from "zod";
import { adventureMapPlaces, mapPlaceForScene } from "./adventureMap";
import type { AdventureGuideDraft } from "./adventureGuidePlan";
import type {
  CampaignTemplate,
  ObjectTemplate,
  PlaceTemplate,
  RealmTemplate,
} from "./LibrarySchema";

export const GuideSceneRevisionSchema = z.object({
  revision: z.number().int().nonnegative(),
  baseline: z.record(z.string()).default({}),
  changes: z.record(z.string()).default({}),
});

export type GuideSceneRevision = z.infer<typeof GuideSceneRevisionSchema>;
export type GuideSceneTarget = { campaignId: string; sceneId: string };
export type GuideSceneField = {
  id: string;
  label: string;
  current: string;
  baseline: string | undefined;
} & (
  { kind: "name" | "arrival" } | { kind: "outcome" | "item"; recordId: string; recordName: string }
);

export type GuideSceneSnapshot = GuideSceneTarget & {
  title: string;
  fields: GuideSceneField[];
  revision: GuideSceneRevision;
};

export type GuideSceneDecision = "studio" | "guide";

export class GuideSceneConflictError extends Error {
  constructor(
    message = "Scenen eller ändringsutkastet har ändrats. Granska de senaste värdena och försök igen.",
  ) {
    super(message);
    this.name = "GuideSceneConflictError";
  }
}

export function authoredGuideScene(guide: AdventureGuideDraft, sceneId: string) {
  return guide.plan.scenes.find(
    (scene) => scene.kind === "playable" && sceneId === `${guide.id}:scene:${scene.id}`,
  );
}

export function sceneRevisionSnapshot(input: {
  campaign: CampaignTemplate;
  sceneId: string;
  guide: AdventureGuideDraft;
  revision: GuideSceneRevision;
  objects: ObjectTemplate[];
  world?: RealmTemplate | undefined;
  places: PlaceTemplate[];
}): GuideSceneSnapshot {
  const { campaign, sceneId, guide, revision, objects, world, places } = input;
  const planned = authoredGuideScene(guide, sceneId);
  const scene = campaign.scenes.find(({ id }) => id === sceneId);
  if (!planned || !scene?.encounter)
    throw new GuideSceneConflictError(
      "Scenen finns inte längre som spelbar scen i det sparade äventyret.",
    );
  const definition = scene.encounter.definition;
  const mapped =
    scene.usePlaceIntro && world
      ? mapPlaceForScene(scene, adventureMapPlaces(world, places))
      : undefined;
  const fields: GuideSceneField[] = [
    {
      id: "name",
      kind: "name",
      label: "Scenens namn",
      current: scene.name,
      baseline: revision.baseline.name ?? planned.name,
    },
    {
      id: "arrival",
      kind: "arrival",
      label: "Ankomsttext",
      current: mapped?.place.note ?? definition.description,
      baseline:
        revision.baseline.arrival ?? (planned.kind === "playable" ? planned.arrival : undefined),
    },
  ];
  const plannedActions = planned.kind === "playable" ? planned.actions : [];
  for (const action of definition.interactions) {
    const id = `outcome:${action.id}`;
    const original = plannedActions.find((entry) => action.id === `${sceneId}:action:${entry.id}`);
    fields.push({
      id,
      kind: "outcome",
      recordId: action.id,
      recordName: action.label,
      label: `Följd av ”${action.label}”`,
      current: action.success.text,
      baseline: revision.baseline[id] ?? original?.outcome,
    });
  }
  for (const item of definition.items) {
    const card = objects.find(({ id }) => id === item.id);
    if (!card) continue;
    const id = `item:${item.id}`;
    const original = guide.plan.items.find(
      (entry) => item.id === (entry.existingId ?? `${guide.id}:item:${entry.id}`),
    );
    fields.push({
      id,
      kind: "item",
      recordId: item.id,
      recordName: card.name,
      label: `Läsbar text för ”${card.name}”`,
      current: campaign.guideItemText?.[item.id] ?? card.readableContent ?? "",
      baseline:
        revision.baseline[id] ??
        (original && !original.existingId ? (original.readableContent ?? "") : undefined),
    });
  }
  return { campaignId: campaign.id, sceneId, title: scene.name, fields, revision };
}

export function guideRevisionRows(snapshot: GuideSceneSnapshot) {
  return Object.entries(snapshot.revision.changes).map(([id, proposed]) => {
    const field = snapshot.fields.find((entry) => entry.id === id);
    if (!field) return { id, proposed, field: undefined, conflict: true };
    const conflict = proposed !== field.current && field.current !== field.baseline;
    return { id, proposed, field, conflict };
  });
}

export function applyGuideSceneRevision(
  campaign: CampaignTemplate,
  current: GuideSceneSnapshot,
  reviewed: GuideSceneSnapshot,
  decisions: Record<string, GuideSceneDecision>,
): { campaign: CampaignTemplate; revision: GuideSceneRevision } {
  if (reviewed.revision.revision !== current.revision.revision) throw new GuideSceneConflictError();
  const next = structuredClone(campaign);
  const scene = next.scenes.find(({ id }) => id === current.sceneId)!;
  const encounter = scene.encounter!;
  const baseline = { ...current.revision.baseline };
  const rows = guideRevisionRows(current);
  if (!rows.length) throw new Error("Lägg till en ändring innan du tillämpar utkastet.");
  for (const { id, field, proposed, conflict } of rows) {
    const reviewedField = reviewed.fields.find((entry) => entry.id === id);
    if (!field || !reviewedField || field.current !== reviewedField.current)
      throw new GuideSceneConflictError(
        "Ett fält har tagits bort eller ändrats sedan granskningen. Läs in scenen igen.",
      );
    const decision = decisions[id];
    if (conflict && decision !== "studio" && decision !== "guide")
      throw new Error(`Välj vilken text som ska sparas för ${field.label.toLowerCase()}.`);
    if (decision === "studio" || proposed === field.current) {
      baseline[id] = field.current;
      continue;
    }
    if (field.kind !== "item" && !proposed.trim())
      throw new Error(`${field.label} behöver en text.`);
    switch (field.kind) {
      case "name":
        scene.name = proposed;
        encounter.definition.title = proposed;
        break;
      case "arrival":
        scene.usePlaceIntro = false;
        encounter.definition.description = proposed;
        break;
      case "outcome":
        encounter.definition.interactions.find(({ id }) => id === field.recordId)!.success.text =
          proposed;
        break;
      case "item":
        next.guideItemText = { ...next.guideItemText, [field.recordId]: proposed };
        break;
    }
    baseline[id] = proposed;
  }
  // Older guide adventures acquire the same card synchronization as newly created ones.
  next.guideItemText ??= {};
  next.guideEditRevision = (campaign.guideEditRevision ?? 0) + 1;
  next.updatedAt = new Date().toISOString();
  return {
    campaign: next,
    revision: { revision: current.revision.revision + 1, baseline, changes: {} },
  };
}
