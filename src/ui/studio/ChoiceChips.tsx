import { useState } from "react";

export const ORIENTATION_PRESET = ["Hetero", "Homo", "Bi"];

function commitLabel(raw: string, existing: string[]): string | undefined {
  const label = raw.trim();
  if (!label) return undefined;
  const key = label.toLowerCase();
  if (existing.some((item) => item.toLowerCase() === key)) {
    return existing.find((item) => item.toLowerCase() === key);
  }
  return label;
}

function AddChip({
  placeholder,
  onAdd
}: {
  placeholder: string;
  onAdd: (label: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  function finish(save: boolean) {
    const label = save ? draft.trim() : "";
    setDraft("");
    setAdding(false);
    if (label) onAdd(label);
  }

  if (!adding) {
    return (
      <div className="setup-chip">
        <button type="button" className="setup-chip__pick" aria-label="Add choice" onClick={() => setAdding(true)}>
          +
        </button>
      </div>
    );
  }

  return (
    <input
      className="setup-chip-add"
      value={draft}
      placeholder={placeholder}
      autoFocus
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          finish(true);
        }
        if (e.key === "Escape") {
          e.preventDefault();
          finish(false);
        }
      }}
    />
  );
}

/** Pick one value from a list. + adds a custom value and selects it. */
export function PickChips({
  choices,
  value,
  onPick,
  onAdd,
  labelFor,
  addPlaceholder = "Asexual…",
  ariaLabel
}: {
  choices: string[];
  value?: string;
  onPick: (choice: string) => void;
  onAdd?: (label: string) => void;
  labelFor?: (choice: string) => string;
  addPlaceholder?: string;
  ariaLabel: string;
}) {
  return (
    <div className="setup-chips" role="radiogroup" aria-label={ariaLabel} style={{ marginBottom: 0 }}>
      {choices.filter(Boolean).map((choice, index) => (
        <div key={`${index}:${choice}`} className={`setup-chip ${value === choice ? "setup-chip--active" : ""}`}>
          <button
            type="button"
            className="setup-chip__pick"
            aria-pressed={value === choice}
            onClick={() => onPick(choice)}
          >
            {labelFor ? labelFor(choice) : choice}
          </button>
        </div>
      ))}
      {onAdd ? (
        <AddChip
          placeholder={addPlaceholder}
          onAdd={(label) => {
            const next = commitLabel(label, choices) ?? label.trim();
            onAdd(next);
          }}
        />
      ) : null}
    </div>
  );
}

/** Author the list itself. + adds, × removes. */
export function EditChips({
  items,
  onChange,
  addPlaceholder = "Asexual…",
  preset,
  presetLabel
}: {
  items: string[];
  onChange: (items: string[]) => void;
  addPlaceholder?: string;
  preset?: string[];
  presetLabel?: string;
}) {
  return (
    <div>
      <div className="setup-chips" style={{ marginBottom: items.length === 0 && preset?.length ? 6 : 0 }}>
        {items.map((item) => (
          <div key={item} className="setup-chip">
            <span className="setup-chip__pick" style={{ cursor: "default" }}>
              {item}
            </span>
            <button
              type="button"
              className="setup-chip__remove"
              aria-label={`Remove ${item}`}
              onClick={() => onChange(items.filter((choice) => choice !== item))}
            >
              ×
            </button>
          </div>
        ))}
        <AddChip
          placeholder={addPlaceholder}
          onAdd={(label) => {
            const next = commitLabel(label, items);
            if (!next || items.some((item) => item.toLowerCase() === next.toLowerCase())) return;
            onChange([...items, next]);
          }}
        />
      </div>
      {items.length === 0 && preset && preset.length > 0 ? (
        <button type="button" className="setup-text-btn" onClick={() => onChange([...preset])}>
          {presetLabel ?? preset.join(" / ")}
        </button>
      ) : null}
    </div>
  );
}
