import type { MapNode } from "./worldMap";
import type { XY } from "./mapShapes";
export function rotatePoint(p:XY,center:XY,degrees:number):XY{const angle=degrees*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);return {x:center.x+(p.x-center.x)*c-(p.y-center.y)*s,y:center.y+(p.x-center.x)*s+(p.y-center.y)*c};}
export function mapPosition(n:MapNode,p:XY):XY{return rotatePoint({x:(n.x+(p.x-.5)*(n.settlementMarker?0:n.width??15))*8,y:(n.y+(p.y-.5)*(n.settlementMarker?0:n.height??(44/6)))*6},{x:n.x*8,y:n.y*6},n.rotation??0);}
