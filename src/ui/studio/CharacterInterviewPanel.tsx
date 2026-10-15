import { useRef, useState } from "react";
import type { GeneratedCharacter } from "@library/characterGenerator";
import { INTERVIEW_OPENING, type InterviewReply } from "@library/characterInterview";
import { pronounLabel } from "@state/pronouns";
import { conductCharacterInterviewWithOllama } from "./characterInterviewWithOllama";

type Turn = { role: "guide" | "user"; text: string };

function formatName(card: GeneratedCharacter): string {
  return [card.name, card.middleName, card.familyName].map((part) => part.trim()).filter(Boolean).join(" ");
}

function userLines(turns: readonly Turn[]): string[] {
  return turns.filter((turn) => turn.role === "user").map((turn) => turn.text);
}

export function CharacterInterviewPanel({
  busy,
  onApply
}: {
  busy: boolean;
  onApply: (card: GeneratedCharacter) => void;
}) {
  const [seed] = useState(() => Math.floor(Math.random() * 1_000_000_000));
  const [turns, setTurns] = useState<Turn[]>([{ role: "guide", text: INTERVIEW_OPENING }]);
  const [reply, setReply] = useState("");
  const [draft, setDraft] = useState<InterviewReply | null>(null);
  const [note, setNote] = useState("");
  const [asking, setAsking] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  async function submit(text: string) {
    const line = text.trim();
    if (!line || busy || asking) return;
    const nextTurns: Turn[] = [...turns, { role: "user", text: line }];
    setTurns(nextTurns);
    setReply("");
    setAsking(true);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const result = await conductCharacterInterviewWithOllama(
        { messages: userLines(nextTurns), seed },
        controller.signal
      );
      if (controller.signal.aborted) return;
      setDraft(result.reply);
      setNote(result.note);
      const guide = result.reply.question || "This is the person. Accept puts the card on the sheet.";
      setTurns([...nextTurns, { role: "guide", text: guide }]);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setNote("Could not reach Ollama. This draft used the local generator.");
    } finally {
      if (abortRef.current === controller) setAsking(false);
    }
  }

  const card = draft?.card ?? null;

  return (
    <div className="character-interview">
      <div className="character-generator__thread">
        {turns.map((turn, index) => (
          <p key={`${turn.role}-${index}`} className={`character-generator__turn character-generator__turn--${turn.role}`}>
            {turn.role === "user" ? `You: ${turn.text}` : turn.text}
          </p>
        ))}
      </div>
      {card && (
        <div className="character-generator__proposal">
          <p className="character-generator__name">{formatName(card)}</p>
          <p>
            {pronounLabel(card.pronoun)} · about {card.approximateAge} · {card.mood}
          </p>
          <p>{card.appearance}</p>
          <p>
            <span className="setup-field__label">How they speak</span>
            {card.speech}
          </p>
          <p>{card.personality}</p>
          {card.tags.length > 0 && <p>{card.tags.join(", ")}</p>}
          <p>
            <span className="setup-field__label">Image prompt</span>
            {draft?.imagePrompt}
          </p>
        </div>
      )}
      {note && <p className="character-generator__note">{note}</p>}
      <label className="setup-field">
        <span className="setup-field__label">Your reply</span>
        <textarea
          className="setup-field__story character-generator__brief"
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit(reply);
            }
          }}
          placeholder="A hero for a science-fiction adventure"
          disabled={busy || asking}
        />
      </label>
      <div className="studio-sheet__actions">
        <button
          type="button"
          className="setup-start"
          disabled={busy || asking || reply.trim().length === 0}
          onClick={() => void submit(reply)}
        >
          {asking ? "Thinking..." : "Send"}
        </button>
        {card && (
          <button type="button" className="setup-start" disabled={busy || asking} onClick={() => onApply(card)}>
            Accept
          </button>
        )}
        {card && (
          <button type="button" className="setup-example" disabled={busy || asking} onClick={() => void submit("Someone else.")}>
            Someone else
          </button>
        )}
      </div>
    </div>
  );
}
