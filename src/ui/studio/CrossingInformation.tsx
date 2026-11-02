import type { WorldMap } from "@library/worldMap";

type CrossingInfo = NonNullable<WorldMap["crossings"]>[number];

export function CrossingInformation({value, riverName, onChange, onClose}: {
  value: CrossingInfo; riverName: string; onChange:(value:CrossingInfo)=>void; onClose:()=>void;
}) {
  return <div className="world-map__connection-details">
    <span className="world-map__eyebrow">RIVER CROSSING</span>
    <h3>{riverName}</h3>
    <label>Crossing type<select value={value.type} onChange={e=>onChange({...value,type:e.target.value as CrossingInfo["type"]})}>
      <option value="bridge">Bridge</option><option value="ferry">Ferry</option><option value="none">No bridge or ferry</option>
    </select></label>
    {value.type === "none" && <label>Natural passage<select value={value.naturalPassage??"blocked"} onChange={e=>onChange({...value,naturalPassage:e.target.value as NonNullable<CrossingInfo["naturalPassage"]>})}>
      <option value="blocked">No established passage</option><option value="ford">Can be waded — ford</option><option value="swim">Can be swum</option>
    </select></label>}
    <label>Description for AI<textarea rows={4} value={value.description??""} onChange={e=>onChange({...value,description:e.target.value})} placeholder={value.type==="bridge"?"A narrow wooden bridge, guarded at the far end…":value.type==="ferry"?"A small cable ferry with room for four travellers…":"Shallow water over a rocky bed; unsafe after heavy rain…"}/></label>
    {value.type === "ferry" && <label>Ferry schedule<textarea rows={3} value={value.schedule??""} onChange={e=>onChange({...value,schedule:e.target.value})} placeholder="Departs at dawn and dusk. No service after sunset." /></label>}
    <label>Conditions & instructions for AI<textarea rows={4} value={value.instructions??""} onChange={e=>onChange({...value,instructions:e.target.value})} placeholder="The guards ask for a permit. Describe the checkpoint before allowing passage." /></label>
    <label>Current passage<select value={value.access??"open"} onChange={e=>onChange({...value,access:e.target.value as "open"|"blocked"})}><option value="open">Available</option><option value="blocked">Blocked</option></select></label>
    <p>Descriptions, schedules and conditions guide the AI. Use Blocked to prevent passage in the movement rules; written conditions do not automatically lock the crossing.</p>
    <button type="button" onClick={onClose}>Close details</button>
  </div>;
}
