import type { SVGProps } from 'react';
import type { MapNode } from '../../library/worldMap';
import type { Interior,InteriorEdge } from '../../library/interior';
import { furnitureSizeMeters,interiorScale,openingAngle,openingWidthMeters } from '../../library/interiorScale';
import type { FurnitureType } from '../../library/interiorFurniture';

function FurnitureArtwork({ type }: { type: FurnitureType }) {
  switch (type) {
    case 'dining-set':
      return <g stroke="#79613e" strokeWidth="2.6">
        {[-25, 25].flatMap(x => [-36, 36].map(y => <rect key={`${x}:${y}`} data-dining-seat="true"
          x={x - 11} y={y - 11} width="22" height="22" rx="5" fill="#cbb08a" />))}
        <rect x="-40" y="-24" width="80" height="48" rx="8" fill="#b29369" />
      </g>;
    case 'chair':
      return <g stroke="#79613e" strokeWidth="3">
        <rect x="-47" y="-47" width="94" height="94" rx="16" fill="#b48b79" />
        <rect x="-28" y="-17" width="56" height="54" rx="9" fill="#d1ac99" />
        <path d="M-28 -26H28" fill="none" />
      </g>;
    case 'rug':
      return <g>
        <rect x="-48" y="-47" width="96" height="94" rx="5" fill="#ab7667" stroke="#765246" strokeWidth="2" />
        <rect x="-41" y="-39" width="82" height="78" rx="3" fill="none" stroke="#edc9a3" strokeWidth="3" />
        <path d="M0 -22L27 0 0 22 -27 0Z" fill="none" stroke="#e6b38e" strokeWidth="3" />
      </g>;
    case 'bar-counter':
      return <g stroke="#77513a" strokeWidth="2.8">
        <rect x="-49" y="-47" width="98" height="94" rx="5" fill="#a97855" />
        <rect x="-46" y="-45" width="92" height="62" rx="4" fill="#ca9c6e" />
        <path d="M-22 23V45M22 23V45" fill="none" />
      </g>;
    case 'toilet':
      return <g stroke="#7d9290" strokeWidth="3">
        <rect x="-46" y="-48" width="92" height="29" rx="6" fill="#e7eee7" />
        <ellipse cx="0" cy="10" rx="42" ry="37" fill="#f5f5e8" />
        <ellipse cx="0" cy="10" rx="25" ry="23" fill="#cadbd7" />
      </g>;
    case 'stove':
      return <g stroke="#60685e" strokeWidth="3">
        <rect x="-48" y="-48" width="96" height="96" rx="6" fill="#d1d0bd" />
        {[-23, 23].flatMap(x => [-22, 16].map(y => <circle key={`${x}:${y}`} cx={x} cy={y} r="12" fill="#81867a" />))}
        <path d="M-40 36H40" fill="none" />
      </g>;
    case 'fireplace':
      return <g stroke="#746959" strokeWidth="2.6">
        <rect x="-48" y="-47" width="96" height="94" rx="5" fill="#bbb09c" />
        <path d="M-34 -29H34V25H-34Z" fill="#564e43" />
        <path d="M-13 20Q-27 4 -8 -7Q-8 5 0 5Q12 -1 7 -20Q28 2 14 20Z" fill="#efaf57" stroke="none" />
      </g>;
    case 'lamp':
      return <g>
        <circle r="46" fill="#f8dfa1" stroke="#a4824c" strokeWidth="4" />
        <circle r="23" fill="#fff5cb" stroke="#b79051" strokeWidth="3" />
        <path d="M-36 0H36M0 -36V36" stroke="#b79051" strokeWidth="3" opacity=".55" />
      </g>;
    default:
      return null;
  }
}

/** Draw in metres before converting to the floor plan. Rotation stays circular in physical space. */
export function InteriorFurniture({building,node,selected=false,invalid=false,...props}:{building:MapNode;node:MapNode;selected?:boolean;invalid?:boolean}&SVGProps<SVGGElement>){
 const m=interiorScale(building),s=furnitureSizeMeters(node),p=node.interiorPosition!,type=node.furnitureType??'table';
 const custom=type!=='table'&&type!=='bed'&&type!=='storage';
 return <g {...props} data-furniture-type={type} data-furniture-width-m={s.width} data-furniture-depth-m={s.depth} transform={`translate(${p.x*8} ${p.y*6}) scale(${m.pxPerMetreX} ${m.pxPerMetreY}) rotate(${node.rotation??0})`}>
  <rect x={-s.width/2} y={-s.depth/2} width={s.width} height={s.depth} rx={type==='table'?Math.min(s.width,s.depth)*.24:.035} fill={custom?'transparent':type==='bed'?'#d5bea8':'#b29369'} stroke={invalid?'#b34d3a':selected?'#86696d':custom?'none':'#79613e'} strokeWidth={selected||invalid?1.5:.035} vectorEffect={selected||invalid?'non-scaling-stroke':undefined}/>
  {node.furnitureType==='bed'&&<><rect x={-s.width*.4} y={-s.depth*.45} width={s.width*.8} height={Math.min(.35,s.depth*.18)} rx=".04" fill="#f6ead8"/><path d={`M${-s.width/2} ${-s.depth*.2}H${s.width/2}`} stroke="#f6ead8" strokeWidth=".03"/></>}
  {custom&&<g transform={`scale(${s.width/100} ${s.depth/100})`} pointerEvents="none"><FurnitureArtwork type={type}/></g>}
  {node.furnitureType==='storage'&&<path d={`M0 ${-s.depth/2}V${s.depth/2}M-.05 0H.05`} stroke="#79613e" strokeWidth=".025"/>}
 </g>;
}
export function InteriorOpening({building,opening,edge,selected=false,invalid=false,...props}:{building:MapNode;opening:Interior['openings'][number];edge:InteriorEdge;selected?:boolean;invalid?:boolean}&SVGProps<SVGGElement>){
 const m=interiorScale(building),w=openingWidthMeters(opening),angle=openingAngle(building,edge);
 return <g {...props} data-opening-width-m={w} transform={`translate(${opening.position.x*8} ${opening.position.y*6}) scale(${m.pxPerMetreX} ${m.pxPerMetreY}) rotate(${angle})`}>
  <rect x={-w/2} y="-.11" width={w} height=".22" fill={selected?'#d9bc9b':'#faf4e5'} stroke={invalid?'#b34d3a':opening.kind==='window'?'#729dac':opening.access==='locked'?'#a06953':'#927348'} strokeWidth={selected?1.5:.03} vectorEffect={selected?'non-scaling-stroke':undefined}/>
  {opening.kind==='door'?<path d={`M${-w/2} 0H${w/2}M${-w/2} 0V${-w}Q${w/2} ${-w} ${w/2} 0`} fill="none" stroke="#927348" strokeWidth=".025"/>:<path d={`M${-w/2} -.04H${w/2}M${-w/2} .04H${w/2}`} stroke="#729dac" strokeWidth=".025"/>}
 </g>;
}
