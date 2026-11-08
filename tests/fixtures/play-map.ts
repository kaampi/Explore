import { settlementPiece } from '../../src/library/settlement';
import { newRealmTemplate,newPlaceTemplate } from '../../src/library/LibrarySchema';
import { exampleCharacterTemplate } from '../../src/library/exampleTemplates';
import { quickCharacterSession } from '../../src/ui/home/quickStart';

export function playMapFixture(){
 const town={...settlementPiece('settlement','',50,50),id:'town',placeId:'town-place',name:'Riverside',distanceScale:{value:25,unit:'m',kmPerUnit:.001}},home={...settlementPiece('cottage','town',30,40),id:'home',placeId:'home-place',name:'Cottage',description:'PRIVATE AUTHOR NOTE — the owner hides a jewel.'},hall={...settlementPiece('longhouse','town',70,40),id:'hall',placeId:'hall-place',name:'Meeting hall'},room={...settlementPiece('square','home',30,40),id:'room',placeId:'room-place',kind:'Room',name:'Kitchen'},well={...settlementPiece('well','town',50,60),id:'well',placeId:'well-place',name:'Old well',visibility:'arrival' as const},secret={...settlementPiece('cottage','town',10,90),id:'secret',placeId:'secret-place',name:'Secret hideout',visibility:'hidden' as const};
 const world=newRealmTemplate({id:'world',name:'The valley',note:'',source:'player',worldMap:{mapType:'world',distanceScale:{value:1,unit:'km',kmPerUnit:1},nodes:[town,home,hall,room,well,secret],routes:[{id:'street',from:home.id,to:hall.id,type:'road',mode:'Walk',duration:'3 minutes',bothWays:true,access:'open'},{id:'secret-road',from:home.id,to:secret.id,type:'path',mode:'Walk',duration:'1 minute',bothWays:true,access:'hidden'}]}});
 const places=world.worldMap!.nodes.map(n=>newPlaceTemplate({id:n.placeId!,name:n.name,realmId:world.id,note:n.description}));
 const session=quickCharacterSession(exampleCharacterTemplate(),'map-session',{realm:world,place:places[0]!});
 return {world,session,places,town,home,hall,room,well,secret};
}
