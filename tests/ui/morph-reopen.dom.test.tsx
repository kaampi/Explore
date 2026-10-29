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
