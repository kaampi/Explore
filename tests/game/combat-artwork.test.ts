import { expect,it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { IndexedDBRepository } from '../../src/persistence/IndexedDBRepository';
import { StateEngine } from '../../src/state/StateEngine';
import { EventLog } from '../../src/events/EventLog';
import { gateEncounterScenario } from '../../src/ui/home/gateScenario';
import { loadingBayScenario } from '../../src/ui/home/encounterScenario';
import { parseSession } from '../../src/state/StateSchema';
const png='data:image/png;base64,iVBORw0KGgo=';
it('persists artwork across reload without changing checks, turns, positions, health or ammunition',async()=>{
 for(const seed of [gateEncounterScenario('gate-art','mock'),loadingBayScenario('depot-art','mock')]){
  const engine=new StateEngine(seed,new EventLog()),before=engine.getSession(),id=before.encounter?'courier':'player';
  engine.setCombatArtwork(id,png);const after=engine.getSession();expect(after.gateEncounter).toEqual(before.gateEncounter);expect(after.encounter).toEqual(before.encounter);expect(after.conversation).toEqual(before.conversation);expect(after.events).toEqual(before.events);
  const repo=new IndexedDBRepository(new IDBFactory(),seed.id);await repo.saveSession(after);const loaded=parseSession(await repo.loadSession(seed.id));expect(loaded.combatArtwork?.[id]?.imageDataUrl).toBe(png);
  const restored=new StateEngine(loaded,new EventLog());restored.setCombatArtwork(id,null);expect(restored.getSession().combatArtwork?.[id]).toBeUndefined();
 }
});
it('rejects unknown actors and executable image formats without partially changing state',()=>{
 const engine=new StateEngine(gateEncounterScenario('invalid-art','mock'),new EventLog()),before=engine.getSession();
 expect(()=>engine.setCombatArtwork('unknown',png)).toThrow('Unknown');expect(()=>engine.setCombatArtwork('player','data:image/svg+xml;base64,PHN2Zz4=')).toThrow();expect(engine.getSession()).toEqual(before);
});
