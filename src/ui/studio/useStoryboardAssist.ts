import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CampaignScene,
  CampaignTemplate,
  StoryboardPosition,
} from "../../library/LibrarySchema";
import type { ObjectTemplate } from "../../library/LibrarySchema";
import type {
  AssistClose,
  AssistIntent,
  AssistPanelProps,
  AssistPreview,
  AssistTarget,
  OpenAssist,
  RenderAssist,
} from "./assistContract";
import { buildAssistPreview, type PreviewModel } from "./assistPreview";
import { placeNewScenes, type PlacedCard } from "./storyboardArrange";
import { CARD_HEIGHT, CARD_WIDTH, layoutStoryboard } from "./storyboardLayout";

/** How long the scenes the help has just added stay lit. */
export const JUST_ADDED_MS = 4000;

type Open = { id: number; request: OpenAssist; anchorSceneId: string | undefined };

function anchorOf(campaign: CampaignTemplate, target: AssistTarget): string | undefined {
  if ("sceneId" in target) return target.sceneId;
  if ("linkId" in target)
    return campaign.sceneLinks.find((link) => link.id === target.linkId)?.fromSceneId;
  return target.text.sceneId;
}

/**
 * Storyboard's side of the AI help: opening the panel, drawing what it proposes, and the change
 * from the preview to what was saved. The panel itself is somebody else's; this only keeps the
 * contract in `assistContract.ts`. Nothing the panel previews is ever saved from here.
 */
export function useStoryboardAssist(args: {
  campaign: CampaignTemplate;
  objects: ObjectTemplate[];
  renderAssist: RenderAssist | undefined;
  /** Reads the adventure again from where it is saved. */
  reloadCampaign: (() => Promise<CampaignTemplate>) | undefined;
  onChange: (campaign: CampaignTemplate) => void;
  onFocusScene: (id: string) => void;
  onFocusLink: (id: string) => void;
}) {
  const { campaign, objects, renderAssist } = args;
  const [open, setOpen] = useState<Open | null>(null);
  const [preview, setPreview] = useState<AssistPreview>(null);
  const [justAdded, setJustAdded] = useState<ReadonlySet<string>>(new Set());
  const counter = useRef(0);
  const closed = useRef(-1);
  const latest = useRef({ ...args });
  latest.current = { ...args };
  const lastPositions = useRef(new Map<string, StoryboardPosition>());
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const cards = useMemo<PlacedCard[]>(
    () =>
      [...layoutStoryboard(campaign.scenes, campaign.storyboardSections ?? []).sceneCards].map(
        ([id, card]) => ({ id, pos: card.pos, width: card.width, height: card.height }),
      ),
    [campaign.scenes, campaign.storyboardSections],
  );
  const model = useMemo<PreviewModel | null>(() => {
    if (!open || !preview) return null;
    const next = buildAssistPreview({
      campaign,
      library: { objects },
      cards,
      anchorSceneId: open.anchorSceneId,
      preview,
    });
    return next;
  }, [open, preview, campaign, objects, cards]);
  useEffect(() => {
    if (model) lastPositions.current = model.positions;
  }, [model]);

  const openAssist = useCallback(
    (intent: AssistIntent, target: AssistTarget) => {
      if (!renderAssist) return;
      setOpen((current) => {
        if (current) return current;
        const request: OpenAssist = { campaignId: campaign.id, intent, target };
        return {
          id: ++counter.current,
          request,
          anchorSceneId: anchorOf(campaign, target),
        };
      });
    },
    [renderAssist, campaign],
  );

  const onPreview = useCallback((next: AssistPreview) => setPreview(next), []);

  const onClose = useCallback(async (result: AssistClose, forId: number) => {
    // Exactly once for each opening, whatever the panel does.
    if (closed.current === forId) return;
    closed.current = forId;
    if (!result.changed) {
      setPreview(null);
      setOpen(null);
      return;
    }
    let loaded: CampaignTemplate | undefined;
    try {
      loaded = await latest.current.reloadCampaign?.();
    } catch {
      loaded = undefined;
    }
    // The preview gives way to what was saved in one update, so that nothing blinks.
    if (loaded) {
      const next = placeSaved(loaded, result.newSceneIds, lastPositions.current);
      latest.current.onChange(next);
    }
    setPreview(null);
    setOpen(null);
    if (loaded && result.newSceneIds.length) {
      setJustAdded(new Set(result.newSceneIds));
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setJustAdded(new Set()), JUST_ADDED_MS);
    }
    if (result.focus && "sceneId" in result.focus)
      latest.current.onFocusScene(result.focus.sceneId);
    else if (result.focus) latest.current.onFocusLink(result.focus.linkId);
  }, []);

  const panel =
    open && renderAssist
      ? renderAssist({
          request: open.request,
          onPreview,
          onClose: (result) => void onClose(result, open.id),
        } satisfies AssistPanelProps)
      : null;

  return {
    isOpen: open !== null,
    panelKey: open?.id,
    panel,
    openAssist,
    model,
    justAdded,
  };
}

/** The saved adventure, with the new scenes where the preview showed them. */
function placeSaved(
  loaded: CampaignTemplate,
  newSceneIds: string[],
  remembered: Map<string, StoryboardPosition>,
): CampaignTemplate {
  const fresh = newSceneIds.filter((id) => loaded.scenes.some((scene) => scene.id === id));
  if (fresh.length === 0) return loaded;
  const unplaced = fresh.filter((id) => !remembered.has(id));
  const board = [...layoutStoryboard(loaded.scenes, loaded.storyboardSections ?? []).sceneCards];
  const cards: PlacedCard[] = board
    .filter(([id]) => !fresh.includes(id))
    .map(([id, card]) => ({ id, pos: card.pos, width: card.width, height: card.height }));
  for (const id of fresh)
    if (remembered.has(id))
      cards.push({ id, pos: remembered.get(id)!, width: CARD_WIDTH, height: CARD_HEIGHT });
  const anchor =
    loaded.sceneLinks.find((link) => fresh.includes(link.toSceneId))?.fromSceneId ?? "";
  const rest = unplaced.length ? placeNewScenes(cards, anchor, unplaced) : new Map();
  return {
    ...loaded,
    scenes: loaded.scenes.map((scene): CampaignScene => {
      if (!fresh.includes(scene.id) || scene.position) return scene;
      const position = remembered.get(scene.id) ?? rest.get(scene.id);
      return position ? { ...scene, position } : scene;
    }),
  };
}
