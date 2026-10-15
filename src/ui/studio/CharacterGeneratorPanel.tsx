import { useState } from "react";
import { generateCharacter, type GeneratedCharacter } from "@library/characterGenerator";
import { BUILTIN_PRONOUNS, pronounLabel } from "@state/pronouns";

const PRONOUNS = [...BUILTIN_PRONOUNS, "they"] as const;

export function CharacterGeneratorPanel({
  busy,
  onApply
}: {
  busy: boolean;
  onApply: (card: GeneratedCharacter) => void;
}) {
  const [brief, setBrief] = useState("");
  const [pronoun, setPronoun] = useState<string | null>(null);
  const [age, setAge] = useState("");
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1_000_000_000));
  const [rolled, setRolled] = useState(false);

  function years(): number | null {
    if (age.trim() === "") return null;
    const value = Number(age);
    return Number.isFinite(value) ? value : null;
  }

  function roll(nextSeed: number) {
    const card = generateCharacter({
      brief,
      pronoun,
      approximateAge: years(),
      seed: nextSeed
    });
    setSeed(nextSeed);
    setRolled(true);
    onApply(card);
  }

  return (
    <div className="character-generator">
      <p className="setup-kicker">Character generator</p>
      <p className="form-section__lede">
        One line about who they are. The card is identity — name, looks, mood, and how they treat people — ready to edit and save on this shelf.
      </p>
      <label className="setup-field">
        <span className="setup-field__label">Who are they?</span>
        <textarea
          className="setup-field__story character-generator__brief"
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          placeholder="A wary bartender who notices everything"
        />
      </label>
      <div className="setup-field">
        <span className="setup-field__label">Pronoun</span>
        <div className="setup-chips" role="radiogroup" aria-label="Generator pronoun">
          <div className={`setup-chip ${pronoun === null ? "setup-chip--active" : ""}`}>
            <button type="button" className="setup-chip__pick" onClick={() => setPronoun(null)}>
              Any
            </button>
          </div>
          {PRONOUNS.map((choice) => (
            <div key={choice} className={`setup-chip ${pronoun === choice ? "setup-chip--active" : ""}`}>
              <button type="button" className="setup-chip__pick" onClick={() => setPronoun(choice)}>
                {pronounLabel(choice)}
              </button>
            </div>
          ))}
        </div>
      </div>
      <label className="setup-field setup-field--row">
        <span className="setup-field__label">
          Approximate age
          <span className="setup-optional">optional</span>
        </span>
        <input
          type="number"
          min={1}
          max={130}
          inputMode="numeric"
          value={age}
          onChange={(e) => setAge(e.target.value)}
          placeholder="any"
        />
      </label>
      <div className="studio-sheet__actions">
        <button type="button" className="setup-start" disabled={busy} onClick={() => roll(rolled ? seed + 1 : seed)}>
          {rolled ? "Another" : "Make this card"}
        </button>
      </div>
    </div>
  );
}
