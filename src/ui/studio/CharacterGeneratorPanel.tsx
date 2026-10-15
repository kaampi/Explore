import { useState } from "react";
import { generateCharacter, SPEECH_STYLES, type GeneratedCharacter } from "@library/characterGenerator";
import { BUILTIN_PRONOUNS, pronounLabel } from "@state/pronouns";

const PRONOUNS = [...BUILTIN_PRONOUNS, "they"] as const;

function formatName(card: GeneratedCharacter): string {
  return [card.name, card.middleName, card.familyName].map((part) => part.trim()).filter(Boolean).join(" ");
}

export function CharacterGeneratorPanel({
  busy,
  onApply
}: {
  busy: boolean;
  onApply: (card: GeneratedCharacter) => void;
}) {
  const [mode, setMode] = useState<"explain" | "surprise">("explain");
  const [brief, setBrief] = useState("");
  const [pronoun, setPronoun] = useState<string | null>(null);
  const [speech, setSpeech] = useState<string | null>(null);
  const [age, setAge] = useState("");
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1_000_000_000));
  const [proposal, setProposal] = useState<GeneratedCharacter | null>(null);

  function years(): number | null {
    if (age.trim() === "") return null;
    const value = Number(age);
    return Number.isFinite(value) ? value : null;
  }

  function propose(nextSeed: number) {
    const card = generateCharacter({
      brief: mode === "surprise" ? "" : brief,
      pronoun,
      speech,
      approximateAge: years(),
      seed: nextSeed
    });
    setSeed(nextSeed);
    setProposal(card);
  }

  const explainReady = mode === "surprise" || brief.trim().length > 0;

  return (
    <div className="character-generator">
      <p className="setup-kicker">Character generator</p>
      <p className="form-section__lede">
        Explain who they are, or take a person at random. Accept puts the card on the sheet. Reject asks for another. Save is still yours.
      </p>
      <div className="setup-chips" role="radiogroup" aria-label="How to make them">
        <div className={`setup-chip ${mode === "explain" ? "setup-chip--active" : ""}`}>
          <button type="button" className="setup-chip__pick" onClick={() => setMode("explain")}>
            I'll explain
          </button>
        </div>
        <div className={`setup-chip ${mode === "surprise" ? "setup-chip--active" : ""}`}>
          <button type="button" className="setup-chip__pick" onClick={() => setMode("surprise")}>
            Surprise me
          </button>
        </div>
      </div>
      {mode === "explain" && (
        <label className="setup-field">
          <span className="setup-field__label">Who are they?</span>
          <textarea
            className="setup-field__story character-generator__brief"
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder="A wary bartender who notices everything, clipped speech"
          />
        </label>
      )}
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
      <div className="setup-field">
        <span className="setup-field__label">How they speak</span>
        <div className="setup-chips" role="radiogroup" aria-label="How they speak">
          <div className={`setup-chip ${speech === null ? "setup-chip--active" : ""}`}>
            <button type="button" className="setup-chip__pick" onClick={() => setSpeech(null)}>
              Any
            </button>
          </div>
          {SPEECH_STYLES.map((style) => (
            <div key={style.id} className={`setup-chip ${speech === style.id ? "setup-chip--active" : ""}`}>
              <button type="button" className="setup-chip__pick" onClick={() => setSpeech(style.id)}>
                {style.label}
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
        <button
          type="button"
          className="setup-start"
          disabled={busy || !explainReady}
          onClick={() => propose(proposal ? seed + 1 : seed)}
        >
          {mode === "surprise" ? "Surprise me" : "Propose"}
        </button>
      </div>
      {proposal && (
        <div className="character-generator__proposal">
          <p className="character-generator__name">{formatName(proposal)}</p>
          <p>
            {pronounLabel(proposal.pronoun)} · about {proposal.approximateAge} · {proposal.mood}
          </p>
          <p>{proposal.appearance}</p>
          <p>
            <span className="setup-field__label">How they speak</span>
            {proposal.speech}
          </p>
          <p>{proposal.personality}</p>
          {proposal.tags.length > 0 && <p>{proposal.tags.join(", ")}</p>}
          <div className="studio-sheet__actions">
            <button type="button" className="setup-start" disabled={busy} onClick={() => onApply(proposal)}>
              Accept
            </button>
            <button type="button" className="setup-example" disabled={busy} onClick={() => propose(seed + 1)}>
              Reject
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
