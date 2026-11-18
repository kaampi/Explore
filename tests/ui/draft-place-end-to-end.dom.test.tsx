// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { IndexedDBRepository } from "@persistence/IndexedDBRepository";
import { CoreManuscripts } from "../../src/ui/home/CoreManuscripts";
import { PlayableStoryboard } from "../../src/ui/studio/PlayableStoryboard";
import {
  copyCoreEntity,
  manuscriptWorld,
  placeOnWorldMap,
} from "../../src/integrations/coreEntities";
import { adventureMapPlaces } from "../../src/library/adventureMap";
import { isOpenDraft } from "../../src/library/sceneFormat";
import {
  emptyCampaignScene,
  newCampaignTemplate,
  newRealmTemplate,
} from "../../src/library/LibrarySchema";
import type { CampaignTemplate } from "../../src/library/LibrarySchema";

const origin = { workspaceId: "w-1", projectId: "book-one", revision: 2 };
const harbour = { entity_ref: "harbour", name: "Harbour", referenceImages: [], facts: [] };
const entry = {
  ...origin,
  title: "Night Keys",
  language: "English",
  translationGroupId: "f",
  updatedAt: "2026-10-27",
};
const bible = [
  { kind: "locations", label: "Locations", entities: [harbour] },
  {
    kind: "events",
    label: "Events",
    entities: [
      {
        entity_ref: "e1",
        name: "Fog rolls in",
        referenceImages: [],
        facts: [{ predicate: "where", label: "Where", value: "It starts at the Harbour." }],
      },
    ],
  },
];

async function clickIn(host: HTMLElement, label: string) {
  const button = Array.from(host.querySelectorAll("button")).find((b) =>
    b.textContent?.includes(label),
  );
  if (!button) throw new Error(`Missing ${label}`);
  await act(async () => {
    button.click();
    await new Promise((resolve) => setTimeout(resolve, 40));
  });
}

function storyboardHarness(
  host: HTMLElement,
  start: CampaignTemplate,
  library: Parameters<typeof PlayableStoryboard>[0]["library"],
  mapPlaces: Parameters<typeof PlayableStoryboard>[0]["mapPlaces"],
) {
  const root = createRoot(host);
  const seen: { campaign: CampaignTemplate } = { campaign: start };
  function Harness() {
    const [current, setCurrent] = useState(start);
    seen.campaign = current;
    return (
      <PlayableStoryboard
        campaign={current}
        places={library!.places}
        characters={[]}
        objects={[]}
        library={library}
        mapPlaces={mapPlaces}
        busy={false}
        onChange={setCurrent}
        onPlay={() => {}}
      />
    );
  }
  return { root, seen, render: () => act(async () => root.render(<Harness />)) };
}

it("takes scene drafts in a new adventure all the way to a playable scene with the suggested place", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value() {
      this.open = true;
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value() {
      this.open = false;
    },
  });
  const repo = new IndexedDBRepository(new IDBFactory(), "draft-place-end-to-end");
  // The place was copied from the manuscript earlier, as an import does it.
  const { realm } = manuscriptWorld(await repo.listRealms(), origin, "Night Keys");
  const place = copyCoreEntity("locations", harbour, origin, { realmId: realm.id });
  await repo.savePlace(place);
  await repo.saveRealm(placeOnWorldMap(realm, [place]));

  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) =>
      Response.json(
        path.endsWith("/manuscripts")
          ? [entry]
          : { ...entry, manuscript: { title: "Night Keys", synopsis: "", chapters: [], bible } },
      ),
    ),
  );
  const top = document.createElement("div");
  document.body.append(top);
  const topRoot = createRoot(top);
  await act(async () => topRoot.render(<CoreManuscripts repo={repo} />));
  await clickIn(top, "Find shared manuscripts");
  await clickIn(top, "Night Keys");
  await clickIn(top, "Create scene drafts");
  await clickIn(top, "Add drafts (1)");
  await act(async () => topRoot.unmount());
  top.remove();
  vi.unstubAllGlobals();

  const [campaign] = await repo.listCampaigns();
  const world = (await repo.loadRealm(realm.id))!;
  expect(campaign!.realmId).toBe(realm.id);
  expect(campaign!.mapWorldId).toBe(realm.id);
  expect(campaign!.scenes[0]!.draft!.suggestedPlaceId).toBe(place.id);

  const places = await repo.listPlaces();
  const host = document.createElement("div");
  document.body.append(host);
  const sb = storyboardHarness(
    host,
    campaign!,
    { characters: [], places, objects: [] },
    adventureMapPlaces(world, places),
  );
  try {
    await sb.render();
    await clickIn(host, "01");
    const use = Array.from(host.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Use Harbour as the place"),
    )!;
    expect(use.disabled).toBe(false);
    await act(async () => use.click());
    const bound = sb.seen.campaign.scenes[0]!;
    expect(bound.placeId).toBe(place.id);
    expect(bound.mapNodeId).toBe(world.worldMap!.nodes[0]!.id);

    await clickIn(host, "Make scene playable");
    const playable = sb.seen.campaign.scenes[0]!;
    expect(playable.encounter).toBeDefined();
    expect(isOpenDraft(playable)).toBe(false);
    expect(playable.placeId).toBe(place.id);
  } finally {
    await act(async () => sb.root.unmount());
    host.remove();
  }
});

it("turns the place button off, with a reason, when the adventure belongs to another world", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const manuscriptRealm = newRealmTemplate({ name: "Night Keys", source: "player", note: "" });
  const place = copyCoreEntity("locations", harbour, origin, { realmId: manuscriptRealm.id });
  const otherWorld = newRealmTemplate({ name: "Elsewhere", source: "player", note: "" });
  const campaign = newCampaignTemplate({
    name: "Another tale",
    realmId: otherWorld.id,
    scenes: [
      {
        ...emptyCampaignScene(),
        name: "Fog rolls in",
        position: { x: 40, y: 40 },
        draft: {
          origin: { ...origin, entityRef: "e1" },
          facts: [],
          suggestedCharacterIds: [],
          suggestedPlaceId: place.id,
          otherPlaceIds: [],
          suggestedObjectIds: [],
        },
      },
    ],
  });
  const host = document.createElement("div");
  document.body.append(host);
  const sb = storyboardHarness(
    host,
    campaign,
    { characters: [], places: [place], objects: [] },
    undefined,
  );
  try {
    await sb.render();
    await clickIn(host, "01");
    const use = Array.from(host.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Use Harbour as the place"),
    )!;
    expect(use.disabled).toBe(true);
    expect(use.title).toBe("This place is not in this adventure’s world.");
  } finally {
    await act(async () => sb.root.unmount());
    host.remove();
  }
});
