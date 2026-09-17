import { useEffect, useState } from "react";
import { EngineProvider } from "./EngineStore";
import { StatusBar } from "./components/StatusBar";
import { CastPanel } from "./components/CastPanel";
import { ChatPanel } from "./components/ChatPanel";
import { InspectorPanel } from "./components/InspectorPanel";
import { StudioShell } from "./studio/StudioShell";
import { getRepository, loadExistingSession, UI_SESSION_ID } from "./persistence";
import type { StudioResume } from "@persistence/IndexedDBRepository";
import type { Session } from "@state/StateSchema";
import "./styles.css";

export default function App() {
  const [repo] = useState(() => getRepository());
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [resume, setResume] = useState<StudioResume | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([loadExistingSession(repo), repo.loadStudioResume()])
      .then(([loaded, studioResume]) => {
        setSession(loaded);
        setResume(studioResume);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : String(err)));
  }, [repo]);

  async function startScene(next: Session) {
    try {
      if (next.campaignId) {
        await repo.saveStudioResume({
          campaignId: next.campaignId,
          ...(next.sceneId ? { sceneId: next.sceneId } : {})
        });
      } else {
        await repo.clearStudioResume();
      }
      await repo.saveSession(next);
    } catch (err) {
      console.warn("Failed to persist the new scene:", err);
    }
    setSession(next);
  }

  if (loadError) {
    return (
      <div className="app-shell" style={{ display: "grid", placeItems: "center" }}>
        <p style={{ color: "var(--accent-danger)" }}>Failed to start: {loadError}</p>
      </div>
    );
  }

  if (session === undefined) {
    return (
      <div className="app-shell" style={{ display: "grid", placeItems: "center" }}>
        <p style={{ color: "var(--text-faint)" }}>Loading session…</p>
      </div>
    );
  }

  if (session === null) {
    return (
      <StudioShell
        sessionId={UI_SESSION_ID}
        repo={repo}
        resume={resume}
        onStart={(next) => void startScene(next)}
      />
    );
  }

  return (
    <EngineProvider initialSession={session} repo={repo}>
      <div className="app-shell">
        <StatusBar />
        <div className="three-zone">
          <CastPanel />
          <ChatPanel />
          <InspectorPanel />
        </div>
      </div>
    </EngineProvider>
  );
}
