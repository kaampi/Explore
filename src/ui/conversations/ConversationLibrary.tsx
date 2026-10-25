import { useState } from "react";
import type { ConversationEntry } from "@persistence/ConversationSchema";
import { Modal } from "../components/Modal";
import { useAppearance } from "../themes/ThemeProvider";

export function ConversationCard({
  entry,
  compact = false,
  busy = false,
  onOpen,
  onRename,
  onArchive,
  onDelete,
}: {
  entry: ConversationEntry;
  compact?: boolean;
  busy?: boolean;
  onOpen: (id: string) => void;
  onRename?: (entry: ConversationEntry) => void;
  onArchive?: (id: string, archived: boolean) => void;
  onDelete?: (entry: ConversationEntry) => void;
}) {
  const { library } = useAppearance();
  const theme =
    library.conversations[entry.id] ?? library.defaultPlay ?? library.active;
  const date = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(entry.updatedAt));
  return (
    <article
      className={`sb-conversation-card${compact ? " sb-conversation-card--compact" : ""}`}
    >
      <div className="sb-conversation-card__top">
        <span className="sb-eyebrow">
          {entry.participants.join(", ") || "YOUR EXPLORATION"}
        </span>
        <span>{date}</span>
      </div>
      <h3>{entry.title}</h3>
      <p>{entry.preview || "A conversation waiting to begin."}</p>
      <div className="sb-conversation-meta">
        <span>{entry.world}</span>
        <span>{entry.messageCount} messages</span>
        <span>
          <i style={{ background: theme.accent }} /> {theme.name}
        </span>
      </div>
      <div className="sb-conversation-actions">
        {!entry.archived && (
          <button
            type="button"
            className={compact ? "sb-link" : "sb-button"}
            disabled={busy}
            aria-label={`Continue ${entry.title}`}
            onClick={() => onOpen(entry.id)}
          >
            Continue →
          </button>
        )}
        {onRename && (
          <button
            type="button"
            className="sb-link"
            disabled={busy}
            aria-label={`Rename ${entry.title}`}
            onClick={() => onRename(entry)}
          >
            Rename
          </button>
        )}
        {onArchive && (
          <button
            type="button"
            className="sb-link"
            disabled={busy}
            aria-label={`${entry.archived ? "Restore" : "Archive"} ${entry.title}`}
            onClick={() => onArchive(entry.id, !entry.archived)}
          >
            {entry.archived ? "Restore" : "Archive"}
          </button>
        )}
        {onDelete && <button type="button" className="sb-link sb-delete-conversation" disabled={busy} aria-label={`Delete ${entry.title}`} onClick={() => onDelete(entry)}>Delete</button>}
      </div>
    </article>
  );
}

export function ConversationLibrary({
  entries,
  unreadable,
  busy,
  onOpen,
  onRename,
  onArchive,
  onDelete,
  onNew,
}: {
  entries: ConversationEntry[];
  unreadable: number;
  busy: boolean;
  onOpen: (id: string) => void;
  onRename: (id: string, title: string) => Promise<void>;
  onArchive: (id: string, archived: boolean) => void;
  onDelete: (id: string) => Promise<void>;
  onNew: () => void;
}) {
  const [archived, setArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [renaming, setRenaming] = useState<ConversationEntry | null>(null);
  const [deleting, setDeleting] = useState<ConversationEntry | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const visible = entries.filter(
    (entry) =>
      entry.archived === archived &&
      `${entry.title} ${entry.participants.join(" ")} ${entry.world}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  return (
    <main className="sb-home sb-conversation-library">
      <div className="sb-breadcrumb">
        Your creative space <span>/</span> Conversations
      </div>
      <div className="sb-section-heading">
        <h1>
          Stories to <em>come back to.</em>
        </h1>
        <button
          type="button"
          className="sb-button"
          onClick={onNew}
          disabled={busy}
        >
          ＋ New conversation
        </button>
      </div>
      <p className="sb-muted">
        Every meeting has its own history, relationships, and atmosphere.
      </p>
      <div className="sb-conversation-filters">
        <div className="sb-segment" aria-label="Conversation collection">
          <button
            type="button"
            aria-pressed={!archived}
            onClick={() => setArchived(false)}
          >
            Conversations ({entries.filter((entry) => !entry.archived).length})
          </button>
          <button
            type="button"
            aria-pressed={archived}
            onClick={() => setArchived(true)}
          >
            Archived ({entries.filter((entry) => entry.archived).length})
          </button>
        </div>
        <input
          aria-label="Find a conversation"
          placeholder="Find a conversation…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      {unreadable > 0 && (
        <p className="sb-notice" role="status">
          {unreadable} saved conversation
          {unreadable === 1 ? " could" : "s could"} not be read. The original
          records remain in storage.
        </p>
      )}
      <div className="sb-conversation-grid">
        {visible.map((entry) => (
          <ConversationCard
            key={entry.id}
            entry={entry}
            busy={busy}
            onOpen={onOpen}
            onRename={(entry) => {
              setRenaming(entry);
              setTitle(entry.title);
              setError(null);
            }}
            onArchive={onArchive}
            onDelete={entry => { setDeleting(entry); setError(null); }}
          />
        ))}
      </div>
      {!visible.length && (
        <div className="sb-empty-world">
          <span aria-hidden="true">◷</span>
          <div>
            <h3>
              {search
                ? "No matching conversations."
                : archived
                  ? "Nothing archived yet."
                  : "Your first conversation is waiting."}
            </h3>
            <p>
              {archived
                ? "Archived conversations stay saved. Restore one whenever you want to return."
                : "Start with a character. Each conversation will find a home here."}
            </p>
          </div>
        </div>
      )}
      {renaming && (
        <Modal
          title="Give this conversation a name"
          onClose={() => setRenaming(null)}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setError(null);
              void onRename(renaming.id, title)
                .then(() => setRenaming(null))
                .catch((err: unknown) =>
                  setError(
                    err instanceof Error
                      ? err.message
                      : "Could not rename this conversation.",
                  ),
                );
            }}
          >
            <label className="sb-field">
              Conversation name
              <input
                required
                maxLength={120}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            {error && (
              <p className="sb-error" role="alert">
                {error}
              </p>
            )}
            <div className="sb-dialog__actions">
              <button
                type="button"
                className="sb-link"
                onClick={() => setRenaming(null)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="sb-button"
                disabled={busy || !title.trim()}
              >
                Save name
              </button>
            </div>
          </form>
        </Modal>
      )}
      {deleting && <Modal title="Delete conversation permanently?" onClose={() => { if (!busy) setDeleting(null); }}>
        <p>Delete <strong>{deleting.title}</strong> and its entire conversation history? This cannot be undone.</p>
        <p className="sb-muted">Your characters, worlds, saved ideas and shared audio tracks stay in your library. To keep this conversation for later, cancel and choose Archive instead.</p>
        {error && <p className="sb-error" role="alert">{error}</p>}
        <div className="sb-dialog__actions">
          <button type="button" className="sb-link" disabled={busy} autoFocus onClick={() => setDeleting(null)}>Cancel</button>
          <button type="button" className="sb-button sb-button--danger" disabled={busy} onClick={() => {
            setError(null);
            void onDelete(deleting.id).then(() => setDeleting(null)).catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not delete this conversation. Try again."));
          }}>{busy ? "Deleting…" : "Delete permanently"}</button>
        </div>
      </Modal>}
    </main>
  );
}
