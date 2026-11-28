// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { IDBFactory } from "fake-indexeddb";
import { expect, it } from "vitest";
import { CharacterStudio } from "../../src/ui/studio/CharacterStudio";
import { LanguageProvider } from "../../src/ui/i18n/LanguageProvider";
import { IndexedDBRepository } from "../../src/persistence/IndexedDBRepository";
import {
  collectLibraryBackup,
  parseLibraryBackup,
  restoreLibraryBackup,
} from "../../src/library/libraryBackup";
import { newCharacterTemplate } from "../../src/library/LibrarySchema";
import {
  addReferenceCard,
  saveCardVersion,
  type CardDraft,
  type CharacterReferences,
} from "../../src/library/referenceCards";

const NOW = "2026-11-26T10:00:00.000Z";
const draft = (label: string): CardDraft => ({
  imageDataUrl: `data:image/png;base64,IMG-${label}`,
  thumbDataUrl: `data:image/png;base64,THUMB-${label}`,
  imageHash: `hash-${label}`,
  facts: { hair: label, other: [] },
  palette: [],
  source: { kind: "local" },
});

/** Emma with Fantasy (three versions, default) and Sci-fi (two versions). */
function emmaWithCards() {
  const first = addReferenceCard(undefined, {
    cardId: "fantasy",
    name: "Fantasy",
    draft: draft("brown"),
    now: NOW,
  });
  if (!first.ok) throw new Error(first.reason);
  const second = addReferenceCard(first.value, {
    cardId: "sci-fi",
    name: "Sci-fi",
    draft: draft("silver"),
    now: NOW,
  });
  if (!second.ok) throw new Error(second.reason);
  const more = (references: CharacterReferences, cardId: string, label: string) => ({
    ...references,
    cards: references.cards.map((card) => {
      if (card.cardId !== cardId) return card;
      const saved = saveCardVersion(card, draft(label), NOW);
      if (saved.status !== "saved") throw new Error("unexpected");
      return saved.card;
    }),
  });
  let references = more(second.value, "fantasy", "auburn");
  references = more(references, "fantasy", "red");
  references = more(references, "sci-fi", "white");
  return newCharacterTemplate({
    id: "emma",
    name: "Emma",
    personality: "Curious.",
    appearance: "Tall.",
    references,
  });
}

it("keeps both cards, the default and every version when Emma is saved in Character Studio", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const emma = emmaWithCards();
  // Through the real backup path: export, write as JSON, read it, restore into a fresh library.
  const source = new IndexedDBRepository(new IDBFactory(), "refs-source");
  await source.saveCharacter(emma);
  const exported = await collectLibraryBackup(source);
  const { backup, skipped } = parseLibraryBackup(JSON.parse(JSON.stringify(exported)));
  expect(skipped).toBe(0);
  const repo = new IndexedDBRepository(new IDBFactory(), "refs-target");
  expect(await restoreLibraryBackup(repo, backup)).toEqual({ saved: 1, skipped: 0 });
  const before = (await repo.listCharacters())[0]!;
  expect(before.references?.cards.map((card) => card.cardId)).toEqual(["fantasy", "sci-fi"]);

  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const settle = () =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 40));
    });
  try {
    await act(async () =>
      root.render(
        <LanguageProvider>
          <CharacterStudio repo={repo} />
        </LanguageProvider>,
      ),
    );
    await settle();
    const emmaButton = Array.from(host.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "Emma" || b.textContent?.includes("Emma"),
    )!;
    expect(emmaButton).toBeTruthy();
    await act(async () => emmaButton.click());
    const personality = Array.from(host.querySelectorAll("textarea")).find(
      (area) => area.value === "Curious.",
    )!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
        personality,
        "Curious, and braver than she looks.",
      );
      personality.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const save = Array.from(host.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "Save",
    )!;
    await act(async () => save.click());
    await settle();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }

  // Open it again from storage.
  const after = (await repo.listCharacters())[0]!;
  expect(after.personality).toBe("Curious, and braver than she looks.");
  expect(after.references).toEqual(before.references);
  expect(after.references?.defaultCardId).toBe("fantasy");
  const versions = (id: string) =>
    after.references!.cards.find((card) => card.cardId === id)!.versions.map((v) => v.version);
  expect(versions("fantasy")).toEqual([3, 2, 1]);
  expect(versions("sci-fi")).toEqual([2, 1]);
});
