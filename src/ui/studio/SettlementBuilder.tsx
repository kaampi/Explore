import { useMemo,useState } from 'react';
import { generateSettlement,type SettlementOptions,type SettlementLayout } from '../../library/settlement';
import { Modal } from '../components/Modal';
import { SettlementPlan } from './SettlementArtwork';
import { settlementWorldContext } from '../../library/settlementContext';
import type { WorldMap } from '../../library/worldMap';

export function SettlementBuilder({name,parentId,onUse,onClose,worldMap,showWorldContext=true}:{name:string;parentId:string;onUse:(layout:SettlementLayout)=>void;onClose:()=>void;worldMap?:WorldMap;showWorldContext?:boolean}) {
  const [options,setOptions]=useState<SettlementOptions>({size:'village',layout:'street',landmark:'worship'});
  const layout=useMemo(()=>generateSettlement(options,parentId),[options,parentId]);
  const count=layout.nodes.filter(n=>n.kind==='Building').length;
  const context=worldMap&&showWorldContext?settlementWorldContext({...worldMap,nodes:worldMap.nodes.map(n=>n.id===parentId?{...n,distanceScale:layout.distanceScale}:n)},parentId):null;
  return <Modal title={`Build settlement · ${name}`} wide onClose={onClose}><div className="settlement-builder">
    <div className="settlement-builder__intro"><small>A PLACE PEOPLE CAN LIVE</small><h3>A settlement with a plan</h3><p>Start with streets, a square and buildings that belong together. Every place stays editable.</p></div>
    <div className="settlement-builder__layout"><div className="settlement-builder__settings">
      <label>Settlement size<select value={options.size} onChange={e=>setOptions({...options,size:e.target.value as SettlementOptions['size']})}><option value="village">Village</option><option value="town">Town</option><option value="city">City starter</option></select></label>
      <label>Street pattern<select value={options.layout} onChange={e=>setOptions({...options,layout:e.target.value as SettlementOptions['layout']})}><option value="street">Along a main street</option><option value="crossroads">Around a crossroads</option></select></label>
      <label>Landmark on the outskirts<select value={options.landmark} onChange={e=>setOptions({...options,landmark:e.target.value as SettlementOptions['landmark']})}><option value="worship">Place of worship</option><option value="hall">Community hall</option><option value="none">No landmark</option></select></label>
      <p>Shops, a café and an inn face the square. Homes face streets. The edge landmark has an approach of its own.</p><p>Names and uses are starting suggestions. Adapt them to fantasy, modern settings or science fiction. People and building interiors are yours to add.</p>
      <div className="settlement-builder__summary"><strong>{count} buildings · 1 square</strong><span>{layout.distanceScale.value} metres per grid cell</span><span>Includes connected streets and entrance paths.</span></div>
      {context&&<p>World geography is a read-only underlay. Adjust the suggested layout to the roads and shoreline after applying it.</p>}
    </div><SettlementPlan map={layout} parentId={parentId} worldContext={context}/></div>
    <footer><p>The preview has not changed your map. This creates real places, not decorative house stamps.</p><button type="button" onClick={onClose}>Cancel</button><button type="button" className="world-map__primary" onClick={()=>onUse(layout)}>Use this layout</button></footer>
  </div></Modal>;
}
