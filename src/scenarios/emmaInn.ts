import { EncounterGameSchema, InteractionSchema, type Interaction } from '../game/EncounterSchema';
import { adventureMapPlaces, bindSceneMapPlace, type AdventureMapPlace } from '../library/adventureMap';
import {
  emptyCampaignPlayer, emptyCampaignScene, newCampaignTemplate, SceneCastSchema,
  type CharacterTemplate, type PlaceTemplate, type RealmTemplate
} from '../library/LibrarySchema';
import { formatPersonName } from '../library/personName';

const BROOCH = 'einar-brooch';
const TOLD = 'inn:einar-story-shared';
const SHOWN = 'inn:brooch-shown';
const GIVEN = 'inn:brooch-given';
const TENDED = 'inn:wounds-tended';
const RESTED = 'inn:rested';

export function emmaInnExample(
  world: RealmTemplate, places: PlaceTemplate[], emma: CharacterTemplate, commonRoomId: string, emmaRoomId: string
) {
  const rooms = adventureMapPlaces(world, places).filter(entry => entry.node.kind === 'Room');
  const common = rooms.find(entry => entry.node.id === commonRoomId);
  const bedroom = rooms.find(entry => entry.node.id === emmaRoomId);
  if (!common?.node.parentId || !bedroom || common === bedroom || bedroom.node.parentId !== common.node.parentId) {
    throw new Error('Choose two different saved rooms in the same inn.');
  }

  const name = formatPersonName(emma.name, emma.familyName, emma.middleName);
  const emmaId = `npc:${emma.id}`;
  const groupId = crypto.randomUUID();
  const brooch = {
    id: BROOCH, name: 'Broschen',
    description: 'Kvinnan du och Einar räddade gav dig den här broschen. Hon sa att det var det enda av värde hon hade.'
  };
  function action(
    id: string, label: string, reply: string, flag: string, requiresFlags: string[] = [],
    extra: Partial<Interaction> = {}, effects: Interaction['success']['effects'] = []
  ) {
    return InteractionSchema.parse({
      id, label, description: label, position: 'here', counterpartyId: emmaId, costsAction: false,
      requiresFlags, success: { text: reply, effects: [...effects, { kind: 'flag', flag }] },
      failure: { text: 'Inget förändras.' }, ...extra
    });
  }

  const barIntro = 'Det är sent. Några gäster sitter kvar vid elden och talar lågt. Bakom den vinklade bardisken torkar Emma av ett glas. Hon lyfter blicken mot dig. ”Köket är stängt.”\n\nDu har fortfarande blod på ärmen efter överfallet. Du och Einar räddade en kvinna och hennes fyra barn. När striden verkade över gjorde en av rövarna ett sista utfall och skar Einar över halsen. Du slog ner rövaren, men kunde inte rädda din vän. Kvinnan gav dig sin brosch som tack. Den ligger i din ficka.';
  const roomIntro = 'Emma hjälper dig över tröskeln till sitt rum och får dig att sätta dig på sängkanten. Slamret från salen dämpas när dörren går igen. Hon lägger broschen bredvid ljuset och hämtar vatten och en ren duk.';

  function scene(
    entry: AdventureMapPlace, title: string, intro: string, interactions: Interaction[], afterGift: boolean
  ) {
    const draft = {
      ...emptyCampaignScene(), name: title, storyboardSectionId: groupId,
      position: { x: afterGift ? 390 : 70, y: 110 },
      people: [SceneCastSchema.parse({ characterId: emma.id, position: afterGift ? 'Vid sängen' : 'Bakom bardisken' })]
    };
    const game = EncounterGameSchema.parse({
      definition: {
        id: draft.id, title, description: intro, playerId: 'player', rules: { id: 'd100' },
        places: [{ id: 'here', name: entry.node.name, x: 0, y: 0 }],
        connections: [], sightLines: [], hostilities: [], weapons: [], items: [brooch], interactions,
        descriptions: afterGift ? [
          { requiresFlags: [RESTED], text: 'Gryningsljuset letar sig in i rummet. Dina sår är förbundna. Broschen ligger kvar hos Emma.' },
          { requiresFlags: [TENDED], excludesFlags: [RESTED], text: 'Emma har förbundit dina sår. Broschen ligger vid ljuset på bordet.' }
        ] : [
          { requiresFlags: [GIVEN], text: 'Broschen ligger i Emmas hand. Hon håller dig stadigt över bardisken medan tröttheten sköljer över dig.' }
        ]
      },
      state: {
        version: 1, sceneId: draft.id, revision: 0, phase: 'exploration', round: 0, cursor: 0,
        flags: afterGift ? [TOLD, SHOWN, GIVEN] : [],
        actors: {
          player: { id: 'player', name: 'Resenären', team: 'traveller', control: 'player', position: 'here',
            hp: 20, maxHp: 20, stats: {}, weapons: [], inventory: afterGift ? [] : [BROOCH] },
          [emmaId]: { id: emmaId, name, team: 'inn', control: 'npc', position: 'here',
            hp: 20, maxHp: 20, stats: {}, weapons: [], inventory: afterGift ? [BROOCH] : [] }
        },
        barriers: {}
      },
      history: []
    });
    return bindSceneMapPlace({ ...draft, encounter: game }, entry, false);
  }

  const atBar = scene(common, 'Vid bardisken', barIntro, [
    action('tell-einar', '”Han räddade mitt liv fler gånger än jag kan räkna. När han behövde mig kunde jag inte rädda honom.”',
      '”Einar.” Hon säger namnet lågt och skjuter fram en pall. ”Sätt dig. Jag lyssnar.”',
      TOLD, [], { dialogueMode: 'report', dialogueTopics: ['Einar'] }),
    action('show-brooch', 'Visa Emma broschen',
      'Du lägger broschen i handflatan. Emma lutar sig över disken för att se. ”Det var den hon gav dig?” Du får en märklig visshet om att broschen hör hemma hos Emma.',
      SHOWN, [TOLD], { counterpartyId: undefined }),
    action('give-brooch', 'Ge broschen till Emma',
      'Emma tar emot broschen. I samma ögonblick viker sig dina knän. Det känns som om broschen hade hållit dig uppe hela vägen hit. Emma hinner fånga din arm. ”Luta dig mot mig. Mitt rum är strax här intill.”',
      GIVEN, [SHOWN], { counterpartyId: undefined }, [{ kind: 'transfer-item', itemId: BROOCH, from: 'player', to: emmaId }])
  ], false);
  const inRoom = scene(bedroom, 'I Emmas rum', roomIntro, [
    action('tend-wounds', 'Låt Emma förbinda såren',
      'Emma tvättar skärsåren och lindar om armen. ”Berätta gärna mer om Einar någon gång”, säger hon medan hon knyter förbandet. ”Om du vill.”',
      TENDED, [], { counterpartyId: undefined }),
    action('rest', 'Vila till gryningen',
      'Du somnar till ljudet av att Emma ställer undan skålen med vatten. När du vaknar har ljuset brunnit ner. Broschen ligger där hon lade den, och från salen hörs de första stegen för dagen.',
      RESTED, [TENDED], { counterpartyId: undefined })
  ], true);

  return newCampaignTemplate({
    name: 'Emma och Einar · Natten på värdshuset',
    realmId: world.id, mapWorldId: world.id, people: [{ characterId: emma.id, stats: {} }],
    player: { ...emptyCampaignPlayer(), name: 'Resenären' },
    storyboardSections: [{ id: groupId, kind: 'group', title: 'Natten på värdshuset' }],
    scenes: [atBar, inRoom],
    sceneLinks: [{
      id: crypto.randomUUID(), fromSceneId: atBar.id, toSceneId: inRoom.id,
      label: 'Låt Emma hjälpa dig till rummet', requiresFlags: [GIVEN], requiresAbsentFlags: [], setsFlags: []
    }],
    goal: { title: 'Få hjälp på värdshuset och vila till gryningen.', requiresFlags: [RESTED] }
  });
}
