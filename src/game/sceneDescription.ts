import type { EncounterDefinition,EncounterState } from './EncounterSchema';
/** Authored variants describe committed state, without rewriting earlier conversation. */
export function encounterDescription(d:EncounterDefinition,s:EncounterState){
 return d.descriptions?.find(v=>v.requiresFlags.every(f=>s.flags.includes(f))&&v.excludesFlags.every(f=>!s.flags.includes(f)))?.text??d.description;
}
