import type { CheckResult } from "../../checks/CheckEngine";
import { ActionCheckDialog } from "./ActionCheckDialog";
import { playerCheckStats } from "../../checks/playerCheck";
import type { IndexedDBRepository } from "@persistence/IndexedDBRepository";
import { captureIdea, type Idea } from "../../ideas/IdeaSchema";
import { IdeaEditor } from "../ideas/IdeaEditor";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useEngine } from "../EngineStore";
import { useAppearance } from "../themes/ThemeProvider";
import { Dot } from "./Dot";
import { MessageMenu } from "./MessageMenu";
import { Modal } from "./Modal";
import { BACKGROUND_PATTERNS } from "../themes/BackgroundSettings";
import { displayCharacterName, narratorLabel, primaryCharacter } from "@session/createSession";
import type { Session } from "@state/StateSchema";
import { formatGameTime } from "@state/gameClock";
import { RoutePlanner } from "./RoutePlanner";
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

import { useChatExpressions, type ChatExpression } from "../studio/useChatExpressions";
import { ChatMorphPortrait } from "../studio/ChatMorphPortrait";

const INTRO_FADE_MS = 520;

interface DisplayTurn {
  check?:CheckResult;
  turn: number;
  role: "player" | "character" | "system";
  speaker?: string;
  toldBy?: "narrator";
  content: string;
}

function speakerLabel(turn: DisplayTurn, session: Session, fallback: string): string {
  if (turn.role === "player") return session.player?.name?.trim() || "You";
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

function CardFace({ src, narrator, morph }: { src?: string | undefined; narrator?: boolean; morph?: ChatExpression | undefined }) {
  if (narrator) {
    return <span className="message__portrait message__portrait--narrator" aria-hidden="true" />;
  }
  if (morph) return <ChatMorphPortrait value={morph} fallback={src} className="message__portrait" />;
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

export function ChatPanel({ partyTarget = null, checkRequest = 0, gameTools = false, canSend = true, onCheckConnection, repo, conversationTitle, onIdeas }: { partyTarget?: HTMLElement | null; checkRequest?: number; gameTools?: boolean; canSend?: boolean; onCheckConnection?: () => void; repo?: IndexedDBRepository; conversationTitle?: string | undefined; onIdeas?: (() => void) | undefined }) {
  const {
    useSession,
    phase,
    streamingText,
    replyComplete,
    streamingCharacterId,
    streamingNarrator,
    lastError,
    sendMessage,
    removeJourneyStop,
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
  const [capturing, setCapturing] = useState(false);
  const [selectedTurns, setSelectedTurns] = useState<Set<number>>(new Set());
  const [idea, setIdea] = useState<Idea | null>(null);
  const [ideaNotice, setIdeaNotice] = useState("");
  const [ideaError, setIdeaError] = useState("");
  function capture(turns: Iterable<number>) {
    try { setIdea(captureIdea(session, turns, conversationTitle || "Your conversation")); setIdeaError(""); }
    catch (err) { setIdeaError(err instanceof Error ? err.message : "Could not capture this idea."); }
  }
  const speakingAs = primaryCharacter(session);
  const characterName = speakingAs ? speakingAs.name : "someone";
  const toldBy = narratorLabel(session) ?? characterName;
  const [draft, setDraft] = useState(() => { try { return sessionStorage.getItem(`sandboxai-draft:${session.id}`) ?? ""; } catch { return ""; } });
  useEffect(() => { try { if (draft) sessionStorage.setItem(`sandboxai-draft:${session.id}`, draft); else sessionStorage.removeItem(`sandboxai-draft:${session.id}`); } catch { /* Draft remains in the composer. */ } }, [draft, session.id]);
  const [queuedMessage, setQueuedMessage] = useState<string | null>(null);
  const [planningJourney, setPlanningJourney] = useState(false);
  const [timeAction, setTimeAction] = useState("wait");
  const [timeAmount, setTimeAmount] = useState("30");
  const [timeUnit, setTimeUnit] = useState("minutes");
  const queuedMessageRef = useRef<string | null>(null);
  const [editingTurn, setEditingTurn] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [messageMenu, setMessageMenu] = useState<{turn: DisplayTurn; x: number; y: number} | null>(null);
  const [copiedTurn, setCopiedTurn] = useState<number | null>(null);
  const [regenNote, setRegenNote] = useState("");
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputRowRef = useRef<HTMLDivElement>(null);

  const conversation = session.conversation as DisplayTurn[];
  const liveTurns = parseLiveTurns(session.conversation);
  const busy = phase === "streaming";
  const expressions = useChatExpressions(session, repo, busy || !canSend);
  const streamingPortrait = busy
    ? characterPortraitUrl(session, streamingCharacterId ?? speakingAs?.id)
    : undefined;
  const { library: { active: theme } } = useAppearance();
  const scenePictures = sceneBackdrop(session);
  const customPictures = theme.backgroundDataUrl ? [{ imageDataUrl: theme.backgroundDataUrl, thumbDataUrl: theme.backgroundDataUrl }] : [];
  const backdrop = { ...scenePictures,
    pictures: theme.backgroundMode === "scene" ? scenePictures.pictures : theme.backgroundMode === "custom" ? customPictures : [],
    picturePlay: theme.backgroundMode === "custom" ? "random" as const : scenePictures.picturePlay
  };
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
  const exits = session.journey ? [] : [...mapExits(session), ...mapLandmarkTravels(session, travelPlaces)];
  const slots = partySlots(session);
  const staying = new Set(holdingPartyIds(session));
  const later = waitlistSlots(session);
  const youPortrait = portraitSrc(session.player?.portraitDataUrl);
  const youLabel = session.player?.name?.trim() || "You";

  useEffect(() => {
    if (busy || editingTurn !== null || fork || !canSend) return;
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
  }, [busy, editingTurn, fork, canSend]);

  useEffect(() => {
    if (busy || !canSend || fork || phase === "error" || !queuedMessageRef.current) return;
    const text = queuedMessageRef.current;
    queuedMessageRef.current = null;
    setQueuedMessage(null);
    void sendMessage(text);
  }, [busy, canSend, fork, phase, sendMessage]);

  async function handleSend() {
    const text = draft.trim();
    if (!text || (busy && !replyComplete) || queuedMessageRef.current || fork || !canSend) return;
    if (busy) {
      queuedMessageRef.current = text;
      setQueuedMessage(text);
      setDraft("");
      inputRef.current?.focus();
      return;
    }
    setDraft("");
    inputRef.current?.focus();
    await sendMessage(text);
    inputRef.current?.focus();
  }

  async function handleWhatNow(label: string, room: string) {
    if (busy || editingTurn !== null || !canSend) return;
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
    if (busy || editingTurn !== null || fork || !canSend) return;
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
    if (busy || !canRegenerate || !canSend) return;
    const note = regenNote.trim();
    setRegenNote("");
    setRegenerateOpen(false);
    await regenerate(note || undefined);
  }

  async function handleReplay(turn: DisplayTurn) {
    if (busy || !canSend) return;
    const turns = parseLiveTurns(session.conversation);
    const beat = chatBeatFor(turns, turn.turn);
    if (!beat) return;
    if (beatHasLaterChat(turns, beat)) {
      const ok = confirm("Replay this beat? Chat after this line is undone.");
      if (!ok) return;
    }
    await replay(turn.turn);
  }

  const partyContent = (
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
                    {expressions[slot.id] ? (<ChatMorphPortrait key={`${session.id}:${slot.id}`} value={expressions[slot.id]!} fallback={src} className="chat-party__face" />) : src ? (<img className="chat-party__face" src={src} alt="" />
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
                  {expressions[slot.id] ? (<ChatMorphPortrait key={`${session.id}:${slot.id}`} value={expressions[slot.id]!} fallback={src} className="chat-party__face" />) : src ? (<img className="chat-party__face" src={src} alt="" />
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
  );
  const [checkingAction,setCheckingAction]=useState(false);
  useEffect(() => { if (checkRequest > 0) setCheckingAction(true); }, [checkRequest]);
  return (
    <div className={repo ? "chat-panel chat-panel--ideas" : "chat-panel"}>
      {messageMenu && !busy && <MessageMenu x={messageMenu.x} y={messageMenu.y} onClose={() => setMessageMenu(null)} items={[
        ...(repo ? [{label:"Save as idea", action:() => capture([messageMenu.turn.turn])}] : []),
        {label:copiedTurn === messageMenu.turn.turn ? "Copied" : "Copy", action:() => { void copyTurn(messageMenu.turn); }},
        {label:"Inspect", action:() => setInspectTurn(inspectTurn === messageMenu.turn.turn ? null : messageMenu.turn.turn)},
        {label:"Edit", action:() => startEdit(messageMenu.turn)},
        ...(canSend && canRegenerate && messageMenu.turn.role === "character" && messageMenu.turn.turn === conversation.at(-1)?.turn ? [{label:"Regenerate…", action:() => setRegenerateOpen(true)}] : []),
        ...(canSend && !(messageMenu.turn.role === "character" && messageMenu.turn.turn === conversation.at(-1)?.turn) && chatBeatFor(liveTurns, messageMenu.turn.turn) ? [{label:"Replay", action:() => { void handleReplay(messageMenu.turn); }}] : [])
      ]} />}
      {regenerateOpen && <Modal title="Rewrite this reply" onClose={() => setRegenerateOpen(false)}>
        <p>Generate a new version of the latest reply. You can add instructions below.</p>
        <label>Optional instructions<textarea autoFocus value={regenNote} onChange={event => setRegenNote(event.target.value)} placeholder="What would you like to change?" /></label>
        <div className="sb-dialog__actions"><button type="button" onClick={() => setRegenerateOpen(false)}>Cancel</button><button type="button" disabled={busy || !canSend || !canRegenerate} onClick={() => void handleRegenerate()}>Regenerate</button></div>
      </Modal>}
      {checkingAction&&<ActionCheckDialog session={session} onClose={()=>setCheckingAction(false)} onContinue={result=>{setCheckingAction(false);void sendMessage(result.action,{check:result});}}/>}
      {!gameTools&&playerCheckStats(session).length>0&&<button type="button" disabled={busy||!canSend||!!session.journey} onClick={()=>setCheckingAction(true)}>Take a chance · Roll dice</button>}
      {planningJourney && repo && <RoutePlanner repo={repo} session={session} onClose={()=>setPlanningJourney(false)} onStart={(destinationId,name,plan)=>{
        setPlanningJourney(false);void sendMessage(`I go to ${name}.`,{travelPlaceId:destinationId,plan});
      }}/>}
      {session.gameClock && <div className="chat-world-status" aria-label="Current place and game time">
        <span>{session.scene?.location ?? "Current scene"}</span>
        {repo&&!session.journey&&<button type="button" className="sb-link" disabled={busy||!canSend||Boolean(queuedMessage)} onClick={()=>setPlanningJourney(true)}>Plan journey</button>}
        <time title={session.gameClock.lastAdvance ? `${session.gameClock.lastAdvance.reason}: +${session.gameClock.lastAdvance.minutes} minutes` : "Fictional time; independent of real time"}>{formatGameTime(session.gameClock.totalMinutes)}</time>
      </div>}
      {repo && <div className="sb-idea-capture">
        {capturing ? <><span>{selectedTurns.size} selected</span><button type="button" disabled={busy || !selectedTurns.size} onClick={() => capture(selectedTurns)}>Save selection as idea</button><button type="button" onClick={() => { setCapturing(false); setSelectedTurns(new Set()); }}>Cancel selection</button></> : <button type="button" disabled={busy || !conversation.length} onClick={() => { setCapturing(true); setIdeaNotice(""); }}>Capture ideas</button>}
        {onIdeas && <button type="button" disabled={busy} onClick={onIdeas}>My ideas</button>}
        {ideaNotice && <span role="status">{ideaNotice}</span>}{ideaError && <span role="alert">{ideaError}</span>}
      </div>}
      {idea && repo && <IdeaEditor idea={idea} repo={repo} onClose={() => setIdea(null)} onSaved={() => { setIdea(null); setCapturing(false); setSelectedTurns(new Set()); setIdeaNotice("Idea saved in My ideas."); }} />}

      <div className={backdrop.pictures.length > 0 ? "chat-stage chat-stage--backdrop" : "chat-stage"}>
        {theme.backgroundMode === "pattern" && <div className="chat-pattern-backdrop" aria-hidden="true" style={{backgroundImage:`url(${BACKGROUND_PATTERNS.find(item=>item.id===theme.backgroundPattern)?.url})`,opacity:theme.patternStrength}} />}
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
        {showLog && conversation.map((turn) => {
          const isEditing = editingTurn === turn.turn;
          const narratorCard =
            turn.role === "character" &&
            (turn.toldBy === "narrator" || Boolean(narratorLabel(session)));
          const portrait = turn.role === "player" ? youPortrait :
            narratorCard || turn.role !== "character"
              ? undefined
              : characterPortraitUrl(session, turn.speaker);
          const expression = expressions[turn.speaker || speakingAs?.id || ""];
          const morph = !narratorCard && turn.role === "character" && expression?.turn === turn.turn ? expression : undefined;
          const showFace = narratorCard || Boolean(portrait) || Boolean(morph);

          return (
            <div
              key={turn.turn}
              onContextMenu={event => { if (busy || isEditing) return; event.preventDefault(); setMessageMenu({turn, x:event.clientX, y:event.clientY}); }}
              className={`message ${turn.role === "player" ? "message--player" : "message--character"}${
                inspectTurn === turn.turn ? " message--inspect" : ""
              }`}
            >
              <span className="message__attribution">
                {repo && capturing && <label className="sb-idea-select"><input type="checkbox" aria-label={`Select message ${turn.turn} for idea`} checked={selectedTurns.has(turn.turn)} disabled={busy} onChange={event => { setSelectedTurns(current => { const next = new Set(current); if (event.target.checked) next.add(turn.turn); else next.delete(turn.turn); return next; }); }} />Select</label>}
                <Dot kind={turn.role === "player" ? "player" : "ai"} />
                {speakerLabel(turn, session, characterName)}
                {!isEditing && !busy && <button type="button" className="message__act message__menu-trigger" aria-label={`Message actions for ${speakerLabel(turn, session, characterName)}`} aria-haspopup="menu" onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); setMessageMenu({turn, x: rect.left, y: rect.bottom}); }}>⋯</button>}              </span>

              {isEditing ? (
                <div className={showFace ? "message__bubble message__bubble--portrait" : "message__bubble"}>
                  <CardFace src={portrait} narrator={narratorCard} morph={morph} />
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
                  <div className={showFace ? "message__bubble message__bubble--portrait" : "message__bubble"}>
                  <CardFace src={portrait} narrator={narratorCard} morph={morph} />
                  <div className="message__content"><MessageBody text={turn.content} />{turn.check&&<div className="action-check__hint" role="note">d100 · {turn.check.attributeName}: {turn.check.roll} / {turn.check.target} · {turn.check.success?'Success':'Setback'}</div>}</div>
                </div>
              )}

            </div>
          );
        })}

        {showLog && busy && streamingText && (
          <div className={`message message--character${replyComplete ? "" : " message--streaming"}`}>
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

      <div className="chat-composer">
        {session.journey && <section className="chat-journey" aria-label="Journey progress">
          <div><strong>Journey to {session.journey.destination.location}</strong><span>Stage {session.journey.completedStages} complete · {Math.ceil(session.journey.remainingTravelMinutes / 60)} travel hours remaining</span></div>
          <progress aria-label="Journey progress" max={session.journey.totalTravelMinutes} value={session.journey.totalTravelMinutes - session.journey.remainingTravelMinutes} />
          <p>{session.journey.currentStop && <strong>{session.journey.currentStop}. </strong>}{session.journey.phase === "overnight" ? "An overnight stop is due. Rest here, play out the evening, or choose to push on." : session.journey.phase === "pause" ? "You are at your planned stop. Explore or pause here, then continue when ready." : "You have rested. Continue when you are ready; talking here does not move the journey forward."}</p>
          <div className="chat-journey__actions">
            {session.journey.phase === "overnight" && <button type="button" disabled={busy || !canSend} onClick={() => void sendMessage("I rest until morning.")}>Rest until morning · 08:00</button>}
            <button type="button" disabled={busy || !canSend || session.journey.phase === "overnight"} onClick={() => void sendMessage("I continue the journey.")}>{session.journey.phase === "pause" ? "Skip pause and continue" : "Continue journey"}</button>
            {session.journey.phase === "overnight" && <button type="button" className="sb-link" disabled={busy || !canSend} onClick={() => void sendMessage("I continue the journey without rest.")}>Continue without rest</button>}
          </div>
          {session.journey.plan&&session.journey.plan.stops.length>session.journey.completedStages&&<details className="chat-time-controls"><summary>Upcoming stops</summary><ul>{session.journey.plan.stops.slice(session.journey.completedStages).map((stop,i)=><li key={`${i}-${stop.fraction}`}>{stop.label} · {stop.kind==="overnight"?"Overnight":"Pause"} <button type="button" className="sb-link" disabled={busy} aria-label={`Remove stop: ${stop.label}`} onClick={()=>removeJourneyStop(session.journey!.completedStages+i)}>Remove</button></li>)}</ul></details>}
        </section>}
        {session.gameClock && !fork && <details className="chat-time-controls">
          <summary>Pass time</summary>
          <p>Choose how much fictional time passes here. Conversation length and real time do not move the clock.</p>
          <div className="setup-row">
            <label>Action<select aria-label="Time action" value={timeAction} onChange={e => {setTimeAction(e.target.value); if(e.target.value === "sleep"){setTimeAmount("8");setTimeUnit("hours");}}}><option value="wait">Wait</option><option value="rest">Rest</option><option value="sleep">Sleep</option></select></label>
            <label>Duration<input aria-label="Time duration" type="number" min="1" step="1" value={timeAmount} onChange={e => setTimeAmount(e.target.value)} /></label>
            <label>Unit<select aria-label="Time unit" value={timeUnit} onChange={e => setTimeUnit(e.target.value)}><option value="minutes">Minutes</option><option value="hours">Hours</option></select></label>
            <button type="button" disabled={busy || !canSend || !Number.isSafeInteger(Number(timeAmount)) || Number(timeAmount) <= 0} onClick={() => void sendMessage(`I ${timeAction} for ${timeAmount} ${timeUnit}.`)}>Pass time</button>
            <button type="button" disabled={busy || !canSend} onClick={() => void sendMessage(`I ${timeAction} until morning.`)}>Until morning · 08:00</button>
          </div>
        </details>}
        {busy && replyComplete && <p role="status" className="sb-chat-connection-hint">Updating the world… You can send your next message.</p>}
        {queuedMessage && <p role="status" className="sb-chat-connection-hint">Queued: {queuedMessage} <button type="button" className="sb-link" onClick={() => { queuedMessageRef.current = null; setQueuedMessage(null); setDraft(current => current || queuedMessage); }}>Cancel</button></p>}
        {!canSend && <p className="sb-chat-connection-hint" id="sb-chat-connection-hint">You can write a draft while AI connects. {onCheckConnection && <button type="button" className="sb-link" onClick={onCheckConnection}>Set up AI</button>}</p>}
        {lastError && phase === "error" && <div className="chat-error">{lastError} {onCheckConnection && <button type="button" className="sb-link" onClick={onCheckConnection}>AI connection</button>}</div>}
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
                    disabled={busy || !canSend || (!dest && !stay)}
                    onClick={() => void handleWhatNow(choice.label, choice.room)}
                  >
                    {choice.label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
        {gameTools ? (partyTarget ? createPortal(partyContent, partyTarget) : null) : partyContent}
        {exits.length > 0 ? (
          <div className="chat-exits">
            <p className="chat-exits__label">Go</p>
            <div className="chat-exits__chips">
              {exits.map((exit) => (
                <button
                  key={exit.id}
                  type="button"
                  className={exit.enabled ? "chat-exits__chip" : "chat-exits__chip chat-exits__chip--shut"}
                  disabled={busy || !canSend || fork || editingTurn !== null || !exit.enabled}
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
        <input
          aria-label="Your message"
          aria-describedby={!canSend ? "sb-chat-connection-hint" : undefined}
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
        <button onClick={() => void handleSend()} disabled={(busy && !replyComplete) || Boolean(queuedMessage) || !canSend || !draft.trim()}>
          {queuedMessage ? "Queued" : "Send"}
        </button>
        </>
        )}
        </div>
        )}
      </div>
    </div>
  );
}
