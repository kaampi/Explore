import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { expect,it } from 'vitest';
import { IndexedDBRepository } from '../../src/persistence/IndexedDBRepository';
import { instantiateBlueprint,starterBlueprints } from '../../src/library/placeBlueprint';
import { WorldMapSchema } from '../../src/library/worldMap';
it('persists reusable templates and keeps placed copies independent',async()=>{
 const factory=new IDBFactory(),repo=new IndexedDBRepository(factory,'place-blueprint-test');
 const templates=await repo.listPlaceBlueprints();expect(templates.length).toBeGreaterThan(0);
 const ruin=templates.find(t=>t.name==='Ruin')!,forest=instantiateBlueprint(ruin,'forest'),village=instantiateBlueprint(ruin,'village');
 expect(forest.id).not.toBe(village.id);expect(forest.parentId).toBe('forest');expect(village.parentId).toBe('village');
 await repo.savePlaceBlueprints(templates.map(t=>t.id===ruin.id?{...t,name:'Ancient ruin'}:t));
 expect((await new IndexedDBRepository(factory,'place-blueprint-test').listPlaceBlueprints()).find(t=>t.id===ruin.id)?.name).toBe('Ancient ruin');
 expect(forest.name).toBe('Ruin');expect(village.name).toBe('Ruin');
 const square=instantiateBlueprint(starterBlueprints.find(t=>t.kind==='Area')!);
 expect(square.isArea).not.toBe(true); // A generic region is not a terrain subarea clipped to its parent.
 expect(WorldMapSchema.parse({nodes:[square],routes:[]}).nodes[0]?.blueprintId).toBe(square.blueprintId);
});
