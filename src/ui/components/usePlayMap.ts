import { useEffect,useState } from 'react';
import type { IndexedDBRepository } from '../../persistence/IndexedDBRepository';
import type { Session } from '../../state/StateSchema';
import type { RealmTemplate } from '../../library/LibrarySchema';
import { playMapModel } from '../../library/playMap';

export function usePlayMap(repo:IndexedDBRepository,session:Session){
 const [worlds,setWorlds]=useState<RealmTemplate[]>([]);
 const pinned=session.adventure?.geography;
 useEffect(()=>{let active=true;if(pinned)return;void repo.listRealms().then(rows=>{if(active)setWorlds(rows);}).catch(()=>{if(active)setWorlds([]);});return()=>{active=false;};},[repo,session.id,session.scene?.placeId,pinned?.worldId,pinned?.updatedAt]);
 return playMapModel(session,worlds);
}
