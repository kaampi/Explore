import type { CharacterLoreEntry } from "@library/LibrarySchema";
import { formatKeywordList, parseKeywordList } from "@layers/keywords";
import { FormSection } from "./FormSection";

export function emptyLoreEntry(): CharacterLoreEntry {
  return { id: crypto.randomUUID(), title: "", content: "", keywords: [] };
}

export function LoreEditor({
  entries,
  onChange
}: {
  entries: CharacterLoreEntry[];
  onChange: (next: CharacterLoreEntry[]) => void;
}) {
  return (
    <FormSection
      title="Lore"
      action={
        <button type="button" className="setup-text-btn" onClick={() => onChange([...entries, emptyLoreEntry()])}>
          + Add
        </button>
      }
      lede="This campaign only. Quiet until chat hits the wake words. Empty wake words means always in the prompt."
    >
      {entries.length === 0 && <p className="inspector-empty">No lore entries yet.</p>}
      {entries.map((entry) => (
        <div key={entry.id} className="layer-card">
          <label className="setup-field setup-field--row">
            <span className="setup-field__label">Title</span>
            <input
              value={entry.title}
              placeholder="Title"
              onChange={(e) =>
                onChange(entries.map((item) => (item.id === entry.id ? { ...item, title: e.target.value } : item)))
              }
            />
          </label>
          <label className="setup-field setup-field--row">Used as
            <select value={entry.purpose ?? "world"} onChange={(e) => onChange(entries.map((item) => item.id === entry.id ? { ...item, purpose: e.target.value as "world" | "storyline" | "rules" } : item))}>
              <option value="world">World lore · all modes</option><option value="storyline">Storyline · Adventure only</option><option value="rules">Game rule · Adventure / Free exploration</option>
            </select>
          </label>
          <label className="setup-field">
            <span className="setup-field__label">When this wakes</span>
            <textarea
              className="setup-field__story"
              placeholder="What the model may know when this wakes…"
              value={entry.content}
              onChange={(e) =>
                onChange(entries.map((item) => (item.id === entry.id ? { ...item, content: e.target.value } : item)))
              }
            />
          </label>
          <label className="setup-field setup-field--row">
            <span className="setup-field__label">Wake on</span>
            <input
              placeholder="Wake on words (empty = always in the prompt)"
              value={formatKeywordList(entry.keywords)}
              onChange={(e) =>
                onChange(
                  entries.map((item) =>
                    item.id === entry.id ? { ...item, keywords: parseKeywordList(e.target.value) } : item
                  )
                )
              }
            />
          </label>
          <button
            type="button"
            className="setup-example"
            onClick={() => onChange(entries.filter((item) => item.id !== entry.id))}
          >
            Remove
          </button>
        </div>
      ))}
    </FormSection>
  );
}

