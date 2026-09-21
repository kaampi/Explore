import { useRef, useState } from "react";
import type { CampaignScene, StoryboardLink, StoryboardPosition } from "@library/LibrarySchema";
import { formatKeywordList, parseKeywordList } from "@layers/keywords";
import { linksFromScene, linksToScene, removeSceneLink, setScenePosition, upsertSceneLink } from "@library/storyboardLinks";

/**
 * Storyboard — a free-canvas map of how this campaign's scenes connect.
 * Drag a card to move it; drag from its port to another card to link
 * them; click a line to edit what it requires and sets. Purely
 * authoring-time (§ project_spec) — Start still plays one scene at a
 * time; this is the map, not a live auto-chain between them.
 */

const CARD_W = 200;
const CARD_H = 96;

function defaultPosition(index: number): StoryboardPosition {
  const perRow = 4;
  const col = index % perRow;
  const row = Math.floor(index / perRow);
  return { x: 40 + col * 240, y: 40 + row * 150 };
}

function outPort(pos: StoryboardPosition): StoryboardPosition {
  return { x: pos.x + CARD_W, y: pos.y + CARD_H / 2 };
}

function inPort(pos: StoryboardPosition): StoryboardPosition {
  return { x: pos.x, y: pos.y + CARD_H / 2 };
}

function bezierPath(a: StoryboardPosition, b: StoryboardPosition): string {
  const dx = Math.max(40, Math.abs(b.x - a.x) / 2);
  return `M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`;
}

export function StoryboardCanvas({
  scenes,
  links,
  onScenesChange,
  onLinksChange
}: {
  scenes: CampaignScene[];
  links: StoryboardLink[];
  onScenesChange: (scenes: CampaignScene[]) => void;
  onLinksChange: (links: StoryboardLink[]) => void;
}) {
  const boardRef = useRef<HTMLDivElement>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const [dragId, setDragId] = useState<string | null>(null);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [draftPoint, setDraftPoint] = useState<StoryboardPosition | null>(null);
  const [hoverTarget, setHoverTarget] = useState<string | null>(null);
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);

  const positioned = scenes.map((scene, index) => ({
    scene,
    pos: scene.position ?? defaultPosition(index)
  }));
  const byId = new Map(positioned.map((item) => [item.scene.id, item]));
  const sceneLabel = (id: string) => byId.get(id)?.scene.name.trim() || "Untitled scene";

  function pointFromEvent(event: { clientX: number; clientY: number }): StoryboardPosition {
    const rect = boardRef.current?.getBoundingClientRect();
    const board = boardRef.current;
    if (!rect || !board) return { x: 0, y: 0 };
    return {
      x: event.clientX - rect.left + board.scrollLeft,
      y: event.clientY - rect.top + board.scrollTop
    };
  }

  function startDrag(event: React.PointerEvent, sceneId: string) {
    const item = byId.get(sceneId);
    if (!item) return;
    const p = pointFromEvent(event);
    dragOffset.current = { x: p.x - item.pos.x, y: p.y - item.pos.y };
    setDragId(sceneId);
    setSelectedLinkId(null);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function startConnect(event: React.PointerEvent, sceneId: string) {
    event.stopPropagation();
    setConnectFrom(sceneId);
    setDraftPoint(pointFromEvent(event));
    setSelectedLinkId(null);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function onBoardPointerMove(event: React.PointerEvent) {
    const p = pointFromEvent(event);
    if (dragId) {
      const next = { x: Math.max(0, p.x - dragOffset.current.x), y: Math.max(0, p.y - dragOffset.current.y) };
      onScenesChange(setScenePosition(scenes, dragId, next));
      return;
    }
    if (connectFrom) {
      setDraftPoint(p);
      const el = document.elementFromPoint(event.clientX, event.clientY);
      const cardEl = el instanceof Element ? el.closest<HTMLElement>("[data-scene-id]") : null;
      setHoverTarget(cardEl?.dataset.sceneId ?? null);
    }
  }

  function endConnect() {
    if (connectFrom && hoverTarget && hoverTarget !== connectFrom) {
      const existing = links.find((l) => l.fromSceneId === connectFrom && l.toSceneId === hoverTarget);
      if (existing) {
        setSelectedLinkId(existing.id);
      } else {
        const created: StoryboardLink = {
          id: crypto.randomUUID(),
          fromSceneId: connectFrom,
          toSceneId: hoverTarget,
          requiresFlags: [],
          requiresAbsentFlags: [],
          setsFlags: [],
          label: ""
        };
        onLinksChange(upsertSceneLink(links, created));
        setSelectedLinkId(created.id);
      }
    }
    setConnectFrom(null);
    setDraftPoint(null);
    setHoverTarget(null);
  }

  function onBoardPointerUp() {
    setDragId(null);
    if (connectFrom) endConnect();
  }

  const selectedLink = links.find((item) => item.id === selectedLinkId) ?? null;

  function patchLink(patch: Partial<StoryboardLink>) {
    if (!selectedLink) return;
    onLinksChange(upsertSceneLink(links, { ...selectedLink, ...patch }));
  }

  return (
    <div className="storyboard">
      <p className="form-section__lede">
        Drag a card to move it. Drag from the dot on its right edge onto another card to connect them. Click a line
        to set what it requires or sets.
      </p>
      <div
        ref={boardRef}
        className="storyboard-board"
        onPointerMove={onBoardPointerMove}
        onPointerUp={onBoardPointerUp}
        onPointerLeave={() => {
          if (!dragId) setConnectFrom(null);
        }}
      >
        <svg className="storyboard-lines">
          <defs>
            <marker id="storyboard-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" className="storyboard-arrowhead" />
            </marker>
          </defs>
          {links.map((link) => {
            const from = byId.get(link.fromSceneId);
            const to = byId.get(link.toSceneId);
            if (!from || !to) return null;
            const a = outPort(from.pos);
            const b = inPort(to.pos);
            const blocks = link.requiresAbsentFlags.length > 0;
            const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
            return (
              <g key={link.id}>
                <path d={bezierPath(a, b)} className="storyboard-line-hit" onClick={() => setSelectedLinkId(link.id)} />
                <path
                  d={bezierPath(a, b)}
                  className={`storyboard-line${blocks ? " storyboard-line--blocks" : ""}${selectedLinkId === link.id ? " is-selected" : ""}`}
                  markerEnd="url(#storyboard-arrow)"
                />
                {link.label.trim() ? (
                  <text x={mid.x} y={mid.y - 8} className="storyboard-line-label" textAnchor="middle">
                    {link.label}
                  </text>
                ) : null}
              </g>
            );
          })}
          {connectFrom && draftPoint && byId.get(connectFrom) ? (
            <path
              d={bezierPath(outPort(byId.get(connectFrom)!.pos), draftPoint)}
              className="storyboard-line storyboard-line--draft"
            />
          ) : null}
        </svg>

        {positioned.map(({ scene, pos }) => (
          <div
            key={scene.id}
            data-scene-id={scene.id}
            className={`storyboard-card${connectFrom && hoverTarget === scene.id ? " is-drop-target" : ""}`}
            style={{ left: pos.x, top: pos.y, width: CARD_W, height: CARD_H }}
            onPointerDown={(event) => startDrag(event, scene.id)}
          >
            <div className="storyboard-card__name">{scene.name.trim() || "Untitled scene"}</div>
            <div className="storyboard-card__meta">
              {linksFromScene(links, scene.id).length} out · {linksToScene(links, scene.id).length} in
            </div>
            <button
              type="button"
              className="storyboard-card__port"
              onPointerDown={(event) => startConnect(event, scene.id)}
              aria-label={`Connect ${scene.name.trim() || "this scene"} to another scene`}
            />
          </div>
        ))}

        {scenes.length === 0 ? <p className="inspector-empty">Add a scene on the Scenes tab first.</p> : null}
      </div>

      {selectedLink ? (
        <div className="storyboard-inspector">
          <div className="storyboard-inspector__head">
            <span>
              {sceneLabel(selectedLink.fromSceneId)} &rarr; {sceneLabel(selectedLink.toSceneId)}
            </span>
            <button type="button" className="setup-text-btn" onClick={() => setSelectedLinkId(null)}>
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
