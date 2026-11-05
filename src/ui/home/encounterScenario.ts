import { newCharacterTemplate, newPlaceTemplate, newRulesetTemplate } from '@library/LibrarySchema';
import { quickCharacterSession } from './quickStart';
import { loadingBayGame } from '../../scenarios/loadingBay';

export function loadingBayScenario(sessionId: string, model?: string) {
  const encounter = loadingBayGame(), d = encounter.definition;
  const person = newCharacterTemplate({ id: 'depot-quartermaster', name: 'Imani', personality: 'The orbital depot quartermaster.', position: 'At the docking hatch', mood: 'professional' });
  const place = newPlaceTemplate({ realmId: d.id, name: d.title, note: d.description, brief: 'An orbital depot with a quartermaster, cargo shutter and patrol.' });
  const ruleset = newRulesetTemplate({ name: 'Encounter rules · d100', source: 'example', attributes: [] });
  const session = quickCharacterSession(person, sessionId, { place, ruleset, ...(model ? { model } : {}) });
  session.encounter = encounter;
  if (session.player) { session.player.name = encounter.state.actors[d.playerId]!.name; session.player.stats = Object.fromEntries(Object.entries(encounter.state.actors[d.playerId]!.stats).map(([id, value]) => [id, String(value)])); }
  session.conversation = [{ turn: 0, role: 'character', toldBy: 'narrator', content: d.description }];
  return session;
}
