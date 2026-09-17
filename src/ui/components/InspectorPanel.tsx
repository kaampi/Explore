import { useState } from "react";
import { useEngine } from "../EngineStore";
import { Dot } from "./Dot";
import { getEffectiveActiveLayers } from "@layers/LayerEngine";
import type { StateEvent } from "@events/EventLog";
import { beatLocation, sideRoomStage, venueBuildingName } from "@state/playerDestination";
import { roomGate, roomIsOpened } from "@state/roomGate";
import { inspectPromptBudget } from "@context/promptBudget";
import { effectiveMaxReplyTokens } from "@state/StateSchema";
import { chatBeatFor, inspectEventsForBeat, parseLiveTurns } from "@session/chatBeat";

function lockDot(lock: string) {
  if (lock === "player_locked") return <Dot kind="locked" title="player_locked" />;
  if (lock === "system_locked") return <Dot kind="locked" title="system_locked" />;
  return null;
}

function PromptBudgetSection() {
  const { useSession } = useEngine();
  const session = useSession();
  const budget = inspectPromptBudget(session);
  const fill = Math.min(100, (budget.promptTokens / budget.targetTokens) * 100);
  const over = budget.overTarget;

  return (
    <div
      className="inspector-section"
      title="Heuristic size (~4 characters per token), same as the budget trimmer. Pass 1 is writing rules; chat is dialogue that still fits."
    >
      <p className="panel-heading">Prompt</p>
      <div className="inspector-row">
        <span className="inspector-row__key">this turn</span>
        <span className={`inspector-row__value${over ? " inspector-row__value--warn" : ""}`}>
          {budget.promptTokens} / {budget.targetTokens}
          {over ? " over target" : ""}
        </span>
      </div>
      <div className="prompt-meter" aria-hidden="true">
        <div
          className={`prompt-meter__fill${over ? " prompt-meter__fill--over" : ""}`}
          style={{ width: `${fill}%` }}
        />
      </div>
      <div className="inspector-row">
        <span className="inspector-row__key">ceiling</span>
        <span className="inspector-row__value">{budget.hardCeilingTokens}</span>
      </div>
      {budget.parts.map((part) => (
        <div className="inspector-row" key={part.id}>
          <span className="inspector-row__key">{part.label}</span>
          <span className="inspector-row__value">{part.tokens}</span>
        </div>
      ))}
      {budget.droppedBlocks > 0 ? (
        <div className="inspector-row">
          <span className="inspector-row__key">dropped</span>
          <span className="inspector-row__value inspector-row__value--warn">
            {budget.droppedBlocks} block{budget.droppedBlocks === 1 ? "" : "s"}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function eventChainDot(event: StateEvent): "ai" | "player" | "active" {
  const payload = event.payload as { source?: string } | undefined;
  if (payload?.source === "ai_approved_state_mutation" || payload?.source === "ai_inference") return "ai";
  if (payload?.source) return "player";
  return "active";
}

function summarizeEvent(event: StateEvent): string {
  const p = event.payload as Record<string, unknown>;
  switch (event.type) {
    case "state_mutation_committed":
      return `${p.path} → ${JSON.stringify(p.value)}`;
    case "lock_state_changed":
      return `${p.path} lock → ${p.newLock}`;
    case "conversation_turn_appended": {
      const content = String(p.content ?? "");
      return `${p.role}: "${content.slice(0, 60)}${content.length > 60 ? "…" : ""}"`;
    }
    case "layer_added": {
      const layer = p.layer as { type?: string; content?: string } | undefined;
      return `${layer?.type ?? "?"} layer added`;
    }
    case "layer_removed":
      return "layer rejected";
    case "layer_keywords_changed":
      return "layer keywords updated";
    case "layer_spent":
      return "once beat played";
    case "layers_compacted": {
      const removed = p.removed as unknown[] | undefined;
      const added = p.added as unknown[] | undefined;
      return `compacted ${removed?.length ?? 0} notes into ${added?.length ?? 0}`;
    }
    case "memory_entry_added": {
      const entry = p.entry as { content?: string } | undefined;
      return `[${p.memoryType}] ${String(entry?.content ?? "").slice(0, 50)}`;
    }
    case "turn_committed":
      return `${p.mutationsApplied} applied, ${p.mutationsRejected} rejected`;
    case "mutation_undone":
      return `reverted ${p.undoneEventType}`;
    case "runtime_model_changed":
      return `model → ${p.model}`;
    case "room_opened_changed":
      return p.opened ? `opened ${p.roomId}` : `closed ${p.roomId}`;
    case "party_member_changed":
      return p.withPlayer ? `with ${p.characterId}` : `left ${p.characterId}`;
    case "party_offer_changed":
      return `asked ${p.characterId}`;
    case "party_hold_changed":
      return p.hold ? `stay ${p.characterId}` : `come ${p.characterId}`;
    case "landmark_traveled":
      return `→ ${p.location ?? p.placeId}`;
    default:
      return event.type;
  }
}

export function InspectorPanel() {
  const { useSession, useEventLog, undo, inspectTurn, setInspectTurn, setRoomOpened } = useEngine();
  const session = useSession();
  const events = useEventLog();
  const liveTurns = parseLiveTurns(session.conversation);
  const beat = inspectTurn !== null ? chatBeatFor(liveTurns, inspectTurn) : null;
  const beatEvents = beat ? inspectEventsForBeat(events, beat) : [];
  const beatEventIds = new Set(beatEvents.map((event) => event.id));
  const committed = beatEvents.find((event) => event.type === "turn_committed");
  const committedPayload = committed?.payload as { mutationsApplied?: number; mutationsRejected?: number } | undefined;
  const chainEvents = beat ? [...beatEvents].reverse() : [...events].slice(-6).reverse();
  const [undoMessage, setUndoMessage] = useState<string | null>(null);

  function handleUndo() {
    const result = undo();
    setUndoMessage(result.ok ? null : (result.reason ?? "Nothing to undo."));
  }

  const here = beatLocation(session);
  const venue = venueBuildingName(session.scene?.location);
  const staged = Boolean(sideRoomStage(session));

  return (
    <div className="panel panel--right">
      <p className="panel-heading">Inspector</p>

      <PromptBudgetSection />

      <div className="inspector-section">
        <div className="inspector-row">
          <span className="inspector-row__key">state_version</span>
          <span className="inspector-row__value">{session.stateVersion}</span>
        </div>
        {here ? (
          <div className="inspector-row">
            <span className="inspector-row__key">here</span>
            <span className="inspector-row__value">{here}</span>
          </div>
        ) : null}
        {venue ? (
          <div className="inspector-row">
            <span className="inspector-row__key">venue</span>
            <span className="inspector-row__value">
              {staged ? venue : (session.scene?.location ?? venue)}
            </span>
          </div>
        ) : null}
        {session.player ? (
          <>
            <div className="inspector-row">
              <span className="inspector-row__key">you</span>
              <span className="inspector-row__value">{session.player.position.value}</span>
            </div>
            {(session.partyIds ?? []).length > 0 ? (
              <div className="inspector-row">
                <span className="inspector-row__key">party</span>
                <span className="inspector-row__value">
                  {(session.partyIds ?? [])
                    .map((id) => session.characters[id]?.name?.trim() || id)
                    .join(", ")}
                </span>
              </div>
            ) : null}
            {(session.partyPendingIds ?? []).length > 0 ? (
              <div className="inspector-row">
                <span className="inspector-row__key">prospects</span>
                <span className="inspector-row__value">
                  {(session.partyPendingIds ?? [])
                    .map((id) => session.characters[id]?.name?.trim() || id)
                    .join(", ")}
                </span>
              </div>
            ) : null}
            {(session.partyHoldIds ?? []).length > 0 ? (
              <div className="inspector-row">
                <span className="inspector-row__key">stay</span>
                <span className="inspector-row__value">
                  {(session.partyHoldIds ?? [])
                    .map((id) => session.characters[id]?.name?.trim() || id)
                    .join(", ")}
                </span>
              </div>
            ) : null}
            {(session.scene?.rooms ?? [])
              .filter((room) => roomGate(room) !== "open")
              .map((room) => {
                const opened = roomIsOpened(session, room.id);
                return (
                  <div className="inspector-row" key={room.id}>
                    <span className="inspector-row__key">{room.label.trim() || room.id}</span>
                    <span className="inspector-row__value">
                      <button
                        type="button"
                        className="setup-text-btn"
                        onClick={() => setRoomOpened(room.id, !opened)}
                      >
                        {opened ? "Opened" : roomGate(room) === "hidden" ? "Hidden" : "Closed"}
                      </button>
                    </span>
                  </div>
                );
              })}
            <div className="inspector-row">
              <span className="inspector-row__key">status</span>
              <span className="inspector-row__value">{session.player.status.value}</span>
            </div>
          </>
        ) : null}
        {session.story?.premise ? (
          <div className="inspector-row">
            <span className="inspector-row__key">story</span>
            <span className="inspector-row__value">{session.story.title.trim() || "ground story"}</span>
          </div>
        ) : null}
        {session.voice?.instruction ? (
          <div className="inspector-row">
            <span className="inspector-row__key">narrator</span>
            <span className="inspector-row__value">{session.voice.title.trim() || "voice"}</span>
          </div>
        ) : null}
        {session.ruleset ? (
          <div className="inspector-row">
            <span className="inspector-row__key">rule-set</span>
            <span className="inspector-row__value">{session.ruleset.name}</span>
          </div>
        ) : null}
        <div className="inspector-row">
          <span className="inspector-row__key">model</span>
          <span className="inspector-row__value">{session.runtime.model}</span>
        </div>
        <div className="inspector-row">
          <span className="inspector-row__key">reply cap</span>
          <span className="inspector-row__value">
            {effectiveMaxReplyTokens(session.runtime.maxReplyTokens)} tokens
          </span>
        </div>
        {(session.objects ?? []).length > 0 ? (
          <div className="inspector-row">
            <span className="inspector-row__key">objects</span>
            <span className="inspector-row__value">
              {(session.objects ?? []).map((object) => object.name).join(", ")}
            </span>
          </div>
        ) : null}
      </div>

      <div className="inspector-section">
        <p className="panel-heading">Characters</p>
        {Object.entries(session.characters).map(([id, character]) => (
          <div className="inspector-character" key={id}>
            <div className="inspector-character__name">{id}</div>
            <div className="inspector-row">
              <span className="inspector-row__key">position</span>
              <span className="inspector-row__value">{character.position.value}</span>
              {lockDot(character.position.lock)}
            </div>
            <div className="inspector-row">
              <span className="inspector-row__key">mood</span>
              <span className="inspector-row__value">{character.mood.value}</span>
              {lockDot(character.mood.lock)}
            </div>
            {character.name?.trim() ? (
              <div className="inspector-row">
                <span className="inspector-row__key">called</span>
                <span className="inspector-row__value">{character.name.trim()}</span>
              </div>
            ) : null}
            {character.middleName?.trim() ? (
              <div className="inspector-row">
                <span className="inspector-row__key">middle</span>
                <span className="inspector-row__value">{character.middleName.trim()}</span>
              </div>
            ) : null}
            {character.familyName?.trim() ? (
              <div className="inspector-row">
                <span className="inspector-row__key">surname</span>
                <span className="inspector-row__value">{character.familyName.trim()}</span>
              </div>
            ) : null}
            {character.pronoun && (
              <div className="inspector-row">
                <span className="inspector-row__key">pronoun</span>
                <span className="inspector-row__value">{character.pronoun}</span>
              </div>
            )}
            {typeof character.approximateAge === "number" ? (
              <div className="inspector-row">
                <span className="inspector-row__key">age</span>
                <span className="inspector-row__value">{character.approximateAge}</span>
              </div>
            ) : null}
            {character.appearance?.trim() ? (
              <div className="inspector-row">
                <span className="inspector-row__key">looks</span>
                <span className="inspector-row__value">{character.appearance.trim()}</span>
              </div>
            ) : null}
            {character.clothing?.value.trim() ? (
              <div className="inspector-row">
                <span className="inspector-row__key">wearing</span>
                <span className="inspector-row__value">{character.clothing.value.trim()}</span>
                {lockDot(character.clothing.lock)}
              </div>
            ) : null}
            {character.holding?.value.trim() ? (
              <div className="inspector-row">
                <span className="inspector-row__key">holding</span>
                <span className="inspector-row__value">{character.holding.value.trim()}</span>
                {lockDot(character.holding.lock)}
              </div>
            ) : null}
            {character.pose && (
              <div className="inspector-row">
                <span className="inspector-row__key">pose</span>
                <span className="inspector-row__value">{character.pose.value}</span>
                {lockDot(character.pose.lock)}
              </div>
            )}
            {character.stats &&
              Object.entries(character.stats).map(([statId, field]) => (
                <div className="inspector-row" key={statId}>
                  <span className="inspector-row__key">
                    {session.ruleset?.attributes.find((def) => def.id === statId)?.name ?? statId}
                  </span>
                  <span className="inspector-row__value">{String(field.value)}</span>
                  {lockDot(field.lock)}
                </div>
              ))}
          </div>
        ))}
      </div>

      <div className="inspector-section">
        <p className="panel-heading">Layers &amp; memory</p>
        <div className="inspector-row">
          <span className="inspector-row__key">layers in play</span>
          <span className="inspector-row__value">
            {getEffectiveActiveLayers(session).length} / {session.layers.filter((l) => l.active).length} on /{" "}
            {session.layers.length}
          </span>
        </div>
        <div className="inspector-row">
          <span className="inspector-row__key">memory</span>
          <span className="inspector-row__value">
            {session.memory.episodic.length + session.memory.semantic.length + session.memory.relational.length}{" "}
            entries
          </span>
        </div>
      </div>

      <div className="inspector-section">
        <div className="inspector-row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
          <p className="panel-heading" style={{ margin: 0 }}>
            {beat ? "This beat" : "Mutation chain"}
          </p>
          {beat ? (
            <button
              type="button"
              className="message__act"
              onClick={() => setInspectTurn(null)}
              title="Show the recent mutation chain"
            >
              all events
            </button>
          ) : (
            <button
              onClick={handleUndo}
              style={{
                background: "transparent",
                border: "1px solid var(--border)",
                color: "var(--text-dim)",
                borderRadius: 4,
                padding: "2px 8px",
                fontSize: "11px",
                fontFamily: "var(--font-mono)"
              }}
              title="Undo the most recent state change (§31)"
            >
              undo
            </button>
          )}
        </div>
        {beat ? (
          <>
            <div className="inspector-row">
              <span className="inspector-row__key">player</span>
              <span className="inspector-row__value">{beat.player.content.slice(0, 80)}</span>
            </div>
            <div className="inspector-row">
              <span className="inspector-row__key">Pass 1</span>
              <span className="inspector-row__value">{beat.reply.content.slice(0, 80)}</span>
            </div>
            {committedPayload ? (
              <div className="inspector-row">
                <span className="inspector-row__key">Pass 2</span>
                <span className="inspector-row__value">
                  {committedPayload.mutationsApplied ?? 0} applied
                  {committedPayload.mutationsRejected
                    ? `, ${committedPayload.mutationsRejected} rejected`
                    : ""}
                </span>
              </div>
            ) : null}
          </>
        ) : null}
        {undoMessage && !beat && (
          <p className="inspector-empty" style={{ color: "var(--accent-danger)", marginBottom: 6 }}>
            {undoMessage}
          </p>
        )}
        {chainEvents.length === 0 && (
          <p className="inspector-empty">
            {beat ? "No events for this beat." : "No events yet — say something to start."}
          </p>
        )}
        <div className="chain">
          {chainEvents.map((event) => (
            <div className={beatEventIds.has(event.id) && beat ? "chain-link chain-link--on" : "chain-link"} key={event.id}>
              <span
                className="chain-link__node"
                style={{
                  background: `var(--accent-${eventChainDot(event)})`
                }}
              />
              <div className="chain-link__body">
                <div className="chain-link__label">
                  turn {event.turn} · {event.type.replace(/_/g, " ")}
                </div>
                <div className="chain-link__detail">{summarizeEvent(event)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
