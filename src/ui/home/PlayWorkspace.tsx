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
import { GameAudio } from "../audio/GameAudio";
import { portraitSrc } from "../studio/portrait";
import { playerCheckStats } from "../../checks/playerCheck";
import gateBackground from "../assets/gate-play-background.jpg";

export function PlayWorkspace({
  onHome,
  onAppearance,
  title,
  repo,
  onIdeas,
}: {
  repo: IndexedDBRepository;
  onIdeas: () => void;
  title?: string | undefined;
  onHome: (session: Session) => void;
  onAppearance: () => void;
}) {
  const { useSession, phase, setOllamaModel } = useEngine();
  const { discovery, refresh, chooseModel } = useConnection();
  const [connectionOpen, setConnectionOpen] = useState(false);
  const session = useSession();
  const person = primaryCharacter(session);
  const portrait = portraitSrc(person ? session.characters[person.id]?.portraitDataUrl : undefined);
  const { library } = useAppearance();
  const [castOpen, setCastOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [checkRequest, setCheckRequest] = useState(0);
  const withRules = !!session.ruleset;
  const gatePreview = session.ruleset?.name === 'Gate test · d100';
  const checkStats = playerCheckStats(session);
  const streaming = phase === "streaming";
  const readiness = modelReadiness(discovery, session.runtime.model);
  const canSend = readiness === "ready";
  useEffect(() => {
    if (phase === "error") void refresh();
  }, [phase, refresh]);
  return (
    <div className="sb-play-workspace">
      <div className="sb-play-toolbar">
        {portrait && <img className="sb-play-portrait" src={portrait} alt={`${person?.name ?? "Character"} portrait`} />}
        <div className="sb-play-title">
          <strong>
            {title || primaryCharacter(session)?.name || "Your exploration"}
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
            Cast
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
            Settings
          </button>
          <button
            type="button"
            className="sb-link"
            aria-pressed={inspectorOpen}
            onClick={() => setInspectorOpen(!inspectorOpen)}
          >
            Inspector
          </button>
          <button
            type="button"
            className="sb-play-exit"
            aria-label="Exit conversation"
            disabled={streaming}
            title={
              streaming
                ? "Wait for the reply to finish"
                : "Return home; keep this conversation"
            }
            onClick={() => onHome(session)}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
              <path d="M16 6V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2M10 12h12m-4-4 4 4-4 4" />
            </svg>
          </button>
        </div>
      </div>
      {settingsOpen && <StatusBar />}
      {!canSend && (
        <div className="sb-play-connection" role="status">
          <span>
            {readiness === "checking"
              ? "Checking your local AI…"
              : readiness === "missing-model"
                ? "Choose an installed model to hear a reply."
                : "Your conversation is ready. Connect local AI to hear a reply."}
          </span>
          <button
            type="button"
            className="sb-link"
            onClick={() => setConnectionOpen(true)}
          >
            Set up AI
          </button>
        </div>
      )}
      <div
        className={`sb-play-layout${castOpen ? " sb-play-layout--cast" : ""}${inspectorOpen ? " sb-play-layout--inspector" : ""}`}
      >
        {castOpen && <CastPanel />}
        <div className={`sb-themed-play${withRules ? " sb-themed-play--rules" : ""}${gatePreview ? " sb-themed-play--gate-preview" : ""}`} style={{...playThemeStyle(library.active), ...(gatePreview ? {backgroundImage:`url(${gateBackground})`} : {})}}>
          <ChatPanel
            gameTools={withRules}
            checkRequest={checkRequest}
            repo={repo}
            conversationTitle={title}
            onIdeas={onIdeas}
            canSend={canSend}
            onCheckConnection={() => setConnectionOpen(true)}
          />
          {withRules && <aside className="sb-game-toolbox" aria-label="Game tools">
            <header><span className="sb-game-toolbox__eyebrow">YOUR ADVENTURE</span><h2>At your fingertips</h2><p>{session.ruleset?.name}</p></header>
            <section><h3>Take a chance</h3><p>Describe what you want to try, choose a stat, and let the dice decide.</p>
              <button type="button" className="sb-game-toolbox__roll" disabled={streaming || !canSend || !!session.journey || checkStats.length === 0} onClick={() => setCheckRequest(value => value + 1)}><span aria-hidden="true">◇</span> Roll the dice</button>
              {checkStats.length === 0 && <small>Add numeric stats to your player sheet to make a check.</small>}
              {!!session.journey && <small>Finish or pause your journey before making a check.</small>}
            </section>
            <section><h3>{session.player?.name || "Your character"}</h3><dl>{checkStats.map(stat => <div key={stat.id}><dt>{stat.name}</dt><dd>{stat.value}</dd></div>)}</dl></section>
            <section className="sb-game-toolbox__session"><h3>Your story stays with you</h3><p>Your conversation and resolved rolls are saved as you play.</p><button type="button" className="sb-link" disabled={streaming} onClick={() => onHome(session)}>Save & return home ↗</button></section>
          </aside>}
        </div>
        {inspectorOpen && <InspectorPanel />}
      </div>
      {connectionOpen && (
        <Modal title="Your local AI" onClose={() => setConnectionOpen(false)}>
          <ConnectionHelp
            model={session.runtime.model}
            disabled={streaming}
            onModelChange={(model) => {
              chooseModel(model);
              setOllamaModel(model);
            }}
          />
          <div className="sb-dialog__actions">
            <button
              type="button"
              className="sb-button"
              onClick={() => setConnectionOpen(false)}
            >
              {canSend ? "Back to the conversation" : "Keep exploring"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
