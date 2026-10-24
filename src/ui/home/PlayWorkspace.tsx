import { useState } from "react";
import type { Session } from "@state/StateSchema";
import { primaryCharacter } from "@session/createSession";
import { useEngine } from "../EngineStore";
import { CastPanel } from "../components/CastPanel";
import { ChatPanel } from "../components/ChatPanel";
import { InspectorPanel } from "../components/InspectorPanel";
import { StatusBar } from "../components/StatusBar";
import { playThemeStyle, useAppearance } from "../themes/ThemeProvider";

export function PlayWorkspace({
  onHome,
  onAppearance,
}: {
  onHome: (session: Session) => void;
  onAppearance: () => void;
}) {
  const { useSession, phase } = useEngine();
  const session = useSession();
  const { library } = useAppearance();
  const [castOpen, setCastOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const streaming = phase === "streaming";
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
            {primaryCharacter(session)?.name ?? "Your exploration"}
          </strong>
          <span>{session.scene?.location}</span>
        </div>
        <div className="sb-play-tools">
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
      <div
        className={`sb-play-layout${castOpen ? " sb-play-layout--cast" : ""}${inspectorOpen ? " sb-play-layout--inspector" : ""}`}
      >
        {castOpen && <CastPanel />}
        <div className="sb-themed-play" style={playThemeStyle(library.active)}>
          <ChatPanel />
        </div>
        {inspectorOpen && <InspectorPanel />}
      </div>
    </div>
  );
}
