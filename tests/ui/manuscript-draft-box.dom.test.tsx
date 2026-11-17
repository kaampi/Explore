// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { PlayableStoryboard } from "../../src/ui/studio/PlayableStoryboard";
import {
  emptyCampaignScene,
  newCampaignTemplate,
  newCharacterTemplate,
  newObjectTemplate,
  newPlaceTemplate,
  newRealmTemplate,
} from "../../src/library/LibrarySchema";
import { storyboardIssues } from "../../src/ui/studio/storyboardReadiness";
import { actorIdFor } from "../../src/library/sceneParts";

async function click(host: HTMLElement, text: string) {
  const b = Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.includes(text));
  expect(b, text).toBeTruthy();
  await act(async () => b!.click());
}
const has = (host: HTMLElement, text: string) =>
  Array.from(host.querySelectorAll("button")).some((b) => b.textContent?.includes(text));

function setup() {
  const realm = newRealmTemplate({ name: "Highmark", source: "player", note: "" });
  const square = newPlaceTemplate({ name: "The village square", realmId: realm.id });
  const orla = newCharacterTemplate({ name: "Orla" });
  const lamp = newObjectTemplate({ name: "Brass lamp", note: "", tags: [], source: "player" });
  const scene = {
    ...emptyCampaignScene(),
    name: "The lamp goes out",
    position: { x: 40, y: 40 },
    draft: {
      origin: { workspaceId: "w1", projectId: "p1", entityRef: "ev-1", revision: 1 },
      facts: [{ label: "What", value: "Orla drops the lamp." }],
      suggestedCharacterIds: [orla.id],
      suggestedPlaceId: square.id,
      otherPlaceIds: [],
      suggestedObjectIds: [lamp.id],
    },
  };
  const campaign = newCampaignTemplate({ name: "Night Keys", scenes: [scene] });
  return { campaign, square, orla, lamp, realm };
}

it("shows the manuscript notes, and adds what is suggested only when the author presses it", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const { campaign, square, orla, lamp } = setup();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  let snapshot = campaign;
  function Harness() {
    const [current, setCurrent] = useState(campaign);
    snapshot = current;
    return (
      <PlayableStoryboard
        campaign={current}
        places={[square]}
        characters={[]}
        objects={[]}
        library={{ characters: [orla], places: [square], objects: [lamp] }}
        busy={false}
        onChange={setCurrent}
        onPlay={() => {}}
      />
    );
  }
  try {
    await act(async () => root.render(<Harness />));
    await click(host, "01");
    const box = host.querySelector('section[aria-label="From the manuscript"]')!;
    expect(box.textContent).toContain("Orla drops the lamp.");
    expect(snapshot.scenes[0]!.placeId).toBe("");
    expect(snapshot.scenes[0]!.people).toEqual([]);

    expect(has(host, "Use The village square as the place")).toBe(true);
    const addPerson = Array.from(box.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Add Orla"),
    )!;
    expect(addPerson.disabled).toBe(true);
    expect(box.textContent).toContain("Make the scene playable");

    await click(host, "Use The village square as the place");
    expect(snapshot.scenes[0]!.placeId).toBe(square.id);
    await click(host, "Make scene playable");
    expect(snapshot.scenes[0]!.encounter).toBeDefined();
    await click(host, "Add Orla to this scene");
    await click(host, "Place Brass lamp here");

    const done = snapshot.scenes[0]!;
    expect(done.encounter!.state.actors[actorIdFor(orla.id)]).toBeDefined();
    expect(snapshot.people.map((p) => p.characterId)).toEqual([orla.id]);
    expect(done.objectIds).toContain(lamp.id);
    expect(snapshot.objectIds).toContain(lamp.id);
    expect(done.draft).toBeDefined();
    expect(host.textContent).toContain("Orla is in this scene");

    await click(host, "Dismiss manuscript notes");
    expect(snapshot.scenes[0]!.draft).toBeUndefined();
    expect(host.querySelector('section[aria-label="From the manuscript"]')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it("does not hold the adventure back while the scene is only a draft, but does once the notes are dismissed", () => {
  const { campaign, square } = setup();

  const withDraft = storyboardIssues(campaign, [square], new Set());
  const without = {
    ...campaign,
    scenes: campaign.scenes.map(({ draft: _d, ...scene }) => scene),
  };
  const dismissed = storyboardIssues(without, [square], new Set());

  expect(withDraft).toEqual([]);
  expect(dismissed.some((i) => i.message.includes("The lamp goes out"))).toBe(true);
});
