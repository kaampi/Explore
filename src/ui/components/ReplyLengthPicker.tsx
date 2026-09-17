import {
  REPLY_LENGTH_PRESETS,
  effectiveMaxReplyTokens
} from "@state/StateSchema";

export function ReplyLengthPicker({
  tokens,
  onChange
}: {
  tokens: number | undefined;
  onChange: (tokens: number) => void;
}) {
  const current = effectiveMaxReplyTokens(tokens);
  const known = REPLY_LENGTH_PRESETS.some((preset) => preset.tokens === current);
  const options = known
    ? REPLY_LENGTH_PRESETS
    : [...REPLY_LENGTH_PRESETS, { id: "custom", tokens: current, label: "custom" }];

  return (
    <label
      className="chip"
        title="Target length (~400–500 characters at beat). The model should finish the beat; the token stop has headroom so sentences are not clipped. Pass 2 is uncapped."
    >
      reply:
      <select
        className="chip__field"
        value={current}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {options.map((preset) => (
          <option key={preset.id} value={preset.tokens}>
            {preset.label} {preset.tokens}
          </option>
        ))}
      </select>
    </label>
  );
}
