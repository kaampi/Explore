import { expect,it } from "vitest";
import { mapPosition,rotatePoint } from "../../src/library/mapGeometry";
it("rotates points in screen space and reverses the transform",()=>{const p=rotatePoint({x:10,y:0},{x:0,y:0},90);expect(p.x).toBeCloseTo(0);expect(p.y).toBeCloseTo(10);const original=rotatePoint(p,{x:0,y:0},-90);expect(original.x).toBeCloseTo(10);});
it("rotates anchored edge positions with the object",()=>{const node={id:"a",name:"A",kind:"Place",x:50,y:50,width:20,height:10,rotation:90,description:"",population:"",characterIds:[]};const anchor=mapPosition(node,{x:1,y:.5});expect(anchor.x).toBeCloseTo(400);expect(anchor.y).toBeCloseTo(380);});
