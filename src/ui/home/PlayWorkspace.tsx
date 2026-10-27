import type { IndexedDBRepository } from "@persistence/IndexedDBRepository";
import { useEffect, useRef, useState } from "react";
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

function readPanelWidth(key: string, fallback: number, min: number, max: number): number {
  try {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) && value > 0 ? Math.max(min, Math.min(max, value)) : fallback;
  } catch { return fallback; }
}

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
  const [castWidth, setCastWidth] = useState(() => readPanelWidth("sandbox.castWidth", 300, 200, 520));
  const [inspectorWidth, setInspectorWidth] = useState(() => readPanelWidth("sandbox.inspectorWidth", 360, 220, 560));
  const layoutRef = useRef<HTMLDivElement>(null);
  useEffect(() => { try { localStorage.setItem("sandbox.castWidth", String(castWidth)); } catch { /* optional */ } }, [castWidth]);
  useEffect(() => { try { localStorage.setItem("sandbox.inspectorWidth", String(inspectorWidth)); } catch { /* optional */ } }, [inspectorWidth]);
  function startResize(event: React.PointerEvent<HTMLDivElement>, side: "cast" | "inspector") {
    if (event.button !== 0 || !window.matchMedia("(min-width: 901px)").matches) return;
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const move = (next: PointerEvent) => {
      const rect = layoutRef.current?.getBoundingClientRect();
      if (!rect) return;
      if (side === "cast") setCastWidth(Math.max(200, Math.min(520, next.clientX - rect.left)));
      else setInspectorWidth(Math.max(220, Math.min(560, rect.right - next.clientX)));
    };
    const stop = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", stop);
      handle.removeEventListener("pointercancel", stop);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", stop, { once: true });
    handle.addEventListener("pointercancel", stop, { once: true });
  }
  const streaming = phase === "streaming";
  const readiness = modelReadiness(discovery, session.runtime.model);
  const canSend = readiness === "ready";
  useEffect(() => {
    if (phase === "error") void refresh();
  }, [phase, refresh]);
  return (
    <div className="sb-play-workspace">
      <div className="sb-play-toolbar">
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
        ref={layoutRef}
        style={{ ["--cast-width" as string]: `${castWidth}px`, ["--inspector-width" as string]: `${inspectorWidth}px` }}
      >
        {castOpen && <CastPanel />}
        {castOpen && <div className="sb-play-resizer sb-play-resizer--cast" role="separator" aria-label="Resize character panel" aria-orientation="vertical" aria-valuemin={200} aria-valuemax={520} aria-valuenow={castWidth} tabIndex={0} onPointerDown={(event) => startResize(event, "cast")} onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); setCastWidth(w => Math.max(200, Math.min(520, w + (event.key === "ArrowRight" ? 20 : -20)))); } }} />
        <div className="sb-themed-play" style={playThemeStyle(library.active)}>
          <ChatPanel
            repo={repo}
            conversationTitle={title}
            onIdeas={onIdeas}
            canSend={canSend}
            onCheckConnection={() => setConnectionOpen(true)}
          />
        </div>
        {inspectorOpen && <div className="sb-play-resizer sb-play-resizer--inspector" role="separator" aria-label="Resize inspector panel" aria-orientation="vertical" aria-valuemin={220} aria-valuemax={560} aria-valuenow={inspectorWidth} tabIndex={0} onPointerDown={(event) => startResize(event, "inspector")} onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); setInspectorWidth(w => Math.max(220, Math.min(560, w + (event.key === "ArrowLeft" ? 20 : -20)))); } }} />}
        {inspectorOpen && <InspectorPanel />
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
