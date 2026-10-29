import { IDBFactory } from "fake-indexeddb";
import { expect, it } from "vitest";
import { IndexedDBRepository } from "../../src/persistence/IndexedDBRepository";

it("installs Mona and her activated morph once without overwriting edits or restoring deletion", async () => {
  const repo = new IndexedDBRepository(new IDBFactory(), "example-mona");
  await Promise.all([repo.installExampleMona(), repo.installExampleMona()]);
  const characters = await repo.listCharacters();
  expect(characters).toHaveLength(1);
  const mona = characters[0]!;
  expect(mona.name).toBe("Mona");
  expect(mona.familyName).toBe("Sanchez");
  expect(mona.source).toBe("example");
  const profile = await repo.loadCharacterMorph(mona.id) as { active: boolean; expressions: { name: string; points: unknown[]; image: string }[]; eyeCorrections: unknown };
  expect(profile.active).toBe(true);
  expect(profile.expressions).toHaveLength(5);
  expect(profile.expressions.every(expression => expression.points.length === 57 && expression.image.startsWith("/examples/mona/"))).toBe(true);
  expect(profile.eyeCorrections).toBeDefined();
  await repo.saveCharacter({ ...mona, personality: "My edited version" });
  await repo.installExampleMona();
  expect((await repo.loadCharacter(mona.id)).personality).toBe("My edited version");
  await repo.deleteCharacter(mona.id);
  await repo.installExampleMona();
  expect(await repo.listCharacters()).toEqual([]);
});
