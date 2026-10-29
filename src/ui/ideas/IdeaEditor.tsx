import { useRef, useState } from "react";
import type { IndexedDBRepository } from "@persistence/IndexedDBRepository";
import { IDEA_KINDS, IDEA_LABELS, IdeaSchema, type Idea } from "../../ideas/IdeaSchema";
import { Modal } from "../components/Modal";

export function IdeaEditor({ idea, repo, onSaved, onClose }: {
  idea: Idea;
  repo: IndexedDBRepository;
  onSaved: (idea: Idea) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(idea.title);
  const [description, setDescription] = useState(idea.description);
  const [kind, setKind] = useState(idea.kind);
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState("");

  async function save() {
    if (pending.current) return;
    const parsed = IdeaSchema.safeParse({
      ...idea, title, description, kind, updatedAt: new Date().toISOString(),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check your idea.");
      return;
    }
    pending.current = true;
    setSaving(true);
    setError("");
    try {
      await repo.saveIdea(parsed.data);
      onSaved(parsed.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your idea. Please try again.");
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  return (
    <Modal title="Save an idea" onClose={() => { if (!pending.current) onClose(); }} wide>
      <p className="sb-muted">
        Keep a possibility to explore later. Saving an idea does not change your story.
      </p>
      <form onSubmit={event => { event.preventDefault(); void save(); }}>
        <fieldset disabled={saving} className="sb-idea-fields">
          <label className="sb-field">
            Title
            <input autoFocus maxLength={120} required value={title}
              onChange={event => setTitle(event.target.value)} />
          </label>
          <label className="sb-field">
            Idea type
            <select value={kind} onChange={event => setKind(event.target.value as Idea["kind"])}>
              {IDEA_KINDS.map(value => (
                <option key={value} value={value}>{IDEA_LABELS[value]}</option>
              ))}
            </select>
          </label>
          <label className="sb-field">
            Description
            <textarea required maxLength={50000} rows={8} value={description}
              onChange={event => setDescription(event.target.value)} />
          </label>
        </fieldset>
        {idea.origin !== "manual" && <details className="sb-idea-source">
          <summary>
            From {idea.source.conversationTitle} · {idea.source.excerpts.length} message(s)
          </summary>
          {idea.source.excerpts.map((excerpt, index) => (
            <blockquote key={index}>
              <strong>{excerpt.speaker}</strong>
              <p>{excerpt.content}</p>
            </blockquote>
          ))}
        </details>}
        {error && <p role="alert">{error}</p>}
        <div className="sb-dialog__actions">
          <button type="button" className="sb-button" disabled={saving} onClick={onClose}>
            Cancel
          </button>
          <button className="sb-button sb-button--primary" disabled={saving}>
            {saving ? "Saving…" : "Save idea"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
