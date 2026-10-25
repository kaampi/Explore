import type { PlaceTemplate, RulesetTemplate, VoiceTemplate } from "@library/LibrarySchema";

export function ChatSetupFields({ places, voices, rulesets, placeId, voiceId, rulesetId, onPlace, onVoice, onRuleset, disabled, includePlace = true }: {
  places: PlaceTemplate[]; voices: VoiceTemplate[]; rulesets: RulesetTemplate[];
  placeId: string; voiceId: string; rulesetId: string;
  onPlace: (id: string) => void; onVoice: (id: string) => void; onRuleset: (id: string) => void;
  disabled: boolean;
  includePlace?: boolean;
}) {
  return <div className="sb-chat-setup-fields">
    <label className="sb-field">Rule-set <span>optional</span>
      <select aria-label="Conversation rule-set" value={rulesetId} disabled={disabled} onChange={event => onRuleset(event.target.value)}>
        <option value="">None</option>
        {rulesets.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      {rulesetId && <small>Numeric traits start at the middle of their range. Text traits stay unset.</small>}
    </label>
    <label className="sb-field">Voice <span>optional · narration style</span>
      <select aria-label="Conversation voice" value={voiceId} disabled={disabled} onChange={event => onVoice(event.target.value)}>
        <option value="">None</option>
        {voices.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
    </label>
    {includePlace && <label className="sb-field">Place <span>optional</span>
      <select aria-label="Conversation place" value={placeId} disabled={disabled} onChange={event => onPlace(event.target.value)}>
        <option value="">None — no fixed place</option>
        {places.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
    </label>}
  </div>;
}
