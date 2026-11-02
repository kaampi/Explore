import { expect, it } from "vitest";
import { WorldMapSchema } from "@library/worldMap";
import { authoredRouteInfo } from "@library/routeContext";
import { assembleContext, buildPass1Messages } from "@context/ContextEngine";
import { beginJourney } from "@state/journey";
import { landmarkTravelPatch } from "@session/landmarkTravel";
import { newPlaceTemplate } from "@library/LibrarySchema";
import { quickCharacterSession } from "../../src/ui/home/quickStart";
import { exampleCharacterTemplate } from "@library/exampleTemplates";

const map = () => WorldMapSchema.parse({nodes:[
  {id:"v",name:"Village",kind:"Settlement",x:10,y:50},
  {id:"f",name:"New forest",kind:"Forest",x:90,y:50}
],routes:[{id:"r",from:"v",to:"f",mode:"Walk",type:"road",duration:"3 days",access:"open",bothWays:true}]});

it("does not derive route terrain from a forest destination", () => {
  const worldMap=map();
  expect(authoredRouteInfo(worldMap,"r")).toContain("terrain along this route is unspecified");
  worldMap.routes[0]!.description="Open fields; the forest is still in the distance.";
  worldMap.routes[0]!.instructions="Stop at the bridge before the forest.";
  const saved=WorldMapSchema.parse(JSON.parse(JSON.stringify(worldMap)));
  expect(authoredRouteInfo(saved,"r")).toContain("Open fields");
  expect(authoredRouteInfo(saved,"r")).toContain("Stop at the bridge");
});

it("keeps journey grounding required in the actual system prompt", () => {
  const origin=newPlaceTemplate({id:"v",realmId:"w",name:"Village"});
  const target=newPlaceTemplate({id:"f",realmId:"w",name:"New forest",note:"Dense pine trees at the destination."});
  const session=quickCharacterSession(exampleCharacterTemplate(),"route",{place:origin});
  beginJourney(session,{...landmarkTravelPatch(target),travelDays:3,routeInfo:"The road crosses open fields."});
  const assembled=assembleContext(session);
  expect(assembled.includedBlocks.find(b=>b.id==="journey-grounding")?.required).toBe(true);
  const prompt=buildPass1Messages(assembled,[],"I look around",Object.keys(session.characters)[0]!,{outOfSight:true})[0]!.content;
  expect(prompt).toContain("destination name is a direction, NOT the current setting");
  expect(prompt).toContain("The road crosses open fields");
  expect(prompt).not.toContain("Dense pine trees at the destination");
  expect(prompt).toContain("Narrate the player's surroundings in second person: you / your");
  expect(prompt).toContain("Third-person instructions apply to NPCs only");
  expect(prompt).not.toContain("Write in third person. You are the narrator of the player's here");
});
