import { attachLorebooks } from "../lore/attachLorebooks";
import { IdeaLibrary } from "./ideas/IdeaLibrary";
import { GuidePanel } from "./guide/GuidePanel";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { EngineProvider, useEngine, type ChatPhase } from "./EngineStore";
import { StudioShell } from "./studio/StudioShell";
import { ConnectionProvider } from "./connection/ConnectionProvider";
import { HomeScreen } from "./home/HomeScreen";
import { AppSwitcher } from "./home/AppSwitcher";
import { PlayWorkspace } from "./home/PlayWorkspace";
import { ConversationLibrary } from "./conversations/ConversationLibrary";
import { ThemeProvider, useAppearance } from "./themes/ThemeProvider";
import { deleteAudioPreferences } from "./audio/audioStorage";
import { AppearanceDialog } from "./themes/AppearanceDialog";
import {
  getRepository,
  loadExistingSession,
  UI_SESSION_ID,
} from "./persistence";
import type { ConversationCatalog } from "@persistence/ConversationSchema";
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
  useLayoutEffect(() => {
    onSession(live);
  }, [live, onSession]);
  useLayoutEffect(() => {
    onPhase(phase);
  }, [phase, onPhase]);
  return null;
}
function ConversationAppearance({ id }: { id: string | null }) {
  const { ready, activateConversation } = useAppearance();
  useLayoutEffect(() => {
    if (ready) activateConversation(id);
  }, [ready, id, activateConversation]);
  return null;
}
function sceneResume(session: Session): StudioResume | null {
  return session.campaignId
    ? {
        conversationId: session.id,
        campaignId: session.campaignId,
        ...(session.sceneId ? { sceneId: session.sceneId } : {}),
      }
    : null;
}
function SandboxApp() {
  const { forgetConversation } = useAppearance();
  const [repo] = useState(() => getRepository());
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const live = useRef<Session | null>(null);
  const [resume, setResume] = useState<StudioResume | null>(null);
  const [catalog, setCatalog] = useState<ConversationCatalog>({
    entries: [],
    unreadable: 0,
  });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<
    "home" | "studio" | "play" | "conversations" | "ideas" | "guide"
  >("home");
  const [studioView, setStudioView] = useState<StudioView>("characters");
  const [generation, setGeneration] = useState(0);
  const [phase, setPhase] = useState<ChatPhase>("idle");
  const currentPhase = useRef<ChatPhase>("idle");
  const actionPending = useRef(false);
  const [working, setWorking] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);
  const setLive = useCallback((next: Session | null) => {
    live.current = next;
    setSession(next);
  }, []);
  const synchronizePhase = useCallback((next: ChatPhase) => {
    currentPhase.current = next;
    setPhase(next);
  }, []);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const loaded = await loadExistingSession(repo);
      const [studioResume, conversations] = await Promise.all([
        repo.loadStudioResume(),
        repo.listConversations(),
      ]);
      if (cancelled) return;
      setLive(loaded);
      setCatalog(conversations);
      setResume(
        loaded
          ? studioResume?.conversationId === loaded.id ||
            (loaded.id === UI_SESSION_ID && !studioResume?.conversationId)
            ? studioResume
            : sceneResume(loaded)
          : studioResume,
      );
    })().catch((err: unknown) => {
      if (!cancelled)
        setLoadError(err instanceof Error ? err.message : String(err));
    });
    return () => {
      cancelled = true;
    };
  }, [repo, setLive]);

  async function refreshCatalog() {
    try {
      setCatalog(await repo.listConversations());
    } catch (err) {
      setOperationError(
        err instanceof Error
          ? err.message
          : "Could not refresh your conversations.",
      );
    }
  }
  async function action(work: () => Promise<void>) {
    if (actionPending.current)
      throw new Error("Please wait while the conversation opens.");
    if (currentPhase.current === "streaming")
      throw new Error(
        "Wait for the current reply to finish before changing conversations.",
      );
    actionPending.current = true;
    setWorking(true);
    setOperationError(null);
    try {
      await work();
    } finally {
      actionPending.current = false;
      setWorking(false);
    }
  }
  function report(work: Promise<void>) {
    void work.catch((err: unknown) =>
      setOperationError(
        err instanceof Error
          ? err.message
          : "Could not update your conversations.",
      ),
    );
  }
  async function persistCurrent() {
    if (live.current) await repo.saveSession(live.current);
  }
  async function startScene(next: Session) {
    await action(async () => {
      await persistCurrent();
      const books = await repo.listLorebooks();
      if (books.unreadable) setOperationError("Some lorebooks could not be read and were skipped. Their original stored records have been kept; review Lorebooks when convenient.");
      const place = next.scene?.placeId && books.entries.some(book => book.binding.kind === "realm")
        ? (await repo.listPlaces()).find(item => item.id === next.scene?.placeId) : undefined;
      const realmId = place?.realmId ?? (!next.scene?.placeId ? books.entries.find(book => book.materializedRealmId && book.materializedCharacterIds?.some(id => Object.values(next.characters).some(c => c.sourceLibraryId === id)))?.materializedRealmId : undefined);
      const fresh = attachLorebooks({ ...next, id: crypto.randomUUID() }, books.entries, { realmId });
      await repo.createConversation(fresh);
      const nextResume = sceneResume(fresh);
      try {
        if (nextResume) await repo.saveStudioResume(nextResume);
        else await repo.clearStudioResume();
      } catch (err) {
        console.warn("Could not save the studio return point:", err);
      }
      setResume(nextResume);
      setLive(fresh);
      setGeneration((value) => value + 1);
      setView("play");
      await refreshCatalog();
    });
  }
  async function openConversation(id: string) {
    await action(async () => {
      await persistCurrent();
      const next =
        live.current?.id === id ? live.current : await repo.loadSession(id);
      await repo.activateConversation(id);
      if (live.current?.id !== id) {
        setResume(sceneResume(next));
        setLive(next);
        setGeneration((value) => value + 1);
      }
      setView("play");
      await refreshCatalog();
    });
  }
  async function archiveConversation(id: string, archived: boolean) {
    await action(async () => {
      await persistCurrent();
      await repo.archiveConversation(id, archived);
      if (archived && live.current?.id === id) {
        setLive(null);
        setGeneration((value) => value + 1);
        setView("conversations");
      }
      await refreshCatalog();
    });
  }
  async function renameConversation(id: string, title: string) {
    await action(async () => {
      await repo.renameConversation(id, title);
      await refreshCatalog();
    });
  }
  async function deleteConversation(id: string) {
    await action(async () => {
      await persistCurrent();
      await repo.deleteSession(id);
      // Detach the live engine before any further awaits: navigation must not
      // autosave the deleted conversation back into storage.
      if (live.current?.id === id) {
        setLive(null);
        setGeneration(value => value + 1);
      }
      setResume(current => current?.conversationId === id || (id === UI_SESSION_ID && current && !current.conversationId) ? null : current);
      setCatalog(current => ({ ...current, entries: current.entries.filter(entry => entry.id !== id) }));
      forgetConversation(id);
      let cleanupFailed = false;
      try { sessionStorage.removeItem(`sandboxai-draft:${id}`); } catch { cleanupFailed = true; }
      try { await deleteAudioPreferences(id); } catch { cleanupFailed = true; }
      if (cleanupFailed) setOperationError("Conversation deleted. Some local playback preferences or draft data could not be cleared.");
      await refreshCatalog();
    });
  }
  function navigate(destination: "home" | "conversations" | "ideas" | "guide") {
    report(
      action(async () => {
        await persistCurrent();
        setView(destination);
        await refreshCatalog();
      }),
    );
  }
  function openStudio(next: StudioView) {
    if (actionPending.current || currentPhase.current === "streaming") {
      setOperationError(
        "Wait for the current reply to finish before opening the studio.",
      );
      return;
    }
    setStudioView(next);
    setView("studio");
    setOperationError(null);
  }
  async function newConversation(
    current: Session,
    nextResume: StudioResume | null,
  ) {
    await action(async () => {
      await repo.saveSession(current);
      if (nextResume) await repo.saveStudioResume(nextResume);
      else await repo.clearStudioResume();
      setLive(current);
      setResume(nextResume);
      setStudioView(current.campaignId ? "campaigns" : "adventure");
      setView("studio");
      await refreshCatalog();
    });
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
      <ConversationAppearance
        id={view === "play" ? (session?.id ?? null) : null}
      />
      <header className="sb-header">
        <button
          type="button"
          className="sb-brand"
          onClick={() => navigate("home")}
          aria-label="SandboxAI home"
        >
          <span aria-hidden="true">✧</span>
          <span>
            Sandbox<span className="sb-brand__ai">AI</span>
            <small>YOUR CREATIVE UNIVERSE</small>
          </span>
        </button>
        <AppSwitcher onHome={() => navigate("home")} />
        <button
          type="button"
          className="sb-header-appearance"
          onClick={() => setAppearanceOpen(true)}
          aria-label="Appearance and themes"
        >
          ◐ <span>Appearance</span>
        </button>
      </header>
      {operationError && (
        <div className="sb-operation-error" role="alert">
          <span>{operationError}</span>
          <button
            type="button"
            className="sb-link"
            onClick={() => setOperationError(null)}
            aria-label="Dismiss notification"
          >
            Dismiss
          </button>
        </div>
      )}
      {view === "play" && session ? (
        <PlayWorkspace
          repo={repo}
          onIdeas={() => navigate("ideas")}
          title={
            catalog.entries.find((entry) => entry.id === session.id)?.title
          }
          onHome={(current) => {
            setLive(current);
            navigate("home");
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
                onClick={() => navigate("home")}
              >
                ◈ <span>My space</span>
              </button>
              <button
                type="button"
                className={view === "conversations" ? "is-active" : ""}
                onClick={() => navigate("conversations")}
              >
                ◷ <span>My conversations</span>
              </button>
              <button type="button" className={view === "ideas" ? "is-active" : ""} onClick={() => navigate("ideas")}>
                ✧ <span>My ideas</span>
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
              <button type="button" className={view === "studio" && studioView === "lorebooks" ? "is-active" : ""} onClick={() => openStudio("lorebooks")}>▤ <span>Lorebooks</span></button>
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
              <button type="button" className={view === "guide" ? "is-active" : ""} onClick={() => navigate("guide")}>? <span>Guide</span></button>
              {session && (
                <button
                  type="button"
                  disabled={working}
                  onClick={() => report(openConversation(session.id))}
                >
                  ↗ <span>Continue exploring</span>
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
              <StudioShell
                key={studioView}
                initialView={studioView}
                sessionId={UI_SESSION_ID}
                repo={repo}
                resume={resume}
                onStart={(next) => report(startScene(next))}
              />
            </div>
          ) : view === "guide" ? (
            <GuidePanel />
          ) : view === "ideas" ? (
            <IdeaLibrary repo={repo} conversations={catalog.entries} onOpen={id => report(openConversation(id))} />
          ) : view === "conversations" ? (
            <ConversationLibrary
              entries={catalog.entries}
              unreadable={catalog.unreadable}
              busy={working || phase === "streaming"}
              onOpen={(id) => report(openConversation(id))}
              onRename={renameConversation}
              onDelete={deleteConversation}
              onArchive={(id, archived) =>
                report(archiveConversation(id, archived))
              }
              onNew={() => navigate("home")}
            />
          ) : (
            <HomeScreen
              key={generation}
              repo={repo}
              session={session}
              sessionId={UI_SESSION_ID}
              onResume={() => {
                if (session) report(openConversation(session.id));
              }}
              onStart={startScene}
              onStudio={openStudio}
              conversations={catalog.entries}
              navigationBusy={working}
            />
          )}
        </div>
      )}
      {appearanceOpen && (
        <AppearanceDialog onClose={() => setAppearanceOpen(false)} />
      )}
    </>
  );
  return session ? (
    <EngineProvider
      key={generation}
      initialSession={session}
      repo={repo}
      onNewConversation={newConversation}
    >
      <LiveSessionBridge onSession={setLive} onPhase={synchronizePhase} />
      {workspace}
    </EngineProvider>
  ) : (
    workspace
  );
}
export default function App() {
  return (
    <ThemeProvider>
      <ConnectionProvider>
        <SandboxApp />
      </ConnectionProvider>
    </ThemeProvider>
  );
}
