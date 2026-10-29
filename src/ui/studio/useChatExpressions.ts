import { useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@state/StateSchema";
import type { IndexedDBRepository } from "@persistence/IndexedDBRepository";
import { OllamaProvider } from "@llm/providers/OllamaProvider";
import { useConnection } from "../connection/ConnectionProvider";
import { useEngine } from "../EngineStore";
import { chooseChatExpression } from "./chatExpression";
import type { Profile } from "./morphRenderer";

export type ChatExpression = { profile: Profile; expression: string; turn: number };
type Turn = { role: string; speaker?: string; content: string; turn: number; toldBy?: string };

export function useChatExpressions(session: Session, repo: IndexedDBRepository | undefined, busy: boolean) {
  const { backend } = useConnection();
  const { ollamaModel } = useEngine();
  // Expression analysis is authorized for the local Ollama server only.
  const provider = useMemo(() => new OllamaProvider({ model: ollamaModel, baseUrl: "http://localhost:11434" }), [ollamaModel]);
  const [portraits, setPortraits] = useState<Record<string, ChatExpression>>({});
  const current = useRef(portraits);
  const seen = useRef(new Map<string, string>());
  const sessionId = useRef(session.id);
  useEffect(() => {
    if (sessionId.current !== session.id) {
      sessionId.current = session.id; seen.current.clear(); current.current = {}; setPortraits({});
    }
    if (!repo || busy || backend !== "ollama") return;
    const controller = new AbortController();
    const turns = session.conversation.filter((value): value is Turn => Boolean(value && typeof value === "object" && "role" in value && "content" in value && typeof value.content === "string" && "turn" in value && typeof value.turn === "number"));
    const latest = new Map<string, { turn: Turn; index: number }>();
    turns.forEach((turn, index) => {
      if (turn.role !== "character" || turn.toldBy === "narrator") return;
      const id = turn.speaker || Object.keys(session.characters)[0];
      if (id && session.characters[id]) latest.set(id, { turn, index });
    });
    void (async () => {
      for (const [id, { turn, index }] of latest) {
        if (controller.signal.aborted) return;
        const key = JSON.stringify([turn.turn, turn.content]);
        if (seen.current.get(id) === key) continue;
        try {
          const character = session.characters[id]!;
          const profile = await repo.loadCharacterMorph(character.sourceLibraryId || id) as Profile | null;
          if (controller.signal.aborted) return;
          if (!profile?.active || profile.version !== 1 || !Array.isArray(profile.expressions) || profile.expressions.length < 2) { seen.current.set(id, key); continue; }
          const available = profile.expressions.map(item => item.name);
          const previous = current.current[id]?.expression;
          const initial = available.includes(previous ?? "") ? previous! : available.find(name => name.toLowerCase() === "neutral") ?? available[0]!;
          const player = turns.slice(0, index).reverse().find(item => item.role === "player")?.content ?? "";
          const request = new AbortController();
          const abort = () => request.abort();
          controller.signal.addEventListener("abort", abort, { once: true });
          const timeout = setTimeout(abort, 15000);
          let choice: string | null = null;
          try { choice = await chooseChatExpression(provider, { character: character.name || id, current: initial, available, player: player.slice(-4000), reply: turn.content.slice(-12000) }, request.signal); }
          finally { clearTimeout(timeout); controller.signal.removeEventListener("abort", abort); }
          if (controller.signal.aborted) return;
          const next = { ...current.current, [id]: { profile, expression: choice ?? initial, turn: turn.turn } };
          current.current = next; setPortraits(next); seen.current.set(id, key);
        } catch { if (!controller.signal.aborted) seen.current.set(id, key); }
      }
    })();
    return () => controller.abort();
  }, [session.id, session.conversation, session.characters, repo, busy, backend, provider]);
  return portraits;
}
