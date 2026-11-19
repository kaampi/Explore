import { useArrivalResidents } from "./useArrivalResidents";
import { useTranslate } from "../i18n/LanguageProvider";
import { PlayerInventory } from "./PlayerInventory";
import { adventureCompleted, knownThings, sceneWays } from "../../game/AdventureEngine";
import { SceneColumn } from "../play/SceneColumn";
import { CombatStage } from "../combat/CombatStage";
import { projectFighters } from "../combat/fighters";
import { useCombatPlayback } from "../combat/useCombatPlayback";
import { CombatPlaybackOverlay } from "../combat/CombatPlaybackOverlay";
import { lineOfSight } from "../../game/geometry";
import { CombatLog, encounterCombatLog } from "./CombatLog";
import { HealthMeter } from "./HealthMeter";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useEngine } from "../EngineStore";
import { Menu } from "./Menu";
import type { EncounterAction, EncounterRequest } from "../../game/EncounterSchema";
import { actionBlock, attackTarget, hostile } from "../../game/EncounterEngine";
import { groupedCommands, suggestedCommands } from "../../game/catalog";
import type { DoPlan, SayPlan } from "../../session/encounterAI";
import { actionLabel } from "../../game/narration";
import { greetingTarget, present, spokenInteraction } from "../../game/dialogue";
import { encounterRules } from "../../game/rules";
import { ActionSaveError } from "../../persistence/ActionSaveError";
import { PlayFrame } from "../play/PlayFrame";
import { StoryLog } from "../play/StoryLog";
import { WhatDoYouDo } from "../play/WhatDoYouDo";
import { PlayArrival, PlayNoticeStrip, useNotices } from "../play/PlayNotices";
import { PeopleColumn } from "../play/PeopleColumn";
import { personCard } from "../play/personCard";
import { useStoredFlag } from "../play/useStoredFlag";
import { storyRows } from "../play/storyRows";
import { storySegments } from "../../game/AdventureEngine";

const REPLY_FAILED =
  "The reply could not be written, so the scene shows the plain result. Nothing else changed.";

/** A line to remember from a reply: its words on one line, cut at a sentence end if it is long. */
export function noteFrom(text: string): string {
  const line = text.replace(/\s+/g, " ").trim();
  if (line.length <= 300) return line;
  const cut = line.slice(0, 300);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return end > 80 ? cut.slice(0, end + 1) : cut.slice(0, 299).trimEnd() + "…";
}

export function EncounterPanel({
  mapView,
  backdrop,
  onSaveIdea,
  onJournal,
}: {
  mapView?: ReactNode;
  backdrop?: ReactNode;
  /** Keeps a line of the story as an idea. Without it the lines have no "Save idea". */
  onSaveIdea?: (turns: number[]) => void;
  /** Opens the journal. */
  onJournal?: () => void;
}) {
  const t = useTranslate();
  const {
      useSession,
      executeEncounterAction,
      planEncounterSay,
      planEncounterDo,
      wordEncounterTurn,
      saveEncounter: saveSession,
      setCombatArtwork,
      transitionAdventure,
      rememberPlaceNote,
      populateResidents,
    } = useEngine(),
    session = useSession(),
    game = session.encounter!;
  const { definition: d, state: s } = game,
    player = s.actors[d.playerId]!;
  const [selectedTarget, setSelectedTarget] = useState("");
  const [say, setSay] = useState(""),
    [text, setText] = useState(""),
    [pending, setPending] = useState<EncounterRequest | null>(null);
  const [waiting, setWaiting] = useState<"interpreting" | "writing" | null>(null),
    [draftReply, setDraftReply] = useState("");
  const [notice, setNotice] = useState(""),
    [saving, setSaving] = useState(false),
    [saveFailed, setSaveFailed] = useState(false);
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    text: string;
    free?: boolean;
    sceneId?: string;
  } | null>(null);
  const [earlier, setEarlier] = useState(false);
  const [mode, setMode] = useState<"say" | "do">("say");
  const [talkingTo, setTalkingTo] = useState("");
  const marks = useNotices(session);
  const [collapsedLeft, setCollapsedLeft] = useStoredFlag("explore-play-left-collapsed");
  const [collapsedRight, setCollapsedRight] = useStoredFlag("explore-play-right-collapsed");
  const abortRef = useRef<AbortController | null>(null);
  const lock = useRef(false),
    current = useRef(s);
  current.current = s;
  const ended = s.phase === "defeated" || s.phase === "complete";
  // Who the player talks to: the person they chose, if still here; otherwise the first one here.
  const people = Object.values(s.actors)
    .filter((actor) => present(d, s, actor))
    .map((actor) => ({ id: actor.id, name: actor.name }));
  const addressee = people.find((person) => person.id === talkingTo)?.id ?? people[0]?.id ?? "";
  const playback = useCombatPlayback(session, () => {
    const now = current.current;
    if (now.phase === "combat" && now.actors[d.playerId]!.actionsLeft === 0 && !saveFailed) {
      void run({ kind: "end-turn" });
      return true;
    }
    return false;
  });
  const arena = s.phase === "combat" || playback.combat;
  const turnLabel =
    playback.actorId === d.playerId
      ? "Your turn"
      : `${s.actors[playback.actorId]?.name ?? playback.actorId}’s turn`;
  const busy = saving || waiting !== null || playback.active || saveFailed;
  // A world that invents residents gives an empty place its people once, on arrival.
  const arrivedAt = session.adventure?.currentSceneId;
  const [populating, setPopulating] = useState(false);
  useArrivalResidents(
    arrivedAt,
    !!session.adventure?.openWorld?.generateResidents &&
      !!arrivedAt &&
      !session.adventure.settled.includes(arrivedAt),
    (signal) => {
      setPopulating(true);
      return populateResidents(signal).finally(() => setPopulating(false));
    },
  );
  useEffect(() => {
    if (!busy && s.phase === "combat" && player.actionsLeft === 0)
      void run(
        { kind: "end-turn" },
        {
          id: `auto-pass:${s.revision}`,
          expectedRevision: s.revision,
          expectedSceneId: d.id,
          action: { kind: "end-turn" },
        },
      );
  }, [busy, s.revision, s.phase, player.actionsLeft]);
  async function addAiWording(
    action: EncounterAction,
    actionId: string,
    reply?: { addresseeId: string; text: string },
  ) {
    const job = reply
      ? ({
          kind: "free-reply",
          actionId,
          sceneId: d.id,
          addresseeId: reply.addresseeId,
          text: reply.text,
        } as const)
      : action.kind === "move" || action.kind === "interact"
        ? ({ kind: "narrated-outcome", actionId, sceneId: d.id } as const)
        : undefined;
    if (!job) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setWaiting("writing");
    try {
      const result = await wordEncounterTurn(job, {
        signal: controller.signal,
        onDelta: setDraftReply,
      });
      if (result === "failed" && job.kind === "free-reply") setNotice(REPLY_FAILED);
    } catch {
      if (job.kind === "free-reply") setNotice(REPLY_FAILED);
    } finally {
      abortRef.current = null;
      setDraftReply("");
      setWaiting(null);
    }
  }
  async function run(
    action: EncounterAction,
    request?: EncounterRequest,
    reply?: { addresseeId: string; text: string },
  ) {
    if (lock.current || busy || ended) return;
    const reason = actionBlock(d, s, action);
    if (reason) {
      setNotice(reason);
      return;
    }
    if (action.kind === "attack") setSelectedTarget(action.targetId);
    lock.current = true;
    setSaving(true);
    setNotice("");
    setPending(null);
    const revision = s.revision;
    const settled = request ?? {
      id: crypto.randomUUID(),
      expectedRevision: revision,
      action,
      expectedSceneId: d.id,
    };
    try {
      await executeEncounterAction(settled);
      setSay("");
      setText("");
      if (
        action.kind === "say" &&
        !action.interactionId &&
        !reply &&
        !spokenInteraction(d, s, action.text) &&
        !greetingTarget(d, s, action.text)
      )
        setNotice(
          "This scene has no prepared reply for that topic yet. Try one of the conversation choices in the panel.",
        );
      await addAiWording(action, settled.id, reply);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not complete the action.");
      if (error instanceof ActionSaveError || current.current.revision > revision)
        setSaveFailed(true);
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }
  /** Decide what a spoken line means. The engine, not the AI, then settles it. */
  async function submitSay() {
    const line = say.trim();
    if (!line || busy || ended || lock.current) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setNotice("");
    setWaiting("interpreting");
    const plan = await planEncounterSay(line, controller.signal, addressee || undefined)
      .catch((): SayPlan => ({ kind: "plain" }))
      .finally(() => {
        abortRef.current = null;
        setWaiting(null);
      });
    if (plan.kind === "cancelled") return;
    if (plan.kind === "review") {
      setPending({
        id: crypto.randomUUID(),
        expectedRevision: s.revision,
        expectedSceneId: d.id,
        action: plan.action,
      });
      return;
    }
    if (plan.kind === "matched")
      return void run({ kind: "say", text: line, interactionId: plan.interactionId });
    if (plan.kind === "free")
      return void run({ kind: "say", text: line }, undefined, {
        addresseeId: plan.addresseeId,
        text: line,
      });
    void run({ kind: "say", text: line });
  }
  /** Turn a described action into a proposal the player reviews. */
  async function submitDo() {
    if (!text.trim() || busy || ended || lock.current) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setNotice("");
    setWaiting("interpreting");
    const plan = await planEncounterDo(text, controller.signal)
      .catch((): DoPlan => ({ kind: "none" }))
      .finally(() => {
        abortRef.current = null;
        setWaiting(null);
      });
    if (plan.kind === "cancelled") return;
    if (plan.kind === "review") {
      setPending({
        id: crypto.randomUUID(),
        expectedRevision: s.revision,
        expectedSceneId: d.id,
        action: plan.action,
      });
      return;
    }
    setNotice(
      "Please make the target and action clearer, or choose an action from the panel. The scene is unchanged.",
    );
  }
  function chance(action: EncounterAction) {
    if (action.kind === "attack")
      return attackTarget(d, s, d.playerId, action.targetId, action.weaponId);
    if (action.kind === "interaction") {
      const check = d.interactions.find((i) => i.id === action.interactionId)?.check;
      if (check) return encounterRules(d).skillTarget(player, check.stat, check.modifier, d);
    }
  }
  function choose(action: EncounterAction) {
    if (busy || ended) return;
    if (action.kind === "attack" && s.actors[action.targetId]?.disposition === "surrendered") {
      setNotice("");
      setPending({
        id: crypto.randomUUID(),
        expectedRevision: s.revision,
        expectedSceneId: d.id,
        action,
      });
      return;
    }
    void run(action);
  }
  async function go(linkId: string) {
    if (lock.current || busy) return;
    lock.current = true;
    setSaving(true);
    try {
      await transitionAdventure({
        id: crypto.randomUUID(),
        linkId,
        expectedStateVersion: session.stateVersion,
      });
      setPending(null);
      setText("");
      setSay("");
      setNotice("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not continue.");
      if (error instanceof ActionSaveError) setSaveFailed(true);
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }
  const preview = pending ? actionBlock(d, s, pending.action) : undefined;
  const fighters = projectFighters(session, playback.actors),
    targetId =
      playback.active && playback.actorId !== d.playerId
        ? playback.actorId
        : (fighters.opponents.find((actor) => actor.id === selectedTarget)?.id ??
          fighters.opponents[0]?.id ??
          "");
  const target = s.actors[targetId];
  const fightRange =
    target?.position === player.position
      ? "Within melee reach"
      : target && lineOfSight(d, s, player.position, target.position)
        ? "Out of melee reach"
        : "Line of sight blocked · Out of melee reach";
  const fightActions = player.weapons.map((weaponId) => {
    const action: EncounterAction = { kind: "attack", targetId, weaponId };
    return {
      id: weaponId,
      label: d.weapons.find((weapon) => weapon.id === weaponId)?.name ?? weaponId,
      blocked: actionBlock(d, s, action),
      run: () => choose(action),
    };
  });
  const pendingInteraction =
    pending?.action.kind === "interaction"
      ? d.interactions.find(
          (i) =>
            i.id ===
            (pending.action as Extract<EncounterAction, { kind: "interaction" }>).interactionId,
        )
      : undefined;
  const sceneName =
    session.adventure?.scenes.find((scene) => scene.id === session.adventure!.currentSceneId)
      ?.name ?? d.title;
  const statuses = Object.fromEntries(
    people.flatMap((person) => {
      const actor = s.actors[person.id]!;
      const word =
        actor.hp === 0
          ? "Incapacitated"
          : actor.disposition !== "active"
            ? actor.disposition
            : actor.defending
              ? "Defending"
              : hostile(d, player, actor)
                ? "Hostile"
                : "";
      return word ? [[person.id, word] as const] : [];
    }),
  );
  const leftColumn = (
    <PeopleColumn
      sceneName={sceneName}
      backdrop={backdrop}
      cards={people.map((person) => personCard(session, person.id, person.name))}
      statuses={statuses}
      selectedId={addressee}
      onSelect={setTalkingTo}
      collapsed={collapsedLeft}
      onToggleCollapsed={() => setCollapsedLeft(!collapsedLeft)}
    />
  );
  return (
    <PlayFrame
      collapsed={collapsedLeft}
      rightCollapsed={collapsedRight}
      left={leftColumn}
      center={
        <div className={`chat-panel gate-scene-panel${arena ? " gate-scene-panel--combat" : ""}`}>
          {menu && (
            <Menu
              label="Message actions"
              at={{ x: menu.x, y: menu.y }}
              onClose={() => setMenu(null)}
              items={[
                ...(menu.free && session.adventure
                  ? [
                      {
                        label: t("rememberThis"),
                        onSelect: () => {
                          rememberPlaceNote(noteFrom(menu.text), menu.sceneId)
                            .then(() =>
                              setNotice(
                                t("rememberedAt", {
                                  place:
                                    session.adventure?.scenes.find(
                                      (scene) =>
                                        scene.id ===
                                        (menu.sceneId ?? session.adventure!.currentSceneId),
                                    )?.name ?? "this place",
                                }),
                              ),
                            )
                            .catch((error: unknown) =>
                              setNotice(
                                error instanceof Error ? error.message : "Could not remember this.",
                              ),
                            );
                        },
                      },
                    ]
                  : []),
                {
                  label: "Copy",
                  onSelect: () => {
                    void navigator.clipboard?.writeText(menu.text);
                  },
                },
              ]}
            />
          )}
          <div className="gate-scene-status">
            <span>
              {fighters.player.position} ·{" "}
              {arena
                ? `Combat · round ${playback.round ?? s.round}`
                : ended
                  ? "Encounter complete"
                  : "Exploration"}
            </span>
            <span>
              {playback.active
                ? turnLabel
                : s.phase === "combat"
                  ? `Actions ${player.actionsLeft} · Moves ${player.movesLeft}`
                  : d.title}
            </span>
            {s.phase === "combat" && (
              <span>
                Order: {s.initiative!.order.map((id) => s.actors[id]!.name).join(" → ")} ·{" "}
                {turnLabel}
              </span>
            )}
          </div>
          <div className={`chat-stage${arena ? " chat-stage--combat" : ""}`}>
            <PlayArrival arrival={marks.arrival} />
            {arena && (
              <CombatStage
                player={fighters.player}
                opponents={fighters.opponents}
                selectedId={targetId}
                onSelect={setSelectedTarget}
                activeId={playback.actorId}
                turnLabel={turnLabel}
                round={playback.round ?? s.round}
                range={fightRange}
                actions={fightActions}
                busy={busy}
                onArtwork={setCombatArtwork}
              />
            )}
            <StoryLog
              rows={storyRows(session, { earlier })}
              {...(draftReply ? { draftReply } : {})}
              hidden={arena}
              showTime={!!session.adventure?.links.some((link) => link.minutes !== undefined)}
              hasEarlier={storySegments(session).length > 1}
              earlier={earlier}
              onToggleEarlier={() => setEarlier(!earlier)}
              canRemember={!!session.adventure}
              onSaveIdea={onSaveIdea ? (turn) => onSaveIdea([turn]) : undefined}
              onRemember={(row) =>
                void rememberPlaceNote(noteFrom(row.text), row.sceneId)
                  .then(() =>
                    setNotice(
                      t("rememberedAt", {
                        place:
                          session.adventure?.scenes.find(
                            (scene) =>
                              scene.id === (row.sceneId ?? session.adventure!.currentSceneId),
                          )?.name ?? "this place",
                      }),
                    ),
                  )
                  .catch((error: unknown) =>
                    setNotice(error instanceof Error ? error.message : "Could not remember this."),
                  )
              }
              onRowMenu={(event, row) => {
                event.preventDefault();
                setMenu({
                  x: event.clientX,
                  y: event.clientY,
                  text: row.kind === "do" ? row.label : row.text,
                  free: row.kind === "person" && row.improvised,
                  ...(row.kind === "person" && row.sceneId ? { sceneId: row.sceneId } : {}),
                });
              }}
            />
          </div>
          <div className="gate-scene-composer">
            <PlayNoticeStrip notices={marks.notices} />
            {populating && (
              <p role="status" className="playable-hint">
                {t("lookingAround")}
              </p>
            )}
            {notice && <p role="status">{notice}</p>}
            {saveFailed && (
              <p role="alert">
                The action is resolved but saving failed. Keep this page open.{" "}
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await saveSession();
                      setSaveFailed(false);
                      setNotice("Saved.");
                    } catch {
                      setNotice("Saving is still unavailable.");
                    }
                  }}
                >
                  {t("epRetrySave")}
                </button>
              </p>
            )}
            {pending && (
              <div className="gate-action-preview" role="region" aria-label="Review your attempt">
                <strong>{actionLabel(d, s, pending.action)}</strong>
                {chance(pending.action) !== undefined && (
                  <span>{chance(pending.action)}% chance · d100</span>
                )}
                {pendingInteraction && <p>{pendingInteraction.description}</p>}
                {pending.action.kind === "attack" &&
                  s.actors[pending.action.targetId]?.disposition === "surrendered" && (
                    <p>{t("epThisOpponentHasSurrendered")}</p>
                  )}
                {preview && <p role="status">{preview}</p>}
                <div>
                  <button
                    type="button"
                    disabled={busy || !!preview}
                    onClick={() => void run(pending.action, pending)}
                  >
                    {t("epAttempt")}
                  </button>
                  <button type="button" onClick={() => setPending(null)}>
                    {t("epChange")}
                  </button>
                </div>
              </div>
            )}
            {!ended || playback.active ? (
              <WhatDoYouDo
                game={game}
                suggestions={suggestedCommands(game, addressee || undefined)}
                groups={groupedCommands(game)}
                mode={mode}
                onMode={setMode}
                say={say}
                text={text}
                onSay={setSay}
                onText={(value) => {
                  setText(value);
                  setPending(null);
                }}
                busy={busy}
                waiting={waiting}
                onCancelWaiting={() => abortRef.current?.abort()}
                onChoose={(command) => choose(command.action)}
                onSubmitSay={() => void submitSay()}
                onSubmitDo={() => void submitDo()}
                titleFor={(command) =>
                  command.blocked ??
                  (command.action.kind === "interaction"
                    ? d.interactions.find(
                        (i) => i.id === (command.action as { interactionId: string }).interactionId,
                      )?.description
                    : undefined)
                }
              />
            ) : (
              <p>{t("epThisEncounterHasEnded")}</p>
            )}
          </div>
          <CombatPlaybackOverlay
            playback={playback}
            names={Object.fromEntries(Object.values(s.actors).map((a) => [a.id, a.name]))}
            statNames={Object.fromEntries(d.rules.attributes.map((a) => [a.id, a.name]))}
          />
        </div>
      }
      right={
        <SceneColumn
          game={game}
          ways={sceneWays(session)}
          known={knownThings(session)}
          busy={busy || s.phase === "combat" || ended}
          mapView={mapView}
          onGo={go}
          onAction={choose}
          header={
            session.adventure ? (
              <div className="play-scene__adventure">
                <small>{session.adventure.goal ? t("yourAdventureEyebrow") : t("yourWorld")}</small>
                <h3>{session.adventure.title}</h3>
                {session.adventure.goal && (
                  <div
                    className={`adventure-goal${adventureCompleted(session) ? " adventure-goal--complete" : ""}`}
                    role="status"
                    aria-label="Adventure objective"
                  >
                    <strong>
                      {adventureCompleted(session) ? "✓ Adventure completed" : "Your objective"}
                    </strong>
                    <p>{session.adventure.goal.title}</p>
                    {adventureCompleted(session) && <small>{t("epYourProgressIsSaved")}</small>}
                  </div>
                )}
                {!sceneWays(session).length && !adventureCompleted(session) && (
                  <p>{t("epExploreThisSceneTo")}</p>
                )}
              </div>
            ) : undefined
          }
          character={
            <>
              <HealthMeter name={player.name} value={fighters.player.hp} max={player.maxHp} />
              <PlayerInventory session={session} busy={busy} onAction={choose} announce={false} />
            </>
          }
          footer={
            !playback.active ? (
              <CombatLog entries={encounterCombatLog(game)} active={s.phase === "combat"} />
            ) : undefined
          }
          {...(onJournal ? { onJournal } : {})}
          collapsed={collapsedRight}
          onToggleCollapsed={() => setCollapsedRight(!collapsedRight)}
        />
      }
    />
  );
}
