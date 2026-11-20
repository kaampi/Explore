import { IDBFactory } from "fake-indexeddb";
import { expect, it } from "vitest";
import { AttributeDefSchema } from "../../src/state/StateSchema";
import { IndexedDBRepository } from "../../src/persistence/IndexedDBRepository";
import { newRulesetTemplate, RulesetTemplateSchema } from "../../src/library/LibrarySchema";
import {
  collectLibraryBackup,
  parseLibraryBackup,
  restoreLibraryBackup,
} from "../../src/library/libraryBackup";

const PICTURE = "data:image/jpeg;base64," + "A".repeat(60);
const attribute = AttributeDefSchema.parse({
  id: "str",
  name: "Strength",
  kind: "number",
  min: 1,
  max: 18,
});

it("takes a picture on a rule-set, and does without one", () => {
  const without = newRulesetTemplate({ name: "Plain", source: "player", attributes: [attribute] });
  expect(RulesetTemplateSchema.parse(without).imageDataUrl).toBeUndefined();
  expect("imageDataUrl" in RulesetTemplateSchema.parse(without)).toBe(false);

  const withPicture = newRulesetTemplate({
    name: "Pictured",
    source: "player",
    attributes: [attribute],
    imageDataUrl: PICTURE,
  });
  expect(RulesetTemplateSchema.parse(withPicture).imageDataUrl).toBe(PICTURE);
  // An older rule-set, saved before pictures existed, still opens.
  const old: Record<string, unknown> = { ...withPicture };
  delete old.imageDataUrl;
  expect(RulesetTemplateSchema.parse(old).imageDataUrl).toBeUndefined();
  // Something that is not text is refused.
  expect(() => RulesetTemplateSchema.parse({ ...withPicture, imageDataUrl: 5 })).toThrow();
});

it("comes back unchanged, picture and all, after the library is exported and imported", async () => {
  const source = new IndexedDBRepository(new IDBFactory(), "rs-picture-source", 15);
  const target = new IndexedDBRepository(new IDBFactory(), "rs-picture-target", 15);
  const pictured = newRulesetTemplate({
    name: "Pictured",
    source: "player",
    attributes: [attribute],
    imageDataUrl: PICTURE,
  });
  const plain = newRulesetTemplate({ name: "Plain", source: "player", attributes: [attribute] });
  await source.saveRuleset(pictured);
  await source.saveRuleset(plain);

  const exported = await collectLibraryBackup(source);
  const { backup, skipped } = parseLibraryBackup(JSON.parse(JSON.stringify(exported)));
  expect(skipped).toBe(0);
  await restoreLibraryBackup(target, backup);

  expect(await target.loadRuleset(pictured.id)).toEqual(pictured);
  expect((await target.loadRuleset(pictured.id)).imageDataUrl).toBe(PICTURE);
  expect(await target.loadRuleset(plain.id)).toEqual(plain);
  expect("imageDataUrl" in (await target.loadRuleset(plain.id))).toBe(false);
  await source.close();
  await target.close();
});
