// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { PlayableStoryboard } from "../../src/ui/studio/PlayableStoryboard";
import { connectedAdventureExample } from "../../src/library/playableCampaign";
import {
  emptyCampaignScene,
  newCampaignTemplate,
  newCharacterTemplate,
  newObjectTemplate,
  parseCampaignTemplate,
  type PlaceTemplate,
} from "../../src/library/LibrarySchema";
import { planNewPlace } from "../../src/library/campaignPlace";
import { startPlayableCampaign } from "../../src/session/adventureStart";
import { adventureOptions } from "../../src/game/AdventureEngine";
async function click(host: HTMLElement, text: string) {
  const b = Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.includes(text));
  expect(b, text).toBeTruthy();
  await act(async () => b!.click());
}
it("adds an action to the selected scene from the visible toolbar and focuses its label", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const built = connectedAdventureExample(),
    host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  let snapshot = built.campaign;
  function Harness() {
    const [campaign, setCampaign] = useState(built.campaign);
    snapshot = campaign;
    return (
      <PlayableStoryboard
        campaign={campaign}
        places={built.places}
        characters={built.characters}
        objects={built.objects}
        busy={false}
        onChange={setCampaign}
        onPlay={() => {}}
      />
    );
  }
  try {
    await act(async () => root.render(<Harness />));
    await click(host, "02");
    const inspector = host.querySelector(".playable-storyboard__inspector")!;
    expect(inspector.textContent).toContain("A note at the watchtower");
    await click(host, "+ Action");
    expect(snapshot.scenes[0]!.encounter!.definition.interactions).toHaveLength(2);
    expect(snapshot.scenes[1]!.encounter!.definition.interactions).toHaveLength(2);
    expect((document.activeElement as HTMLInputElement).value).toBe("New action");
    await workflow(host, "Connections");
    await click(host, "Return to the village");
    expect(
      Array.from(inspector.querySelectorAll("button")).some((b) => b.textContent === "+ Action"),
    ).toBe(false);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
it("edits a connection with readable discoveries, preserves its IDs and tests the resulting campaign", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const built = connectedAdventureExample(),
    host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host),
    play = vi.fn();
  let snapshot = built.campaign;
  function Harness() {
    const [campaign, setCampaign] = useState(built.campaign);
    snapshot = campaign;
    return (
      <PlayableStoryboard
        campaign={campaign}
        places={built.places}
        characters={built.characters}
        objects={built.objects}
        busy={false}
        onChange={setCampaign}
        onPlay={play}
      />
    );
  }
  try {
    await act(async () => root.render(<Harness />));
    await workflow(host, "Connections");
    await click(host, "Follow the lead");
    expect(host.querySelector(".playable-storyboard__inspector fieldset")?.textContent).toContain(
      "Ask Edda about the messenger · succeeded",
    );
    const checkbox = host.querySelector<HTMLInputElement>(
      ".playable-storyboard__inspector fieldset input",
    )!;
    expect(checkbox.checked).toBe(true);
    await act(async () => checkbox.click());
    expect(snapshot.sceneLinks[0]!.requiresFlags).toHaveLength(0);
    const reloaded = parseCampaignTemplate(JSON.parse(JSON.stringify(snapshot)));
    expect(reloaded.scenes[0]!.encounter!.definition.interactions[0]!.id).toBe(
      built.campaign.scenes[0]!.encounter!.definition.interactions[0]!.id,
    );
    expect(
      adventureOptions(
        startPlayableCampaign(reloaded, reloaded.scenes[0]!, built.places, "edited"),
      ),
    ).toHaveLength(1);
    await click(host, "01");
    await workflow(host, "Test");
    await click(host, "Test this scene");
    expect(play).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
it("renames an action without breaking its connector and exposes failure conditions only for rolled actions", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const built = connectedAdventureExample(),
    host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  let snapshot = built.campaign;
  function Harness() {
    const [campaign, setCampaign] = useState(built.campaign);
    snapshot = campaign;
    return (
      <PlayableStoryboard
        campaign={campaign}
        places={built.places}
        characters={built.characters}
        objects={built.objects}
        busy={false}
        onChange={setCampaign}
        onPlay={() => {}}
      />
    );
  }
  try {
    await act(async () => root.render(<Harness />));
    const action = Array.from(host.querySelectorAll("label"))
      .find((l) => l.textContent === "Action label")!
      .querySelector("input")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        action,
        "Ask about the north road",
      );
      action.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const check = Array.from(host.querySelectorAll("label"))
      .find((l) => l.textContent?.includes("Requires a skill roll"))!
      .querySelector("input")!;
    await act(async () => check.click());
    await workflow(host, "Connections");
    await click(host, "Follow the lead");
    expect(host.querySelector(".playable-storyboard__inspector fieldset")!.textContent).toContain(
      "Ask about the north road · succeeded",
    );
    expect(host.querySelector(".playable-storyboard__inspector fieldset")!.textContent).toContain(
      "Ask about the north road · failed",
    );
    expect(snapshot.sceneLinks[0]!.requiresFlags[0]).toBe(
      built.campaign.sceneLinks[0]!.requiresFlags[0],
    );
    await click(host, "01");
    await act(async () =>
      Array.from(host.querySelectorAll("label"))
        .find((l) => l.textContent?.includes("Requires a skill roll"))!
        .querySelector<HTMLInputElement>("input")!
        .click(),
    );
    expect(snapshot.scenes[0]!.encounter!.definition.interactions[0]!.check).toBeUndefined();
    const who = host.querySelector<HTMLSelectElement>(
      'select[aria-label="Who this action concerns"]',
    )!;
    await act(async () => {
      who.value = "";
      who.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(
      snapshot.scenes[0]!.encounter!.definition.interactions[0]!.counterpartyId,
    ).toBeUndefined();
    await workflow(host, "Connections");
    await click(host, "Follow the lead");
    expect(
      host.querySelector(".playable-storyboard__inspector fieldset")!.textContent,
    ).not.toContain("· failed");
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

async function workflow(host: HTMLElement, label: string) {
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>(
        '[aria-label="Adventure workflow"] [aria-label="' + label + '"]',
      )!
      .click(),
  );
}

it("leads from a missing arrival in review to the right scene and preserves the chosen test start", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const built = connectedAdventureExample();
  built.campaign.scenes[1]!.encounter!.definition.description = "";
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  const play = vi.fn();
  function Harness() {
    const [campaign, setCampaign] = useState(built.campaign);
    return (
      <PlayableStoryboard
        campaign={campaign}
        places={built.places}
        characters={built.characters}
        objects={built.objects}
        busy={false}
        onChange={setCampaign}
        onPlay={play}
      />
    );
  }
  try {
    await act(async () => root.render(<Harness />));
    await workflow(host, "Test");
    const testButton = () =>
      Array.from(host.querySelectorAll("button")).find(
        (button) => button.textContent === "Test this scene →",
      )!;
    expect(testButton().disabled).toBe(true);
    await click(host, "Describe the arrival in");
    const arrival = host.querySelector<HTMLTextAreaElement>('[data-storyboard-field="arrival"]')!;
    expect(document.activeElement).toBe(arrival);
    expect(host.querySelector(".storyboard-panel-heading h3")?.textContent).toBe(
      built.campaign.scenes[1]!.name,
    );
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
        arrival,
        "You arrive at the old watchtower.",
      );
      arrival.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await workflow(host, "Test");
    expect(testButton().disabled).toBe(false);
    expect(host.querySelector<HTMLSelectElement>('[aria-label="Start from"]')?.value).toBe(
      built.campaign.scenes[0]!.id,
    );
    await click(host, "Test this scene");
    expect(play).toHaveBeenCalledWith(
      expect.objectContaining({ id: built.campaign.scenes[0]!.id }),
    );
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it("creates a place from the scene panel in an adventure that has none, and points the scene at it", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const scene = { ...emptyCampaignScene(), name: "Arrival" };
  const start = newCampaignTemplate({ name: "Fresh start", scenes: [scene] });
  let snapshot = start;
  let created: PlaceTemplate | undefined;
  function Harness() {
    const [campaign, setCampaign] = useState(start);
    const [known, setKnown] = useState<PlaceTemplate[]>([]);
    snapshot = campaign;
    return (
      <PlayableStoryboard
        campaign={campaign}
        places={known}
        characters={[]}
        objects={[]}
        busy={false}
        onChange={setCampaign}
        onPlay={() => {}}
        onCreatePlace={async (name) => {
          const plan = planNewPlace(campaign, known, name);
          created = plan.place;
          setKnown([...known, plan.place]);
          return { place: plan.place, campaign: plan.campaign };
        }}
      />
    );
  }
  try {
    await act(async () => root.render(<Harness />));
    expect(host.textContent).toContain("Name your first place");
    const field = host.querySelector<HTMLInputElement>('input[aria-label="New place name"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        field,
        "The village square",
      );
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click(host, "Create a place");
    expect(created?.name).toBe("The village square");
    expect(snapshot.scenes[0]!.placeId).toBe(created!.id);
    expect(snapshot.realmId).toBe(created!.realmId);
    const select = host.querySelector<HTMLSelectElement>('select[aria-label="Place"]')!;
    expect(select.value).toBe(created!.id);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it("lists a scene the player cannot reach and opens Connections when it is chosen", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const built = connectedAdventureExample(),
    host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const cut = {
    ...built.campaign,
    sceneLinks: built.campaign.sceneLinks.filter(
      (link) => link.toSceneId !== built.campaign.scenes[1]!.id,
    ),
  };
  function Harness() {
    const [campaign, setCampaign] = useState(cut);
    return (
      <PlayableStoryboard
        campaign={campaign}
        places={built.places}
        characters={built.characters}
        objects={built.objects}
        busy={false}
        onChange={setCampaign}
        onPlay={() => {}}
      />
    );
  }
  try {
    await act(async () => root.render(<Harness />));
    await workflow(host, "Test");
    const warning = host.querySelector(".storyboard-review--warnings")!;
    expect(warning.textContent).toContain("cannot reach");
    expect(warning.textContent).toContain("do not stop you testing");
    expect(host.querySelector(".storyboard-review:not(.storyboard-review--warnings)")).toBeNull();
    expect(host.querySelector<HTMLButtonElement>(".storyboard-primary")!.disabled).toBe(false);
    await click(host, "cannot reach");
    expect(
      host
        .querySelector('.storyboard-workflow [aria-label="Connections"]')!
        .getAttribute("aria-current"),
    ).toBe("step");
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it("can still test a scene on its own when another scene is not connected", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const built = connectedAdventureExample(),
    host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host),
    play = vi.fn();
  const unlinked = { ...built.campaign, sceneLinks: [], goal: undefined };
  function Harness() {
    const [campaign, setCampaign] = useState(unlinked as typeof built.campaign);
    return (
      <PlayableStoryboard
        campaign={campaign}
        places={built.places}
        characters={built.characters}
        objects={built.objects}
        busy={false}
        onChange={setCampaign}
        onPlay={play}
      />
    );
  }
  try {
    await act(async () => root.render(<Harness />));
    await workflow(host, "Test");
    const select = host.querySelector<HTMLSelectElement>('select[aria-label="Start from"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(
        select,
        built.campaign.scenes[1]!.id,
      );
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => host.querySelector<HTMLButtonElement>(".storyboard-primary")!.click());
    expect(play).toHaveBeenCalledWith(
      expect.objectContaining({ id: built.campaign.scenes[1]!.id }),
    );
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it("does not count scenes in the earlier format as unfinished, and does not offer them to test", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const built = connectedAdventureExample(),
    host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const older = {
    ...emptyCampaignScene(),
    name: "An old scene",
    placeId: built.places[0]!.id,
    people: [
      {
        characterId: "someone",
        position: "",
        mood: "calm",
        clothing: "",
        holding: "",
        trust: "20",
        familiarity: "10",
        tension: "5",
      },
    ],
  };
  const mixed = { ...built.campaign, scenes: [...built.campaign.scenes, older] };
  function Harness() {
    const [campaign, setCampaign] = useState(mixed);
    return (
      <PlayableStoryboard
        campaign={campaign}
        places={built.places}
        characters={built.characters}
        objects={built.objects}
        busy={false}
        onChange={setCampaign}
        onPlay={() => {}}
      />
    );
  }
  try {
    await act(async () => root.render(<Harness />));
    expect(host.querySelector('[aria-label="Scenes"]')!.textContent).toContain("2 of 2 ready");
    await workflow(host, "Test");
    expect(host.querySelector(".storyboard-review:not(.storyboard-review--warnings)")).toBeNull();
    expect(host.querySelector<HTMLButtonElement>(".storyboard-primary")!.disabled).toBe(false);
    const options = Array.from(
      host.querySelectorAll<HTMLOptionElement>('select[aria-label="Start from"] option'),
    ).map((option) => option.textContent);
    expect(options).not.toContain("An old scene");
    expect(host.textContent).not.toContain("cannot reach “An old scene”");
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it("labels the place field and its button differently", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const built = connectedAdventureExample(),
    host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <PlayableStoryboard
          campaign={built.campaign}
          places={built.places}
          characters={built.characters}
          objects={built.objects}
          busy={false}
          onChange={() => {}}
          onPlay={() => {}}
          onCreatePlace={async () => undefined}
        />,
      ),
    );
    const field = host.querySelector(".storyboard-create-place label")!.textContent;
    const button = host.querySelector(".storyboard-create-place button")!.textContent;
    expect(field).toContain("Name a new place");
    expect(button).toBe("Create a place");
    expect(field).not.toContain("Create a place");
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it("adds a person to the scene from Who and what is here, and offers them in actions", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const built = connectedAdventureExample(),
    host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const orla = newCharacterTemplate({ name: "Orla" });
  let snapshot = built.campaign;
  function Harness() {
    const [campaign, setCampaign] = useState(built.campaign);
    snapshot = campaign;
    return (
      <PlayableStoryboard
        campaign={campaign}
        places={built.places}
        characters={[...built.characters, orla]}
        objects={built.objects}
        busy={false}
        onChange={setCampaign}
        onPlay={() => {}}
      />
    );
  }
  const choose = async (label: string, value: string) => {
    const select = host.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(
        select,
        value,
      );
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
  };
  try {
    await act(async () => root.render(<Harness />));
    const parts = host.querySelector('[aria-label="Who and what is here"]')!;
    expect(parts.textContent).toContain("Edda");
    await choose("Person to add", orla.id);
    await click(host, "Add person");
    expect(
      Object.values(snapshot.scenes[0]!.encounter!.state.actors).map((actor) => actor.name),
    ).toContain("Orla");
    const concerns = Array.from(
      host.querySelectorAll<HTMLOptionElement>(
        'select[aria-label="Who this action concerns"] option',
      ),
    ).map((option) => option.textContent);
    expect(concerns).toContain("Orla");
    expect(parts.textContent).toContain("Orla");
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it("explains why a person cannot be removed while an action is about them", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const built = connectedAdventureExample(),
    host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  function Harness() {
    const [campaign, setCampaign] = useState(built.campaign);
    return (
      <PlayableStoryboard
        campaign={campaign}
        places={built.places}
        characters={built.characters}
        objects={built.objects}
        busy={false}
        onChange={setCampaign}
        onPlay={() => {}}
      />
    );
  }
  try {
    await act(async () => root.render(<Harness />));
    await act(async () =>
      host.querySelector<HTMLButtonElement>('button[aria-label="Remove Edda"]')!.click(),
    );
    expect(host.querySelector('[role="alert"]')!.textContent).toContain(
      "Ask Edda about the messenger",
    );
    expect(host.querySelector('[aria-label="Who and what is here"]')!.textContent).toContain(
      "Edda",
    );
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it("adds a locked door from the scene panel and puts it on the way to the next scene", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const built = connectedAdventureExample(),
    host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  let snapshot = built.campaign;
  function Harness() {
    const [campaign, setCampaign] = useState(built.campaign);
    snapshot = campaign;
    return (
      <PlayableStoryboard
        campaign={campaign}
        places={built.places}
        characters={built.characters}
        objects={built.objects}
        busy={false}
        onChange={setCampaign}
        onPlay={() => {}}
      />
    );
  }
  const set = async (selector: string, value: string, kind: "input" | "select") => {
    const element = host.querySelector<HTMLInputElement | HTMLSelectElement>(selector)!;
    const prototype = kind === "input" ? HTMLInputElement.prototype : HTMLSelectElement.prototype;
    await act(async () => {
      Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
      element.dispatchEvent(new Event(kind === "input" ? "input" : "change", { bubbles: true }));
    });
  };
  try {
    await act(async () => root.render(<Harness />));
    await set('input[aria-label="Door name"]', "Village gate", "input");
    await act(async () =>
      host
        .querySelector<HTMLInputElement>('.storyboard-scene-parts input[type="checkbox"]')!
        .click(),
    );
    await set('select[aria-label="Key to the door"]', built.objects[0]!.id, "select");
    await click(host, "Add door");
    const door = Object.values(snapshot.scenes[0]!.encounter!.state.barriers).find(
      (barrier) => barrier.name === "Village gate",
    )!;
    expect(door).toMatchObject({ locked: true, keyId: built.objects[0]!.id });
    expect(host.querySelector('[aria-label="Who and what is here"]')!.textContent).toContain(
      "Village gate · locked with",
    );
    await set(
      'select[aria-label="Where Village gate stands"]',
      `route:${snapshot.sceneLinks[0]!.id}`,
      "select",
    );
    await act(async () =>
      host.querySelector<HTMLButtonElement>('button[aria-label="Put Village gate there"]')!.click(),
    );
    expect(snapshot.sceneLinks[0]!.requiresOpenBarriers).toEqual([door.id]);
    expect(snapshot.scenes[1]!.encounter!.state.barriers[door.id]).toMatchObject({ shared: true });
    expect(host.querySelector('[aria-label="Who and what is here"]')!.textContent).toContain(
      "on the way to",
    );
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it("will not add a locked door without a key and says why", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const built = connectedAdventureExample(),
    host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  function Harness() {
    const [campaign, setCampaign] = useState(built.campaign);
    return (
      <PlayableStoryboard
        campaign={campaign}
        places={built.places}
        characters={built.characters}
        objects={built.objects}
        busy={false}
        onChange={setCampaign}
        onPlay={() => {}}
      />
    );
  }
  try {
    await act(async () => root.render(<Harness />));
    const name = host.querySelector<HTMLInputElement>('input[aria-label="Door name"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(name, "Gate");
      name.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () =>
      host
        .querySelector<HTMLInputElement>('.storyboard-scene-parts input[type="checkbox"]')!
        .click(),
    );
    await click(host, "Add door");
    expect(host.querySelector('[role="alert"]')!.textContent).toContain(
      "needs a thing that opens it",
    );
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it("adds a position from the scene panel, joined to the one it is next to, and removes it again", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const built = connectedAdventureExample(),
    host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  let snapshot = built.campaign;
  function Harness() {
    const [campaign, setCampaign] = useState(built.campaign);
    snapshot = campaign;
    return (
      <PlayableStoryboard
        campaign={campaign}
        places={built.places}
        characters={built.characters}
        objects={built.objects}
        busy={false}
        onChange={setCampaign}
        onPlay={() => {}}
      />
    );
  }
  try {
    await act(async () => root.render(<Harness />));
    const name = host.querySelector<HTMLInputElement>('input[aria-label="New position name"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        name,
        "The porch",
      );
      name.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click(host, "Add position");
    const game = snapshot.scenes[0]!.encounter!;
    expect(game.definition.places.map((p) => p.name)).toContain("The porch");
    expect(game.definition.connections).toHaveLength(1);
    const positions = host.querySelector('[aria-label="Positions"]')!;
    expect(positions.textContent).toContain("↔");
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('button[aria-label="Remove position The porch"]')!
        .click(),
    );
    expect(snapshot.scenes[0]!.encounter!.definition.places).toHaveLength(1);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it("says why the only position cannot be removed", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const built = connectedAdventureExample(),
    host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  function Harness() {
    const [campaign, setCampaign] = useState(built.campaign);
    return (
      <PlayableStoryboard
        campaign={campaign}
        places={built.places}
        characters={built.characters}
        objects={built.objects}
        busy={false}
        onChange={setCampaign}
        onPlay={() => {}}
      />
    );
  }
  try {
    await act(async () => root.render(<Harness />));
    const remove = host.querySelector<HTMLButtonElement>(
      '[aria-label="Positions"] button.playable-remove',
    )!;
    expect(remove.disabled).toBe(true);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it("places a weapon in someone's hands and lets the rounds be set", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const built = connectedAdventureExample(),
    host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const bow = newObjectTemplate({
    name: "Hunting bow",
    note: "",
    source: "player",
    tags: [],
    weapon: { skill: "Archery", kind: "ranged", damage: 3, range: 20, usesAmmunition: true },
  });
  let snapshot = built.campaign;
  function Harness() {
    const [campaign, setCampaign] = useState(built.campaign);
    snapshot = campaign;
    return (
      <PlayableStoryboard
        campaign={campaign}
        places={built.places}
        characters={built.characters}
        objects={[...built.objects, bow]}
        busy={false}
        onChange={setCampaign}
        onPlay={() => {}}
      />
    );
  }
  const choose = async (label: string, value: string) => {
    const select = host.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(
        select,
        value,
      );
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
  };
  try {
    await act(async () => root.render(<Harness />));
    await choose("Thing to place", bow.id);
    await choose("Where to place it", "held:player");
    await click(host, "Place thing");
    const player = snapshot.scenes[0]!.encounter!.state.actors.player!;
    expect(player.weapons).toContain(bow.id);
    const rounds = host.querySelector<HTMLInputElement>(
      'input[aria-label="Rounds of Hunting bow"]',
    )!;
    expect(rounds.value).toBe("6");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(rounds, "9");
      rounds.dispatchEvent(new Event("input", { bubbles: true }));
      rounds.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    expect(snapshot.scenes[0]!.encounter!.state.actors.player!.ammunition[bow.id]).toBe(9);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it("makes a person hostile from the scene panel and shows their toughness", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const built = connectedAdventureExample(),
    host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  let snapshot = built.campaign;
  function Harness() {
    const [campaign, setCampaign] = useState(built.campaign);
    snapshot = campaign;
    return (
      <PlayableStoryboard
        campaign={campaign}
        places={built.places}
        characters={built.characters}
        objects={built.objects}
        busy={false}
        onChange={setCampaign}
        onPlay={() => {}}
      />
    );
  }
  const choose = async (label: string, value: string) => {
    const select = host.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(
        select,
        value,
      );
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
  };
  try {
    await act(async () => root.render(<Harness />));
    await choose("Attitude of Edda", "hostile");
    const edda = Object.values(snapshot.scenes[0]!.encounter!.state.actors).find(
      (a) => a.name === "Edda",
    )!;
    expect(edda.team).toBe("opponents");
    await choose("Toughness of Edda", "tough");
    expect(
      Object.values(snapshot.scenes[0]!.encounter!.state.actors).find((a) => a.name === "Edda")!
        .maxHp,
    ).toBe(20);
    expect(host.querySelector('[aria-label="Who and what is here"]')!.textContent).not.toContain(
      "Retreats at health",
    );
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
