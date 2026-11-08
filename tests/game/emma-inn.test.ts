import { expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { emmaInnExample } from '../../src/scenarios/emmaInn';
import { innVisitExample } from '../../src/scenarios/innVisit';
import { newCharacterTemplate } from '../../src/library/LibrarySchema';
import { IndexedDBRepository } from '../../src/persistence/IndexedDBRepository';
import { startPlayableCampaign } from '../../src/session/adventureStart';
import { StateEngine } from '../../src/state/StateEngine';
import { EventLog } from '../../src/events/EventLog';
import { adventureCompleted, adventureOptions } from '../../src/game/AdventureEngine';
import type { EncounterAction } from '../../src/game/EncounterSchema';

it('lets the traveller tell Einar’s story, explicitly give Emma the brooch and carry the result into her room', async () => {
  const { realm, places } = innVisitExample();
  const emma = newCharacterTemplate({ name: 'Emma', familyName: 'Blossom' });
  const common = realm.worldMap!.nodes.find(node => node.name === 'Common room')!;
  const bedroom = realm.worldMap!.nodes.find(node => node.name === 'Guest room')!;
  const campaign = emmaInnExample(realm, places, emma, common.id, bedroom.id);
  const repo = new IndexedDBRepository(new IDBFactory(), 'emma-inn');
  await repo.saveCampaign(campaign);
  const saved = await repo.loadCampaign(campaign.id);
  expect(saved.people.map(person => person.characterId)).toEqual([emma.id]);
  expect(saved.scenes.map(scene => scene.mapNodeId)).toEqual([common.id, bedroom.id]);
  const engine = new StateEngine(startPlayableCampaign(saved, saved.scenes[0]!, places, 'emma-run', [realm]), new EventLog());
  const session = () => engine.getSession();
  const actor = (id: string) => session().encounter!.state.actors[id]!;
  const emmaId = `npc:${emma.id}`;
  const act = (action: EncounterAction) => engine.executeEncounterAction({
    id: crypto.randomUUID(), expectedRevision: session().encounter!.state.revision, expectedSceneId: session().sceneId!, action
  }, () => { throw new Error('This conversation should not roll dice.'); });
  const choose = (interactionId: string) => act({ kind: 'interaction', interactionId });

  expect(actor('player').inventory).toEqual(['einar-brooch']);
  expect(adventureOptions(session())).toEqual([]);
  expect(() => choose('give-brooch')).toThrow();
  const words = 'Einar räddade mig vid floden en gång. Jag önskar att han hade fått sitta här med oss.';
  act({ kind: 'say', text: words });
  expect(session().conversation.at(-2)).toMatchObject({ content: words });
  expect(session().encounter!.history.at(-1)?.speakerId).toBe(emmaId);
  choose('show-brooch');
  act({ kind: 'say', text: 'Emma, nu har jag gett dig broschen.' });
  expect(actor(emmaId).inventory).toEqual([]);
  expect(adventureOptions(session())).toEqual([]);
  choose('give-brooch');
  expect(actor('player').inventory).toEqual([]);
  expect(actor(emmaId).inventory).toEqual(['einar-brooch']);
  expect(session().conversation.at(-1)).toMatchObject({ content: expect.stringContaining('viker sig dina knän') });

  const [option] = adventureOptions(session());
  expect(option?.label).toBe('Låt Emma hjälpa dig till rummet');
  engine.transitionAdventure({ id: crypto.randomUUID(), linkId: option!.id, expectedStateVersion: session().stateVersion });
  expect(session().player?.locationRef?.placeId).toBe(bedroom.placeId ?? bedroom.id);
  expect(actor(emmaId).inventory).toEqual(['einar-brooch']);
  expect(session().conversation).toContainEqual(expect.objectContaining({ content: words }));
  expect(() => choose('rest')).toThrow();
  choose('tend-wounds');
  choose('rest');
  expect(adventureCompleted(session())).toBe(true);
  await repo.saveSession(session());
  const restored = await repo.loadSession(session().id);
  expect(adventureCompleted(restored)).toBe(true);
  expect(restored.encounter!.state.actors[emmaId]!.inventory).toEqual(['einar-brooch']);
});
