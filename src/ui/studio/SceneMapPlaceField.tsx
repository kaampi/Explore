import type { CampaignScene } from '../../library/LibrarySchema';
import { bindSceneMapPlace,mapPlaceForScene,type AdventureMapPlace } from '../../library/adventureMap';

export function SceneMapPlaceField({scene,entries,onChange}:{scene:CampaignScene;entries:AdventureMapPlace[];onChange:(scene:CampaignScene)=>void}){
 const selected=mapPlaceForScene(scene,entries),value=selected?.node.id??scene.mapNodeId??'';
 return <div className="scene-map-place"><label>Place on map<select aria-label="Place on map" value={value} onChange={e=>{const entry=entries.find(p=>p.node.id===e.target.value);if(entry)onChange(bindSceneMapPlace(scene,entry));}}>
  <option value="">Choose a place on the map</option>{!selected&&value&&<option value={value}>Missing map place — choose again</option>}{entries.map(entry=><option key={entry.node.id} value={entry.node.id}>{entry.path}</option>)}
 </select></label>
 {selected?<><p className="playable-hint">{selected.node.kind||'Place'} · {selected.path}</p><svg viewBox="0 0 100 100" role="img" aria-label={`Map position of ${selected.place.name}`}>
  {entries.filter(entry=>entry.node.parentId===selected.node.parentId).map(entry=><g key={entry.node.id}><circle cx={entry.node.x} cy={entry.node.y} r={entry.node.id===selected.node.id?3:1.5} className={entry.node.id===selected.node.id?'is-selected':''}/>{entry.node.id===selected.node.id&&<text x={Math.min(62,Math.max(5,entry.node.x))} y={entry.node.y>85?entry.node.y-6:entry.node.y+8}>{entry.place.name}</text>}</g>)}
 </svg><label className="playable-check"><input type="checkbox" checked={scene.usePlaceIntro===true} onChange={e=>onChange(bindSceneMapPlace(scene,selected,e.target.checked))}/>Use the introduction from the map</label><p className="playable-hint">Map names and information are refreshed from Map Studio. Editing the scene’s arrival text creates a scene-specific introduction.</p></>:<p className="playable-hint">{entries.length?'Choose the actual place where this scene happens.':'This map has no places yet. Open Map Studio to add one.'}</p>}
 </div>;
}
