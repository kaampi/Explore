import { mapPosition } from './mapGeometry';
import { openRoutePath, routePoints } from './mapRoutes';
import { applyMapScale } from './mapTravel';
import { smoothBrushPath } from './forestBrush';
import type { MapNode, WorldMap } from './worldMap';
import { curvePoint } from './mapShapes';

export type SettlementOptions = {
  size: 'village' | 'town' | 'city';
  layout: 'street' | 'crossroads';
  landmark: 'worship' | 'hall' | 'none';
};
export type SettlementLayout = WorldMap & { distanceScale: NonNullable<WorldMap['distanceScale']> };
const sizes = { village: 14, town: 30, city: 50 };
const building = (node: MapNode) => node.kind.toLowerCase() === 'building';
export type SettlementPiece='settlement'|'cottage'|'longhouse'|'townhouse'|'inn'|'square'|'fields'|'cattle'|'well'|'docks';
export function settlementPiece(piece:SettlementPiece,parentId:string,x:number,y:number):MapNode {
  if(['fields','cattle','well','docks'].includes(piece)){
    const dimensions:Record<string,[number,number]>={fields:[16,12],cattle:[12,10],well:[3,4],docks:[10,7]},[width,height]=dimensions[piece]!;
    const names:Record<string,string>={fields:'Fields',cattle:'Cattle pasture',well:'Well',docks:'Docks'},descriptions:Record<string,string>={fields:'Cultivated fields. Define crops, ownership and seasonal activity.',cattle:'A grazing area for cattle. Define the herd and its keepers.',well:'A water well. Define its water quality, access and ownership.',docks:'A landing place on the shoreline for boats. Routes, vessels and destinations are authored separately.'};
    const id=crypto.randomUUID();return {id,placeId:id,name:names[piece]!,kind:piece==='well'?'Point of Interest':'Area',parentId,x:Math.max(width/2,Math.min(100-width/2,x)),y:Math.max(height/2,Math.min(100-height/2,y)),width,height,symbol:piece as MapNode['symbol'],color:piece==='fields'?'#d6cc99':piece==='cattle'?'#cdd8b1':piece==='docks'?'#d1bd99':'#d2cbb9',description:descriptions[piece]!,population:'',characterIds:[],contentType:'settlement',...(piece==='docks'?{placementRule:'shoreline' as const}:{})};
  }
  const id=crypto.randomUUID(),town=piece==='settlement',square=piece==='square';
  const dimensions:Record<string,[number,number]>={settlement:[0,0],cottage:[7,8],longhouse:[14,12],townhouse:[7,9],inn:[10,10],square:[14,12]};
  const [width,height]=dimensions[piece]!;
  return {id,placeId:id,name:town?'New settlement':square?'New square':`New ${piece}`,kind:town?'Settlement':square?'Square':'Building',x:Math.max(width/2,Math.min(100-width/2,x)),y:Math.max(height/2,Math.min(100-height/2,y)),...(town?{settlementMarker:true,hasMap:true}:{width,height}),...(parentId?{parentId}:{}),...(!town&&!square?{symbol:piece as MapNode['symbol'],entrance:'open' as const} : {}),contentType:town||square?'settlement':'interior',description:'',population:'',characterIds:[],color:town?'#e4d7b8':square?'#dfd0af':'#e4d9bf'};
}

/** A small, editable starting layout. Streets and buildings are real map entities. */
export function generateSettlement(options: SettlementOptions, parentId = '', id = () => crypto.randomUUID()): SettlementLayout {
  const nodes: MapNode[] = [], routes: WorldMap['routes'] = [];
  const make = (name: string, kind: string, x: number, y: number, extra: Partial<MapNode> = {}) => {
    const key = id();
    const node: MapNode = { id: key, placeId: key, name, kind, x, y, description: '', population: '', characterIds: [], ...(parentId ? { parentId } : {}), ...extra };
    nodes.push(node); return node;
  };
  const square = make('Market square', 'Square', 50, 50, { width: 14, height: 14, color: '#dfd0af', contentType: 'settlement', description: 'An open square at the centre of the settlement. Shops and places to meet face the square.' });
  const lots: MapNode[] = [];
  const junctions = new Map<string, MapNode>([['50,50', square]]);
  const junction = (x: number, y: number) => {
    const key = `${x},${y}`, old = junctions.get(key); if (old) return old;
    const node = make('Street junction', 'Junction', x, y, { isJunction: true, width: 1, height: 1 }); delete node.placeId;junctions.set(key, node); return node;
  };
  const overlaps = (x: number, y: number, width: number, height: number) => [square, ...lots].some(n => Math.abs(x - n.x) < (width + (n.width ?? 7)) / 2 + .45 && Math.abs(y - n.y) < (height + (n.height ?? 7)) / 2 + .45);
  const addBuilding = (name: string, x: number, y: number, width: number, height: number, symbol: MapNode['symbol'], description: string, road: 'horizontal' | 'vertical') => {
    if (overlaps(x, y, width, height)) return;
    const node = make(name, 'Building', x, y, { width, height, symbol, entrance:'open', color: '#e4d9bf', contentType: 'interior', description }); lots.push(node);
    const access = road === 'horizontal' ? junction(x, 50) : junction(50, y);
    routes.push({ id: id(), from: node.id, to: access.id, type: 'path', mode: 'Walk', duration: '', bothWays: true, access: 'open', description: 'A short approach from the street to the entrance.' });
    return node;
  };
  const businesses: Array<[string, MapNode['symbol'], string]> = [
    ['Shop', 'townhouse', 'A shop facing the market square. Choose the goods and proprietor when developing the location.'],
    ['Workshop', 'longhouse', 'A workshop near the square. Its trade and occupants can be defined by the author.'],
    ['Café', 'cottage', 'A place for refreshments and conversation beside the market square. Adapt its name and offering to the setting.'],
    ['Inn', 'inn', 'A place for travellers to rest and meet near the square. Rooms and occupants are not generated automatically.']
  ];
  businesses.forEach(([name, symbol, description], i) => addBuilding(name, i % 2 ? 62 : 38, i < 2 ? 40 : 60, symbol === 'longhouse' ? 9 : 7, symbol === 'longhouse' ? 9 : 7, symbol, description, 'horizontal'));
  if (options.landmark !== 'none') addBuilding(options.landmark === 'worship' ? 'Place of worship' : 'Community hall', 12, 23, 12, 12, 'longhouse', options.landmark === 'worship' ? 'A religious building on the edge of the settlement. Define the faith, use and occupants for this world.' : 'A shared gathering place on the edge of the settlement.', 'horizontal');
  const count = sizes[options.size], axes = options.layout === 'crossroads' ? 2 : 1;
  const columns = Math.ceil(count / (2 * axes)) + 3, spacing = 84 / (columns - 1), width = Math.min(7, spacing * .66), height = width * 1.05;
  const offset = Math.max(8, height / 2 + 5);
  // Reserve the approach to the edge landmark before placing residential lots.
  const reserved = (x: number, y: number, w: number, h: number) => options.landmark !== 'none' && Math.abs(x - 12) < w / 2 + 2 && y + h / 2 > 27.5 && y - h / 2 < 50;
  let home = 1;
  for (let axis = 0; axis < axes; axis++) for (let i = 0; i < columns; i++) for (const side of [-1, 1]) {
    if (lots.length >= count) break;
    const along = Math.round((8 + i * spacing) * 1000) / 1000;
    const x = axis ? 50 + side * offset : along, y = axis ? along : 50 + side * offset;
    const longhouse=home%5===0,w=longhouse?width*1.35:width,h=longhouse?height*1.2:height;
    if (axis && Math.abs(y - 50) < height / 2 + 3 || !axis && options.layout === 'crossroads' && Math.abs(x - 50) < width / 2 + 3 || reserved(x, y, w, h)) continue;
    const node = addBuilding(`Home ${String(home).padStart(2, '0')}`, x, y, w, h, home % 5 === 0 ? 'longhouse' : home % 3 === 0 ? 'townhouse' : 'cottage', `A home with an entrance facing ${axis ? 'Market street' : 'Main street'}. Its residents have not been assigned.`, axis ? 'vertical' : 'horizontal');
    if (node) home++;
  }
  junction(5, 50); junction(95, 50);
  if (options.layout === 'crossroads') { junction(50, 5); junction(50, 95); }
  for (let axis = 0; axis < axes; axis++) {
    const ordered = [...junctions.values()].filter(n => axis ? n.x === 50 : n.y === 50).sort((a, b) => axis ? a.y - b.y : a.x - b.x);
    for (let i = 1; i < ordered.length; i++) routes.push({ id: id(), from: ordered[i - 1]!.id, to: ordered[i]!.id, type: 'road', mode: 'Walk', duration: '', access: 'open', bothWays: true, speedKmh: 4, description: axis ? 'Market street runs through the square.' : 'Main street connects the settlement and its market square.' });
  }
  return { mapType: 'settlement', nodes, routes, distanceScale: { value: options.size === 'village' ? 25 : options.size === 'town' ? 50 : 100, unit: 'm', kmPerUnit: .001 } };
}

export function applySettlement(map: WorldMap, parentId: string, layout: SettlementLayout): WorldMap {
  const parent = parentId ? map.nodes.find(n => n.id === parentId) : undefined;
  if (parentId && (!parent || parent.kind.toLowerCase() !== 'settlement')) throw Error('Choose an existing settlement.');
  if (!parentId && map.mapType !== 'settlement') throw Error('Choose a settlement map.');
  if (map.nodes.some(n => (n.parentId ?? '') === parentId)) throw Error('Generate a starting layout in an empty settlement. Existing places are kept.');
  if (layout.nodes.some(n => (n.parentId ?? '') !== parentId) || new Set([...map.nodes, ...layout.nodes].map(n => n.id)).size !== map.nodes.length + layout.nodes.length) throw Error('The layout does not belong to this settlement.');
  const next = { ...map, ...(parentId ? {} : { distanceScale: layout.distanceScale }), nodes: [...map.nodes.map(n => n.id === parentId ? { ...n, hasMap: true, contentType: 'settlement' as const, distanceScale: n.distanceScale ?? layout.distanceScale } : n), ...structuredClone(layout.nodes)], routes: [...map.routes, ...structuredClone(layout.routes)] };
  return applyMapScale(next, parentId, 5);
}

/** Derive the overview from current direct contents. No random or persistent decorative houses. */
export function settlementOverview(parentId: string, nodes: MapNode[], routes: WorldMap['routes']) {
  const contents = nodes.filter(n => (n.parentId ?? '') === parentId);
  const buildings = contents.filter(building), areas = contents.filter(n => ['square', 'area', 'district'].includes(n.kind.toLowerCase()));
  if (!buildings.length && !areas.length) return null;
  const byId = new Map(contents.map(n => [n.id, n]));
  const streets = routes.filter(r => byId.has(r.from) && byId.has(r.to) && r.mode.toLowerCase() !== 'door').map(r => ({ route: r, points: routePoints(r, byId.get(r.from)!, byId.get(r.to)!) }));
  const strokes: NonNullable<MapNode['brush']> = [];
  for (const n of [...buildings, ...areas]) {
    const width = (n.width ?? 10) * 8, height = (n.height ?? 10) * 6;
    const radius = Math.min(70, Math.max(12, Math.min(width, height) / 2 + 9));
    // Several samples preserve the footprint of long buildings and squares.
    for (const x of [.2, .5, .8]) for (const y of [.2, .5, .8]) { const p = mapPosition(n, { x, y }); strokes.push({ ...p, radius, erase: false }); }
  }
  for (const street of streets) for (let i = 1; i < street.points.length; i++) {
    const a = street.points[i - 1]!, b = street.points[i]!, steps = Math.min(128,Math.max(8,Math.ceil(Math.hypot((b.x - a.x) * 8, (b.y - a.y) * 6) / 9)));
    for (let j = 0; j <= steps; j++) { const p=curvePoint(a,b,j/steps);strokes.push({ x:p.x*8,y:p.y*6,radius:street.route.type==='road'?12:8,erase:false }); }
  }
  let left=800,top=600,right=0,bottom=0;
  for(const s of strokes){left=Math.min(left,s.x-s.radius);top=Math.min(top,s.y-s.radius);right=Math.max(right,s.x+s.radius);bottom=Math.max(bottom,s.y+s.radius);}
  left=Math.max(0,left);top=Math.max(0,top);right=Math.min(800,right);bottom=Math.min(600,bottom);
  const terrain: MapNode = { id: 'settlement-footprint', name: '', kind: 'Settlement', x: 50, y: 50, description: '', population: '', characterIds: [], brush: strokes };
  return { buildings, areas, streets: streets.map(s => ({ id: s.route.id, path: openRoutePath(s.points), type: s.route.type })), path: smoothBrushPath(terrain), bounds: { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) } };
}
