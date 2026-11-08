import type { Session } from '../state/StateSchema';
import { inheritedMapImage } from '../library/interior';
/** Resolve from the pinned map. Leaving a pictured room clears its previous picture. */
export function applyAdventurePresentation(session:Session){
 const run=session.adventure,scene=session.scene,current=run?.scenes.find(s=>s.id===run.currentSceneId);
 if(!run?.geography||!current?.mapNodeId||!scene)return;
 const image=inheritedMapImage(run.geography.map,current.mapNodeId);
 delete scene.thumbDataUrl;delete scene.imageDataUrl;delete scene.gallery;delete scene.picturePlay;delete scene.rooms;
 if(image){scene.imageDataUrl=image;scene.thumbDataUrl=image;}
}
