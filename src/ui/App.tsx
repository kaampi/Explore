import "./tokens.css";
import "./controls.css";
import "./menu.css";
import "./rows.css";
import { CodexConnection } from "./connection/CodexConnection";
import { UpdateProvider } from "./home/UpdateProvider";
import { attachLorebooks } from "../lore/attachLorebooks";
import { IdeaLibrary } from "./ideas/IdeaLibrary";
import { GuidePanel, GuideHost, openGuide } from "./guide/GuidePanel";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PlayTheme } from "./themes/theme";
import { EngineProvider, useEngine, type ChatPhase } from "./EngineStore";
import { StudioShell } from "./studio/StudioShell";
import { ConnectionProvider } from "./connection/ConnectionProvider";
import { HomeScreen } from "./home/HomeScreen";
import { ExploreNavigation } from "./home/ExploreNavigation";
import { useLibraryBackup } from "./studio/useLibraryBackup";
import { PlayWorkspace } from "./home/PlayWorkspace";
import { ConversationLibrary } from "./conversations/ConversationLibrary";
import { ThemeProvider, useAppearance } from "./themes/ThemeProvider";
import { deleteAudioPreferences } from "./audio/audioStorage";
import { SettingsDialog } from "./settings/SettingsDialog";
import {
  LanguageProvider,
  languageOptions,
  useLanguage,
  type InterfaceLanguage,
} from "./i18n/LanguageProvider";
import { getRepository, loadExistingSession, UI_SESSION_ID } from "./persistence";
import { startGatehouseExample } from "../scenarios/gatehouse";
import type { ConversationCatalog } from "@persistence/ConversationSchema";
import type { StudioResume } from "@persistence/IndexedDBRepository";
import type { Session } from "@state/StateSchema";
import type { StudioView } from "./studio/types";
import "./styles.css";
import "./dice.css";
import "./experience.css";
import "./page-system.css";

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
function HeaderLanguagePicker() {
  const { language, setLanguage } = useLanguage();
  return (
    <select
      className="sb-header-language"
      aria-label="Interface language"
      value={language}
      onChange={(event) => setLanguage(event.target.value as InterfaceLanguage)}
    >
      {languageOptions.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
function HeaderAppearanceToggle() {
  const { library, setShell, ready } = useAppearance();
  const dark = library.shell === "dark";
  const { t } = useLanguage();
  return (
    <button
      type="button"
      className="sb-header-appearance"
      disabled={!ready}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setShell(dark ? "light" : "dark")}
    >
      <span aria-hidden="true">{dark ? "☾" : "☀"}</span>
      <span>{dark ? t("themeDark") : t("themeLight")}</span>
    </button>
  );
}

function ConversationAppearance({
  id,
  authorTheme,
}: {
  id: string | null;
  authorTheme?: PlayTheme | undefined;
}) {
  const { ready, activateConversation } = useAppearance();
  const author = useRef(authorTheme);
  author.current = authorTheme;
  useLayoutEffect(() => {
    // The author's look is only for a game seen for the first time; the player's change stays.
    if (ready) activateConversation(id, author.current);
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
  const { t } = useLanguage();
  const { forgetConversation } = useAppearance();
  const [repo] = useState(() => getRepository());
  const resumePlay = useRef(
    (() => {
      try {
        return sessionStorage.getItem("explore-last-view") === "play";
      } catch {
        return false;
      }
    })(),
  );
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
  const [studioDirty, setStudioDirty] = useState(false);
  const [catalogRevision, setCatalogRevision] = useState(0);
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
      if (loaded && resumePlay.current) setView("play");
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
      if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err));
    });
    return () => {
      cancelled = true;
    };
  }, [repo, setLive]);

  useEffect(() => {
    if (session === undefined) return;
    try {
      sessionStorage.setItem("explore-last-view", view === "play" ? "play" : "home");
    } catch {}
  }, [view, session]);
  async function refreshCatalog() {
    try {
      setCatalog(await repo.listConversations());
    } catch (err) {
      setOperationError(
        err instanceof Error ? err.message : "Could not refresh your conversations.",
      );
    }
  }
  async function action(work: () => Promise<void>) {
    if (actionPending.current) throw new Error("Please wait while the conversation opens.");
    if (currentPhase.current === "streaming")
      throw new Error("Wait for the current reply to finish before changing conversations.");
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
        err instanceof Error ? err.message : "Could not update your conversations.",
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
      if (books.unreadable)
        setOperationError(
          "Some lorebooks could not be read and were skipped. Their original stored records have been kept; review Lorebooks when convenient.",
        );
      const place =
        next.scene?.placeId && books.entries.some((book) => book.binding.kind === "realm")
          ? (await repo.listPlaces()).find((item) => item.id === next.scene?.placeId)
          : undefined;
      const realmId =
        place?.realmId ??
        (!next.scene?.placeId
          ? books.entries.find(
              (book) =>
                book.materializedRealmId &&
                book.materializedCharacterIds?.some((id) =>
                  Object.values(next.characters).some((c) => c.sourceLibraryId === id),
                ),
            )?.materializedRealmId
          : undefined);
      const fresh = attachLorebooks({ ...next, id: crypto.randomUUID() }, books.entries, {
        realmId,
      });
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
      await refreshCatalog();
      setStudioDirty(false);
      setView("play");
    });
  }
  async function openConversation(id: string) {
    if (!canLeaveStudio()) return;
    await action(async () => {
      await persistCurrent();
      const next = live.current?.id === id ? live.current : await repo.loadSession(id);
      await repo.activateConversation(id);
      if (live.current?.id !== id) {
        setResume(sceneResume(next));
        setLive(next);
        setGeneration((value) => value + 1);
      }
      setStudioDirty(false);
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
        setGeneration((value) => value + 1);
      }
      setResume((current) =>
        current?.conversationId === id ||
        (id === UI_SESSION_ID && current && !current.conversationId)
          ? null
          : current,
      );
      setCatalog((current) => ({
        ...current,
        entries: current.entries.filter((entry) => entry.id !== id),
      }));
      forgetConversation(id);
      let cleanupFailed = false;
      try {
        sessionStorage.removeItem(`sandboxai-draft:${id}`);
      } catch {
        cleanupFailed = true;
      }
      try {
        await deleteAudioPreferences(id);
      } catch {
        cleanupFailed = true;
      }
      if (cleanupFailed)
        setOperationError(
          "Conversation deleted. Some local playback preferences or draft data could not be cleared.",
        );
      await refreshCatalog();
    });
  }
  function canLeaveStudio() {
    return (
      view !== "studio" ||
      !studioDirty ||
      confirm(studioView === "cutscenes" ? t("csDiscardQuestion") : t("navDiscard"))
    );
  }

  const backup = useLibraryBackup({
    repo,
    canRestore: canLeaveStudio,
    onRestored: () => {
      setStudioDirty(false);
      setCatalogRevision((revision) => revision + 1);
    },
  });

  function navigate(destination: "home" | "conversations" | "ideas" | "guide") {
    if (destination === view || !canLeaveStudio()) return;
    report(
      action(async () => {
        await persistCurrent();
        setStudioDirty(false);
        setView(destination);
        await refreshCatalog();
      }),
    );
  }
  function openStudio(next: StudioView) {
    if (actionPending.current || currentPhase.current === "streaming") {
      setOperationError("Wait for the current reply to finish before opening the studio.");
      return;
    }
    const destination = next === "places" ? "maps" : next;
    if ((view === "studio" && destination === studioView) || !canLeaveStudio()) return;
    setStudioDirty(false);
    setStudioView(destination);
    setView("studio");
    setOperationError(null);
  }
  function openGuideStoryboard(campaignId: string, sceneId?: string) {
    setResume({ campaignId, openStoryboard: true, ...(sceneId ? { sceneId } : {}) });
    openStudio("campaigns");
  }
  async function newConversation(current: Session, nextResume: StudioResume | null) {
    await action(async () => {
      await repo.saveSession(current);
      if (nextResume) await repo.saveStudioResume(nextResume);
      else await repo.clearStudioResume();
      setLive(current);
      setResume(nextResume);
      setStudioView(current.campaignId ? "campaigns" : "adventure");
      setStudioDirty(false);
      setView("studio");
      await refreshCatalog();
    });
  }
  if (loadError)
    return (
      <div className="sb-loading">
        <h1>We couldn't open your space.</h1>
        <p role="alert">{loadError}</p>
        <button type="button" className="sb-button" onClick={() => window.location.reload()}>
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
        authorTheme={view === "play" ? session?.authorTheme : undefined}
      />
      <header className="sb-header" data-play={view === "play" || undefined}>
        <div className="sb-header-start">
          <button
            type="button"
            className="sb-brand"
            onClick={() => navigate("home")}
            aria-label="kaampi Explore home"
          >
            <img
              className="sb-brand__logo sb-brand__logo--light"
              src="/brand/kaampi-explore.svg"
              alt="kaampi Explore"
            />
            <img
              className="sb-brand__logo sb-brand__logo--dark"
              src="/brand/kaampi-explore-dark.svg"
              alt="kaampi Explore"
            />
          </button>
          {view !== "play" && (
            <nav className="sb-header-utilities" aria-label="Help and settings">
              <button type="button" onClick={() => openGuide()}>
                {t("guide")}
              </button>
              <button type="button" onClick={() => setAppearanceOpen(true)}>
                {t("settings")}
              </button>
            </nav>
          )}
        </div>
        {view !== "play" && (
          <ExploreNavigation
            view={view === "studio" ? studioView : view}
            openStudio={openStudio}
            onIdeas={() => navigate("ideas")}
            onConversations={() => navigate("conversations")}
            onContinue={session ? () => report(openConversation(session.id)) : undefined}
            resumeDisabled={working}
            backup={backup}
          />
        )}
        <div className="sb-header-preferences">
          <CodexConnection />
          <HeaderLanguagePicker />
          <HeaderAppearanceToggle />
        </div>
      </header>
      {backup.input}
      {backup.notice && (
        <p className="sb-backup-notice" role="status">
          {backup.notice}
        </p>
      )}
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
          onStartGuidePlaytest={startScene}
          onOpenGuideStoryboard={({ campaignId, sceneId }) =>
            openGuideStoryboard(campaignId, sceneId)
          }
          onStartGatehouse={async () => {
            report(
              startScene(await startGatehouseExample(repo, UI_SESSION_ID, session.runtime.model)),
            );
          }}
          title={catalog.entries.find((entry) => entry.id === session.id)?.title}
          onHome={(current) => {
            setLive(current);
            navigate("home");
          }}
          onAppearance={() => setAppearanceOpen(true)}
        />
      ) : (
        <div className={`sb-workspace${view === "studio" ? " sb-workspace--studio" : ""}`}>
          {view === "studio" ? (
            <div className="sb-studio-wrap">
              <StudioShell
                key={catalogRevision}
                view={studioView}
                onViewChange={openStudio}
                onDirtyChange={setStudioDirty}
                sessionId={UI_SESSION_ID}
                repo={repo}
                resume={resume}
                onStart={(next) => report(startScene(next))}
              />
            </div>
          ) : view === "guide" ? (
            <GuidePanel />
          ) : view === "ideas" ? (
            <IdeaLibrary
              repo={repo}
              conversations={catalog.entries}
              onOpen={(id) => report(openConversation(id))}
            />
          ) : view === "conversations" ? (
            <ConversationLibrary
              entries={catalog.entries}
              unreadable={catalog.unreadable}
              busy={working || phase === "streaming"}
              onOpen={(id) => report(openConversation(id))}
              onRename={renameConversation}
              onDelete={deleteConversation}
              onArchive={(id, archived) => report(archiveConversation(id, archived))}
              onNew={() => navigate("home")}
            />
          ) : (
            <HomeScreen
              key={`${generation}-${catalogRevision}`}
              repo={repo}
              session={session}
              sessionId={UI_SESSION_ID}
              onResume={() => {
                if (session) report(openConversation(session.id));
              }}
              onStart={startScene}
              onStudio={openStudio}
              onGuideStoryboard={openGuideStoryboard}
              conversations={catalog.entries}
              navigationBusy={working}
            />
          )}
        </div>
      )}
      <GuideHost />
      {appearanceOpen && <SettingsDialog onClose={() => setAppearanceOpen(false)} />}
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
    <LanguageProvider>
      <ThemeProvider>
        <ConnectionProvider>
          <UpdateProvider>
            <SandboxApp />
          </UpdateProvider>
        </ConnectionProvider>
      </ThemeProvider>
    </LanguageProvider>
  );
}
