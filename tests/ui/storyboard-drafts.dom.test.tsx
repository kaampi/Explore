// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { PlayableStoryboard } from "../../src/ui/studio/PlayableStoryboard";
import {
  connectedAdventureExample,
  adventureFacts,
  makePlayableScene,
} from "../../src/library/playableCampaign";
import { storyboardIssues, storyboardWarnings } from "../../src/ui/studio/storyboardReadiness";
import { startPlayableCampaign } from "../../src/session/adventureStart";
import { addEventDrafts } from "../../src/integrations/coreEvents";
import { isOpenDraft } from "../../src/library/sceneFormat";
import type { CoreBibleEntity } from "../../src/integrations/coreBibleSchema";
import type { CampaignTemplate } from "../../src/library/LibrarySchema";

const events: CoreBibleEntity[] = [1, 2, 3].map((n) => ({
  entity_ref: `ev-${n}`,
  name: `Event ${n}`,
  facts: [{ predicate: "p", label: "What", value: `Thing ${n}` }],
  referenceImages: [],
}));
const source = { workspaceId: "w", projectId: "p", revision: 1 };

/** The finished example adventure with three manuscript events added to it as drafts. */
function withDrafts() {
  const built = connectedAdventureExample();
  const imported = addEventDrafts({
    campaign: built.campaign,
    title: "Night Keys",
    events,
    chosen: new Set(events.map((e) => e.entity_ref)),
    source,
    library: { characters: [], places: [], objects: [] },
  });
  return { built, campaign: imported.campaign };
}
const facts = (c: CampaignTemplate) => new Set(adventureFacts(c).map((f) => f.id));

it("does not count a draft as an unfinished scene, so an adventure with drafts can still be tested", () => {
  const { built, campaign } = withDrafts();

  expect(storyboardIssues(built.campaign, built.places, facts(built.campaign))).toEqual([]);
  expect(storyboardIssues(campaign, built.places, facts(campaign))).toEqual([]);
});

it("warns about each draft that is left out of the test, and does not also say it cannot be reached", () => {
  const { campaign } = withDrafts();

  const warnings = storyboardWarnings(campaign, facts(campaign));

  const forDrafts = warnings.filter((w) => w.message.includes("is a draft from the manuscript"));
  expect(forDrafts.map((w) => w.message.match(/“(.*?)”/)![1])).toEqual([
    "Event 1",
    "Event 2",
    "Event 3",
  ]);
  expect(warnings.some((w) => w.message.includes("cannot reach “Event"))).toBe(false);
});

it("starts a game without the drafts, and without any way to or from them", () => {
  const { built, campaign } = withDrafts();
  const draft = campaign.scenes.find(isOpenDraft)!;
  const linked: CampaignTemplate = {
    ...campaign,
    sceneLinks: [
      ...campaign.sceneLinks,
      {
        id: crypto.randomUUID(),
        fromSceneId: campaign.scenes[0]!.id,
        toSceneId: draft.id,
        label: "To the draft",
        requiresFlags: [],
        requiresAbsentFlags: [],
        setsFlags: [],
      },
    ],
  };

  const session = startPlayableCampaign(
    linked,
    linked.scenes[0]!,
    built.places,
    "drafts",
    [built.realm],
    {
      characters: built.characters,
    },
  );

  const run = session.adventure!;
  expect(run.scenes.map((s) => s.name)).toEqual(built.campaign.scenes.map((s) => s.name));
  expect(run.links.some((l) => l.label === "To the draft")).toBe(false);
  expect(() => startPlayableCampaign(linked, draft, built.places, "x", [built.realm])).toThrow(
    /make “Event 1” playable before starting from it/,
  );
});

it("counts a draft as a scene again once it has been made playable", () => {
  const { built, campaign } = withDrafts();
  const draft = campaign.scenes.find(isOpenDraft)!;
  const playable = makePlayableScene(
    campaign,
    { ...draft, placeId: built.places[0]!.id },
    built.places,
    [],
    [],
  );

  const next = {
    ...campaign,
    scenes: campaign.scenes.map((s) => (s.id === draft.id ? playable : s)),
  };

  expect(isOpenDraft(playable)).toBe(false);
  expect(
    storyboardWarnings(next, facts(next)).some((w) => w.message.includes("cannot reach “Event 1”")),
  ).toBe(true);
});

it("leaves the drafts out of the list of scenes to start from, and out of the count of scenes that are ready", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const { built, campaign } = withDrafts();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  function Harness() {
    const [current, setCurrent] = useState(campaign);
    return (
      <PlayableStoryboard
        campaign={current}
        places={built.places}
        characters={built.characters}
        objects={built.objects}
        busy={false}
        onChange={setCurrent}
        onPlay={() => {}}
        initialStep="test"
      />
    );
  }
  try {
    await act(async () => root.render(<Harness />));

    const options = Array.from(
      host.querySelectorAll<HTMLOptionElement>('select[aria-label="Start from"] option'),
    ).map((o) => o.textContent);
    expect(options).toEqual(built.campaign.scenes.map((s) => s.name));
    expect(host.textContent).toContain("Ready to test");
    expect(host.textContent).not.toContain("to finish before testing");
    expect(host.textContent).toContain("is a draft from the manuscript");
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
