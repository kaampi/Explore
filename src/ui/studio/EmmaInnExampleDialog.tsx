import { useState } from 'react';
import type { CampaignTemplate, CharacterTemplate, PlaceTemplate, RealmTemplate } from '../../library/LibrarySchema';
import { adventureMapPlaces } from '../../library/adventureMap';
import { formatPersonName } from '../../library/personName';
import { emmaInnExample } from '../../scenarios/emmaInn';
import { Modal } from '../components/Modal';

const personName = (person: CharacterTemplate) => formatPersonName(person.name, person.familyName, person.middleName);
const commonRoom = /^(common room|taproom|storstugan|salen|värdshussalen)$/i;
const emmaRoom = /^(emma(?:['’]?s)?\s+(?:room|rum|bedroom))$/i;

export function EmmaInnExampleDialog({ characters, worlds, places, busy, error, onCreate, onClose }: {
  characters: CharacterTemplate[];
  worlds: RealmTemplate[];
  places: PlaceTemplate[];
  busy: boolean;
  error: string | null;
  onCreate: (campaign: CampaignTemplate) => Promise<void>;
  onClose: () => void;
}) {
  const mappedWorlds = worlds.filter(world => world.worldMap?.nodes.some(node => node.kind === 'Room'));
  const suggestedWorld = mappedWorlds.find(world => world.worldMap!.nodes.some(node => emmaRoom.test(node.name.trim())));
  const [characterId, setCharacterId] = useState(() => characters.find(person => /^emma blossom$/i.test(personName(person)))?.id ?? '');
  const [worldId, setWorldId] = useState(suggestedWorld?.id ?? mappedWorlds[0]?.id ?? '');
  const [commonId, setCommonId] = useState<string>();
  const [bedroomId, setBedroomId] = useState<string>();
  const world = mappedWorlds.find(item => item.id === worldId);
  const emma = characters.find(person => person.id === characterId);
  const rooms = adventureMapPlaces(world, places).filter(entry => entry.node.kind === 'Room' && entry.node.parentId);
  const suggestedBedroom = rooms.find(entry => emmaRoom.test(entry.node.name.trim()));
  const suggestedCommon = rooms.find(entry => commonRoom.test(entry.node.name.trim()) &&
    (!suggestedBedroom || entry.node.parentId === suggestedBedroom.node.parentId));
  const common = rooms.find(entry => entry.node.id === (commonId ?? suggestedCommon?.node.id));
  const bedrooms = rooms.filter(entry => entry !== common && entry.node.parentId === common?.node.parentId);
  const bedroom = bedroomId === undefined ? bedrooms.find(entry => emmaRoom.test(entry.node.name.trim()))
    : bedrooms.find(entry => entry.node.id === bedroomId);
  const [formError, setFormError] = useState('');

  async function create() {
    if (!world || !emma || !common || !bedroom) return;
    setFormError('');
    try {
      await onCreate(emmaInnExample(world, places, emma, common.node.id, bedroom.node.id));
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : 'Could not create the adventure.');
    }
  }

  return <Modal title="Emma och Einar" onClose={() => { if (!busy) onClose(); }}>
    <p className="setup-lede">Choose Emma Blossom and two rooms in your saved inn. Explore creates a new adventure with two connected scenes.</p>
    <label className="setup-field">Character
      <select value={characterId} onChange={event => setCharacterId(event.target.value)}>
        <option value="">Choose a saved character</option>
        {characters.map(person => <option key={person.id} value={person.id}>{personName(person)}</option>)}
      </select>
    </label>
    <label className="setup-field">World map
      <select value={worldId} onChange={event => {
        setWorldId(event.target.value); setCommonId(undefined); setBedroomId(undefined);
      }}>
        <option value="">Choose a saved world map</option>
        {mappedWorlds.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
    </label>
    <label className="setup-field">Room with the bar
      <select value={common?.node.id ?? ''} onChange={event => { setCommonId(event.target.value); setBedroomId(undefined); }}>
        <option value="">Choose the common room</option>
        {rooms.map(entry => <option key={entry.node.id} value={entry.node.id}>{entry.path}</option>)}
      </select>
    </label>
    <label className="setup-field">Emma’s room
      <select value={bedroom?.node.id ?? ''} disabled={!common} onChange={event => setBedroomId(event.target.value)}>
        <option value="">Choose a second room in this building</option>
        {bedrooms.map(entry => <option key={entry.node.id} value={entry.node.id}>{entry.path}</option>)}
      </select>
    </label>
    {!mappedWorlds.length && <p className="inspector-empty">Save your inn and its rooms in World maps to make them available here.</p>}
    {(error || formError) && <p className="setup-error" role="alert">{error || formError}</p>}
    <div className="setup-actions">
      <button className="setup-start" type="button" disabled={busy || !world || !emma || !common || !bedroom} onClick={() => void create()}>
        {busy ? 'Creating…' : 'Create & open Storyboard'}
      </button>
    </div>
  </Modal>;
}
