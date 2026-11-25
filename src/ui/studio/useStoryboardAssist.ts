import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CampaignScene,
  CampaignTemplate,
  ObjectTemplate,
  StoryboardPosition,
} from "../../library/LibrarySchema";
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
/** The panel has saved, but the adventure could not be read again. Nothing is lost: it is saved. */
type Unread = { newSceneIds: string[]; focus: AssistClose["focus"]; message: string };

function anchorOf(campaign: CampaignTemplate, target: AssistTarget): string | undefined {
  if ("sceneId" in target) return target.sceneId;
  if ("linkId" in target)
    return campaign.sceneLinks.find((link) => link.id === target.linkId)?.fromSceneId;
  return target.text.sceneId;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The adventure as the author has it, with what the panel saved added to it. The author's unsaved
 * work is kept: a card they moved stays where they moved it, and a scene they have changed in
 * another way is not overwritten (it is reported instead). What the panel added is taken from the
 * saved adventure, with the author's own positions.
 */
export function mergeSaved(
  local: CampaignTemplate,
  base: CampaignTemplate,
  saved: CampaignTemplate,
): { campaign: CampaignTemplate; conflicts: string[] } {
  const conflicts: string[] = [];
  const baseScene = (id: string) => base.scenes.find((scene) => scene.id === id);
  const localIds = new Set(local.scenes.map((scene) => scene.id));
  const scenes: CampaignScene[] = local.scenes.map((here) => {
    const was = baseScene(here.id);
    const after = saved.scenes.find((scene) => scene.id === here.id);
    if (!after || !was) return here;
    const changedHere = !same({ ...here, position: undefined }, { ...was, position: undefined });
    const changedSaved = !same({ ...after, position: undefined }, { ...was, position: undefined });
    if (!changedSaved) return here;
    if (changedHere) {
      conflicts.push(here.name.trim() || here.id);
      return here;
    }
    return { ...after, position: here.position };
  });
  for (const scene of saved.scenes)
    if (!localIds.has(scene.id) && !baseScene(scene.id)) scenes.push(scene);
  const links = [
    ...local.sceneLinks,
    ...saved.sceneLinks.filter(
      (link) =>
        !local.sceneLinks.some((item) => item.id === link.id) &&
        !base.sceneLinks.some((item) => item.id === link.id),
    ),
  ];
  const objectIds = [...new Set([...local.objectIds, ...saved.objectIds])];
  return { campaign: { ...local, scenes, sceneLinks: links, objectIds }, conflicts };
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
  /** Reads the adventure again from where it is saved. Without it there is no help. */
  reloadCampaign: (() => Promise<CampaignTemplate>) | undefined;
  onChange: (campaign: CampaignTemplate) => void;
  onFocusScene: (id: string) => void;
  onFocusLink: (id: string) => void;
}) {
  const { campaign, objects, renderAssist, reloadCampaign } = args;
  const enabled = Boolean(renderAssist && reloadCampaign);
  const [open, setOpen] = useState<Open | null>(null);
  const openRef = useRef<Open | null>(null);
  openRef.current = open;
  const [preview, setPreview] = useState<AssistPreview>(null);
  const [justAdded, setJustAdded] = useState<ReadonlySet<string>>(new Set());
  const [unread, setUnread] = useState<Unread | null>(null);
  /** Scenes the panel changed that the author had changed too: kept as the author has them. */
  const [conflicts, setConflicts] = useState<string[]>([]);
  const counter = useRef(0);
  const closed = useRef(-1);
  const latest = useRef({ ...args, enabled });
  latest.current = { ...args, enabled };
  /** The adventure as it was when the panel opened: what the panel's changes are measured from. */
  const base = useRef<CampaignTemplate | null>(null);
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
    return buildAssistPreview({
      campaign,
      library: { objects },
      cards,
      anchorSceneId: open.anchorSceneId,
      preview,
    });
  }, [open, preview, campaign, objects, cards]);
  useEffect(() => {
    if (model) lastPositions.current = model.positions;
  }, [model]);

  const openAssist = useCallback(
    (intent: AssistIntent, target: AssistTarget) => {
      if (!latest.current.enabled || openRef.current) return;
      const request: OpenAssist = { campaignId: campaign.id, intent, target };
      base.current = campaign;
      const next = { id: ++counter.current, request, anchorSceneId: anchorOf(campaign, target) };
      openRef.current = next;
      setOpen(next);
    },
    [campaign],
  );

  /** A panel can only change the preview of the opening it belongs to. */
  const previewFor = useCallback((id: number, next: AssistPreview) => {
    if (openRef.current?.id !== id) return;
    setPreview(next);
  }, []);

  const applySaved = useCallback(
    async (newSceneIds: string[], focus: AssistClose["focus"], forOpen: number | null) => {
      const current = latest.current;
      const loaded = await current.reloadCampaign!();
      const from = base.current ?? current.campaign;
      const merged = mergeSaved(current.campaign, from, loaded);
      const next = placeSaved(merged.campaign, newSceneIds, lastPositions.current);
      current.onChange(next);
      if (forOpen === null || openRef.current?.id === forOpen) {
        setPreview(null);
        setOpen(null);
        openRef.current = null;
      }
      if (newSceneIds.length) {
        setJustAdded(new Set(newSceneIds));
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setJustAdded(new Set()), JUST_ADDED_MS);
      }
      if (focus && "sceneId" in focus) current.onFocusScene(focus.sceneId);
      else if (focus) current.onFocusLink(focus.linkId);
      return merged.conflicts;
    },
    [],
  );

  const onClose = useCallback(
    async (result: AssistClose, forId: number) => {
      // Exactly once for each opening, whatever the panel does.
      if (closed.current === forId) return;
      closed.current = forId;
      if (!result.changed) {
        if (openRef.current?.id === forId) {
          setPreview(null);
          setOpen(null);
          openRef.current = null;
        }
        return;
      }
      try {
        setConflicts(await applySaved(result.newSceneIds, result.focus, forId));
        setUnread(null);
      } catch (error) {
        // The panel saved. Only the reading failed, so the author reads again rather than saving again.
        setPreview(null);
        setOpen(null);
        openRef.current = null;
        setUnread({
          newSceneIds: result.newSceneIds,
          focus: result.focus,
          message: error instanceof Error ? error.message : "",
        });
      }
    },
    [applySaved],
  );

  /** Reads the saved adventure again, after a failed reading. Nothing is saved again. */
  const readAgain = useCallback(async () => {
    if (!unread) return;
    try {
      await applySaved(unread.newSceneIds, unread.focus, null);
      setUnread(null);
    } catch (error) {
      setUnread({
        ...unread,
        message: error instanceof Error ? error.message : "",
      });
    }
  }, [applySaved, unread]);

  const panel =
    open && enabled
      ? renderAssist!({
          request: open.request,
          onPreview: (next) => previewFor(open.id, next),
          onClose: (result) => void onClose(result, open.id),
        } satisfies AssistPanelProps)
      : null;

  return {
    enabled,
    isOpen: open !== null,
    panelKey: open?.id,
    panel,
    openAssist,
    model,
    justAdded,
    unread: unread ? { message: unread.message, readAgain } : null,
    conflicts,
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
  const board = [...layoutStoryboard(loaded.scenes, loaded.storyboardSections ?? []).sceneCards];
  const cards: PlacedCard[] = board
    .filter(([id]) => !fresh.includes(id))
    .map(([id, card]) => ({ id, pos: card.pos, width: card.width, height: card.height }));
  for (const id of fresh)
    if (remembered.has(id))
      cards.push({ id, pos: remembered.get(id)!, width: CARD_WIDTH, height: CARD_HEIGHT });
  const unplaced = fresh.filter((id) => !remembered.has(id));
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
