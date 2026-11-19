import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  CampaignScene,
  StoryboardChapter,
  StoryboardLink,
  StoryboardPosition,
  StoryboardSection,
  StoryboardSectionSize,
} from "@library/LibrarySchema";
import { storyboardSectionTitle } from "@library/storyboardHierarchy";
import { formatKeywordList, parseKeywordList } from "@layers/keywords";
import {
  linksFromScene,
  linksToScene,
  removeSceneLink,
  setScenePosition,
  upsertSceneLink,
} from "@library/storyboardLinks";
import {
  buildChapterExport,
  chapterExportFilename,
  newChapter,
  setSceneChapter,
  unassignChapter,
} from "@library/storyboardChapters";
import { downloadJson } from "./studioShared";
import { layoutStoryboard, type SectionCard, type StoryboardCard } from "./storyboardLayout";
import {
  routeMovingStoryboardLinks,
  routeStoryboardDraft,
  routeStoryboardLinks,
  storyboardLinkBounds,
  storyboardLinkPoint,
  type LinkSides,
} from "./storyboardRouting";

/**
 * Storyboard — a free-canvas map of how this campaign's scenes connect,
 * and which of them make up a chapter for export to the writing tool.
 * Drag a card to move it; drag from its port to another card to link
 * them; click a line to edit what it requires and sets. Purely
 * authoring-time (§ project_spec). PlayableStoryboard uses these same
 * links as explicit player choices between pinned encounter scenes.
 */

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 3;
const ZOOM_STEP = 1.25;
const VIEW_PADDING = 24;
const CHAPTER_COLORS = ["#4fb0a5", "#6fa8dc", "#b08bc9", "#c98a3b", "#d9707a", "#8bc98a"];

function chapterColor(index: number): string {
  return CHAPTER_COLORS[index % CHAPTER_COLORS.length]!;
}

const EMPTY_SECTIONS: StoryboardSection[] = [];

type LinkEndpoints = { from: StoryboardCard; to: StoryboardCard };
type LabelBox = { x: number; y: number; width: number; height: number };

function sameCard(a: StoryboardCard, b: StoryboardCard): boolean {
  const sameId =
    "scene" in a
      ? "scene" in b && a.scene.id === b.scene.id
      : "section" in b && a.section.id === b.section.id;
  return (
    sameId &&
    a.pos.x === b.pos.x &&
    a.pos.y === b.pos.y &&
    a.width === b.width &&
    a.height === b.height
  );
}

function sameLabelBoxes(a: Map<string, LabelBox>, b: Map<string, LabelBox>): boolean {
  return (
    a.size === b.size &&
    [...a].every(([id, box]) => {
      const next = b.get(id);
      return (
        next &&
        box.x === next.x &&
        box.y === next.y &&
        box.width === next.width &&
        box.height === next.height
      );
    })
  );
}

function overlap(a: LabelBox, b: LabelBox): number {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return Math.max(0, width) * Math.max(0, height);
}

export type StoryboardContextTarget = {
  x: number;
  y: number;
  position: StoryboardPosition;
  sceneId?: string;
  linkId?: string;
  sectionId?: string;
};

export function StoryboardCanvas({
  scenes,
  links,
  chapters,
  campaignName,
  onScenesChange,
  onLinksChange,
  sections = EMPTY_SECTIONS,
  selectedSectionId,
  markedSceneIds,
  onSelectSection,
  onToggleSection,
  onMoveSection,
  onResizeSection,
  onChaptersChange,
  externalInspector = false,
  onSelectScene,
  onSelectLink,
  onCanvasContext,
  selectedSceneId,
  activeLinkId,
  connectionFromSceneId,
  onConnectionEnd,
}: {
  onCanvasContext?: (target: StoryboardContextTarget) => void;
  selectedSceneId?: string | undefined;
  activeLinkId?: string | undefined;
  externalInspector?: boolean;
  onSelectScene?: ((id: string, additive?: boolean) => void) | undefined;
  onSelectLink?: ((id: string | null) => void) | undefined;
  connectionFromSceneId?: string | null | undefined;
  onConnectionEnd?: (() => void) | undefined;
  scenes: CampaignScene[];
  sections?: StoryboardSection[];
  selectedSectionId?: string;
  markedSceneIds?: ReadonlySet<string>;
  onSelectSection?: (id: string) => void;
  onToggleSection?: (id: string) => void;
  onMoveSection?: (id: string, delta: StoryboardPosition) => void;
  onResizeSection?: (id: string, size: StoryboardSectionSize) => void;
  links: StoryboardLink[];
  chapters: StoryboardChapter[];
  campaignName: string;
  onScenesChange: (scenes: CampaignScene[]) => void;
  onLinksChange: (links: StoryboardLink[]) => void;
  onChaptersChange: (chapters: StoryboardChapter[]) => void;
}) {
  const boardRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [labelBoxes, setLabelBoxes] = useState(() => new Map<string, LabelBox>());
  const previousRouting = useRef<{
    sides: Map<string, LinkSides>;
    endpoints: Map<string, LinkEndpoints>;
  } | null>(null);
  const arrowId = useId();
  const [zoom, setZoom] = useState(1);
  const pendingScroll = useRef<StoryboardPosition | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const resizing = useRef<{
    id: string;
    pointerId: number;
    start: StoryboardPosition;
    size: StoryboardSectionSize;
  } | null>(null);
  const [drag, setDrag] = useState<{
    id: string;
    section: boolean;
    origin: StoryboardPosition;
  } | null>(null);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [draftPoint, setDraftPoint] = useState<StoryboardPosition | null>(null);
  const [hoverTarget, setHoverTarget] = useState<string | null>(null);
  const [selectedLinkId, setSelectedLinkState] = useState<string | null>(null);
  function setSelectedLinkId(id: string | null) {
    setSelectedLinkState(id);
    onSelectLink?.(id);
  }

  const { visibleScenes, frames, folded, endpoints, sceneCards } = useMemo(
    () => layoutStoryboard(scenes, sections),
    [scenes, sections],
  );
  const sectionCards = useMemo(() => [...frames, ...folded], [frames, folded]);
  const cards = useMemo(() => [...visibleScenes, ...sectionCards], [visibleScenes, sectionCards]);
  const sceneLabel = (id: string) => sceneCards.get(id)?.scene.name.trim() || "Untitled scene";
  const { projectedLinks, incoming, outgoing } = useMemo(() => {
    const outgoing = new Map<StoryboardCard, number>();
    const incoming = new Map<StoryboardCard, number>();
    const projectedLinks = links.flatMap((link) => {
      const from = endpoints.get(link.fromSceneId);
      const to = endpoints.get(link.toSceneId);
      if (!from || !to || (from === to && "section" in from)) return [];
      outgoing.set(from, (outgoing.get(from) ?? 0) + 1);
      incoming.set(to, (incoming.get(to) ?? 0) + 1);
      return [{ id: link.id, link, from, to }];
    });
    return { projectedLinks, incoming, outgoing };
  }, [endpoints, links]);
  const routes = useMemo(() => {
    const previous = previousRouting.current;
    if (!drag || !previous) return routeStoryboardLinks(cards, projectedLinks);
    const moved = new Set<StoryboardCard>();
    for (const { id, from, to } of projectedLinks) {
      const old = previous.endpoints.get(id);
      if (old && !sameCard(from, old.from)) moved.add(from);
      if (old && !sameCard(to, old.to)) moved.add(to);
    }
    return routeMovingStoryboardLinks(cards, projectedLinks, previous.sides, moved);
  }, [cards, drag, projectedLinks]);
  useLayoutEffect(() => {
    previousRouting.current = {
      sides: new Map([...routes].map(([id, route]) => [id, route.sides])),
      endpoints: new Map(projectedLinks.map(({ id, from, to }) => [id, { from, to }])),
    };
  }, [projectedLinks, routes]);

  const placedBoxes: LabelBox[] = [];
  const drawnLinks = projectedLinks.map(({ id, link, from, to }) => {
    const route = routes.get(id)!;
    const endpointNames = `${sceneLabel(link.fromSceneId)} → ${sceneLabel(link.toSceneId)}`;
    const label = link.label.trim() || ("section" in from || "section" in to ? endpointNames : "");
    const box = label ? labelBoxes.get(label) : undefined;
    let point = route.label;
    if (box) {
      const at = (position: StoryboardPosition) => ({
        ...box,
        x: box.x + position.x,
        y: box.y + position.y,
      });
      const overlapWithPlaced = (position: StoryboardPosition) =>
        placedBoxes.reduce((area, other) => area + overlap(at(position), other), 0);
      if (overlapWithPlaced(point)) {
        const earlier = storyboardLinkPoint(route, 0.4);
        const later = storyboardLinkPoint(route, 0.6);
        point = overlapWithPlaced(earlier) <= overlapWithPlaced(later) ? earlier : later;
      }
      placedBoxes.push(at(point));
    }
    return { link, route, label, point, box, endpointNames };
  });

  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    function measureLabels() {
      if (!svg?.isConnected) return;
      const padding = parseFloat(getComputedStyle(svg).getPropertyValue("--space-1")) || 0;
      const measured = new Map<string, LabelBox>();
      for (const text of Array.from(
        svg.querySelectorAll<SVGTextElement>("[data-storyboard-label]"),
      )) {
        const label = text.textContent;
        if (!label || measured.has(label) || typeof text.getBBox !== "function") continue;
        const { x, y, width, height } = text.getBBox();
        measured.set(label, {
          x: x - padding,
          y: y - padding,
          width: width + 2 * padding,
          height: height + 2 * padding,
        });
      }
      setLabelBoxes((current) => (sameLabelBoxes(current, measured) ? current : measured));
    }
    measureLabels();
    document.fonts?.addEventListener("loadingdone", measureLabels);
    return () => document.fonts?.removeEventListener("loadingdone", measureLabels);
  }, [links, sceneCards]);

  const activeConnectFrom = connectionFromSceneId ?? connectFrom;
  const draftSource = activeConnectFrom ? endpoints.get(activeConnectFrom) : undefined;
  const draft = draftSource ? routeStoryboardDraft(draftSource, draftPoint ?? undefined) : null;
  const draftBounds = draft ? storyboardLinkBounds(draft) : null;

  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  function include({ x, y }: StoryboardPosition) {
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
  }
  for (const { pos, width, height } of cards) {
    include(pos);
    include({ x: pos.x + width + 8, y: pos.y + height });
  }
  for (const { route } of drawnLinks) {
    const area = storyboardLinkBounds(route);
    include({ x: area.left, y: area.top });
    include({ x: area.right, y: area.bottom });
  }
  for (const box of placedBoxes) {
    include(box);
    include({ x: box.x + box.width, y: box.y + box.height });
  }
  const origin = drag?.origin ?? { x: Math.min(0, left), y: Math.min(0, top) };
  const width = Math.max(
    960,
    Math.max(right, draftBounds?.right ?? 0) - origin.x + 2 * VIEW_PADDING,
  );
  const height = Math.max(
    720,
    Math.max(bottom, draftBounds?.bottom ?? 0) - origin.y + 2 * VIEW_PADDING,
  );

  const moveView = useCallback(
    (nextZoom: number, scroll: StoryboardPosition) => {
      const board = boardRef.current;
      if (!board) return;
      const target = { x: Math.max(0, scroll.x), y: Math.max(0, scroll.y) };
      if (nextZoom === zoom) {
        board.scrollLeft = target.x;
        board.scrollTop = target.y;
      } else {
        pendingScroll.current = target;
        setZoom(nextZoom);
      }
    },
    [zoom],
  );

  useLayoutEffect(() => {
    const board = boardRef.current;
    const scroll = pendingScroll.current;
    if (!board || !scroll) return;
    pendingScroll.current = null;
    board.scrollLeft = scroll.x;
    board.scrollTop = scroll.y;
  }, [zoom]);

  const zoomAround = useCallback(
    (requested: number, pointer?: StoryboardPosition) => {
      const board = boardRef.current;
      if (!board) return;
      const nextZoom = Math.max(Math.min(MIN_ZOOM, zoom), Math.min(MAX_ZOOM, requested));
      const anchor = pointer ?? { x: board.clientWidth / 2, y: board.clientHeight / 2 };
      const ratio = nextZoom / zoom;
      moveView(nextZoom, {
        x: (board.scrollLeft + anchor.x) * ratio - anchor.x,
        y: (board.scrollTop + anchor.y) * ratio - anchor.y,
      });
    },
    [moveView, zoom],
  );

  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const onWheel = (event: WheelEvent) => {
      if ((!event.ctrlKey && !event.metaKey) || !event.deltaY) return;
      event.preventDefault();
      const rect = board.getBoundingClientRect();
      zoomAround(zoom * (event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP), {
        x: event.clientX - rect.left - board.clientLeft,
        y: event.clientY - rect.top - board.clientTop,
      });
    };
    board.addEventListener("wheel", onWheel, { passive: false });
    return () => board.removeEventListener("wheel", onWheel);
  }, [zoom, zoomAround]);

  function fitAll() {
    const board = boardRef.current;
    if (!board || (!visibleScenes.length && !sectionCards.length)) return;
    const availableWidth = board.clientWidth - 2 * VIEW_PADDING;
    const availableHeight = board.clientHeight - 2 * VIEW_PADDING;
    if (availableWidth <= 0 || availableHeight <= 0) return;
    const nextZoom = Math.min(1, availableWidth / (right - left), availableHeight / (bottom - top));
    moveView(nextZoom, {
      x: ((left + right) / 2 - origin.x) * nextZoom - board.clientWidth / 2,
      y: ((top + bottom) / 2 - origin.y) * nextZoom - board.clientHeight / 2,
    });
  }

  useEffect(() => {
    if (connectionFromSceneId) {
      setConnectFrom(null);
      setDrag(null);
      setDraftPoint(null);
      setHoverTarget(null);
    }
  }, [connectionFromSceneId]);
  useEffect(() => {
    if (!activeConnectFrom) return;
    const cancel = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setConnectFrom(null);
      setDraftPoint(null);
      setHoverTarget(null);
      onConnectionEnd?.();
    };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, [activeConnectFrom, onConnectionEnd]);

  function pointFromEvent(event: { clientX: number; clientY: number }): StoryboardPosition {
    const rect = boardRef.current?.getBoundingClientRect();
    const board = boardRef.current;
    if (!rect || !board) return { x: 0, y: 0 };
    return {
      x: origin.x + (event.clientX - rect.left - board.clientLeft + board.scrollLeft) / zoom,
      y: origin.y + (event.clientY - rect.top - board.clientTop + board.scrollTop) / zoom,
    };
  }

  function startDrag(event: React.PointerEvent, item: StoryboardCard) {
    if (event.button !== 0) return;
    const section = "section" in item;
    const id = section ? item.section.id : item.scene.id;
    if (connectionFromSceneId && !section) {
      finishConnection(connectionFromSceneId, id);
      return;
    }
    const additive = !section && (event.shiftKey || event.ctrlKey || event.metaKey);
    if (section) onSelectSection?.(id);
    else onSelectScene?.(id, additive);
    setSelectedLinkId(null);
    if (additive) return;
    const p = pointFromEvent(event);
    dragOffset.current = { x: p.x - item.pos.x, y: p.y - item.pos.y };
    setDrag({ id, section, origin });
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function startConnect(event: React.PointerEvent, sceneId: string) {
    if (event.button !== 0) return;
    event.stopPropagation();
    onConnectionEnd?.();
    setConnectFrom(sceneId);
    setDraftPoint(pointFromEvent(event));
    setSelectedLinkId(null);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function onBoardPointerMove(event: React.PointerEvent) {
    const resize = resizing.current;
    if (resize) {
      if (resize.pointerId === event.pointerId) {
        const point = pointFromEvent(event);
        resizeSection(
          resize.id,
          resize.size.width + point.x - resize.start.x,
          resize.size.height + point.y - resize.start.y,
        );
      }
      return;
    }
    if (!drag && !activeConnectFrom) return;
    const p = pointFromEvent(event);
    if (drag) {
      const section = drag.section
        ? sectionCards.find((card) => card.section.id === drag.id)
        : undefined;
      const next = {
        x: Math.max(Math.min(0, section?.pos.x ?? 0), p.x - dragOffset.current.x),
        y: Math.max(Math.min(0, section?.pos.y ?? 0), p.y - dragOffset.current.y),
      };
      if (section)
        onMoveSection?.(drag.id, { x: next.x - section.pos.x, y: next.y - section.pos.y });
      else if (!drag.section) onScenesChange(setScenePosition(scenes, drag.id, next));
      return;
    }
    if (activeConnectFrom) {
      setDraftPoint(p);
      const el = document.elementFromPoint(event.clientX, event.clientY);
      const cardEl = el instanceof Element ? el.closest<HTMLElement>("[data-scene-id]") : null;
      setHoverTarget(cardEl?.dataset.sceneId ?? null);
    }
  }

  function finishConnection(fromSceneId: string, toSceneId: string) {
    if (fromSceneId === toSceneId || !sceneCards.has(fromSceneId) || !sceneCards.has(toSceneId))
      return;
    const existing = links.find((l) => l.fromSceneId === fromSceneId && l.toSceneId === toSceneId);
    if (existing) {
      setSelectedLinkId(existing.id);
    } else {
      const created: StoryboardLink = {
        id: crypto.randomUUID(),
        fromSceneId,
        toSceneId,
        requiresFlags: [],
        requiresAbsentFlags: [],
        setsFlags: [],
        label: "",
      };
      onLinksChange(upsertSceneLink(links, created));
      setSelectedLinkId(created.id);
    }
    onConnectionEnd?.();
    setConnectFrom(null);
    setDraftPoint(null);
    setHoverTarget(null);
  }

  function endConnect() {
    if (connectFrom && hoverTarget) finishConnection(connectFrom, hoverTarget);
    setConnectFrom(null);
    setDraftPoint(null);
    setHoverTarget(null);
  }

  function onBoardPointerUp(event: React.PointerEvent) {
    if (resizing.current) {
      if (resizing.current.pointerId === event.pointerId) resizing.current = null;
      return;
    }
    setDrag(null);
    if (connectFrom) endConnect();
  }

  const selectedLink = links.find((item) => item.id === selectedLinkId) ?? null;

  function patchLink(patch: Partial<StoryboardLink>) {
    if (!selectedLink) return;
    onLinksChange(upsertSceneLink(links, { ...selectedLink, ...patch }));
  }

  function resizeSection(id: string, width: number, height: number) {
    onResizeSection?.(id, { width: Math.max(1, width), height: Math.max(1, height) });
  }

  function renderSection(card: SectionCard) {
    const { section, pos, sceneCount } = card;
    const title = storyboardSectionTitle(section);
    const isFolded = section.collapsed === true;
    const countLabel = `${sceneCount} ${sceneCount === 1 ? "scene" : "scenes"}`;
    const connectionCount = (incoming.get(card) ?? 0) + (outgoing.get(card) ?? 0);
    return (
      <div
        key={section.id}
        data-section-id={section.id}
        className={`storyboard-section storyboard-section--${section.kind}${isFolded ? " is-folded" : ""}${selectedSectionId === section.id ? " is-selected" : ""}`}
        style={{
          left: pos.x - origin.x,
          top: pos.y - origin.y,
          width: card.width,
          height: card.height,
        }}
      >
        <div
          className="storyboard-section__header"
          onPointerDown={(event) => startDrag(event, card)}
        >
          <button
            type="button"
            className="storyboard-section__toggle"
            aria-expanded={!isFolded}
            aria-label={`${isFolded ? "Expand" : "Collapse"} ${title}`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => onToggleSection?.(section.id)}
          >
            {isFolded ? "▸" : "▾"}
          </button>
          <button
            type="button"
            className="storyboard-section__title"
            onClick={() => onSelectSection?.(section.id)}
            title={title}
          >
            <small>{section.kind === "act" ? "Act" : "Scene group"}</small>
            <strong>{title}</strong>
          </button>
          {!isFolded && <span className="storyboard-section__count">{countLabel}</span>}
        </div>
        {isFolded && (
          <div
            className="storyboard-section__summary"
            onPointerDown={(event) => startDrag(event, card)}
          >
            <strong>{countLabel}</strong>
            <span>
              {connectionCount} {connectionCount === 1 ? "connection" : "connections"} to other
              parts
            </span>
          </div>
        )}
        {!isFolded && section.kind === "group" && onResizeSection && (
          <button
            type="button"
            className="storyboard-section__resize"
            aria-label={`Resize ${title}`}
            title="Drag to resize, or use the arrow keys"
            disabled={!!activeConnectFrom}
            onPointerDown={(event) => {
              if (event.button !== 0 || resizing.current) return;
              event.stopPropagation();
              onSelectSection?.(section.id);
              resizing.current = {
                id: section.id,
                pointerId: event.pointerId,
                start: pointFromEvent(event),
                size: { width: card.width, height: card.height },
              };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onLostPointerCapture={(event) => {
              if (resizing.current?.pointerId === event.pointerId) resizing.current = null;
            }}
            onKeyDown={(event) => {
              const horizontal =
                event.key === "ArrowRight" ? 16 : event.key === "ArrowLeft" ? -16 : 0;
              const vertical = event.key === "ArrowDown" ? 16 : event.key === "ArrowUp" ? -16 : 0;
              if (!horizontal && !vertical) return;
              event.preventDefault();
              resizeSection(section.id, card.width + horizontal, card.height + vertical);
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="storyboard">
      <p className="form-section__lede">
        {connectionFromSceneId
          ? `Connecting from ${sceneLabel(connectionFromSceneId)}. Move to the destination scene and click to attach. Escape cancels.`
          : "Drag a card to move it. Drag from the dot on its right edge onto another card to connect them. Click a line to set what it requires or sets."}
      </p>

      <div className="storyboard-chapters">
        <span className="storyboard-chapters__label">Chapters</span>
        {chapters.map((chapter, index) => (
          <div key={chapter.id} className="storyboard-chapter-chip">
            <span className="storyboard-chapter-dot" style={{ background: chapterColor(index) }} />
            <input
              type="text"
              value={chapter.title}
              onChange={(e) =>
                onChaptersChange(
                  chapters.map((c) => (c.id === chapter.id ? { ...c, title: e.target.value } : c)),
                )
              }
              placeholder={`Chapter ${index + 1}`}
            />
            <button
              type="button"
              className="storyboard-chapter-remove"
              aria-label={`Remove ${chapter.title.trim() || `Chapter ${index + 1}`}`}
              onClick={() => {
                onChaptersChange(chapters.filter((c) => c.id !== chapter.id));
                onScenesChange(unassignChapter(scenes, chapter.id));
              }}
            >
              &times;
            </button>
          </div>
        ))}
        <button
          type="button"
          className="setup-text-btn"
          onClick={() => onChaptersChange([...chapters, newChapter()])}
        >
          + Chapter
        </button>
        <button
          type="button"
          className="setup-text-btn"
          disabled={chapters.length === 0}
          onClick={() => {
            const payload = buildChapterExport({ name: campaignName, scenes, chapters });
            downloadJson(chapterExportFilename(campaignName), payload);
          }}
        >
          Export chapters
        </button>
      </div>

      <div className="storyboard-zoom" role="group" aria-label="Storyboard zoom">
        <span className="storyboard-zoom__hint">Ctrl / ⌘ + scroll to zoom</span>
        <button
          type="button"
          aria-label="Zoom out"
          disabled={zoom <= MIN_ZOOM}
          onClick={() => zoomAround(zoom / ZOOM_STEP)}
        >
          −
        </button>
        <button
          type="button"
          aria-label={`Reset zoom to 100%, current zoom ${+(zoom * 100).toFixed(1)}%`}
          onClick={() => zoomAround(1)}
        >
          {+(zoom * 100).toFixed(1)}%
        </button>
        <button
          type="button"
          aria-label="Zoom in"
          disabled={zoom >= MAX_ZOOM}
          onClick={() => zoomAround(zoom * ZOOM_STEP)}
        >
          +
        </button>
        <button
          type="button"
          disabled={scenes.length === 0 && sections.length === 0}
          onClick={fitAll}
        >
          Fit all
        </button>
      </div>

      <div
        ref={boardRef}
        className={`storyboard-board${activeConnectFrom ? " is-connecting" : ""}`}
        aria-label="Storyboard workspace"
        onContextMenu={(event) => {
          if (!onCanvasContext) return;
          event.preventDefault();
          const element = event.target as Element;
          const sceneId = element.closest<HTMLElement>("[data-scene-id]")?.dataset.sceneId;
          const linkId = element.closest<SVGElement>("[data-link-id]")?.dataset.linkId;
          const sectionId = element.closest<HTMLElement>("[data-section-id]")?.dataset.sectionId;
          onCanvasContext({
            x: event.clientX,
            y: event.clientY,
            position: pointFromEvent(event),
            ...(sceneId ? { sceneId } : {}),
            ...(linkId ? { linkId } : {}),
            ...(sectionId ? { sectionId } : {}),
          });
        }}
        onPointerMove={onBoardPointerMove}
        onPointerUp={onBoardPointerUp}
        onPointerCancel={() => {
          resizing.current = null;
          setDrag(null);
          setConnectFrom(null);
          setDraftPoint(null);
          setHoverTarget(null);
        }}
        onPointerLeave={() => {
          if (connectFrom && !drag) {
            setConnectFrom(null);
            setDraftPoint(null);
            setHoverTarget(null);
          }
        }}
      >
        <div className="storyboard-surface" style={{ width: width * zoom, height: height * zoom }}>
          <div
            className="storyboard-content"
            style={{ width, height, transform: `scale(${zoom})` }}
          >
            {frames.map(renderSection)}
            <svg
              ref={svgRef}
              className="storyboard-lines"
              viewBox={`${origin.x} ${origin.y} ${width} ${height}`}
            >
              <defs>
                <marker
                  id={arrowId}
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M0,0 L10,5 L0,10 z" className="storyboard-arrowhead" />
                </marker>
              </defs>
              {drawnLinks.map(({ link, route, endpointNames }) => {
                const blocks = link.requiresAbsentFlags.length > 0;
                const path = route.path;
                return (
                  <g key={link.id} data-link-id={link.id}>
                    <title>{endpointNames}</title>
                    <path
                      d={path}
                      className="storyboard-line-hit"
                      style={{ strokeWidth: Math.max(16, 8 / zoom) }}
                      onClick={() => setSelectedLinkId(link.id)}
                    />
                    <path
                      d={path}
                      className={`storyboard-line${blocks ? " storyboard-line--blocks" : ""}${(activeLinkId ?? selectedLinkId) === link.id ? " is-selected" : ""}`}
                      markerEnd={`url(#${arrowId})`}
                      style={zoom < 0.5 ? { strokeWidth: 1 / zoom } : undefined}
                    />
                  </g>
                );
              })}
              {draft && <path d={draft.path} className="storyboard-line storyboard-line--draft" />}
              {drawnLinks.map(({ link, label, point, box }) =>
                label ? (
                  <g
                    key={link.id}
                    data-storyboard-label-link={link.id}
                    transform={`translate(${point.x} ${point.y})`}
                  >
                    {box && <rect {...box} className="storyboard-line-label__background" />}
                    <text
                      className="storyboard-line-label"
                      textAnchor="middle"
                      dominantBaseline="central"
                      data-storyboard-label
                    >
                      {label}
                    </text>
                  </g>
                ) : null,
              )}
            </svg>

            {folded.map(renderSection)}
            {visibleScenes.map((card) => {
              const { scene, pos } = card;
              const chapterIndex = scene.chapterId
                ? chapters.findIndex((c) => c.id === scene.chapterId)
                : -1;
              const color = chapterIndex >= 0 ? chapterColor(chapterIndex) : undefined;
              return (
                <div
                  key={scene.id}
                  data-scene-id={scene.id}
                  className={`storyboard-card${selectedSceneId === scene.id || markedSceneIds?.has(scene.id) ? " is-selected" : ""}${activeConnectFrom && activeConnectFrom !== scene.id && hoverTarget === scene.id ? " is-drop-target" : ""}`}
                  style={{
                    boxSizing: "border-box",
                    left: pos.x - origin.x,
                    top: pos.y - origin.y,
                    width: card.width,
                    height: card.height,
                    ...(color ? { borderLeft: `4px solid ${color}` } : {}),
                  }}
                  onPointerDown={(event) => startDrag(event, card)}
                >
                  <div className="storyboard-card__name">
                    {scene.name.trim() || "Untitled scene"}
                  </div>
                  <div className="storyboard-card__meta">
                    {linksFromScene(links, scene.id).length} out ·{" "}
                    {linksToScene(links, scene.id).length} in
                  </div>
                  <select
                    className="storyboard-card__chapter"
                    value={scene.chapterId ?? ""}
                    onPointerDown={(event) => event.stopPropagation()}
                    onChange={(e) =>
                      onScenesChange(setSceneChapter(scenes, scene.id, e.target.value || undefined))
                    }
                  >
                    <option value="">No chapter</option>
                    {chapters.map((chapter, index) => (
                      <option key={chapter.id} value={chapter.id}>
                        {chapter.title.trim() || `Chapter ${index + 1}`}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="storyboard-card__port"
                    onPointerDown={(event) => startConnect(event, scene.id)}
                    aria-label={`Connect ${scene.name.trim() || "this scene"} to another scene`}
                  />
                </div>
              );
            })}

            {scenes.length === 0 && sections.length === 0 ? (
              <p className="inspector-empty">Add a scene on the Scenes tab first.</p>
            ) : null}
          </div>
        </div>
      </div>

      {selectedLink && !externalInspector ? (
        <div className="storyboard-inspector">
          <div className="storyboard-inspector__head">
            <span>
              {sceneLabel(selectedLink.fromSceneId)} &rarr; {sceneLabel(selectedLink.toSceneId)}
            </span>
            <button
              type="button"
              className="setup-text-btn"
              onClick={() => setSelectedLinkId(null)}
            >
              Close
            </button>
          </div>
          <label className="setup-field">
            <span>Label on the line</span>
            <input
              type="text"
              value={selectedLink.label}
              onChange={(e) => patchLink({ label: e.target.value })}
              placeholder="the player chooses"
            />
          </label>
          <label className="setup-field">
            <span>Requires flag</span>
            <input
              type="text"
              value={formatKeywordList(selectedLink.requiresFlags)}
              onChange={(e) => patchLink({ requiresFlags: parseKeywordList(e.target.value) })}
              placeholder="brooch_shown"
            />
          </label>
          <label className="setup-field">
            <span>Requires flag ABSENT</span>
            <input
              type="text"
              value={formatKeywordList(selectedLink.requiresAbsentFlags)}
              onChange={(e) => patchLink({ requiresAbsentFlags: parseKeywordList(e.target.value) })}
              placeholder="brooch_given"
            />
          </label>
          <label className="setup-field">
            <span>Sets flag when taken</span>
            <input
              type="text"
              value={formatKeywordList(selectedLink.setsFlags)}
              onChange={(e) => patchLink({ setsFlags: parseKeywordList(e.target.value) })}
              placeholder="emma_bjod_in"
            />
          </label>
          <button
            type="button"
            className="setup-text-btn"
            onClick={() => {
              onLinksChange(removeSceneLink(links, selectedLink.id));
              setSelectedLinkId(null);
            }}
          >
            Delete this connection
          </button>
        </div>
      ) : null}
    </div>
  );
}
