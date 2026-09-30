import { useEffect, useRef, useState } from "react";
import type { Session } from "@state/StateSchema";
import { charactersHere } from "@state/sceneFocus";
import { narrationCallName } from "@state/nameHeard";
import { DIFFICULTIES, checkTarget, type CheckResult, type Difficulty } from "../../checks/CheckEngine";
import { playerCheckStats, rollPlayerCheck } from "../../checks/playerCheck";
import { portraitSrc } from "../studio/portrait";
import { DiceTray } from "./DiceTray";
import { DiceSound } from "../diceSound";

export function ActionCheckDialog({ session, onClose, onContinue }: {
  session: Session; onClose: () => void; onContinue: (result: CheckResult) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const ids = charactersHere(session);
  const stats = playerCheckStats(session);
  const [targetId, setTargetId] = useState(ids[0] ?? "");
  const [attributeId, setAttributeId] = useState(stats[0]?.id ?? "");
  const [action, setAction] = useState("I try to charm them.");
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [result, setResult] = useState<CheckResult | null>(null);
  const [settled, setSettled] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rolledRef = useRef(false);
  const continuedRef = useRef(false);
  const soundRef = useRef<DiceSound | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    try { return localStorage.getItem("sandbox-dice-sound") !== "off"; } catch { return true; }
  });
  const stat = stats.find((item) => item.id === attributeId);
  const targetName = targetId ? narrationCallName(session, targetId) : "No one here";
  const playerPortrait = portraitSrc(session.player?.portraitDataUrl);
  const targetPortrait = portraitSrc(session.characters[targetId]?.portraitDataUrl);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => { dialog?.close(); soundRef.current?.close(); };
  }, []);

  function roll() {
    if (rolledRef.current) return;
    try {
      const check = rollPlayerCheck(session, { id: crypto.randomUUID(), action,
        targetId, attributeId, difficulty });
      rolledRef.current = true;
      soundRef.current = new DiceSound(soundEnabled);
      setResult(check);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not roll this check.");
    }
  }

  return (
    <dialog ref={dialogRef} className="action-check" aria-labelledby="action-check-title"
      onCancel={(event) => { event.preventDefault(); if (!result) onClose(); }}>
      <header className="action-check__header">
        <div><span className="action-check__eyebrow">ACTION CHECK · D100</span>
          <h2 id="action-check-title">Take a chance</h2></div>
        {!result && <button type="button" onClick={onClose} aria-label="Close action check">×</button>}
      </header>
      <button type="button" className="action-check__sound" aria-pressed={soundEnabled}
        onClick={() => {
          const enabled = !soundEnabled;
          setSoundEnabled(enabled);
          soundRef.current?.setEnabled(enabled);
          try { localStorage.setItem("sandbox-dice-sound", enabled ? "on" : "off"); } catch {}
        }}>Dice sound: {soundEnabled ? "On" : "Off"}</button>
      <div className="action-check__participants">
        <div className="action-check__participant">
          {playerPortrait ? <img src={playerPortrait} alt="" /> : <span className="action-check__silhouette">You</span>}
          <strong>{session.player?.name?.trim() || "You"}</strong>
          {stat && <span>{stat.name}: {stat.value} <small>({stat.min}–{stat.max})</small></span>}
        </div>
        <span className="action-check__between">↔</span>
        <div className="action-check__participant">
          {targetPortrait ? <img src={targetPortrait} alt="" /> : <span className="action-check__silhouette">?</span>}
          <strong>{targetName}</strong>
          <span>{session.relationships[targetId] ? `Trust: ${session.relationships[targetId]!.trust.value}` : "Your counterpart"}</span>
        </div>
      </div>
      {!result ? (
        <>
          {stats.length === 0 && <p className="action-check__hint">Add numeric values on your campaign's <strong>You</strong> sheet to use checks. The live scene uses the values copied when it started.</p>}
          {ids.length === 0 && <p className="action-check__hint">A character must be in the same place as you.</p>}
          <div className="action-check__fields">
            <label>With whom?<select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
              {ids.map((id) => <option key={id} value={id}>{narrationCallName(session, id)}</option>)}
            </select></label>
            <label>What do you attempt?<input autoFocus maxLength={240} value={action} onChange={(e) => setAction(e.target.value)} /></label>
            <div className="action-check__settings">
              <label>Your stat<select value={attributeId} onChange={(e) => setAttributeId(e.target.value)}>
                {stats.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.value}</option>)}
              </select></label>
              <label>Difficulty<select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)}>
                {Object.entries(DIFFICULTIES).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}
              </select></label>
            </div>
          </div>
          <p className="action-check__hint">{stat ? `Roll ${checkTarget(stat.value, stat.min, stat.max, difficulty)} or lower on d100 to succeed. ` : ""}You choose the stat and difficulty for this first version.</p>
          {error && <p role="alert">{error}</p>}
          <footer className="action-check__footer"><button type="button" onClick={onClose}>Cancel</button>
            <button type="button" className="action-check__primary" disabled={!stat || !targetId || !action.trim()} onClick={roll}>Roll the dice</button></footer>
        </>
      ) : (
        <>
          <p className="action-check__attempt">{result.action}</p>
          {!settled || !fallback ? <DiceTray roll={result.roll} sound={soundRef.current} onSettled={(didFallback) => { setSettled(true); setFallback(didFallback); }} /> : null}
          <div className="action-check__outcome" role="status" aria-live="polite">
            {settled ? <><strong className={result.success ? "action-check__success" : "action-check__failure"}>{result.success ? "Success" : "Setback"}</strong>
              <span>Rolled <b>{result.roll}</b> · needed {result.target} or lower</span>
              <small>{result.attributeName} {result.value} · {DIFFICULTIES[result.difficulty].label}</small></> : <strong>Rolling…</strong>}
          </div>
          {settled && fallback && <p className="action-check__hint">Showing the resolved roll without 3D animation.</p>}
          <footer className="action-check__footer"><button type="button" className="action-check__primary" disabled={!settled}
            onClick={() => { if (continuedRef.current) return; continuedRef.current = true; onContinue(result); }}>Continue the story</button></footer>
        </>
      )}
    </dialog>
  );
}
