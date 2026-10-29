import { expect, it } from "vitest";
import { planMeshInsertion } from "../../src/ui/studio/meshInsertion";
import type { Point } from "../../src/ui/studio/morphRenderer";
const points: Point[]=[[0,0],[1,0],[1,1],[0,1]];
const triangles=[[0,1,2],[0,2,3]];
it("snaps to a shared edge and splits both adjacent triangles",()=>{
 const plan=planMeshInsertion(points,triangles,[.5,.51],300,300)!;
 expect(plan.edge).toBe(true);
 expect(plan.point[0]).toBeCloseTo(plan.point[1]);
 expect(plan.triangles).toHaveLength(4);
 expect(plan.triangles.every(t=>t.includes(4))).toBe(true);
 expect(plan.triangles.some(t=>t.includes(0)&&t.includes(2))).toBe(false);
});
it("splits an interior into three and keeps the other triangle",()=>{
 const plan=planMeshInsertion(points,triangles,[.7,.2],300,300)!;
 expect(plan.edge).toBe(false);
 expect(plan.triangles).toHaveLength(4);
 expect(plan.triangles).toContainEqual([0,2,3]);
 expect(plan.weights.reduce((a,b)=>a+b,0)).toBeCloseTo(1);
});
it("splits a boundary and rejects existing vertices and outside clicks",()=>{
 expect(planMeshInsertion(points,triangles,[.5,.01],300,300)!.triangles).toHaveLength(3);
 expect(planMeshInsertion(points,triangles,[0,0],300,300)).toBeNull();
 expect(planMeshInsertion(points,triangles,[-.2,.5],300,300)).toBeNull();
});
