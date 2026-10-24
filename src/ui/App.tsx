import { useEffect, useState } from "react";
import { EngineProvider, useEngine, type ChatPhase } from "./EngineStore";
import { StudioShell } from "./studio/StudioShell";
import { HomeScreen } from "./home/HomeScreen";
import { AppSwitcher } from "./home/AppSwitcher";
import { PlayWorkspace } from "./home/PlayWorkspace";
import { ThemeProvider } from "./themes/ThemeProvider";
import { AppearanceDialog } from "./themes/AppearanceDialog";
import {
  getRepository,
  loadExistingSession,
  UI_SESSION_ID,
} from "./persistence";
import type { StudioResume } from "@persistence/IndexedDBRepository";
import type { Session } from "@state/StateSchema";
import type { StudioView } from "./studio/types";
import "./styles.css";
import "./experience.css";

function LiveSessionBridge({
  onSession,
  onPhase,
}: {
  onSession: (session: Session) => void;
  onPhase: (phase: ChatPhase) => void;
}) {
  const { useSession, phase } = useEngine();
  const live = useSession();
  useEffect(() => {
    onSession(live);
  }, [live, onSession]);
  useEffect(() => {
    onPhase(phase);
  }, [phase, onPhase]);
  return null;
}

function SandboxApp() {
  const [repo] = useState(() => getRepository());
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [resume, setResume] = useState<StudioResume | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<"home" | "studio" | "play">("home");
  const [studioView, setStudioView] = useState<StudioView>("characters");
  const [generation, setGeneration] = useState(0);
  const [phase, setPhase] = useState<ChatPhase>("idle");
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadExistingSession(repo), repo.loadStudioResume()])
      .then(([loaded, studioResume]) => {
        if (!cancelled) {
          setSession(loaded);
          setResume(studioResume);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setLoadError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [repo]);

  async function startScene(next: Session) {
    if (phase === "streaming")
      throw new Error(
        "Wait for the current reply to finish before starting another conversation.",
      );
    if (
      session &&
      !window.confirm(
        "Start a new conversation? This replaces your current conversation. Your characters, worlds, and themes are kept.",
      )
    )
      return;
    // Persist before replacing the live engine. A failed save leaves the old conversation intact.
    await repo.saveSession(next);
    try {
      if (next.campaignId) {
        const nextResume = {
          campaignId: next.campaignId,
          ...(next.sceneId ? { sceneId: next.sceneId } : {}),
        };
        await repo.saveStudioResume(nextResume);
        setResume(nextResume);
      } else {
        await repo.clearStudioResume();
        setResume(null);
      }
    } catch (err) {
      console.warn("Could not save the studio return point:", err);
    }
    setSession(next);
    setGeneration((value) => value + 1);
    setView("play");
    setStartError(null);
  }
  function openStudio(next: StudioView) {
    setStudioView(next);
    setView("studio");
    setStartError(null);
  }
  function goHome() {
    setView("home");
    setStartError(null);
  }
  if (loadError)
    return (
      <div className="sb-loading">
        <h1>We couldn't open your space.</h1>
        <p role="alert">{loadError}</p>
        <button
          type="button"
          className="sb-button"
          onClick={() => window.location.reload()}
        >
          Try again
        </button>
      </div>
    );
  if (session === undefined)
    return (
      <div className="sb-loading" role="status">
        Opening your creative space…
      </div>
    );

  const workspace = (
    <>
      <header className="sb-header">
        <button
          type="button"
          className="sb-brand"
          onClick={goHome}
          aria-label="SandboxAI home"
        >
          <span aria-hidden="true">✧</span>
          <span>
            Sandbox<span className="sb-brand__ai">AI</span>
            <small>YOUR CREATIVE UNIVERSE</small>
          </span>
        </button>
        <AppSwitcher onHome={goHome} />
        <button
          type="button"
          className="sb-header-appearance"
          onClick={() => setAppearanceOpen(true)}
          aria-label="Appearance and themes"
        >
          ◐ <span>Appearance</span>
        </button>
      </header>
      {view === "play" && session ? (
        <PlayWorkspace
          onHome={(live) => {
            setSession(live);
            goHome();
          }}
          onAppearance={() => setAppearanceOpen(true)}
        />
      ) : (
        <div
          className={`sb-workspace${view === "studio" ? " sb-workspace--studio" : ""}`}
        >
          <aside className="sb-sidebar">
            <span className="sb-eyebrow">YOUR CREATIVE SPACE</span>
            <nav aria-label="SandboxAI navigation">
              <button
                type="button"
                className={view === "home" ? "is-active" : ""}
                onClick={goHome}
              >
                ◈ <span>My space</span>
              </button>
              <button
                type="button"
                className={
                  view === "studio" && studioView === "characters"
                    ? "is-active"
                    : ""
                }
                onClick={() => openStudio("characters")}
              >
                ♧ <span>Characters</span>
              </button>
              <button
                type="button"
                className={
                  view === "studio" && studioView === "places"
                    ? "is-active"
                    : ""
                }
                onClick={() => openStudio("places")}
              >
                ⌖ <span>Worlds & places</span>
              </button>
              <button
                type="button"
                className={
                  view === "studio" && studioView === "campaigns"
                    ? "is-active"
                    : ""
                }
                onClick={() => openStudio("campaigns")}
              >
                ◇ <span>Adventures</span>
              </button>
              {session && (
                <button type="button" onClick={() => setView("play")}>
                  ◷ <span>Continue exploring</span>
                </button>
              )}
            </nav>
            <div className="sb-sidebar__quote">
              <span aria-hidden="true">❧</span>Every story has
              <br />
              more to discover.
            </div>
            <button
              type="button"
              className="sb-link sb-sidebar__appearance"
              onClick={() => setAppearanceOpen(true)}
            >
              ◐ Appearance & themes
            </button>
          </aside>
          {view === "studio" ? (
            <div className="sb-studio-wrap">
              {startError && (
                <p className="sb-error" role="alert">
                  {startError}
                </p>
              )}
              <StudioShell
                key={studioView}
                initialView={studioView}
                sessionId={UI_SESSION_ID}
                repo={repo}
                resume={resume}
                onStart={(next) => {
                  void startScene(next).catch((err: unknown) =>
                    setStartError(
                      err instanceof Error
                        ? err.message
                        : "Could not save the new scene.",
                    ),
                  );
                }}
              />
            </div>
          ) : (
            <HomeScreen
              key={generation}
              repo={repo}
              session={session}
              sessionId={UI_SESSION_ID}
              onResume={() => setView("play")}
              onStart={startScene}
              onStudio={openStudio}
            />
          )}
        </div>
      )}
      {appearanceOpen && (
        <AppearanceDialog onClose={() => setAppearanceOpen(false)} />
      )}
    </>
  );
  // Keep the live engine mounted while browsing Home and Studio; navigation never clears the scene.
  return session ? (
    <EngineProvider key={generation} initialSession={session} repo={repo}>
      <LiveSessionBridge onSession={setSession} onPhase={setPhase} />
      {workspace}
    </EngineProvider>
  ) : (
    workspace
  );
}
export default function App() {
  return (
    <ThemeProvider>
      <SandboxApp />
    </ThemeProvider>
  );
}
