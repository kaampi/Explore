import { useState } from "react";
import type { Session } from "../../state/StateSchema";
import type { IndexedDBRepository } from "../../persistence/IndexedDBRepository";
import { captureIdea, type Idea } from "../../ideas/IdeaSchema";
import { IdeaEditor } from "../ideas/IdeaEditor";

/**
 * A conversation from the old gatehouse test, opened for reading. The test itself has been
 * replaced by an ordinary adventure, so nothing here can be played: the talk can be read and
 * saved as ideas, and the new gatehouse can be started.
 */
export function LegacyGatePanel({
  session,
  repo,
  onStartNew,
  onHome,
}: {
  session: Session;
  repo?: IndexedDBRepository | undefined;
  onStartNew: () => void | Promise<void>;
  onHome: (session: Session) => void;
}) {
  const [idea, setIdea] = useState<Idea | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const turns = session.conversation as { turn: number; role: string; content: string }[];
  return (
    <div className="chat-panel legacy-gate-panel">
      <div className="sb-play-connection" role="status">
        <span>
          This gatehouse test has been replaced, so this conversation is read only. You can still
          read it and save parts of it as ideas.
        </span>
        <button
          type="button"
          className="sb-button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onStartNew();
            } catch (error) {
              setNotice(error instanceof Error ? error.message : "Could not start the gatehouse.");
            } finally {
              setBusy(false);
            }
          }}
        >
          Start the new gatehouse
        </button>
        <button type="button" className="sb-link" onClick={() => onHome(session)}>
          Back to home
        </button>
      </div>
      {notice && <p role="status">{notice}</p>}
      <div className="chat-log">
        {turns.map((turn) => (
          <div
            key={turn.turn}
            className={`message message--${turn.role === "player" ? "player" : "character"}`}
          >
            <span className="message__attribution">
              {turn.role === "player" ? session.player?.name || "Traveller" : "Gatehouse"}
            </span>
            <p>{turn.content}</p>
            {repo && (
              <button
                type="button"
                className="message__act"
                aria-label="Save as idea"
                onClick={() => setIdea(captureIdea(session, [turn.turn], "The gatehouse"))}
              >
                Save as idea
              </button>
            )}
          </div>
        ))}
      </div>
      {idea && repo && (
        <IdeaEditor
          idea={idea}
          repo={repo}
          onClose={() => setIdea(null)}
          onSaved={() => {
            setIdea(null);
            setNotice("Idea saved in My ideas.");
          }}
        />
      )}
    </div>
  );
}
