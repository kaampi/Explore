import { applyPatch, type PatchLibrary } from "../../library/authoringPatch";
import type {
  CampaignScene,
  CampaignTemplate,
  StoryboardLink,
  StoryboardPosition,
} from "../../library/LibrarySchema";
import type { AssistPreview } from "./assistContract";
import { placeNewScenes, type PlacedCard } from "./storyboardArrange";
import { CARD_HEIGHT, CARD_WIDTH } from "./storyboardLayout";

/**
 * What the canvas draws for a preview from the help panel. It is worked out from the proposals on a
 * copy in memory: nothing here is saved, and the adventure is left as it is. See
 * docs/storyboard-ai.sv.md.
 */

/** Ids of what a preview draws start with this, so that they never meet a real scene or route. */
export const PREVIEW_PREFIX = "preview:";
export const isPreviewId = (id: string) => id.startsWith(PREVIEW_PREFIX);

export type PreviewScene = {
  /** A scene card to draw. Its id is a preview id, and it has a position. */
  scene: CampaignScene;
  key: string;
  selected: boolean;
  hovered: boolean;
};
export type PreviewLink = {
  link: StoryboardLink;
  key: string;
  selected: boolean;
  hovered: boolean;
};
/** What a proposal adds to a scene that is already there, for the mark on its card. */
export type PreviewMark = {
  sceneId: string;
  actions: number;
  items: number;
  keys: string[];
  selected: boolean;
  hovered: boolean;
};
export type PreviewModel = {
  scenes: PreviewScene[];
  links: PreviewLink[];
  marks: PreviewMark[];
  /** How many proposals are shown, and how many of them are chosen. */
  shown: number;
  chosen: number;
  /** Keys of proposals that could not be applied, and so are not drawn. */
  failed: string[];
  /**
   * Where each new scene was put, by the id it gets when it is saved. Used to put the saved scenes
   * in the same places. A scene in a chosen proposal wins over one in a proposal that is not.
   */
  positions: Map<string, StoryboardPosition>;
};

export function buildAssistPreview(args: {
  campaign: CampaignTemplate;
  library: PatchLibrary;
  cards: PlacedCard[];
  anchorSceneId: string | undefined;
  preview: NonNullable<AssistPreview>;
}): PreviewModel {
  const { campaign, library, anchorSceneId, preview } = args;
  const taken: PlacedCard[] = [...args.cards];
  const model: PreviewModel = {
    scenes: [],
    links: [],
    marks: [],
    shown: 0,
    chosen: 0,
    failed: [],
    positions: new Map(),
  };
  // Chosen proposals first, so that what is saved is what was seen where it was seen.
  const ordered = [...preview.proposals].sort((a, b) => Number(b.selected) - Number(a.selected));
  const placed = new Map<string, Map<string, StoryboardPosition>>();
  for (const proposal of ordered) {
    let result;
    try {
      result = applyPatch(campaign, library, proposal.patch);
    } catch {
      model.failed.push(proposal.key);
      continue;
    }
    const hovered = preview.hoverKey === proposal.key;
    const base = `${PREVIEW_PREFIX}${proposal.key}:`;
    const newIds = result.newSceneIds;
    const spots = placeNewScenes(
      taken,
      anchorSceneId ?? "",
      newIds.map((id) => base + id),
    );
    const mine = new Map<string, StoryboardPosition>();
    for (const id of newIds) {
      const position = spots.get(base + id)!;
      mine.set(id, position);
      taken.push({ id: base + id, pos: position, width: CARD_WIDTH, height: CARD_HEIGHT });
      if (!model.positions.has(id)) model.positions.set(id, position);
      const scene = result.campaign.scenes.find((item) => item.id === id)!;
      const card: CampaignScene = { ...scene, id: base + id, position };
      delete card.encounter;
      delete card.storyboardSectionId;
      model.scenes.push({ scene: card, key: proposal.key, selected: proposal.selected, hovered });
    }
    placed.set(proposal.key, mine);
    const rename = (id: string) => (newIds.includes(id) ? base + id : id);
    for (const { id } of result.created.links) {
      const link = result.campaign.sceneLinks.find((item) => item.id === id)!;
      model.links.push({
        link: {
          ...link,
          id: base + id,
          fromSceneId: rename(link.fromSceneId),
          toSceneId: rename(link.toSceneId),
        },
        key: proposal.key,
        selected: proposal.selected,
        hovered,
      });
    }
    // What is added to a scene that was there before.
    const added = new Map<string, { actions: number; items: number }>();
    for (const { sceneId } of result.created.actions) {
      if (newIds.includes(sceneId)) continue;
      const entry = added.get(sceneId) ?? { actions: 0, items: 0 };
      entry.actions++;
      added.set(sceneId, entry);
    }
    for (const { opIndex } of result.created.items) {
      const op = proposal.patch.ops[opIndex];
      if (op?.op !== "addItem" || op.inSceneId.startsWith("new:")) continue;
      const entry = added.get(op.inSceneId) ?? { actions: 0, items: 0 };
      entry.items++;
      added.set(op.inSceneId, entry);
    }
    for (const [sceneId, entry] of added)
      model.marks.push({
        sceneId,
        ...entry,
        keys: [proposal.key],
        selected: proposal.selected,
        hovered,
      });
    model.shown++;
    if (proposal.selected) model.chosen++;
  }
  return model;
}
