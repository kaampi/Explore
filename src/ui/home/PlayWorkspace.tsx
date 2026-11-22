import { useTranslate } from "../i18n/LanguageProvider";
import { PlayerInventory } from "../components/PlayerInventory";
import { ChatBackdrop } from "../components/ChatBackdrop";
import { sceneBackdrop } from "../../state/sceneBackdrop";
import { EncounterPanel } from "../components/EncounterPanel";
import { LegacyGatePanel } from "../components/LegacyGatePanel";
import type { IndexedDBRepository } from "@persistence/IndexedDBRepository";
import { useEffect, useState } from "react";
import type { Session } from "@state/StateSchema";
import { primaryCharacter } from "@session/createSession";
import { useEngine } from "../EngineStore";
import { CastPanel } from "../components/CastPanel";
import { ChatPanel } from "../components/ChatPanel";
import { InspectorPanel } from "../components/InspectorPanel";
import { useConnection } from "../connection/ConnectionProvider";
import { modelReadiness } from "../connection/connection";
import { ConnectionHelp } from "../connection/ConnectionHelp";
import { Modal } from "../components/Modal";
import { StatusBar } from "../components/StatusBar";
import { playThemeStyle, useAppearance } from "../themes/ThemeProvider";
import { shellForTheme } from "../themes/theme";
import { GameAudio } from "../audio/GameAudio";
import { portraitSrc } from "../studio/portrait";
import { playerCheckStats } from "../../checks/playerCheck";
import gateBackground from "../assets/gate-play-background.jpg";
import { BackgroundDialog } from "../themes/BackgroundSettings";
import { Menu } from "../components/Menu";
import { PlayMapCard } from "../components/PlayMapCard";
import { usePlayMap } from "../components/usePlayMap";
import { isGateTestSession } from "../../session/gateTest";
import { adventureHasClock } from "../../game/AdventureEngine";
import { PlayTopBar } from "../play/PlayTopBar";
import { Journal } from "../play/Journal";
import { OrnamentProvider, ornamentVars, useSimpleFrames } from "../play/ornament";
import { captureIdea, type Idea } from "../../ideas/IdeaSchema";
import { IdeaEditor } from "../ideas/IdeaEditor";
import { formatGameTime } from "../../state/gameClock";

export function PlayWorkspace({
  onHome,
  onAppearance,
  title,
  repo,
  onIdeas,
  onStartGatehouse,
}: {
  repo: IndexedDBRepository;
  onIdeas: () => void;
  /** Starts the new gatehouse adventure, offered on a conversation from the old test. */
  onStartGatehouse?: (() => void | Promise<void>) | undefined;
  title?: string | undefined;
  onHome: (session: Session) => void;
  onAppearance: () => void;
}) {
  const t = useTranslate();
  const { useSession, phase, setOllamaModel, saveEncounter, forgetPlaceNote } = useEngine();
  const { discovery, refresh, chooseModel } = useConnection();
  const [connectionOpen, setConnectionOpen] = useState(false);
  const session = useSession();
  const person = primaryCharacter(session);
  const portrait = portraitSrc(person ? session.characters[person.id]?.portraitDataUrl : undefined);
  const { library } = useAppearance();
  const [castOpen, setCastOpen] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [checkRequest, setCheckRequest] = useState(0);
  const [partyTarget, setPartyTarget] = useState<HTMLElement | null>(null);
  const [backgroundOpen, setBackgroundOpen] = useState(false);
  const [idea, setIdea] = useState<Idea | null>(null);
  const [ideaNote, setIdeaNote] = useState("");
  const [backgroundMenu, setBackgroundMenu] = useState<{ x: number; y: number } | null>(null);
  const withRules = !!session.ruleset;
  const mapModel = usePlayMap(repo, session),
    mapView = mapModel ? <PlayMapCard key={mapModel.key} model={mapModel} /> : null;
  const scenePictures = sceneBackdrop(session);
  const encounterBackdrop =
    library.active.backgroundMode === "scene" && scenePictures.pictures.length ? (
      <ChatBackdrop
        pictures={scenePictures.pictures}
        play={scenePictures.picturePlay}
        locationKey={session.scene?.placeId ?? session.sceneId ?? ""}
      />
    ) : undefined;
  /** Keep these lines of the story as an idea: open the editor with them. */
  function saveIdea(turns: number[]) {
    try {
      setIdea(
        captureIdea(
          session,
          turns,
          title || session.encounter?.definition.title || "Your adventure",
        ),
      );
      setIdeaNote("");
    } catch (error) {
      setIdeaNote(error instanceof Error ? error.message : "Could not capture this idea.");
    }
  }
  /** The last three lines of the story, the ones just played. */
  function saveRecentIdea() {
    const turns = (session.conversation as { turn?: unknown }[])
      .map((entry) => (typeof entry?.turn === "number" ? entry.turn : undefined))
      .filter((turn): turn is number => turn !== undefined)
      .slice(-3);
    saveIdea(turns);
  }
  const withSidebar = withRules || Boolean(mapModel);
  // An engine scene has its own frame: a top row and three columns.
  const framed = !!session.encounter;
  const run = session.adventure;
  const placeName =
    run?.scenes.find((scene) => scene.id === run.currentSceneId)?.name ||
    session.encounter?.definition.title ||
    title ||
    primaryCharacter(session)?.name ||
    "Your exploration";
  const gatePreview = isGateTestSession(session) && library.active.backgroundMode === "scene";
  const checkStats = playerCheckStats(session);
  const streaming = phase === "streaming";
  const readiness = modelReadiness(discovery, session.runtime.model);
  const canSend = readiness === "ready";
  // Plain frames: chosen by the player, or asked for by the system (less motion, more contrast).
  const simpleFrames = useSimpleFrames(!!library.simpleFrames);
  useEffect(() => {
    if (phase === "error") void refresh();
  }, [phase, refresh]);
  return (
    <OrnamentProvider theme={library.active} simple={simpleFrames}>
      <div className="sb-play-workspace">
        {framed ? (
          <PlayTopBar
            placeName={placeName}
            time={run && adventureHasClock(run) ? formatGameTime(run.clockMinutes) : undefined}
            onHome={() => {
              // The scene is saved on the way out, as the old "Save & return home" did.
              saveEncounter().then(
                () => onHome(session),
                () => setIdeaNote("Saving is unavailable, so you are still here. Try again."),
              );
            }}
            homeDisabled={streaming}
            onSaveIdea={saveRecentIdea}
            onJournal={() => setJournalOpen(true)}
            sound={<GameAudio key={session.id} conversationId={session.id} />}
            onAppearance={onAppearance}
            aiOpen={settingsOpen}
            onToggleAi={() => setSettingsOpen(!settingsOpen)}
            inspectorOpen={inspectorOpen}
            onToggleInspector={() => setInspectorOpen(!inspectorOpen)}
            castOpen={castOpen}
            onToggleCast={() => setCastOpen(!castOpen)}
          />
        ) : (
          <div className="sb-play-toolbar">
            {portrait && (
              <img
                className="sb-play-portrait"
                src={portrait}
                alt={`${person?.name ?? "Character"} portrait`}
              />
            )}
            <div className="sb-play-title">
              <strong>
                {session.encounter?.definition.title ||
                  title ||
                  primaryCharacter(session)?.name ||
                  "Your exploration"}
              </strong>
              <span>{session.scene?.location}</span>
            </div>
            <div className="sb-play-tools">
              <GameAudio key={session.id} conversationId={session.id} />
              <button
                type="button"
                className="sb-link"
                aria-pressed={castOpen}
                onClick={() => setCastOpen(!castOpen)}
              >
                {t("pwCast")}
              </button>
              <button type="button" className="sb-link" onClick={onAppearance}>
                ◐ Appearance
              </button>
              <button
                type="button"
                className="sb-link"
                aria-expanded={settingsOpen}
                onClick={() => setSettingsOpen(!settingsOpen)}
              >
                {t("settings")}
              </button>
              <button
                type="button"
                className="sb-link"
                aria-pressed={inspectorOpen}
                onClick={() => setInspectorOpen(!inspectorOpen)}
              >
                {t("pwInspector")}
              </button>
              <button
                type="button"
                className="sb-play-exit"
                aria-label="Exit conversation"
                disabled={streaming}
                title={
                  streaming ? "Wait for the reply to finish" : "Return home; keep this conversation"
                }
                onClick={() => onHome(session)}
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path d="M16 6V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2M10 12h12m-4-4 4 4-4 4" />
                </svg>
              </button>
            </div>
          </div>
        )}
        {backgroundMenu && (
          <Menu
            label="Background actions"
            at={{ x: backgroundMenu.x, y: backgroundMenu.y }}
            onClose={() => setBackgroundMenu(null)}
            items={[
              { label: "Choose background…", onSelect: () => setBackgroundOpen(true) },
              { label: "Customize appearance…", onSelect: onAppearance },
            ]}
          />
        )}
        {journalOpen && framed && (
          <Journal
            session={session}
            onForget={(sceneId, index) => void forgetPlaceNote(sceneId, index).catch(() => {})}
            onClose={() => setJournalOpen(false)}
          />
        )}
        {backgroundOpen && <BackgroundDialog onClose={() => setBackgroundOpen(false)} />}
        {ideaNote && (
          <p role="alert" className="play-view__note">
            {ideaNote}
          </p>
        )}
        {idea && (
          <IdeaEditor
            idea={idea}
            repo={repo}
            onClose={() => setIdea(null)}
            onSaved={() => {
              setIdea(null);
              setIdeaNote("");
            }}
          />
        )}
        {settingsOpen && <StatusBar />}
        {!canSend && !session.gateEncounter && (
          <div className="sb-play-connection" role="status">
            <span>
              {t(
                readiness === "checking"
                  ? "pwAiChecking"
                  : readiness === "empty" || readiness === "missing-model"
                    ? "pwAiChooseModel"
                    : "pwAiUnavailable",
              )}
            </span>
            <button type="button" className="sb-link" onClick={() => setConnectionOpen(true)}>
              {t("pwSetUpAi")}
            </button>
          </div>
        )}
        <div
          className={`sb-play-layout${castOpen ? " sb-play-layout--cast" : ""}${inspectorOpen ? " sb-play-layout--inspector" : ""}`}
        >
          {castOpen && <CastPanel />}
          <div
            onContextMenu={(event) => {
              const target = event.target as HTMLElement;
              if (
                !target.closest(".chat-stage") ||
                target.closest(".message,button,input,textarea,select,a,[role=dialog]")
              )
                return;
              event.preventDefault();
              setBackgroundMenu({ x: event.clientX, y: event.clientY });
            }}
            className={`sb-themed-play${withSidebar ? " sb-themed-play--rules" : ""}${framed ? " sb-themed-play--framed" : ""}${gatePreview ? " sb-themed-play--gate-preview" : ""}`}
            data-shell={shellForTheme(library.active)}
            style={{
              ...playThemeStyle(library.active),
              ...ornamentVars(library.active, { simple: simpleFrames }),
              ...(gatePreview ? { backgroundImage: `url(${gateBackground})` } : {}),
            }}
          >
            {session.encounter ? (
              <EncounterPanel
                mapView={mapView}
                backdrop={encounterBackdrop}
                aiReady={canSend}
                onSaveIdea={saveIdea}
                onJournal={() => setJournalOpen(true)}
              />
            ) : session.gateEncounter ? (
              <LegacyGatePanel
                session={session}
                repo={repo}
                onHome={onHome}
                onStartNew={onStartGatehouse ?? (() => onHome(session))}
              />
            ) : (
              <>
                <ChatPanel
                  gameTools={withRules}
                  partyTarget={partyTarget}
                  checkRequest={checkRequest}
                  repo={repo}
                  conversationTitle={title}
                  onIdeas={onIdeas}
                  canSend={canSend}
                  onCheckConnection={() => setConnectionOpen(true)}
                />
                {withSidebar && (
                  <aside
                    className={"sb-game-toolbox" + (!withRules ? " sb-game-toolbox--map-only" : "")}
                    aria-label="Game tools"
                  >
                    {mapView && <section className="sb-game-toolbox__map">{mapView}</section>}
                    {withRules && (
                      <>
                        <header>
                          <span className="sb-game-toolbox__eyebrow">YOUR ADVENTURE</span>
                          <h2>{t("pwAtYourFingertips")}</h2>
                          <p>{session.ruleset?.name}</p>
                        </header>
                        <section className="sb-game-toolbox__checks">
                          <h3>{t("pwTakeAChance")}</h3>
                          <p>{t("pwDescribeWhatYouWant")}</p>
                          <button
                            type="button"
                            className="sb-game-toolbox__roll"
                            disabled={
                              streaming || !canSend || !!session.journey || checkStats.length === 0
                            }
                            onClick={() => setCheckRequest((value) => value + 1)}
                          >
                            <span aria-hidden="true">◇</span>
                            {t("pwRollTheDice")}
                          </button>
                          {checkStats.length === 0 && <small>{t("pwAddNumericStatsTo")}</small>}
                          {!!session.journey && <small>{t("pwFinishOrPauseYour")}</small>}
                        </section>
                        <section>
                          <h3>{session.player?.name || "Your character"}</h3>
                          <dl>
                            {checkStats.map((stat) => (
                              <div key={stat.id}>
                                <dt>{stat.name}</dt>
                                <dd>{stat.value}</dd>
                              </div>
                            ))}
                          </dl>
                        </section>
                        <PlayerInventory session={session} busy={streaming} />
                        <section
                          className="sb-game-toolbox__party"
                          aria-label="Party and prospects"
                          ref={setPartyTarget}
                        />
                        <section className="sb-game-toolbox__session">
                          <h3>{t("pwYourStoryStaysWith")}</h3>
                          <p>{t("pwYourConversationAndResolved")}</p>
                          <button
                            type="button"
                            className="sb-link"
                            disabled={streaming}
                            onClick={() => onHome(session)}
                          >
                            Save & return home ↗
                          </button>
                        </section>
                      </>
                    )}
                  </aside>
                )}
              </>
            )}
          </div>
          {inspectorOpen && <InspectorPanel />}
        </div>
        {connectionOpen && (
          <Modal title={t("pwYourLocalAi")} onClose={() => setConnectionOpen(false)}>
            <ConnectionHelp
              model={session.runtime.model}
              disabled={streaming}
              onModelChange={(model) => {
                chooseModel(model);
                setOllamaModel(model);
              }}
            />
            <div className="sb-dialog__actions">
              <button type="button" className="sb-button" onClick={() => setConnectionOpen(false)}>
                {canSend ? "Back to the conversation" : "Keep exploring"}
              </button>
            </div>
          </Modal>
        )}
      </div>
    </OrnamentProvider>
  );
}
