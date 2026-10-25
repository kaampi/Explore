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
  const { library } = useAppearance();
  const [castOpen, setCastOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const streaming = phase === "streaming";
  const readiness = modelReadiness(discovery, session.runtime.model);
  const canSend = readiness === "ready";
  useEffect(() => {
    if (phase === "error") void refresh();
  }, [phase, refresh]);
  return (
    <div className="sb-play-workspace">
      <div className="sb-play-toolbar">
        <button
          type="button"
          className="sb-link"
          disabled={streaming}
          title={
            streaming
              ? "Wait for the reply to finish"
              : "Return home; keep this conversation"
          }
          onClick={() => onHome(session)}
        >
          ← My space
        </button>
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
        <div className="sb-themed-play" style={playThemeStyle(library.active)}>
          <ChatPanel
            repo={repo}
            conversationTitle={title}
            onIdeas={onIdeas}
            canSend={canSend}
            onCheckConnection={() => setConnectionOpen(true)}
          />
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
