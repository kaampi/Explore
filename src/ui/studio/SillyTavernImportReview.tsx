import type { CharacterPronoun } from "@state/StateSchema";
import { BUILTIN_PRONOUNS, isBuiltinPronoun, normalizePronoun, pronounLabel } from "@state/pronouns";
import { formatPersonName, splitPersonName } from "@library/personName";
import { PickChips } from "./ChoiceChips";
import { SheetNameField } from "./SheetNameField";
import { portraitSrc } from "./portrait";

export type ImportDraft = {
  name: string;
  middleName: string;
  familyName: string;
  approximateAge: number | null;
  personality: string;
  appearance: string;
  mood: string;
  pronoun: CharacterPronoun | null;
  portraitDataUrl: string;
  tags: string;
};

export function SillyTavernImportReview({
  rawText,
  fileLabel,
  draft,
  busy,
  error,
  notice,
  onChange,
  onPickPortrait,
  onRemovePortrait,
  onImport,
  onCancel,
  compacting,
  canUndoCompact,
  onCompact,
  onUndoCompact
}: {
  rawText: string;
  fileLabel: string;
  draft: ImportDraft;
  busy: boolean;
  error: string | null;
  notice?: string | null;
  onChange: (next: ImportDraft) => void;
  onPickPortrait: () => void;
  onRemovePortrait: () => void;
  onImport: () => void;
  onCancel: () => void;
  compacting: boolean;
  canUndoCompact: boolean;
  onCompact: () => void;
  onUndoCompact: () => void;
}) {
  return (
    <div className="st-import">
      <div className="st-import__raw">
        <p className="st-import__kicker">SillyTavern card{fileLabel ? ` — ${fileLabel}` : ""}</p>
        <pre className="st-import__text">{rawText || "(No description or personality on this card.)"}</pre>
      </div>
      <div className="st-import__card">
        <p className="st-import__kicker">Our guess — edit, then import</p>
        <SheetNameField
          ariaLabel="Full name"
          value={formatPersonName(draft.name, draft.familyName, draft.middleName)}
          placeholder="New character"
          onChange={(raw) => {
            const parsed = splitPersonName(raw);
            onChange({
              ...draft,
              name: parsed.given,
              middleName: parsed.middle,
              familyName: parsed.family
            });
          }}
        />
        <div className="studio-portrait studio-portrait--character">
          <div className="studio-portrait__frame">
            {portraitSrc(draft.portraitDataUrl) ? (
              <img className="studio-portrait__img" src={portraitSrc(draft.portraitDataUrl)} alt="" />
            ) : (
              <div className="studio-portrait__empty" aria-hidden="true" />
            )}
            {draft.portraitDataUrl ? (
              <button
                type="button"
                className="studio-portrait__trash"
                aria-label="Remove portrait"
                disabled={busy}
                onClick={onRemovePortrait}
              >
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.35"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3.2 4.2h9.6M6.2 4.2V3.1A.9.9 0 0 1 7.1 2.2h1.8a.9.9 0 0 1 .9.9v1.1M5.1 4.2l.5 8.2a1 1 0 0 0 1 .9h2.8a1 1 0 0 0 1-.9l.5-8.2M6.8 6.4v5M9.2 6.4v5"
                  />
                </svg>
              </button>
            ) : null}
          </div>
          <button type="button" className="studio-portrait__btn" disabled={busy} onClick={onPickPortrait}>
            {draft.portraitDataUrl ? "Change portrait" : "Add portrait"}
          </button>
        </div>
        <div className="setup-field">
          <span className="setup-field__label">Pronoun</span>
          <PickChips
            ariaLabel="Pronoun"
            choices={[
              ...BUILTIN_PRONOUNS,
              ...(draft.pronoun && !isBuiltinPronoun(draft.pronoun) ? [draft.pronoun] : [])
            ]}
            value={draft.pronoun ?? undefined}
            labelFor={pronounLabel}
            addPlaceholder="they…"
            onPick={(choice) => onChange({ ...draft, pronoun: draft.pronoun === choice ? null : choice })}
            onAdd={(label) => onChange({ ...draft, pronoun: normalizePronoun(label) })}
          />
        </div>
        <label className="setup-field setup-field--row">
          <span className="setup-field__label">Approximate age</span>
          <input
            type="number"
            min={1}
            max={130}
            inputMode="numeric"
            value={draft.approximateAge ?? ""}
            onChange={(e) => {
              const raw = e.target.value;
              onChange({ ...draft, approximateAge: raw === "" ? null : Number(raw) });
            }}
            placeholder="28"
          />
        </label>
        <label className="setup-field setup-field--row">
          <span className="setup-field__label">Looks</span>
          <textarea
            className="setup-field__story setup-field__looks"
            value={draft.appearance}
            onChange={(e) => onChange({ ...draft, appearance: e.target.value })}
            placeholder="body and face, not clothes"
          />
        </label>
        <label className="setup-field setup-field--row">
          <span className="setup-field__label">Typical mood</span>
          <input
            value={draft.mood}
            onChange={(e) => onChange({ ...draft, mood: e.target.value })}
            placeholder="not a scene"
          />
        </label>
        <label className="setup-field setup-field--row">
          <span className="setup-field__label">Tags</span>
          <input
            value={draft.tags}
            onChange={(e) => onChange({ ...draft, tags: e.target.value })}
            placeholder="comma-separated — Fantasy, Cyberpunk"
          />
        </label>
        <label className="setup-field">
          <span className="setup-field__label">Personality</span>
          <textarea
            className="setup-field__story"
            value={draft.personality}
            onChange={(e) => onChange({ ...draft, personality: e.target.value })}
            placeholder="Dry-witted, slow to open up, speaks in short sentences…"
          />
        </label>
        {notice ? <p className="setup-notice">{notice}</p> : null}
        {error ? <p className="setup-error">{error}</p> : null}
        <div className="studio-sheet__actions">
          <button type="button" className="setup-start" disabled={busy} onClick={onImport}>
            Import
          </button>
          <button type="button" className="setup-example" disabled={busy} onClick={onCompact}>
            {compacting ? "Compacting…" : "Compact"}
          </button>
          {canUndoCompact ? (
            <button type="button" className="setup-example" disabled={busy} onClick={onUndoCompact}>
              Undo compact
            </button>
          ) : null}
          <button type="button" className="setup-example" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
