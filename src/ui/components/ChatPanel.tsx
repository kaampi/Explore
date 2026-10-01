import { ActionCheckDialog } from "./ActionCheckDialog";
import { checkOutcomeLabel, type CheckResult } from "../../checks/CheckEngine";
import { useEffect, useRef, useState } from "react";
import { useEngine } from "../EngineStore";
import { Dot } from "./Dot";
import { displayCharacterName, narratorLabel, primaryCharacter } from "@session/createSession";
import type { Session } from "@state/StateSchema";
import { beatLocation, isWhatNowStay, resolveWhatNowRoom, WHAT_NOW_STAY } from "@state/playerDestination";
import { mapExits } from "@state/roomExits";
import { mapLandmarkTravels } from "@state/landmarkTravel";
import { acceptedPartyIds, canAcceptParty, holdingPartyIds, partySlots, PARTY_SLOTS, waitlistSlots } from "@state/party";
import { whatNowBlocksComposer } from "@state/whatNowGate";
import { hereIntro } from "@state/placeIntro";
import { sceneBackdrop } from "@state/sceneBackdrop";
import { sceneAudio } from "@state/sceneAudio";
import { ChatBackdrop } from "./ChatBackdrop";
import { PlaceAudio } from "./PlaceAudio";
import { portraitSrc } from "../studio/portrait";
import { beatHasLaterChat, chatBeatFor, parseLiveTurns } from "@session/chatBeat";

const INTRO_FADE_MS = 520;

interface DisplayTurn {
  turn: number;
  role: "player" | "character" | "system";
  speaker?: string;
  toldBy?: "narrator";
  content: string;
  check?: CheckResult;
}

function speakerLabel(turn: DisplayTurn, session: Session, fallback: string): string {
  if (turn.role === "player") return "you";
  if (turn.role === "character" && turn.toldBy === "narrator") {
    return narratorLabel(session) ?? "Narrator";
  }
  if (turn.role === "character") {
    const narrator = narratorLabel(session);
    if (narrator) return narrator;
  }
  if (!turn.speaker) return fallback;
  const stored = session.characters[turn.speaker];
  return stored
    ? displayCharacterName(turn.speaker, stored.name, stored.familyName, stored.middleName)
    : displayCharacterName(turn.speaker);
}

function CardFace({ src, narrator }: { src?: string; narrator?: boolean }) {
  if (narrator) {
    return <span className="message__portrait message__portrait--narrator" aria-hidden="true" />;
  }
  if (!src) return null;
  return <img className="message__portrait" src={src} alt="" />;
}

function characterPortraitUrl(session: Session, speakerId?: string): string | undefined {
  const id = speakerId?.trim() || Object.keys(session.characters)[0];
  if (!id) return undefined;
  const url = session.characters[id]?.portraitDataUrl;
  return portraitSrc(url);
}

function introParagraphs(body: string): string[] {
  return body
    .split(/\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function useTypedIntro(body: string, running: boolean) {
  const full = introParagraphs(body).join("\n");
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!running) return;
    setCount(0);
    if (!full) return;
    let i = 0;
    let timer = 0;
    const step = () => {
      i += 1;
      setCount(i);
      if (i >= full.length) return;
      const pause = full[i] === "\n" || full[i - 1] === "\n" ? 760 : 36;
      timer = window.setTimeout(step, pause);
    };
    timer = window.setTimeout(step, 400);
    return () => window.clearTimeout(timer);
  }, [running, full]);

  const typed = full.slice(0, count);
  const parts = typed.length > 0 ? typed.split("\n") : [];
  return {
    parts,
    typing: running && count < full.length
  };
}

function MessageBody({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  if (blocks.length <= 1) {
    return <span className="message__body">{text}</span>;
  }
  return (
    <span className="message__body">
      {blocks.map((block, index) => (
        <p key={index}>{block}</p>
      ))}
    </span>
  );
}

export function ChatPanel() {
  const {
    useSession,
    phase,
    streamingText,
    streamingCharacterId,
    streamingNarrator,
    lastError,
    sendMessage,
    regenerate,
    replay,
    inspectTurn,
    setInspectTurn,
    canRegenerate,
    editMessage,
    acceptParty,
    leaveParty,
    holdParty,
    followParty,
    travelPlaces
  } = useEngine();
  const session = useSession();
  const speakingAs = primaryCharacter(session);
  const characterName = speakingAs ? speakingAs.name : "someone";
  const toldBy = narratorLabel(session) ?? characterName;
  const [draft, setDraft] = useState("");
  const [checkOpen, setCheckOpen] = useState(false);
  const [editingTurn, setEditingTurn] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [copiedTurn, setCopiedTurn] = useState<number | null>(null);
  const [regenNote, setRegenNote] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputRowRef = useRef<HTMLDivElement>(null);

  const conversation = session.conversation as DisplayTurn[];
  const liveTurns = parseLiveTurns(session.conversation);
  const busy = phase === "streaming";
  const streamingPortrait = busy
    ? characterPortraitUrl(session, streamingCharacterId ?? speakingAs?.id)
    : undefined;
  const backdrop = sceneBackdrop(session);
  const sound = sceneAudio(session);
  const intro = hereIntro(session);
  const playStarted = conversation.length > 0 || busy;
  const [introPhase, setIntroPhase] = useState<"in" | "out" | "done">(() =>
    conversation.length > 0 || !hereIntro(session) ? "done" : "in"
  );

  useEffect(() => {
    if (!playStarted || introPhase === "done") return;
    if (introPhase === "in") setIntroPhase("out");
  }, [playStarted, introPhase]);

  useEffect(() => {
    if (introPhase !== "out") return;
    const id = window.setTimeout(() => setIntroPhase("done"), INTRO_FADE_MS);
    return () => window.clearTimeout(id);
  }, [introPhase]);

  const showIntro = Boolean(intro) && introPhase !== "done";
  const showLog = introPhase === "done" || !intro;
  const typedIntro = useTypedIntro(intro?.body ?? "", showIntro && introPhase === "in");

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [conversation.length, streamingText]);

  const fork = whatNowBlocksComposer(session);
  const exits = [...mapExits(session), ...mapLandmarkTravels(session, travelPlaces)];
  const slots = partySlots(session);
  const staying = new Set(holdingPartyIds(session));
  const later = waitlistSlots(session);
  const youPortrait = portraitSrc(session.player?.portraitDataUrl);
  const youLabel = session.player?.name?.trim() || "You";

  useEffect(() => {
    if (checkOpen || busy || editingTurn !== null || fork) return;
    const input = inputRef.current;
    if (!input) return;
    const active = document.activeElement;
    if (active === input) return;
    if (
      active instanceof HTMLElement &&
      active !== document.body &&
      !inputRowRef.current?.contains(active)
    ) {
      return;
    }
    input.focus();
  }, [busy, editingTurn, fork, checkOpen]);

  async function handleSend() {
    const text = draft.trim();
    if (!text || busy || fork) return;
    setDraft("");
    inputRef.current?.focus();
    await sendMessage(text);
    inputRef.current?.focus();
  }

  async function handleWhatNow(label: string, room: string) {
    if (busy || editingTurn !== null) return;
    if (isWhatNowStay(room)) {
      await sendMessage(label, { goTo: WHAT_NOW_STAY });
      return;
    }
    const dest = resolveWhatNowRoom(session, room);
    if (!dest) return;
    await sendMessage(label, { goTo: dest });
  }

  async function handleGo(
    label: string,
    dest: string,
    kind: "landmark" | "room" | "travel"
  ) {
    if (checkOpen || busy || editingTurn !== null || fork) return;
    if (kind === "travel") {
      await sendMessage(`I walk to ${label}.`, { travelPlaceId: dest });
      return;
    }
    await sendMessage(`I walk to ${label}.`, { goTo: dest });
  }

  function startEdit(turn: DisplayTurn) {
    setEditingTurn(turn.turn);
    setEditDraft(turn.content);
    setEditError(null);
  }

  function cancelEdit() {
    setEditingTurn(null);
    setEditDraft("");
    setEditError(null);
  }

  function saveEdit() {
    if (editingTurn === null) return;
    const trimmed = editDraft.trim();
    if (!trimmed) return;
    const result = editMessage(editingTurn, trimmed);
    if (result.ok) {
      cancelEdit();
    } else {
      setEditError(result.reason ?? "Could not save this edit.");
    }
  }

  async function copyTurn(turn: DisplayTurn) {
    try {
      await navigator.clipboard.writeText(turn.content);
      setCopiedTurn(turn.turn);
      window.setTimeout(() => {
        setCopiedTurn((id) => (id === turn.turn ? null : id));
      }, 1400);
    } catch {
      setCopiedTurn(null);
    }
  }

  async function handleRegenerate() {
    if (busy || !canRegenerate) return;
    const note = regenNote.trim();
    setRegenNote("");
    await regenerate(note || undefined);
  }

  async function handleReplay(turn: DisplayTurn) {
    if (busy) return;
    const turns = parseLiveTurns(session.conversation);
    const beat = chatBeatFor(turns, turn.turn);
    if (!beat) return;
    if (beatHasLaterChat(turns, beat)) {
      const ok = confirm("Replay this beat? Chat after this line is undone.");
      if (!ok) return;
    }
    await replay(turn.turn);
  }

  return (
    <div className="chat-panel">
      <div className={backdrop.pictures.length > 0 ? "chat-stage chat-stage--backdrop" : "chat-stage"}>
        {backdrop.pictures.length > 0 ? (
          <ChatBackdrop
            key={beatLocation(session) ?? "venue"}
            pictures={backdrop.pictures}
            play={backdrop.picturePlay}
            locationKey={beatLocation(session) ?? "venue"}
          />
        ) : null}
        {showIntro ? (
          <div className={introPhase === "out" ? "chat-stage__intro chat-stage__intro--out" : "chat-stage__intro"}>
            <div className="chat-stage__intro-copy">
              {typedIntro.parts.length === 0 && typedIntro.typing ? (
                <p>
                  <span className="chat-stage__intro-caret" />
                </p>
              ) : (
                typedIntro.parts.map((part, index) => (
                  <p key={index}>
                    {part}
                    {typedIntro.typing && index === typedIntro.parts.length - 1 ? (
                      <span className="chat-stage__intro-caret" />
                    ) : null}
                  </p>
                ))
              )}
            </div>
          </div>
        ) : null}
        <div className="chat-log" ref={logRef}>
        {showLog && conversation.map((turn, index) => {
          const isLastCharacterTurn = turn.role === "character" && index === conversation.length - 1 && !busy;
          const isEditing = editingTurn === turn.turn;
          const narratorCard =
            turn.role === "character" &&
            (turn.toldBy === "narrator" || Boolean(narratorLabel(session)));
          const portrait =
            narratorCard || turn.role !== "character"
              ? undefined
              : characterPortraitUrl(session, turn.speaker);
          const showFace = narratorCard || Boolean(portrait);

          return (
            <div
              key={turn.turn}
              className={`message ${turn.role === "player" ? "message--player" : "message--character"}${
                inspectTurn === turn.turn ? " message--inspect" : ""
              }`}
            >
              <span className="message__attribution">
                <Dot kind={turn.role === "player" ? "player" : "ai"} />
                {speakerLabel(turn, session, characterName)}
                {turn.check && <span className="message__check" title={`${turn.check.attributeName}: ${turn.check.value}; ${turn.check.difficulty}`}>
                  d100 · {turn.check.roll}/{turn.check.target} · {checkOutcomeLabel(turn.check)}
                </span>}
                {!isEditing && !busy && (
                  <>
                    <button
                      type="button"
                      className="message__act"
                      onClick={() => void copyTurn(turn)}
                      title="Copy this message"
                    >
                      {copiedTurn === turn.turn ? "copied" : "copy"}
                    </button>
                    <button
                      type="button"
                      className="message__act"
                      onClick={() => setInspectTurn(inspectTurn === turn.turn ? null : turn.turn)}
                      title="Inspect this beat in the Inspector"
                    >
                      inspect
                    </button>
                    <button
                      type="button"
                      className="message__act"
                      onClick={() => startEdit(turn)}
                      title="Edit this message (manual correction, not a rewind)"
                    >
                      edit
                    </button>
                  </>
                )}
              </span>

              {isEditing ? (
                <div className={showFace ? "message__bubble message__bubble--portrait" : "message__bubble"}>
                  <CardFace src={portrait} narrator={narratorCard} />
                  <div className="message__body">
                    <textarea
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      style={{
                        width: "100%",
                        minHeight: 60,
                        background: "var(--panel-raised)",
                        border: "1px solid var(--accent-active)",
                        borderRadius: 8,
                        color: "var(--text)",
                        fontFamily: "var(--font-dialogue)",
                        fontSize: "18px",
                        padding: "8px 10px",
                        resize: "vertical"
                      }}
                      autoFocus
                    />
                    {editError && (
                      <p style={{ color: "var(--accent-danger)", fontSize: "11.5px", margin: "4px 0" }}>{editError}</p>
                    )}
                    <div style={{ display: "flex", gap: 6, marginTop: 4, justifyContent: "flex-end" }}>
                      <button
                        onClick={cancelEdit}
                        style={{
                          background: "transparent",
                          border: "1px solid var(--border)",
                          color: "var(--text-dim)",
                          borderRadius: 4,
                          padding: "3px 10px",
                          fontSize: "11.5px"
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={saveEdit}
                        style={{
                          background: "var(--accent-active)",
                          border: "none",
                          color: "#0e2622",
                          borderRadius: 4,
                          padding: "3px 10px",
                          fontSize: "11.5px",
                          fontWeight: 600
                        }}
                      >
                        Save
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                  <span className={showFace ? "message__bubble message__bubble--portrait" : "message__bubble"}>
                  <CardFace src={portrait} narrator={narratorCard} />
                  <MessageBody text={turn.content} />
                </span>
              )}

              {isLastCharacterTurn && canRegenerate && !isEditing && (
                <div className="message__regen">
                  <input
                    className="message__regen-note"
                    value={regenNote}
                    onChange={(e) => setRegenNote(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void handleRegenerate();
                      }
                    }}
                    placeholder="Optional note — the door is locked…"
                    aria-label="Note for regenerate"
                    disabled={busy}
                  />
                  <button
                    type="button"
                    className="message__act"
                    onClick={() => void handleRegenerate()}
                    title="Regenerate this reply — undoes it and re-runs Pass 1 with the same message"
                  >
                    regenerate
                  </button>
                </div>
              )}
              {!isLastCharacterTurn && !isEditing && !busy && chatBeatFor(liveTurns, turn.turn) ? (
                <div className="message__regen">
                  <button
                    type="button"
                    className="message__act"
                    onClick={() => void handleReplay(turn)}
                    title="Replay this beat — later chat is undone, then Pass 1 runs again"
                  >
                    replay
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}

        {showLog && busy && streamingText && (
          <div className="message message--character message--streaming">
            <span className="message__attribution">
              <Dot kind="ai" />
              {streamingNarrator || narratorLabel(session)
                ? narratorLabel(session) ?? "Narrator"
                : toldBy}
            </span>
            <span className={
              streamingNarrator || narratorLabel(session) || streamingPortrait
                ? "message__bubble message__bubble--portrait"
                : "message__bubble"
            }>
              <CardFace
                src={streamingNarrator || narratorLabel(session) ? undefined : streamingPortrait}
                narrator={streamingNarrator || Boolean(narratorLabel(session))}
              />
              <MessageBody text={streamingText} />
            </span>
          </div>
        )}
        </div>
      </div>

      {checkOpen && <ActionCheckDialog session={session} initialAttempt={draft} onClose={() => setCheckOpen(false)} onContinue={(check) => {
        setCheckOpen(false);
        setDraft("");
        void sendMessage(check.action, { check });
      }} />}
      <div className="chat-composer">
        {lastError && phase === "error" && <div className="chat-error">{lastError}</div>}
        {fork && editingTurn === null ? (
          <div className="chat-what-now">
            <p className="chat-what-now__label">Pre-defined Replies</p>
            <div className="chat-what-now__chips">
              {(session.whatNow ?? []).map((choice) => {
                const dest = resolveWhatNowRoom(session, choice.room);
                const stay = isWhatNowStay(choice.room);
                return (
                  <button
                    key={choice.id}
                    type="button"
                    className="chat-what-now__chip"
                    disabled={busy || (!dest && !stay)}
                    onClick={() => void handleWhatNow(choice.label, choice.room)}
                  >
                    {choice.label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
        <div className="chat-exits chat-party">
          <div className="chat-party__row">
            <div className="chat-party__group">
              <p className="chat-exits__label">My Party</p>
              <div className="chat-party__faces">
            <div className="chat-party__you" title={youLabel}>
              {youPortrait ? (
                <img className="chat-party__face" src={youPortrait} alt="" />
              ) : (
                <span className="chat-party__face chat-party__face--empty">{youLabel.slice(0, 1)}</span>
              )}
            </div>
            {slots.map((slot, index) => {
              if (slot.kind === "empty") {
                return <div key={`empty-${index}`} className="chat-party__slot chat-party__slot--empty" />;
              }
              const src = portraitSrc(slot.portrait);
              const held = staying.has(slot.id);
              return (
                <div key={slot.id} className="chat-party__member">
                  <button
                    type="button"
                    className={`chat-party__slot chat-party__slot--on${held ? " chat-party__slot--hold" : ""}`}
                    disabled={busy || editingTurn !== null}
                    title={`${slot.name} is in the party — tap to drop them to Prospects`}
                    onClick={() => leaveParty(slot.id)}
                  >
                    {src ? (
                      <img className="chat-party__face" src={src} alt="" />
                    ) : (
                      <span className="chat-party__face chat-party__face--empty">{slot.name.slice(0, 1)}</span>
                    )}
                  </button>
                  <button
                    type="button"
                    className="chat-party__stay"
                    disabled={busy || editingTurn !== null}
                    title={held ? `${slot.name} stays here — tap Come to follow again` : `Stay: ${slot.name} keeps the party slot and does not follow`}
                    onClick={() => (held ? followParty(slot.id) : holdParty(slot.id))}
                  >
                    {held ? "Come" : "Stay"}
                  </button>
                </div>
              );
            })}
              </div>
            </div>
            <div className="chat-party__later">
              <p className="chat-exits__label">Prospects</p>
              <div className="chat-party__faces">
            {later.map((slot, index) => {
              if (slot.kind === "empty") {
                return (
                  <div
                    key={`later-empty-${index}`}
                    className="chat-party__slot chat-party__slot--empty chat-party__slot--later"
                    title="Someone who asked to join can wait here"
                  />
                );
              }
              const src = portraitSrc(slot.portrait);
              const canRecruit = canAcceptParty(session, slot.id);
              return (
                <button
                  key={slot.id}
                  type="button"
                  className="chat-party__slot chat-party__slot--pending chat-party__slot--later"
                  disabled={busy || editingTurn !== null || !canRecruit}
                  title={
                    canRecruit
                      ? `${slot.name} — tap to recruit`
                      : acceptedPartyIds(session).length >= PARTY_SLOTS
                        ? `${slot.name} is here — the party is full. Someone has to leave first.`
                        : `${slot.name} — go back to this place to recruit.`
                  }
                  onClick={() => acceptParty(slot.id)}
                >
                  {src ? (
                    <img className="chat-party__face" src={src} alt="" />
                  ) : (
                    <span className="chat-party__face chat-party__face--empty">{slot.name.slice(0, 1)}</span>
                  )}
                </button>
              );
            })}
              </div>
            </div>
          </div>
        </div>
        {exits.length > 0 ? (
          <div className="chat-exits">
            <p className="chat-exits__label">Go</p>
            <div className="chat-exits__chips">
              {exits.map((exit) => (
                <button
                  key={exit.id}
                  type="button"
                  className={exit.enabled ? "chat-exits__chip" : "chat-exits__chip chat-exits__chip--shut"}
                  disabled={busy || fork || editingTurn !== null || !exit.enabled}
                  title={
                    exit.kind === "travel"
                      ? "Leave this landmark"
                      : exit.enabled
                        ? undefined
                        : "Closed until this room is opened"
                  }
                  onClick={() => void handleGo(exit.label, exit.dest, exit.kind)}
                >
                  {exit.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {fork && sound.clips.length === 0 ? null : (
        <div className="chat-input-row" ref={inputRowRef}>
        {sound.clips.length > 0 ? (
          <PlaceAudio
            key={beatLocation(session) ?? "venue"}
            clips={sound.clips}
            play={sound.audioPlay}
            locationKey={beatLocation(session) ?? "venue"}
          />
        ) : null}
        {fork ? null : (
        <>
        <button type="button" className="chat-check-button" disabled={busy || editingTurn !== null} onClick={() => setCheckOpen(true)} title="Attempt an action using your rule-set stats">Check</button>
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleSend();
          }}
          placeholder={
            busy
              ? "Write the next line…"
              : narratorLabel(session)
                ? "What do you do?"
                : `Say something to ${characterName}…`
          }
        />
        <button onClick={() => void handleSend()} disabled={busy || !draft.trim()}>
          {busy ? "…" : "Send"}
        </button>
        </>
        )}
        </div>
        )}
      </div>
    </div>
  );
}
