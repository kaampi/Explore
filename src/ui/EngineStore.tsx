import React, {
  createContext,
  useContext,
  useMemo,
  useRef,
  useState,
  useCallback,
  useEffect,
  useSyncExternalStore,
} from "react";
import { StateEngine } from "@state/StateEngine";
import type { Session } from "@state/StateSchema";
import { EventLog, type StateEvent } from "@events/EventLog";
import { LLMAdapter } from "@llm/LLMAdapter";
import { OpenAICompatibleProvider } from "@llm/providers/OpenAICompatibleProvider";
import { useConnection } from "./connection/ConnectionProvider";
import {
  OllamaProvider,
  DEFAULT_OLLAMA_MODEL,
} from "@llm/providers/OllamaProvider";
import {
  SessionEngine,
  TurnFailedError,
  WhatNowRequiredError,
  ReplayNoBeatError,
} from "@session/SessionEngine";
import { createLLMProposalExtractor } from "@session/ProposalExtraction";
import { createLLMLayerProposalExtractor } from "@layers/LayerProposalExtraction";
import { createLLMConversationSummarizer } from "@memory/RollingMemory";
import {
  compactionIsUseful,
  createLLMLayerCompactor,
  flagsForCompactedGroup,
  keywordsForCompactedGroup,
  selectEstablishedForCompaction,
  selectPendingForCompaction,
  type CompactableType,
} from "@layers/LayerCompaction";
import type {
  IndexedDBRepository,
  StudioResume,
} from "@persistence/IndexedDBRepository";
import {
  examplePlaceTemplate,
  mergeWithExamples,
} from "@library/exampleTemplates";
import type { PlaceTemplate } from "@library/LibrarySchema";
import { primaryCharacter } from "@session/createSession";
import { landmarkTravelPatch } from "@session/landmarkTravel";
import { mapLandmarkTravels } from "@state/landmarkTravel";
import { foldPlace } from "@state/roomMatch";
import { focusCharacterId, lastCharacterSpeaker } from "@state/sceneFocus";
import { isLeftBehind } from "@state/party";
import { draftSceneHandoff } from "@state/sceneHandoff";

/**
 * This is the seam between the engine layer (fully tested in isolation,
 * see /tests) and React. It intentionally does very little "logic" of
 * its own — it wires real engine instances together, shares one
 * EventLog between StateEngine and SessionEngine so Inspector Mode can
 * see the full mutation trace (not just turn summaries), and exposes a
 * reactive snapshot via useSyncExternalStore.
 */

export type ChatPhase = "idle" | "streaming" | "error";

interface EngineContextValue {
  useSession: () => Session;
  useEventLog: () => readonly StateEvent[];
  phase: ChatPhase;
  streamingText: string;
  streamingCharacterId: string | null;
  streamingNarrator: boolean;
  lastError: string | null;
  sendMessage: (
    text: string,
    options?: { goTo?: string; travelPlaceId?: string },
  ) => Promise<void>;
  regenerate: (note?: string) => Promise<void>;
  replay: (conversationTurn: number, note?: string) => Promise<void>;
  inspectTurn: number | null;
  setInspectTurn: (turn: number | null) => void;
  canRegenerate: boolean;
  toggleLayer: (layerId: string, active: boolean) => void;
  addPlayerLayer: (params: {
    type: "core" | "relationship" | "environment" | "state_trigger";
    content: string;
    keywords?: string[];
    once?: boolean;
    trigger?: string;
  }) => void;
  setLayerKeywords: (layerId: string, keywords: string[]) => void;
  removeLayer: (layerId: string) => void;
  compactLayers: (
    scope: "pending" | CompactableType,
  ) => Promise<{ ok: boolean; reason?: string }>;
  compacting: boolean;
  editMessage: (
    turnNumber: number,
    newContent: string,
  ) => { ok: boolean; reason?: string };
  undo: () => { ok: boolean; reason?: string };
  ollamaModel: string;
  setOllamaModel: (model: string) => void;
  setMaxReplyTokens: (tokens: number) => void;
  setFieldLock: (path: string, lock: "unlocked" | "player_locked") => void;
  setHandoff: (text: string) => void;
  setOutgoingHandoff: (text: string) => void;
  setRoomOpened: (roomId: string, opened: boolean) => void;
  acceptParty: (characterId: string) => void;
  leaveParty: (characterId: string) => void;
  holdParty: (characterId: string) => void;
  followParty: (characterId: string) => void;
  travelPlaces: Array<{ id: string; name: string; realmId: string }>;
  resetSession: () => Promise<void>;
}

const EngineContext = createContext<EngineContextValue | null>(null);

export function useEngine(): EngineContextValue {
  const ctx = useContext(EngineContext);
  if (!ctx) throw new Error("useEngine must be used within <EngineProvider>");
  return ctx;
}

export function EngineProvider({
  initialSession,
  repo,
  children,
  onNewConversation,
}: {
  initialSession: Session;
  repo: IndexedDBRepository;
  children: React.ReactNode;
  onNewConversation: (
    session: Session,
    resume: StudioResume | null,
  ) => Promise<void>;
}) {
  const { backend, baseUrl } = useConnection();
  const [ollamaModel, setOllamaModelState] = useState(
    () => initialSession.runtime.model.trim() || DEFAULT_OLLAMA_MODEL,
  );
  const [phase, setPhase] = useState<ChatPhase>("idle");
  const [streamingText, setStreamingText] = useState("");
  const [streamingCharacterId, setStreamingCharacterId] = useState<
    string | null
  >(null);
  const [streamingNarrator, setStreamingNarrator] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [hasCompletedTurn, setHasCompletedTurn] = useState(false);
  const [inspectTurn, setInspectTurn] = useState<number | null>(null);
  const [compacting, setCompacting] = useState(false);
  const [travelPlaces, setTravelPlaces] = useState<
    Array<{ id: string; name: string; realmId: string }>
  >([]);
  const placesRef = useRef<PlaceTemplate[]>([]);

  const pass1Adapter = useMemo(
    () =>
      new LLMAdapter({ primary: backend === "strata" ? new OpenAICompatibleProvider({ model: ollamaModel, baseUrl, name: "strata:" + ollamaModel }) : new OllamaProvider({ model: ollamaModel }) }),
    [ollamaModel, backend, baseUrl],
  );
  const pass2Adapter = useMemo(
    () =>
      new LLMAdapter({ primary: new OllamaProvider({ model: ollamaModel }) }),
    [ollamaModel],
  );

  // Engines are constructed once and held in refs — they're stateful
  // classes, not values React should re-create on re-render. The shared
  // EventLog is the important detail: without it, StateEngine's mutation
  // events and SessionEngine's turn_committed events would live in two
  // disconnected logs and Inspector Mode couldn't show one true trace.
  const sharedEventLogRef = useRef<EventLog>();
  if (!sharedEventLogRef.current) sharedEventLogRef.current = new EventLog();
  const sharedEventLog = sharedEventLogRef.current;

  const stateEngineRef = useRef<StateEngine>();
  if (!stateEngineRef.current)
    stateEngineRef.current = new StateEngine(initialSession, sharedEventLog);
  const stateEngine = stateEngineRef.current;

  const proposalExtractor = useMemo(
    () => createLLMProposalExtractor(pass2Adapter, { onFailure: () => {} }),
    [pass2Adapter],
  );
  const layerProposalExtractor = useMemo(
    () =>
      createLLMLayerProposalExtractor(pass2Adapter, { onFailure: () => {} }),
    [pass2Adapter],
  );
  const layerCompactor = useMemo(
    () => createLLMLayerCompactor(pass2Adapter),
    [pass2Adapter],
  );
  const conversationSummarizer = useMemo(
    () =>
      createLLMConversationSummarizer(pass2Adapter, { onFailure: () => {} }),
    [pass2Adapter],
  );
  const sessionEngineRef = useMemo(
    () =>
      new SessionEngine(
        stateEngine,
        pass1Adapter,
        sharedEventLog,
        proposalExtractor,
        { summarizer: conversationSummarizer },
        layerProposalExtractor,
      ),
    [
      stateEngine,
      pass1Adapter,
      sharedEventLog,
      proposalExtractor,
      conversationSummarizer,
      layerProposalExtractor,
    ],
  );

  // A fresh SessionEngine instance (e.g. after changing the Ollama model)
  // has no turn history of its own — Regenerate must not appear
  // available for a turn the new instance never ran.
  useEffect(() => {
    setHasCompletedTurn(false);
  }, [sessionEngineRef]);

  useEffect(() => {
    let cancelled = false;
    repo
      .listPlaces()
      .then((listed) => {
        if (cancelled) return;
        const merged = mergeWithExamples(listed, [examplePlaceTemplate()]);
        placesRef.current = merged;
        setTravelPlaces(
          merged.map((item) => ({
            id: item.id,
            name: item.name,
            realmId: item.realmId,
          })),
        );
      })
      .catch(() => {
        if (cancelled) return;
        const fallback = [examplePlaceTemplate()];
        placesRef.current = fallback;
        setTravelPlaces(
          fallback.map((item) => ({
            id: item.id,
            name: item.name,
            realmId: item.realmId,
          })),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [repo]);

  // --- Reactive session snapshot via useSyncExternalStore -------------
  const sessionListeners = useRef(new Set<() => void>()).current;
  const sessionSnapshotRef = useRef<Session>(stateEngine.getSession());
  const notifySession = useCallback(() => {
    sessionSnapshotRef.current = stateEngine.getSession();
    sessionListeners.forEach((l) => l());
  }, [sessionListeners, stateEngine]);

  const useSession = useCallback((): Session => {
    return useSyncExternalStore(
      (onStoreChange) => {
        sessionListeners.add(onStoreChange);
        return () => sessionListeners.delete(onStoreChange);
      },
      () => sessionSnapshotRef.current,
    );
  }, [sessionListeners]);

  // --- Reactive event log snapshot -------------------------------------
  const eventLogSnapshotRef = useRef<readonly StateEvent[]>(
    sharedEventLog.all(),
  );
  const useEventLog = useCallback((): readonly StateEvent[] => {
    return useSyncExternalStore(
      (onStoreChange) => {
        sessionListeners.add(onStoreChange);
        return () => sessionListeners.delete(onStoreChange);
      },
      () => eventLogSnapshotRef.current,
    );
  }, [sessionListeners]);

  const refreshSnapshots = useCallback(() => {
    eventLogSnapshotRef.current = sharedEventLog.all();
    notifySession();
    const session = stateEngine.getSession();
    // Fire-and-forget autosave. A failed save shouldn't block the UI —
    // the in-memory session is still correct, it just won't survive a
    // refresh this time. Logged, not surfaced as a chat error, since
    // it's unrelated to whether the turn itself succeeded.
    repo.saveSession(session).catch((err) => {
      console.warn("Autosave failed:", err);
    });
    // Runtime story flags stay in this conversation; the reusable campaign is authored input.
  }, [notifySession, sharedEventLog, repo, stateEngine]);

  const sendMessage = useCallback(
    async (
      text: string,
      options?: { goTo?: string; travelPlaceId?: string },
    ) => {
      setPhase("streaming");
      setStreamingText("");
      setLastError(null);
      const turnId = crypto.randomUUID();

      try {
        const session = stateEngine.getSession();
        const speakingAsId =
          focusCharacterId(session, text) ?? primaryCharacter(session)?.id;
        if (!speakingAsId) {
          throw new Error("There is no character in this scene to speak.");
        }
        setStreamingCharacterId(speakingAsId);
        setStreamingNarrator(isLeftBehind(session, speakingAsId));
        const syncStreamingFace = () => {
          refreshSnapshots();
          const live = stateEngine.getSession();
          setStreamingNarrator(isLeftBehind(live, speakingAsId));
        };
        let travel = options?.travelPlaceId?.trim()
          ? (() => {
              const place = placesRef.current.find(
                (item) => item.id === options.travelPlaceId?.trim(),
              );
              return place ? landmarkTravelPatch(place) : undefined;
            })()
          : undefined;
        if (!travel && !options?.goTo?.trim()) {
          const exits = mapLandmarkTravels(session, placesRef.current);
          const hay = foldPlace(text);
          if (/\b(?:walk|go|gå|head|leave)\b/i.test(text)) {
            const hit = exits.find((exit) => {
              const place = placesRef.current.find(
                (item) => item.id === exit.id,
              );
              return (
                hay.includes(foldPlace(exit.label)) ||
                (place ? hay.includes(foldPlace(place.name)) : false)
              );
            });
            if (hit) {
              const place = placesRef.current.find(
                (item) => item.id === hit.id,
              );
              if (place) travel = landmarkTravelPatch(place);
            }
          }
        }
        const result = await sessionEngineRef.runTurn(
          turnId,
          speakingAsId,
          text,
          {
            onTextDelta: (delta) => setStreamingText((prev) => prev + delta),
            onPlayerMessageAppended: refreshSnapshots,
            onSessionUpdated: syncStreamingFace,
          },
          {
            ...(options?.goTo?.trim() ? { goTo: options.goTo.trim() } : {}),
            ...(travel ? { travel } : {}),
          },
        );
        setPhase("idle");
        setStreamingText("");
        setStreamingCharacterId(null);
        setStreamingNarrator(false);
        if (!result.openedWhatNow) setHasCompletedTurn(true);
        refreshSnapshots();
      } catch (err) {
        if (err instanceof WhatNowRequiredError) {
          setPhase("idle");
          setStreamingText("");
          setStreamingCharacterId(null);
          setStreamingNarrator(false);
          refreshSnapshots();
          return;
        }
        setPhase("error");
        setStreamingText("");
        setStreamingCharacterId(null);
        setStreamingNarrator(false);
        console.error("Turn failed:", err); // full cause chain visible in DevTools, even though the UI message is short
        const message =
          err instanceof TurnFailedError
            ? err.message
            : "Something went wrong with this turn.";
        setLastError(message);
        refreshSnapshots(); // the player message may have committed even if the turn later failed
      }
    },
    [refreshSnapshots, sessionEngineRef],
  );

  const regenerate = useCallback(
    async (note?: string) => {
      setPhase("streaming");
      setStreamingText("");
      setLastError(null);
      const turnId = crypto.randomUUID();

      try {
        const session = stateEngine.getSession();
        const speakingAsId =
          lastCharacterSpeaker(session) ??
          primaryCharacter(session)?.id ??
          null;
        setStreamingCharacterId(speakingAsId);
        setStreamingNarrator(
          Boolean(speakingAsId && isLeftBehind(session, speakingAsId)),
        );
        const trimmed = note?.trim();
        await sessionEngineRef.regenerateLastTurn(
          turnId,
          {
            onTextDelta: (delta) => setStreamingText((prev) => prev + delta),
            onSessionUpdated: () => {
              refreshSnapshots();
              if (speakingAsId)
                setStreamingNarrator(
                  isLeftBehind(stateEngine.getSession(), speakingAsId),
                );
            },
          },
          trimmed ? { note: trimmed } : {},
        );
        setPhase("idle");
        setStreamingText("");
        setStreamingCharacterId(null);
        setStreamingNarrator(false);
        refreshSnapshots();
      } catch (err) {
        setPhase("error");
        setStreamingText("");
        setStreamingCharacterId(null);
        setStreamingNarrator(false);
        console.error("Regeneration failed:", err);
        const message =
          err instanceof TurnFailedError ? err.message : "Regeneration failed.";
        setLastError(message);
        refreshSnapshots();
      }
    },
    [refreshSnapshots, sessionEngineRef],
  );

  const replay = useCallback(
    async (conversationTurn: number, note?: string) => {
      setPhase("streaming");
      setStreamingText("");
      setLastError(null);
      setInspectTurn(null);
      const turnId = crypto.randomUUID();

      try {
        const session = stateEngine.getSession();
        const speakingAsId =
          lastCharacterSpeaker(session) ??
          primaryCharacter(session)?.id ??
          null;
        setStreamingCharacterId(speakingAsId);
        setStreamingNarrator(
          Boolean(speakingAsId && isLeftBehind(session, speakingAsId)),
        );
        const trimmed = note?.trim();
        await sessionEngineRef.replayTurn(
          turnId,
          conversationTurn,
          {
            onTextDelta: (delta) => setStreamingText((prev) => prev + delta),
            onSessionUpdated: () => {
              refreshSnapshots();
              if (speakingAsId)
                setStreamingNarrator(
                  isLeftBehind(stateEngine.getSession(), speakingAsId),
                );
            },
          },
          trimmed ? { note: trimmed } : {},
        );
        setHasCompletedTurn(true);
        setPhase("idle");
        setStreamingText("");
        setStreamingCharacterId(null);
        setStreamingNarrator(false);
        refreshSnapshots();
      } catch (err) {
        setPhase("error");
        setStreamingText("");
        setStreamingCharacterId(null);
        setStreamingNarrator(false);
        console.error("Replay failed:", err);
        const message =
          err instanceof ReplayNoBeatError
            ? err.message
            : err instanceof TurnFailedError
              ? err.message
              : "Replay failed.";
        setLastError(message);
        refreshSnapshots();
      }
    },
    [refreshSnapshots, sessionEngineRef, stateEngine],
  );

  const toggleLayer = useCallback(
    (layerId: string, active: boolean) => {
      const currentVersion = stateEngine.getSession().stateVersion;
      stateEngine.setLayerActive(
        layerId,
        active,
        "player_manual_state",
        currentVersion,
      );
      refreshSnapshots();
    },
    [stateEngine, refreshSnapshots],
  );

  const addPlayerLayer = useCallback(
    (params: {
      type: "core" | "relationship" | "environment" | "state_trigger";
      content: string;
      keywords?: string[];
      once?: boolean;
      trigger?: string;
    }) => {
      const currentVersion = stateEngine.getSession().stateVersion;
      stateEngine.addLayer(
        {
          type: params.type,
          priority: 5,
          content: params.content,
          keywords: params.keywords ?? [],
          ...(params.once ? { once: true } : {}),
          ...(params.trigger ? { trigger: params.trigger } : {}),
          active: true,
        },
        "player_manual_state",
        currentVersion,
      );
      refreshSnapshots();
    },
    [stateEngine, refreshSnapshots],
  );

  const setLayerKeywords = useCallback(
    (layerId: string, keywords: string[]) => {
      const currentVersion = stateEngine.getSession().stateVersion;
      stateEngine.setLayerKeywords(
        layerId,
        keywords,
        "player_manual_state",
        currentVersion,
      );
      refreshSnapshots();
    },
    [stateEngine, refreshSnapshots],
  );

  const removeLayer = useCallback(
    (layerId: string) => {
      const currentVersion = stateEngine.getSession().stateVersion;
      stateEngine.removeLayer(layerId, "player_manual_state", currentVersion);
      refreshSnapshots();
    },
    [stateEngine, refreshSnapshots],
  );

  const compactLayers = useCallback(
    async (
      scope: "pending" | CompactableType,
    ): Promise<{ ok: boolean; reason?: string }> => {
      if (compacting) return { ok: false, reason: "Already compacting." };
      const session = stateEngine.getSession();
      const characterIds = Object.keys(session.characters);
      const groups =
        scope === "pending"
          ? selectPendingForCompaction(session.layers, characterIds)
          : selectEstablishedForCompaction(session.layers, characterIds, scope);

      if (groups.length === 0) {
        return {
          ok: false,
          reason: "Need at least two similar notes to compact.",
        };
      }

      setCompacting(true);
      try {
        const removeIds: string[] = [];
        const replacements: Array<{
          type: CompactableType;
          content: string;
          active: boolean;
          aiGenerated: boolean;
          priority: number;
          keywords: string[];
        }> = [];

        for (const group of groups) {
          const contents = group.layers.map((layer) => layer.content);
          const merged = await layerCompactor(group.type, contents);
          if (!merged || !compactionIsUseful(contents, merged)) continue;
          const flags = flagsForCompactedGroup(group.layers);
          const keywords = keywordsForCompactedGroup(group.layers);
          const priority = Math.min(
            ...group.layers.map((layer) => layer.priority),
          );
          removeIds.push(...group.layers.map((layer) => layer.id));
          for (const content of merged) {
            replacements.push({
              type: group.type,
              content,
              active: flags.active,
              aiGenerated: flags.aiGenerated,
              priority,
              keywords,
            });
          }
        }

        if (removeIds.length < 2 || replacements.length === 0) {
          return {
            ok: false,
            reason: "The model did not find a tighter version.",
          };
        }

        const result = stateEngine.compactReplaceLayers(
          removeIds,
          replacements,
          "player_manual_state",
          stateEngine.getSession().stateVersion,
        );
        refreshSnapshots();
        return result.committed
          ? { ok: true }
          : {
              ok: false,
              reason: result.reason ?? "Could not compact these notes.",
            };
      } finally {
        setCompacting(false);
      }
    },
    [compacting, layerCompactor, refreshSnapshots, stateEngine],
  );

  const editMessage = useCallback(
    (
      turnNumber: number,
      newContent: string,
    ): { ok: boolean; reason?: string } => {
      const currentVersion = stateEngine.getSession().stateVersion;
      const result = stateEngine.editConversationTurn(
        turnNumber,
        newContent,
        "player_manual_state",
        currentVersion,
      );
      refreshSnapshots();
      return result.committed
        ? { ok: true }
        : { ok: false, reason: result.reason };
    },
    [stateEngine, refreshSnapshots],
  );

  const undo = useCallback((): { ok: boolean; reason?: string } => {
    const currentVersion = stateEngine.getSession().stateVersion;
    const result = stateEngine.undoLastMutation(
      "player_manual_state",
      currentVersion,
    );
    refreshSnapshots();
    return result.committed
      ? { ok: true }
      : { ok: false, reason: result.reason };
  }, [stateEngine, refreshSnapshots]);

  const resetSession = useCallback(async () => {
    if (phase === "streaming") return;
    const current = stateEngine.getSession();
    const handoff = draftSceneHandoff(current);
    const resume: StudioResume | null = current.campaignId
      ? {
          conversationId: current.id,
          campaignId: current.campaignId,
          ...(current.sceneId ? { sceneId: current.sceneId } : {}),
          ...(handoff ? { handoff } : {}),
        }
      : null;
    try {
      await onNewConversation(current, resume);
    } catch (err) {
      setLastError(
        err instanceof Error
          ? err.message
          : "Could not save this conversation.",
      );
      setPhase("error");
    }
  }, [stateEngine, phase, onNewConversation]);

  const setOllamaModel = useCallback(
    (model: string) => {
      setOllamaModelState(model);
      stateEngine.setRuntimeModel(model);
      refreshSnapshots();
    },
    [stateEngine, refreshSnapshots],
  );

  const setMaxReplyTokens = useCallback(
    (tokens: number) => {
      stateEngine.setRuntimeMaxReplyTokens(tokens);
      refreshSnapshots();
    },
    [stateEngine, refreshSnapshots],
  );

  const setFieldLock = useCallback(
    (path: string, lock: "unlocked" | "player_locked") => {
      const currentVersion = stateEngine.getSession().stateVersion;
      stateEngine.proposeLockChange({
        path,
        requestedLock: lock,
        source: "player_manual_state",
        expectedStateVersion: currentVersion,
      });
      refreshSnapshots();
    },
    [stateEngine, refreshSnapshots],
  );

  const setHandoff = useCallback(
    (text: string) => {
      stateEngine.setHandoff(text);
      refreshSnapshots();
    },
    [stateEngine, refreshSnapshots],
  );

  const setOutgoingHandoff = useCallback(
    (text: string) => {
      stateEngine.setOutgoingHandoff(text);
      refreshSnapshots();
    },
    [stateEngine, refreshSnapshots],
  );

  const setRoomOpened = useCallback(
    (roomId: string, opened: boolean) => {
      stateEngine.setRoomOpened(roomId, opened);
      refreshSnapshots();
    },
    [stateEngine, refreshSnapshots],
  );

  const acceptParty = useCallback(
    (characterId: string) => {
      stateEngine.acceptParty(characterId);
      refreshSnapshots();
    },
    [stateEngine, refreshSnapshots],
  );

  const leaveParty = useCallback(
    (characterId: string) => {
      stateEngine.leaveParty(characterId);
      refreshSnapshots();
    },
    [stateEngine, refreshSnapshots],
  );

  const holdParty = useCallback(
    (characterId: string) => {
      stateEngine.holdParty(characterId);
      refreshSnapshots();
    },
    [stateEngine, refreshSnapshots],
  );

  const followParty = useCallback(
    (characterId: string) => {
      stateEngine.followParty(characterId);
      refreshSnapshots();
    },
    [stateEngine, refreshSnapshots],
  );

  const value: EngineContextValue = {
    useSession,
    useEventLog,
    phase,
    streamingText,
    streamingCharacterId,
    streamingNarrator,
    lastError,
    sendMessage,
    regenerate,
    replay,
    inspectTurn,
    setInspectTurn,
    canRegenerate: hasCompletedTurn,
    toggleLayer,
    addPlayerLayer,
    setLayerKeywords,
    removeLayer,
    compactLayers,
    compacting,
    editMessage,
    undo,
    ollamaModel,
    setOllamaModel,
    setMaxReplyTokens,
    setFieldLock,
    setHandoff,
    setOutgoingHandoff,
    setRoomOpened,
    acceptParty,
    leaveParty,
    holdParty,
    followParty,
    travelPlaces,
    resetSession,
  };

  return (
    <EngineContext.Provider value={value}>{children}</EngineContext.Provider>
  );
}
