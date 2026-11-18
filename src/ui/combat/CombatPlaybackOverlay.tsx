import { useEffect, useState } from "react";
import type { CombatPlayback } from "./useCombatPlayback";
import { DiceRollSurface } from "../components/DiceRollSurface";
import { DiceTray } from "../components/DiceTray";
import { RollResult } from "../components/RollResult";
import { DiceSound } from "../diceSound";
export function CombatPlaybackOverlay({
  playback,
  names,
  statNames,
  soundOn = false,
}: {
  playback: CombatPlayback;
  names: Record<string, string>;
  /** Display names for skill ids. A skill with no name here is shown by its id. */
  statNames?: Record<string, string> | undefined;
  soundOn?: boolean;
}) {
  const name = names[playback.actorId] ?? playback.actorId,
    player = playback.actorId === playback.playerId;
  if (playback.phase === "intro")
    return (
      <span className="combat-roll-status" role="status">
        {playback.beat?.check ? (player ? "Your turn" : `${name}’s turn`) : playback.beat?.text}
      </span>
    );
  if (!playback.beat?.check || !playback.active) return null;
  return (
    <BeatRoll
      key={playback.key}
      playback={playback}
      name={name}
      player={player}
      soundOn={soundOn}
      statNames={statNames}
    />
  );
}
function BeatRoll({
  playback,
  name,
  player,
  soundOn,
  statNames,
}: {
  playback: CombatPlayback;
  name: string;
  player: boolean;
  soundOn: boolean;
  statNames?: Record<string, string> | undefined;
}) {
  const [sound, setSound] = useState<DiceSound | null>(null),
    check = playback.beat!.check!;
  useEffect(() => {
    const audio = new DiceSound(soundOn);
    setSound(audio);
    return () => audio.close();
  }, []);
  useEffect(() => sound?.setEnabled?.(soundOn), [sound, soundOn]);
  return (
    <DiceRollSurface label="Resolved dice roll" onClosed={playback.next}>
      {(close, closing) => (
        <>
          {!playback.skipDice && sound && (
            <DiceTray
              roll={check.roll}
              throwFrom={player ? "left" : "right"}
              sound={sound}
              onSettled={playback.settle}
            />
          )}
          {playback.phase === "result" ? (
            <RollResult
              roll={check.roll}
              target={check.target}
              degree={check.degree}
              detail={`${player ? "Your roll" : name} · ${statNames?.[check.stat] ?? check.stat}`}
              rolledBy={player ? undefined : name}
              closing={closing}
              onConfirm={close}
            />
          ) : (
            <span className="combat-roll-status" role="status">
              {player ? "Your roll" : name} · Rolling…
            </span>
          )}
        </>
      )}
    </DiceRollSurface>
  );
}
