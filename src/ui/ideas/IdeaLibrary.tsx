import { useEffect, useState } from "react";
import type { IndexedDBRepository } from "@persistence/IndexedDBRepository";
import type { ConversationEntry } from "@persistence/ConversationSchema";
import { IDEA_KINDS, IDEA_LABELS, type Idea } from "../../ideas/IdeaSchema";
import { downloadIdeas } from "../../ideas/storybookExport";
import { IdeaEditor } from "./IdeaEditor";

export function IdeaLibrary({ repo, conversations, onOpen }: {
  repo: IndexedDBRepository;
  conversations: ConversationEntry[];
  onOpen: (id: string) => void;
}) {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [ready, setReady] = useState(false);
  const [unreadable, setUnreadable] = useState(0);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("");
  const [editing, setEditing] = useState<Idea | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    void repo.listIdeas().then(result => {
      if (cancelled) return;
      setIdeas(result.entries);
      setUnreadable(result.unreadable);
      setReady(true);
    }).catch(err => {
      if (cancelled) return;
      setError(String(err));
      setReady(true);
    });
    return () => { cancelled = true; };
  }, [repo]);

  const visible = ideas.filter(idea =>
    (!kind || idea.kind === kind) &&
    `${idea.title} ${idea.description} ${idea.source.conversationTitle}`
      .toLowerCase().includes(query.toLowerCase()),
  );

  function download(entries: Idea[]) {
    setError("");
    try {
      downloadIdeas(entries);
      setNotice("JSON download prepared. In StorybookAI, import it as a manuscript and open Brainstorm.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not prepare your export.");
    }
  }

  async function copy(idea: Idea) {
    setError("");
    try {
      await navigator.clipboard.writeText(`${idea.title}\n\n${idea.description}`);
      setNotice("Idea copied. Paste it into a Brainstorm card in your existing book.");
    } catch {
      setError("Could not copy automatically. Select and copy the idea text instead.");
    }
  }

  return (
    <main className="sb-conversation-library sb-idea-library">
      <div className="sb-section-heading">
        <div>
          <span className="sb-eyebrow">KEEP THE SPARK</span>
          <h1>My ideas</h1>
          <p className="sb-muted">Possibilities discovered in your conversations.</p>
        </div>
        <button className="sb-button sb-button--primary" disabled={!visible.length}
          onClick={() => download(visible)}>
          Export {visible.length} idea(s)
        </button>
      </div>
      <p className="sb-idea-help">
        Export opens as a separate idea manuscript in StorybookAI, with one card per idea
        in Brainstorm. To use an idea in an existing book, copy its text to that book’s
        Brainstorm. JSON includes your ideas and their selected source messages.
        Nothing is added to established story facts.
      </p>
      <div className="sb-conversation-filters">
        <input aria-label="Search ideas" placeholder="Find an idea…" value={query}
          onChange={event => setQuery(event.target.value)} />
        <select aria-label="Filter ideas by type" value={kind}
          onChange={event => setKind(event.target.value)}>
          <option value="">All types</option>
          {IDEA_KINDS.map(value => (
            <option key={value} value={value}>{IDEA_LABELS[value]}</option>
          ))}
        </select>
      </div>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {unreadable > 0 && (
        <p role="alert">
          {unreadable} saved idea(s) could not be read. Their stored data has been kept.
        </p>
      )}
      {!ready ? <p>Loading your ideas…</p> : !visible.length ? (
        <div className="sb-empty">
          <h2>{ideas.length ? "No matching ideas" : "Keep something worth exploring"}</h2>
          <p>{ideas.length ? "Try another search or type." :
            "In a conversation, choose Save as idea on a message, or Capture ideas to select several messages."}</p>
        </div>
      ) : (
        <div className="sb-conversation-grid">
          {visible.map(idea => (
            <article key={idea.id} className="sb-conversation-card sb-idea-card">
              <span className="sb-eyebrow">{IDEA_LABELS[idea.kind]} IDEA</span>
              <h3>{idea.title}</h3>
              <p className="sb-idea-description">{idea.description}</p>
              <details className="sb-idea-source">
                <summary>From {idea.source.conversationTitle}</summary>
                <p>
                  Captured {new Date(idea.createdAt).toLocaleDateString()}. Source text is
                  kept even if the conversation changes.
                </p>
                {idea.source.excerpts.map((excerpt, index) => (
                  <blockquote key={index}>
                    <strong>{excerpt.speaker}</strong>
                    <p>{excerpt.content}</p>
                  </blockquote>
                ))}
                {conversations.some(entry => entry.id === idea.source.conversationId && !entry.archived) && (
                  <button className="sb-link" onClick={() => onOpen(idea.source.conversationId)}>
                    Open conversation
                  </button>
                )}
              </details>
              <div className="sb-conversation-actions">
                <button className="sb-button" onClick={() => setEditing(idea)}>Edit idea</button>
                <button className="sb-button" onClick={() => void copy(idea)}>Copy idea</button>
                <button className="sb-button" onClick={() => download([idea])}>Export JSON</button>
              </div>
            </article>
          ))}
        </div>
      )}
      {editing && (
        <IdeaEditor idea={editing} repo={repo} onClose={() => setEditing(null)} onSaved={next => {
          setIdeas(current => current.map(idea => idea.id === next.id ? next : idea)
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
          setEditing(null);
          setNotice("Idea saved.");
        }} />
      )}
    </main>
  );
}
