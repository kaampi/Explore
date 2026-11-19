// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import {
  SceneColumn,
  KNOWN_SHOWN,
  actionsForThing,
  thingsHere,
} from "../../src/ui/play/SceneColumn";
import { LanguageProvider } from "../../src/ui/i18n/LanguageProvider";
import { innVisitExample } from "../../src/scenarios/innVisit";
import { startPlayableCampaign } from "../../src/session/adventureStart";
import type { KnownThing, SceneWay } from "../../src/game/AdventureEngine";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
HTMLDialogElement.prototype.showModal = function () {
  this.setAttribute("open", "");
};
HTMLDialogElement.prototype.close = function () {
  this.removeAttribute("open");
};
const mounted: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of mounted.splice(0)) await close();
  localStorage.clear();
});

/** The inn's common room, where the brass key lies on the counter. */
function inn() {
  const built = innVisitExample();
  const session = startPlayableCampaign(
    built.campaign,
    built.campaign.scenes[0]!,
    built.places,
    "scene-column",
    [built.realm],
  );
  return session;
}

async function render(props: Partial<Parameters<typeof SceneColumn>[0]> = {}) {
  const session = inn();
  // The first scene is outside the inn; the key is in the next one.
  const game = props.game ?? session.encounter!;
  const onGo = vi.fn();
  const onAction = vi.fn();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <LanguageProvider>
        <SceneColumn
          game={game}
          ways={[]}
          known={[]}
          busy={false}
          character={<p>Health</p>}
          foldValues={[]}
          collapsed={false}
          onToggleCollapsed={() => {}}
          onGo={onGo}
          onAction={onAction}
          {...props}
        />
      </LanguageProvider>,
    ),
  );
  mounted.push(async () => {
    await act(async () => root.unmount());
    host.remove();
  });
  return { host, onGo, onAction, game };
}

const buttons = (host: HTMLElement) => Array.from(host.querySelectorAll("button"));

it("lists the ways out with their travel time, and takes the one clicked", async () => {
  const ways: SceneWay[] = [
    { id: "road", label: "The road", toSceneId: "b", minutes: 20, status: "available" },
    { id: "gate", label: "The gate", toSceneId: "c", status: "locked", blockedBy: "Town gate" },
  ];
  const { host, onGo } = await render({ ways });

  const list = Array.from(host.querySelectorAll<HTMLButtonElement>(".play-scene__way"));
  expect(list.map((b) => b.querySelector("span")!.textContent)).toEqual(["The road", "The gate"]);
  expect(list[0]!.textContent).toContain("20 min");
  expect(list[1]!.textContent).toContain("Locked");
  expect(list[1]!.disabled).toBe(true);

  await act(async () => list[0]!.click());
  expect(onGo).toHaveBeenCalledWith("road");
});

it("shows nothing for ways when there are none, and cannot be used while busy", async () => {
  const { host } = await render();
  expect(host.querySelector(".play-scene__way")).toBeNull();
  expect(host.textContent).not.toContain("From here");

  const busy = await render({
    busy: true,
    ways: [{ id: "road", label: "The road", toSceneId: "b", status: "available" }],
  });
  expect(busy.host.querySelector<HTMLButtonElement>(".play-scene__way")!.disabled).toBe(true);
});

it("shows what you know, the newest five, and says so when nothing is known yet", async () => {
  const empty = await render();
  expect(empty.host.textContent).toContain("You have not found out anything yet.");

  const known: KnownThing[] = Array.from({ length: 7 }, (_, index) => ({
    text: `Fact ${index}`,
    sceneId: "a",
    place: "The square",
    minutes: 0,
  }));
  const { host } = await render({ known });
  const lines = Array.from(host.querySelectorAll(".play-scene__known li"));
  expect(lines).toHaveLength(KNOWN_SHOWN);
  expect(lines[0]!.textContent).toContain("Fact 0");
  expect(lines[0]!.textContent).toContain("The square");
});

it("lists the things at the player's place, and shows one with its actions when clicked", async () => {
  const session = inn();
  // Walk into the room where the key lies, the way the engine does it.
  const room = session.adventure!.scenes.find(
    (scene) => scene.game.state.itemLocations["inn-brass-key"] !== undefined,
  )!;
  const game = structuredClone(room.game);
  const here = thingsHere(game);
  const key = here.find((item) => item.id === "inn-brass-key")!;
  expect(key).toBeTruthy();

  const { host, onAction } = await render({ game });
  const thing = host.querySelector<HTMLButtonElement>(".play-scene__thing")!;
  expect(thing.getAttribute("aria-expanded")).toBe("false");
  await act(async () => thing.click());
  expect(thing.getAttribute("aria-expanded")).toBe("true");
  const taking = actionsForThing(game, key.id);
  expect(taking.length).toBeGreaterThan(0);
  const take = buttons(host).find((b) => b.textContent === taking[0]!.label)!;
  await act(async () => take.click());
  expect(onAction).toHaveBeenCalledWith(taking[0]!.action);

  await act(async () => thing.click());
  expect(host.querySelector(".play-scene__thing-card")).toBeNull();
});

it("shows the map only when asked, in a panel", async () => {
  const { host } = await render({ mapView: <div className="the-map">Map</div> });
  expect(host.querySelector(".the-map")).toBeNull();
  await act(async () =>
    buttons(host)
      .find((b) => b.textContent === "Show map")!
      .click(),
  );
  expect(host.querySelector("dialog .the-map")).not.toBeNull();
  await act(async () =>
    buttons(host)
      .find((b) => b.textContent === "Close")!
      .click(),
  );
  expect(host.querySelector(".the-map")).toBeNull();
});

it("shows no map button when there is no map", async () => {
  const { host } = await render();
  expect(buttons(host).some((b) => b.textContent === "Show map")).toBe(false);
});

it("says in words why a way is locked, not only in a tooltip", async () => {
  const { host } = await render({
    ways: [
      { id: "gate", label: "The gate", toSceneId: "c", status: "locked", blockedBy: "Town gate" },
    ],
  });
  const reason = host.querySelector(".play-scene__reason");
  expect(reason?.textContent).toBe("Town gate is locked");
});

it("folds to a strip with one button, and unfolds again", async () => {
  const onToggleCollapsed = vi.fn();
  const open = await render({ onToggleCollapsed });
  const hide = open.host.querySelector<HTMLButtonElement>(".play-scene__fold")!;
  expect(hide.getAttribute("aria-expanded")).toBe("true");
  await act(async () => hide.click());
  expect(onToggleCollapsed).toHaveBeenCalledOnce();

  const folded = await render({
    collapsed: true,
    ways: [{ id: "a", label: "Road", toSceneId: "b", status: "available" }],
  });
  expect(folded.host.querySelector(".play-scene--collapsed")).not.toBeNull();
  expect(folded.host.querySelector(".play-scene__way")).toBeNull();
  const show = folded.host.querySelector<HTMLButtonElement>(".play-scene__fold")!;
  expect(show.getAttribute("aria-expanded")).toBe("false");
  expect(show.getAttribute("aria-label")).toBe("Show the scene panel");
});

it("closes an open thing card when the player comes to another scene", async () => {
  const session = inn();
  const room = session.adventure!.scenes.find(
    (scene) => scene.game.state.itemLocations["inn-brass-key"] !== undefined,
  )!;
  const here = structuredClone(room.game);
  const there = structuredClone(room.game);
  there.definition.id = "another-scene";

  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const draw = (game: typeof here) =>
    act(async () =>
      root.render(
        <LanguageProvider>
          <SceneColumn
            game={game}
            ways={[]}
            known={[]}
            busy={false}
            character={null}
            foldValues={[]}
            collapsed={false}
            onToggleCollapsed={() => {}}
            onGo={() => {}}
            onAction={() => {}}
          />
        </LanguageProvider>,
      ),
    );
  mounted.push(async () => {
    await act(async () => root.unmount());
    host.remove();
  });
  await draw(here);
  await act(async () => host.querySelector<HTMLButtonElement>(".play-scene__thing")!.click());
  expect(host.querySelector(".play-scene__thing-card")).not.toBeNull();

  await draw(there);
  expect(host.querySelector(".play-scene__thing-card")).toBeNull();
  await draw(here);
  expect(host.querySelector(".play-scene__thing-card")).toBeNull();
});

it("tells a locked way from a closed one and a blocked one, in words", async () => {
  const { host } = await render({
    ways: [
      { id: "a", label: "The gate", toSceneId: "x", status: "locked", blockedBy: "Town gate" },
      {
        id: "b",
        label: "The kitchen",
        toSceneId: "y",
        status: "closed",
        blockedBy: "Kitchen door",
      },
      {
        id: "c",
        label: "The cellar",
        toSceneId: "z",
        status: "blocked",
        blockedBy: "Cellar hatch",
      },
    ],
  });
  const ways = Array.from(host.querySelectorAll<HTMLElement>(".play-scene__list > li"));
  expect(ways.map((li) => li.querySelector("small")!.textContent)).toEqual([
    "Locked",
    "Closed",
    "Blocked",
  ]);
  expect(
    Array.from(host.querySelectorAll(".play-scene__reason")).map((r) => r.textContent),
  ).toEqual(["Town gate is locked", "Kitchen door is closed", "Cellar hatch is blocked"]);
  expect(
    Array.from(host.querySelectorAll<HTMLButtonElement>(".play-scene__way")).every(
      (b) => b.disabled,
    ),
  ).toBe(true);
});
