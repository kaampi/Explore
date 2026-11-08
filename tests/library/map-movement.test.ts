import { expect,it } from "vitest";
import { resolveMapMovement } from "../../src/session/mapMovement";
import { newPlaceTemplate,newRealmTemplate } from "../../src/library/LibrarySchema";
import { exampleCharacterTemplate } from "../../src/library/exampleTemplates";
import { quickCharacterSession } from "../../src/ui/home/quickStart";
import { landmarkTravelPatch } from "../../src/session/landmarkTravel";
import { StateEngine } from "../../src/state/StateEngine";
import { EventLog } from "../../src/events/EventLog";
import { findCrossings } from "../../src/library/mapCrossings";
const fixture=()=>{const kitchen=newPlaceTemplate({id:"kitchen",realmId:"world",name:"Kitchen"}),forest=newPlaceTemplate({id:"forest",realmId:"world",name:"Forest",note:"Leaves rustle."});const world=newRealmTemplate({id:"world",name:"World",note:"",source:"player",worldMap:{nodes:[{id:"k",placeId:kitchen.id,name:"Kitchen",kind:"Room",x:20,y:50,description:"",population:"",characterIds:[]},{id:"f",placeId:forest.id,name:"Forest",kind:"Forest",x:80,y:50,description:"",population:"",characterIds:[]}],routes:[{id:"r",from:"k",to:"f",mode:"Walk",duration:"5 minutes",access:"open",bothWays:true}]}});return {places:[kitchen,forest],worlds:[world],session:quickCharacterSession(exampleCharacterTemplate(),"s",{place:kitchen,realm:world})};};
it("resolves outside and records the actual destination in engine state",()=>{const f=fixture(),result=resolveMapMovement("I go outside",f.session,f.worlds,f.places);expect(result.place?.id).toBe("forest");const log=new EventLog(),engine=new StateEngine(f.session,log);engine.travelToLandmark(landmarkTravelPatch(result.place!));expect(engine.getSession().scene?.placeId).toBe("forest");expect(engine.getSession().player?.position.value).toBe("Forest");expect(log.all().some(e=>e.type==="landmark_traveled")).toBe(true);});
it("rejects locked and missing passages instead of inventing movement",()=>{const f=fixture();f.worlds[0]!.worldMap!.routes[0]!.access="locked";expect(()=>resolveMapMovement("I walk to Forest",f.session,f.worlds,f.places)).toThrow(/locked/);f.worlds[0]!.worldMap!.routes=[];expect(()=>resolveMapMovement("I go outside",f.session,f.worlds,f.places)).toThrow(/No mapped exit/);});
it("asks for a destination when more than one exit is possible",()=>{const f=fixture(),map=f.worlds[0]!.worldMap!;map.nodes.push({...map.nodes[1]!,id:"road",name:"Road",placeId:"road"});map.routes.push({...map.routes[0]!,id:"r2",to:"road"});expect(()=>resolveMapMovement("I go outside",f.session,f.worlds,f.places)).toThrow(/Which destination/);});
it("does not move on questions or negated intentions",()=>{const f=fixture();expect(resolveMapMovement("I do not go to Forest",f.session,f.worlds,f.places).place).toBeUndefined();expect(resolveMapMovement("Should I go to Forest?",f.session,f.worlds,f.places).place).toBeUndefined();});

it("approaches a cottage through open forest and enters its room only through a door",()=>{const f=fixture(),map=f.worlds[0]!.worldMap!;const cottage=newPlaceTemplate({id:"cottage",realmId:"world",name:"Witch cottage",note:"Indoor facts"});f.places.push(cottage);map.nodes.push({id:"cottage",placeId:"cottage",parentId:"f",name:"Witch cottage",kind:"Building",x:30,y:30,description:"",population:"",characterIds:[]});map.nodes[0]!.parentId="cottage";map.routes[0]!.mode="Door";f.session.scene!.placeId="forest";f.session.scene!.location="Forest";const approach=resolveMapMovement("I go to Witch cottage",f.session,f.worlds,f.places);expect(approach.place?.id).toBe("cottage");expect(approach.place?.name).toBe("Outside Witch cottage");const engine=new StateEngine(f.session,new EventLog());engine.travelToLandmark(landmarkTravelPatch(approach.place!));const outside=engine.getSession();expect(outside.player?.position.value).toBe("Outside Witch cottage");expect(resolveMapMovement("I enter the cottage",outside,f.worlds,f.places).place?.id).toBe("kitchen");expect(resolveMapMovement("Great. I step inside",outside,f.worlds,f.places).place?.id).toBe("kitchen");expect(resolveMapMovement("Great. I do not step inside",outside,f.worlds,f.places).place).toBeUndefined();map.routes[0]!.bothWays=false;expect(()=>resolveMapMovement("I enter the cottage",outside,f.worlds,f.places)).toThrow(/doorway/);});
it("does not require a drawn road to reach a building inside open terrain",()=>{const f=fixture(),map=f.worlds[0]!.worldMap!;f.places.push(newPlaceTemplate({id:"c",realmId:"world",name:"Cottage"}));map.nodes.push({id:"c",placeId:"c",parentId:"f",name:"Cottage",kind:"Building",x:40,y:40,description:"",population:"",characterIds:[]});map.routes=[];f.session.scene!.placeId="forest";f.session.scene!.location="Forest";expect(resolveMapMovement("gå till Cottage",f.session,f.worlds,f.places).place?.name).toBe("Outside Cottage");});

it("registers outside when a room exit leads to its enclosing cottage",()=>{const f=fixture(),map=f.worlds[0]!.worldMap!;const cottage=newPlaceTemplate({id:"cottage",realmId:"world",name:"Witches cottage"});f.places.push(cottage);map.nodes.push({id:"cottage",placeId:"cottage",name:"Witches cottage",kind:"Building",x:30,y:30,description:"",population:"",characterIds:[]});map.nodes[0]!.parentId="cottage";map.routes=[{id:"door",from:"k",to:"cottage",mode:"Door",duration:"A few steps",access:"open",bothWays:true}];const move=resolveMapMovement("I go outside",f.session,f.worlds,f.places);expect(move.place?.name).toBe("Outside Witches cottage");const engine=new StateEngine(f.session,new EventLog());engine.travelToLandmark(landmarkTravelPatch(move.place!));expect(engine.getSession().player?.position.value).toBe("Outside Witches cottage");});

it("anchors a legacy here position to Kitchen before the player leaves",()=>{const f=fixture(),id=Object.keys(f.session.characters)[0]!;f.session.characters[id]!.position.value="here";const move=resolveMapMovement("I go outside",f.session,f.worlds,f.places);const engine=new StateEngine(f.session,new EventLog());engine.travelToLandmark(landmarkTravelPatch(move.place!));expect(engine.getSession().characters[id]!.position.value).toBe("Kitchen");expect(engine.getSession().player?.position.value).toBe("Forest");});
it("starts quick-chat characters at the actual selected place",()=>{const f=fixture(),id=Object.keys(f.session.characters)[0]!;expect(f.session.characters[id]!.position.value).toBe("Kitchen");});
it("passes crossing facts and requires an explicit choice to wade or swim",()=>{
 const f=fixture(),map=f.worlds[0]!.worldMap!;
 map.nodes.push({id:"water",name:"River",kind:"River",x:50,y:50,width:10,height:80,description:"",population:"",characterIds:[]});
 const c=findCrossings(map)[0]!;
 expect(c).toBeTruthy();
 map.crossings=[{...c,type:"bridge",description:"A guarded wooden bridge"}];
 expect(resolveMapMovement("I go to Forest",f.session,f.worlds,f.places).routeInfo).toContain("guarded wooden bridge");
 map.crossings[0]!.access="blocked";
 expect(()=>resolveMapMovement("I go to Forest",f.session,f.worlds,f.places)).toThrow(/blocked/);
 map.crossings[0]!.access="open";map.crossings[0]!.type="none";map.crossings[0]!.naturalPassage="ford";
 expect(()=>resolveMapMovement("I go to Forest",f.session,f.worlds,f.places)).toThrow(/wade/);
 expect(resolveMapMovement("I wade to Forest",f.session,f.worlds,f.places).place?.id).toBe("forest");
 map.crossings[0]!.naturalPassage="swim";
 expect(()=>resolveMapMovement("I wade to Forest",f.session,f.worlds,f.places)).toThrow(/swimming/);
 expect(resolveMapMovement("I swim to Forest",f.session,f.worlds,f.places).place?.id).toBe("forest");
});

it("uses the selected connection when the map has alternative routes",()=>{
 const f=fixture(),map=f.worlds[0]!.worldMap!;
 map.routes.push({...map.routes[0]!,id:"scenic",duration:"3 hours"});
 const move=resolveMapMovement("I go to Forest",f.session,f.worlds,f.places,"forest",{worldId:"world",routeId:"scenic"});
 expect(move.travelMinutes).toBe(180);
 expect(()=>resolveMapMovement("I go to Forest",f.session,f.worlds,f.places,"forest",{worldId:"world",routeId:"removed"})).toThrow(/no longer reachable/);
});

it('enters and leaves a building through its default entrance without a path or generated rooms',()=>{
 const f=fixture(),map=f.worlds[0]!.worldMap!,cottage=newPlaceTemplate({id:'cottage',realmId:'world',name:'Cottage',note:'A quiet cottage.'});f.places.push(cottage);map.nodes.push({id:'cottage',placeId:'cottage',parentId:'f',name:'Cottage',kind:'Building',entrance:'open',x:40,y:40,description:'',population:'',characterIds:[]});map.routes=[];f.session.scene!.placeId='forest';f.session.scene!.location='Forest';
 const before=structuredClone(map),engine=new StateEngine(f.session,new EventLog()),approach=resolveMapMovement('I go to Cottage',engine.getSession(),f.worlds,f.places);expect(approach.place?.name).toBe('Outside Cottage');engine.travelToLandmark(landmarkTravelPatch(approach.place!));
 const entry=resolveMapMovement('I step inside',engine.getSession(),f.worlds,f.places);expect(entry.place?.name).toBe('Cottage');expect(entry.place?.note).toBe('A quiet cottage.');engine.travelToLandmark(landmarkTravelPatch(entry.place!));expect(engine.getSession().scene?.location).toBe('Cottage');
 const exit=resolveMapMovement('I go outside',engine.getSession(),f.worlds,f.places);expect(exit.place?.name).toBe('Outside Cottage');expect(map).toEqual(before);
});

it('respects locked, hidden, disabled and undiscovered default entrances and cannot enter from a distant place',()=>{
 const f=fixture(),map=f.worlds[0]!.worldMap!,cottage=newPlaceTemplate({id:'cottage',realmId:'world',name:'Cottage'});f.places.push(cottage);const node={id:'cottage',placeId:'cottage',parentId:'f',name:'Cottage',kind:'Building',entrance:'open' as 'open'|'locked'|'hidden'|'none',x:40,y:40,description:'',population:'',characterIds:[]};map.nodes.push(node);map.routes=[];f.session.scene!.placeId='forest';f.session.scene!.location='Forest';
 for(const state of ['locked','hidden','none'] as const){node.entrance=state;expect(()=>resolveMapMovement('I enter Cottage',f.session,f.worlds,f.places)).toThrow(/locked|entrance/);}
 node.entrance='open';expect(resolveMapMovement('I enter Cottage',f.session,f.worlds,f.places).place?.id).toBe('cottage');map.nodes[map.nodes.length-1]={...node,visibility:'hidden'};expect(()=>resolveMapMovement('I enter Cottage',f.session,f.worlds,f.places)).toThrow(/not been revealed/);map.nodes[map.nodes.length-1]=node;f.session.scene!.placeId='kitchen';f.session.scene!.location='Kitchen';expect(()=>resolveMapMovement('I enter Cottage',f.session,f.worlds,f.places)).toThrow(/doorway/);
});

it('never bypasses authored locked or one-way doors with an automatic entrance',()=>{
 const f=fixture(),map=f.worlds[0]!.worldMap!,cottage=newPlaceTemplate({id:'cottage',realmId:'world',name:'Cottage'});f.places.push(cottage);map.nodes.push({id:'cottage',placeId:'cottage',parentId:'f',name:'Cottage',kind:'Building',entrance:'open',x:30,y:30,description:'',population:'',characterIds:[]});map.nodes[0]!.parentId='cottage';map.routes[0]!.mode='Door';map.routes[0]!.access='locked';f.session.scene!.placeId='forest';f.session.scene!.location='Forest';
 expect(()=>resolveMapMovement('I enter Cottage',f.session,f.worlds,f.places)).toThrow(/locked/);map.routes[0]!.access='open';expect(resolveMapMovement('I enter Cottage',f.session,f.worlds,f.places).place?.id).toBe('kitchen');map.routes[0]!.bothWays=false;expect(()=>resolveMapMovement('I enter Cottage',f.session,f.worlds,f.places)).toThrow(/doorway/);
});

it('uses a mapped door directly into the building from its exterior and respects its direction and lock',()=>{
 const f=fixture(),map=f.worlds[0]!.worldMap!;f.places.push(newPlaceTemplate({id:'cottage',realmId:'world',name:'Cottage'}));map.nodes.push({id:'cottage',placeId:'cottage',parentId:'f',name:'Cottage',kind:'Building',entrance:'open',x:30,y:30,description:'',population:'',characterIds:[]});map.routes=[{id:'door',from:'f',to:'cottage',mode:'Door',duration:'A few steps',access:'open',bothWays:true}];f.session.scene!.placeId='cottage';f.session.scene!.location='Outside Cottage';
 expect(resolveMapMovement('I enter Cottage',f.session,f.worlds,f.places).place?.id).toBe('cottage');map.routes[0]!.access='locked';expect(()=>resolveMapMovement('I enter Cottage',f.session,f.worlds,f.places)).toThrow(/locked/);f.session.scene!.location='Cottage';expect(()=>resolveMapMovement('I go outside',f.session,f.worlds,f.places)).toThrow(/locked/);map.routes[0]!.access='open';map.routes[0]!.bothWays=false;expect(()=>resolveMapMovement('I go outside',f.session,f.worlds,f.places)).toThrow(/one-way/);map.routes[0]!.from='cottage';map.routes[0]!.to='f';expect(resolveMapMovement('I go outside',f.session,f.worlds,f.places).place?.name).toBe('Outside Cottage');f.session.scene!.location='Outside Cottage';expect(()=>resolveMapMovement('I enter Cottage',f.session,f.worlds,f.places)).toThrow(/doorway/);
});
