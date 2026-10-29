// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { IndexedDBRepository } from "../../src/persistence/IndexedDBRepository";
import { MorphStudio } from "../../src/ui/studio/MorphStudio";

it("reopens a saved profile without replaying an old save request or replacing its expressions", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const repo = new IndexedDBRepository(new IDBFactory(), "morph-reopen");
  const saved = { version: 1, active: true, eyeWidth: 29, eyeCorrections: { '["happy","shy"]': true }, triangles: [[0,1,2]], expressions: [
    { name: "happy", image: "data:image/png;base64,AA==", points: [[0,0],[1,0],[0,1]] },
    { name: "shy", image: "data:image/png;base64,AQ==", points: [[0,0],[.9,0],[0,1]] },
  ] };
  await repo.saveCharacterMorph("person", saved);
  const save = vi.spyOn(repo, "saveCharacterMorph");
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(<MorphStudio characterId="person" repo={repo} saveRequest={{ id: 5, mode: "profile" }} gallery={[{ name: "unrelated", image: "other" }]} />);
      await new Promise(resolve => setTimeout(resolve, 40));
    });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 40)); });
    expect(save).not.toHaveBeenCalled();
    expect(await repo.loadCharacterMorph("person")).toEqual(saved);
    expect(Array.from(container.querySelectorAll('select[aria-label="From"] option')).map(option => option.textContent)).toEqual(["happy", "shy"]);
    await act(async () => {
      root.render(<MorphStudio characterId="person" repo={repo} saveRequest={{ id: 6, mode: "profile" }} />);
      await new Promise(resolve => setTimeout(resolve, 40));
    });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 40)); });
    expect(save).toHaveBeenCalledTimes(1);
    const result = await repo.loadCharacterMorph("person") as typeof saved;
    expect(result.expressions).toEqual(saved.expressions);
    expect(result.eyeCorrections).toEqual(saved.eyeCorrections);
    expect(result.eyeWidth).toBe(29);
  } finally { await act(async () => root.unmount()); vi.restoreAllMocks(); }
});


it("copies only target mesh points and links scrolling without modifying other expressions", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const repo = new IndexedDBRepository(new IDBFactory(), "morph-tools");
  const profile = { version: 1, active: true, expressions: [
    {name:"first",image:"a",points:[[0,0],[1,0],[0,1]]},
    {name:"second",image:"b",points:[[0,0],[0.8,0],[0,1]]}
  ]};
  await repo.saveCharacterMorph("person",profile);
  const container = document.createElement("div"), root = createRoot(container);
  const render = (id:number) => root.render(<MorphStudio characterId="person" repo={repo} saveRequest={{id,mode:"draft"}}/>);
  try {
    await act(async()=>{render(1);});
    await act(async()=>{await new Promise(resolve=>setTimeout(resolve,50));});
    const button = Array.from(container.querySelectorAll("button")).find(b=>b.textContent==="Copy mesh 1 → 2")!;
    await act(async()=>button.click());
    await act(async()=>{render(2);await new Promise(resolve=>setTimeout(resolve,50));});
    await act(async()=>{await new Promise(resolve=>setTimeout(resolve,50));});
    const saved = await repo.loadCharacterMorph("person") as typeof profile;
    expect(saved.expressions[0]).toEqual(profile.expressions[0]);
    expect(saved.expressions[1]).toEqual({...profile.expressions[1],points:profile.expressions[0]!.points});
    const panels = Array.from(container.querySelectorAll("canvas")).map(c=>c.parentElement!);
    panels.forEach(panel=>Object.defineProperties(panel,{
      scrollWidth:{value:1000,configurable:true},clientWidth:{value:250,configurable:true},
      scrollHeight:{value:1000,configurable:true},clientHeight:{value:250,configurable:true}
    }));
    panels[0]!.scrollLeft=120;panels[0]!.scrollTop=200;
    await act(async()=>panels[0]!.dispatchEvent(new Event("scroll")));
    expect(panels[1]!.scrollLeft).toBe(120);
    expect(panels[2]!.scrollTop).toBe(200);
    const linked=container.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    await act(async()=>linked.click());
    panels[0]!.scrollLeft=220;
    await act(async()=>panels[0]!.dispatchEvent(new Event("scroll")));
    expect(panels[1]!.scrollLeft).toBe(120);
  } finally {await act(async()=>root.unmount());}
});
