// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, expect, it } from "vitest";
import { RulesetStudio } from "../../src/ui/studio/RulesetStudio";
import { LanguageProvider } from "../../src/ui/i18n/LanguageProvider";
import { IndexedDBRepository } from "../../src/persistence/IndexedDBRepository";
import { exampleFantasyRuleset } from "../../src/library/exampleTemplates";
import { newRulesetTemplate } from "../../src/library/LibrarySchema";
import { AttributeDefSchema } from "../../src/state/StateSchema";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
});

const PICTURE = "data:image/jpeg;base64," + "A".repeat(60);
const attr = (id: string, name: string) =>
  AttributeDefSchema.parse({ id, name, kind: "number", min: 1, max: 18 });

async function mount(rulesets: ReturnType<typeof newRulesetTemplate>[] = []) {
  const repo = new IndexedDBRepository(new IDBFactory(), "rs-form-" + Math.random());
  for (const set of rulesets) await repo.saveRuleset(set);
  const host = document.body.appendChild(document.createElement("div"));
  await act(async () =>
    createRoot(host).render(
      <LanguageProvider>
        <RulesetStudio repo={repo} />
      </LanguageProvider>,
    ),
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 40));
  });
  const click = async (el: Element | null | undefined) => {
    expect(el).toBeTruthy();
    await act(async () => (el as HTMLElement).click());
  };
  const button = (text: string) =>
    Array.from(host.querySelectorAll("button")).find((b) => b.textContent === text);
  const open = async (name: string) => {
    await click(
      Array.from(host.querySelectorAll("button")).find((el) => el.textContent?.includes(name)),
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
  };
  return { repo, host, click, button, open };
}
const crosses = (host: HTMLElement) => Array.from(host.querySelectorAll(".rs-attr__remove"));

it("has the cross to remove an attribute only when there is more than one, named after the attribute", async () => {
  const set = newRulesetTemplate({
    name: "Fantasy",
    source: "player",
    attributes: [attr("str", "Strength")],
  });
  const ui = await mount([set]);
  await ui.open("Fantasy");

  // One attribute: nothing to remove it from, so there is no cross.
  expect(ui.host.querySelectorAll(".rs-attr")).toHaveLength(1);
  expect(crosses(ui.host)).toHaveLength(0);

  await ui.click(ui.button("+ Add"));
  expect(ui.host.querySelectorAll(".rs-attr")).toHaveLength(2);
  const marks = crosses(ui.host);
  expect(marks).toHaveLength(2);
  // The first card is named Strength; the new one has no name yet and is called by its number.
  expect(marks[0]!.getAttribute("aria-label")).toBe("Remove: Strength");
  expect(marks[1]!.getAttribute("aria-label")).toBe("Remove: field 2");
  // Each cross is in its own card.
  for (const [index, cross] of marks.entries())
    expect(cross.closest(".rs-attr")).toBe(ui.host.querySelectorAll(".rs-attr")[index]);

  // Removing the second leaves one, and then the last cross is gone again.
  await ui.click(marks[1]);
  expect(ui.host.querySelectorAll(".rs-attr")).toHaveLength(1);
  expect(crosses(ui.host)).toHaveLength(0);
});

it("shows the picture of a rule-set in the list and beside the name, and Remove picture takes it away", async () => {
  const set = newRulesetTemplate({
    name: "Pictured",
    source: "player",
    attributes: [attr("str", "Strength")],
    imageDataUrl: PICTURE,
  });
  const ui = await mount([set]);

  // In the list, before it is opened.
  expect(ui.host.querySelector(`.studio-list__thumb[src="${PICTURE}"]`)).not.toBeNull();

  await ui.open("Pictured");
  const header = () => ui.host.querySelector(".rs-head__pick")!;
  expect(header().querySelector("img")!.getAttribute("src")).toBe(PICTURE);
  expect(header().getAttribute("aria-label")).toBe("Change picture");

  await ui.click(ui.host.querySelector('button[aria-label="Remove picture"]'));
  expect(header().querySelector("img")).toBeNull();
  expect(header().getAttribute("aria-label")).toBe("Add a picture");
  expect(ui.host.querySelector('button[aria-label="Remove picture"]')).toBeNull();

  // Saved, the picture is gone from the rule-set and from the list.
  await ui.click(ui.button("Save"));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 40));
  });
  expect((await ui.repo.loadRuleset(set.id)).imageDataUrl).toBeUndefined();
  expect(ui.host.querySelector(`.studio-list__thumb[src="${PICTURE}"]`)).toBeNull();
});

it("shows a rule-set with no picture with a plus to add one, and no Remove picture", async () => {
  const set = newRulesetTemplate({
    name: "Bare",
    source: "player",
    attributes: [attr("str", "Strength")],
  });
  const ui = await mount([set]);
  await ui.open("Bare");
  expect(ui.host.querySelector(".rs-head__pick")!.getAttribute("aria-label")).toBe("Add a picture");
  expect(ui.host.querySelector('button[aria-label="Remove picture"]')).toBeNull();
});

it("says the texts of the attribute card in the interface language", async () => {
  localStorage.setItem("sandboxai:interface-language", "sv");
  const set = newRulesetTemplate({
    name: "Fantasy",
    source: "player",
    attributes: [attr("str", "Strength")],
  });
  const ui = await mount([set]);
  await ui.open("Fantasy");
  expect(ui.host.textContent).toContain("Rörelse / steg");
  expect(ui.host.textContent).toContain("Närhetssignal");
  expect(ui.host.textContent).toContain("+ Lägg till");
  expect(ui.host.textContent).not.toContain("Move / beat");
  expect(ui.host.textContent).not.toContain("Closeness signal");
  expect(ui.host.querySelector('label[title^="Hur långt AI:n"]')).not.toBeNull();
});

it("gives the high meaning a neutral example text", async () => {
  const set = newRulesetTemplate({
    name: "Fantasy",
    source: "player",
    attributes: [attr("str", "Strength")],
  });
  const ui = await mount([set]);
  await ui.open("Fantasy");
  const placeholders = Array.from(ui.host.querySelectorAll("textarea")).map((t) =>
    t.getAttribute("placeholder"),
  );
  expect(placeholders).toContain("{{char}} does it with ease.");
  expect(placeholders.join(" ")).not.toContain("starts and stays in contact");
});

it("shows bundled covers for existing saved rules and respects custom or explicitly removed pictures", async () => {
  const set = { ...exampleFantasyRuleset(), name: "My campaign rules", playerHealth: 32 };
  delete set.imageDataUrl;
  const ui = await mount([set]);
  const cover = "/rulesets/fantasy.webp";
  const thumbnail = (url: string) => ui.host.querySelector(`.studio-list__thumb[src="${url}"]`);
  expect(thumbnail(cover)).not.toBeNull();
  await ui.open(set.name);
  expect(ui.host.querySelector(".rs-head__pick img")?.getAttribute("src")).toBe(cover);
  await ui.click(ui.host.querySelector('button[aria-label="Remove picture"]'));
  await ui.click(ui.button("Save"));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 40));
  });
  expect(thumbnail(cover)).toBeNull();
  expect(await ui.repo.loadRuleset(set.id)).toMatchObject({
    name: set.name,
    playerHealth: 32,
    attributes: set.attributes,
    imageDataUrl: "",
  });

  const custom = await mount([{ ...set, imageDataUrl: PICTURE }]);
  await custom.open(set.name);
  expect(custom.host.querySelector(".rs-head__pick img")?.getAttribute("src")).toBe(PICTURE);
});
