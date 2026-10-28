import type { Lorebook } from "../../lore/LorebookSchema";

export function LoreReview({ book, onChange, disabled = false }: {
  book: Lorebook; onChange: (book: Lorebook) => void; disabled?: boolean;
}) {
  return <div className="sb-lore-review">
    <p>Original text and rules are retained. Select supported entries to use kaampi Explore rules:
      keywords scan the last eight messages, ignore case, match single words as whole words
      and phrases as substrings. Source scan depth, insertion order and budget are not reproduced.
      Imported lore shares a 1,200-token limit and may be omitted when context is full.</p>
    <p>Unsupported entries remain dormant. Importing does not establish kaampi Write facts.</p>
    <button type="button" className="sb-button" disabled={disabled}
      onClick={() => onChange({ ...book, entries: book.entries.map(e => ({ ...e, approved: e.mode !== "dormant" && e.reasons.length === 0 })) })}>
      Use supported entries with Sandbox rules
    </button>
    <button type="button" className="sb-button" disabled={disabled}
      onClick={() => onChange({ ...book, entries: book.entries.map(e => ({ ...e, approved: false })) })}>Deselect all</button>
    <div className="sb-lore-entries">{book.entries.map((entry, index) => <article key={entry.id}>
      <label><input type="checkbox" checked={entry.approved && entry.mode !== "dormant"}
        disabled={disabled || entry.mode === "dormant" || entry.reasons.length > 0}
        onChange={event => {
          const approved = event.target.checked;
          onChange({ ...book, entries: book.entries.map((e, i) => i === index ? { ...e, approved } : e) });
        }} /> {entry.title}</label>
      {entry.entity && <span className="sb-eyebrow">{entry.entity.category} · {entry.entity.id}</span>}
      <span className="sb-muted">{entry.mode === "dormant" ? "Dormant" : entry.mode === "always" ? "Always eligible, within budget" : `Keywords: ${entry.keywords.join(", ")}`}</span>
      {entry.reasons.length > 0 && <ul>{entry.reasons.map((reason, i) => <li key={i}>{reason}</li>)}</ul>}
      <details><summary>Read source text</summary><p>{entry.content || "(No content)"}</p></details>
    </article>)}</div>
  </div>;
}
