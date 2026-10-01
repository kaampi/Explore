import { PLAY_MODES, type PlayMode } from "../../state/playMode";
export function PlayModePicker({ value, onChange }: { value: PlayMode; onChange: (mode: PlayMode) => void }) {
  return <label className="setup-field">Play mode
    <select value={value} onChange={(event) => onChange(event.target.value as PlayMode)}>
      {Object.entries(PLAY_MODES).map(([id, mode]) => <option key={id} value={id}>{mode.label}</option>)}
    </select>
    <span className="setup-optional">{PLAY_MODES[value].description} Chosen for this new playthrough; existing sessions keep their mode.</span>
  </label>;
}
