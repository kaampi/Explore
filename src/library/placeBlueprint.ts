import { z } from 'zod';
import type { MapNode } from './worldMap';
export const PlaceBlueprintSchema=z.object({id:z.string().min(1),name:z.string().trim().min(1).max(100),kind:z.enum(['Area','Building','Space','Point of Interest']),description:z.string().default(''),instructions:z.string().default(''),tags:z.array(z.string().trim().min(1)).default([]),color:z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#d7dfca'),symbol:z.enum(['marker','cottage','longhouse','townhouse','inn']).default('marker')});
export type PlaceBlueprint=z.infer<typeof PlaceBlueprintSchema>;
export const starterBlueprints:PlaceBlueprint[]=[
 {id:'starter-ruin',name:'Ruin',kind:'Building',description:'The remains of a former building. Define what survives and what can be explored.',instructions:'',tags:['fantasy','historical','modern'],color:'#c2bdab',symbol:'cottage'},
 {id:'starter-square',name:'Square',kind:'Area',description:'An open public meeting place.',instructions:'',tags:[],color:'#d8cfb1',symbol:'marker'},
 {id:'starter-inn',name:'Inn',kind:'Building',description:'A place to eat, rest and meet travellers.',instructions:'',tags:['fantasy','historical'],color:'#d7c6a8',symbol:'inn'},
 {id:'starter-police',name:'Police station',kind:'Building',description:'A local police station.',instructions:'',tags:['modern','crime'],color:'#bbc8ce',symbol:'townhouse'},
 {id:'starter-bay',name:'Landing bay',kind:'Area',description:'A designated area for arriving craft.',instructions:'',tags:['sci-fi'],color:'#b4c3c1',symbol:'marker'}
];
export function instantiateBlueprint(template:PlaceBlueprint,parentId?:string):MapNode{
 const t=PlaceBlueprintSchema.parse(template),id=crypto.randomUUID();return {id,placeId:id,name:t.name,kind:t.kind==='Space'?'Room':t.kind,...(parentId?{parentId}:{}),x:50,y:50,contentType:t.kind==='Building'||t.kind==='Space'?'interior':'settlement',width:t.kind==='Area'?25:10,height:t.kind==='Area'?20:10,description:t.description,instructions:t.instructions,population:'',characterIds:[],color:t.color,symbol:t.symbol,blueprintId:t.id};
}
