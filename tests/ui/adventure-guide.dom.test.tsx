// @vitest-environment jsdom
import { IDBFactory } from "fake-indexeddb";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { beforeAll, expect, it, vi } from "vitest";
import { EventLog } from "../../src/events/EventLog";
import { newPlaceTemplate, newRealmTemplate } from "../../src/library/LibrarySchema";
import { newGuideChoice, newGuideInterview } from "../../src/library/guideInterview";
import {
  GuideInterviewConflictError,
  IndexedDBRepository,
} from "../../src/persistence/IndexedDBRepository";
import type { Session } from "../../src/state/StateSchema";
import { StateEngine } from "../../src/state/StateEngine";
import { AdventureGuide } from "../../src/ui/studio/AdventureGuide";
import { CampaignStudio } from "../../src/ui/studio/CampaignStudio";
import { ConnectionProvider } from "../../src/ui/connection/ConnectionProvider";
import { LanguageProvider } from "../../src/ui/i18n/LanguageProvider";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close ??= function () {
    this.open = false;
  };
});

function mountGuide(repo: IndexedDBRepository, language: "sv" | "en" = "sv", connected = false) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  const onStart = vi.fn<(session: Session) => Promise<void>>().mockResolvedValue(undefined);
  const openStoryboard = vi.fn<(id: string) => void>();
  function Harness() {
    const [open, setOpen] = useState(true);
    const [campaignId, setCampaignId] = useState<string>();
    if (campaignId)
      return (
        <CampaignStudio
          repo={repo}
          sessionId="guide-offline"
          resume={{ campaignId, openStoryboard: true }}
          onStart={onStart}
          onOpenShelf={() => {}}
          onOneOff={() => {}}
        />
      );
    return open ? (
      <AdventureGuide
        repo={repo}
        sessionId="guide-offline"
        close={() => setOpen(false)}
        onStart={onStart}
        onCreated={async () => {}}
        openStoryboard={(id) => {
          openStoryboard(id);
          setCampaignId(id);
        }}
      />
    ) : (
      <button type="button" onClick={() => setOpen(true)}>
        Öppna guiden igen
      </button>
    );
  }
  async function until(check: () => void) {
    await vi.waitFor(async () => {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
      check();
    });
  }
  async function click(label: string, selector = "") {
    const area = selector ? host.querySelector(selector)! : host;
    const button = Array.from(area.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === label,
    );
    expect(button, label).toBeDefined();
    await act(async () => button!.click());
  }
  function field(label: string, selector = "") {
    const area = selector ? host.querySelector(selector)! : host;
    const found = Array.from(area.querySelectorAll("label"))
      .find((node) => node.firstElementChild?.textContent === label)
      ?.querySelector("input, textarea, select");
    expect(found, label).toBeDefined();
    return found as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  }
  async function fill(label: string, value: string, selector = "") {
    const control = field(label, selector);
    const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(control), "value")!.set!;
    await act(async () => {
      set.call(control, value);
      control.dispatchEvent(
        new Event(control instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }),
      );
    });
  }
  async function reveal(label: string) {
    const details = host.querySelector<HTMLDetailsElement>(".guide-plan details")!;
    if (!details.open) await act(async () => details.querySelector("summary")!.click());
    await click(label, ".guide-plan details");
  }
  return {
    host,
    onStart,
    openStoryboard,
    until,
    click,
    field,
    fill,
    reveal,
    open: async () => {
      localStorage.setItem("sandboxai:interface-language", language);
      await act(async () =>
        root.render(
          <LanguageProvider>
            {connected ? (
              <ConnectionProvider>
                <Harness />
              </ConnectionProvider>
            ) : (
              <Harness />
            )}
          </LanguageProvider>,
        ),
      );
      await until(() => expect(host.querySelector(".guide-columns")).not.toBeNull());
    },
    cleanup: async () => {
      await act(async () => root.unmount());
      host.remove();
      localStorage.removeItem("sandboxai:interface-language");
    },
  };
}

it("shows English guide controls and local suggestions when Explore is set to English", async () => {
  const view = mountGuide(new IndexedDBRepository(new IDBFactory(), "english-guide"), "en");
  try {
    await view.open();
    expect(view.host.textContent).toContain("Create with the guide");
    expect(view.host.textContent).toContain(
      "What do you already know about the game you want to create?",
    );
    await view.click("Help me find an idea");
    await view.click("A musician needs a place for tonight’s concert.");
    expect(view.field("Your idea").value).toBe("A musician needs a place for tonight’s concert.");
    await view.click("Next");
    await view.click("Make the opening playable");
    expect(view.host.textContent).toContain("Who would you like the player to be?");
    expect(view.host.textContent).not.toMatch(/Skapa med guide|Spelplan|Spelarens roll/);
  } finally {
    await view.cleanup();
  }
});

it("creates a writer's own playable opening with local help and keeps the response when switching panels", async () => {
  const repo = new IndexedDBRepository(new IDBFactory(), "interview-first");
  const view = mountGuide(repo);
  const fetcher = vi.fn().mockRejectedValue(new Error("Offline"));
  vi.stubGlobal("fetch", fetcher);
  try {
    await view.open();
    const headings = () =>
      Array.from(view.host.querySelectorAll(".guide-plan h3"), (element) => element.textContent);
    expect(headings()).toEqual(["Din idé"]);
    expect(view.host.querySelector<HTMLDetailsElement>(".guide-plan details")?.open).toBe(false);
    await view.fill("Din idé", "En budcyklist hittar en övergiven väska.");
    expect(headings()).toEqual(["Din idé"]);
    await view.click("Nästa");
    await view.click("Gör öppningen spelbar");
    await view.fill("Spelarens roll", "Sam", ".guide-question");
    expect(headings()).toEqual(["Din idé", "Spelarroll"]);
    await view.click("Nästa");
    await view.fill("Platsens namn", "Stationen", ".guide-question");
    await view.click("Nästa");
    await view.fill("Ankomst", "En väska står ensam vid bänken.");
    await view.click("Nästa");
    await view.click("Be någon om hjälp");
    await view.click("Nästa");
    await view.click("Bolla med Assistenten");
    await view.click("Skicka till Assistenten");
    expect(view.host.textContent).toContain("Assistenten är inte tillgänglig just nu.");
    await view.click("Bolla med Assistenten");
    await view.click("Hjälp mig hitta på");
    await view.click("Personen vill ha något i gengäld.");
    await view.fill("Följd", "Perrongvärden ber Sam hålla upp dörren.");
    await view.click("Spelplan", ".guide-mobile-tabs");
    expect(view.host.querySelector(".guide-columns")?.getAttribute("data-pane")).toBe("plan");
    expect(view.field("Följd i spelplanen").value).toBe("Perrongvärden ber Sam hålla upp dörren.");
    await view.click("Spelflöde");
    expect(view.host.querySelector(".guide-plan")?.textContent).toContain("Perrongvärden ber Sam");
    await view.click("Guide", ".guide-mobile-tabs");
    expect(view.field("Följd").value).toBe("Perrongvärden ber Sam hålla upp dörren.");
    await view.click("Nästa");
    await view.click("Granska och skapa äventyr");
    const approve = Array.from(view.host.querySelectorAll("button")).find(
      (button) => button.textContent === "Godkänn och skapa",
    )!;
    await act(async () => {
      approve.click();
      approve.click();
    });
    await view.until(() => expect(view.host.textContent).toContain("Äventyret är sparat"));
    const [campaign] = await repo.listCampaigns();
    expect(await repo.listCampaigns()).toHaveLength(1);
    await view.click("Provspela från början");
    await view.until(() => expect(view.onStart).toHaveBeenCalledTimes(1));
    const [session] = view.onStart.mock.calls[0]!;
    expect(session.sceneId).toBe(campaign?.startSceneId);
    const engine = new StateEngine(session, new EventLog());
    const game = session.encounter!;
    const interaction = game.definition.interactions[0]!;
    engine.executeEncounterAction({
      id: "first-choice",
      expectedRevision: game.state.revision,
      expectedSceneId: game.definition.id,
      action: { kind: "interaction", interactionId: interaction.id },
    });
    expect(engine.getSession().encounter?.history[0]?.events).toContainEqual(
      expect.objectContaining({
        kind: "interaction",
        text: "Perrongvärden ber Sam hålla upp dörren.",
      }),
    );
    await view.click("Öppna Storyboard");
    expect(view.openStoryboard).toHaveBeenCalledWith(campaign?.id);
    await view.until(() =>
      expect(view.host.querySelector('[aria-label="Playable adventure editor"]')).not.toBeNull(),
    );
    expect(fetcher).not.toHaveBeenCalled();
  } finally {
    await view.cleanup();
    vi.unstubAllGlobals();
  }
});

function ollamaAnswer(answer: object | string) {
  return new Response(
    [
      JSON.stringify({
        message: { content: typeof answer === "string" ? answer : JSON.stringify(answer) },
      }),
      JSON.stringify({ done: true }),
      "",
    ].join("\n"),
  );
}

function mockGuideModel(complete: (init?: RequestInit) => Response | Promise<Response>) {
  const chat = vi.fn(complete);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/api/tags")) return Response.json({ models: [{ name: "guide:latest" }] });
      if (url.endsWith("/api/show")) return Response.json({ capabilities: ["completion"] });
      if (url.endsWith("/api/chat")) return chat(init);
      throw new Error(`Unexpected request to ${url}`);
    }),
  );
  return chat;
}

it("uses AI only on request, applies synopsis answers one by one, and plays the opening", async () => {
  const repo = new IndexedDBRepository(new IDBFactory(), "guide-synopsis");
  const draft = newGuideInterview();
  draft.premise =
    "Budcyklisten Sam kommer till stationen. En väska står vid bänken. Sam öppnar väskan och hittar ett brev.";
  draft.secrets = "Text som aldrig skickas till Assistenten";
  await repo.saveGuideInterview(draft, undefined);
  const chat = mockGuideModel(() =>
    ollamaAnswer({
      role: "Sam",
      place: "Stationen",
      arrival: "En väska står ensam vid bänken.",
      action: "Öppna väskan",
      outcome: "I väskan ligger ett brev.",
    }),
  );
  const view = mountGuide(repo, "sv", true);
  try {
    await view.open();
    await view.click("Tolka synopsis med AI");
    expect(chat).not.toHaveBeenCalled();
    await view.click("Tolka synopsis");
    await view.until(() => expect(view.host.textContent).toContain("I väskan ligger ett brev."));
    const request = JSON.parse(chat.mock.calls[0]?.[0]?.body as string);
    expect(request.model).toBe("guide:latest");
    expect(JSON.parse(request.messages[1].content)).toEqual({ synopsis: draft.premise });
    expect(await repo.loadGuideInterview()).toEqual(draft);
    const cards = Array.from(view.host.querySelectorAll(".guide-assistant-suggestion"));
    const apply = (index: number) => cards[index]!.querySelector("button")!;
    expect(apply(4).disabled).toBe(true);
    await act(async () => apply(0).click());
    await act(async () => {
      await vi.waitFor(async () => {
        const saved = await repo.loadGuideInterview();
        expect(saved?.role.name).toBe("Sam");
        expect(saved?.opening.place.name).toBe("");
      });
    });
    for (const index of [1, 2, 3, 4]) {
      expect(apply(index).disabled).toBe(false);
      await act(async () => apply(index).click());
    }
    await act(async () => {
      await vi.waitFor(async () => {
        const saved = await repo.loadGuideInterview();
        expect(saved?.choices[0]?.outcome).toBe("I väskan ligger ett brev.");
        expect(saved?.premise).toBe(draft.premise);
      });
    });
    await view.click("Nästa");
    await view.click("Granska och skapa äventyr");
    await view.click("Godkänn och skapa");
    await view.until(() => expect(view.host.textContent).toContain("Äventyret är sparat"));
    await view.click("Provspela från början");
    await view.until(() => expect(view.onStart).toHaveBeenCalledTimes(1));
    const [session] = view.onStart.mock.calls[0]!;
    const engine = new StateEngine(session, new EventLog());
    const game = session.encounter!;
    engine.executeEncounterAction({
      id: "ai-opening-choice",
      expectedRevision: game.state.revision,
      expectedSceneId: game.definition.id,
      action: { kind: "interaction", interactionId: game.definition.interactions[0]!.id },
    });
    expect(engine.getSession().encounter?.history[0]?.events).toContainEqual(
      expect.objectContaining({ kind: "interaction", text: "I väskan ligger ett brev." }),
    );
    expect(chat).toHaveBeenCalledTimes(1);
  } finally {
    await view.cleanup();
    localStorage.removeItem("sandboxai-preferred-model");
    vi.unstubAllGlobals();
  }
});

it("keeps discussion separate, recovers from invalid AI output, and cancels on leaving a question", async () => {
  const repo = new IndexedDBRepository(new IDBFactory(), "guide-discussion");
  const draft = newGuideInterview();
  draft.premise = "Ett tåg står still på en bro.";
  draft.question = "direction";
  draft.subject = "direction";
  await repo.saveGuideInterview(draft, undefined);
  let inFlight: AbortSignal | null | undefined;
  const chat = mockGuideModel(() => ollamaAnswer({}));
  chat
    .mockImplementationOnce(() => ollamaAnswer("Fel format"))
    .mockImplementationOnce(() =>
      ollamaAnswer({
        reply: "Bygg spänningen kring instängdheten.",
        suggestion: "Samarbeta under tidspress.",
      }),
    )
    .mockImplementationOnce(() =>
      ollamaAnswer({
        reply: "Nyfikenhet passar också.",
        suggestion: "Undersök varför tåget stannade.",
      }),
    )
    .mockImplementationOnce((init) => {
      inFlight = init?.signal;
      return new Promise((_, reject) => {
        inFlight?.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
      });
    });
  const view = mountGuide(repo, "sv", true);
  try {
    await view.open();
    await view.click("Bolla med Assistenten");
    await view.fill("Fråga eller idé att bolla", "Kan vi göra det spännande?");
    await view.click("Skicka till Assistenten");
    await view.until(() =>
      expect(view.host.textContent).toContain("Assistenten kunde inte ge ett svar."),
    );
    expect((await repo.loadGuideInterview())?.intention).toBe("");
    await view.click("Skicka till Assistenten");
    await view.until(() => expect(view.host.textContent).toContain("Samarbeta under tidspress."));
    expect(view.field("Vad spelaren ska uppleva", ".guide-question").value).toBe("");
    await view.fill("Vad spelaren ska uppleva", "Jag tänker mig nyfikenhet.", ".guide-question");
    const useSuggestion = view.host.querySelector<HTMLButtonElement>(
      ".guide-assistant-suggestion button",
    )!;
    expect(useSuggestion.disabled).toBe(true);
    await view.fill("Fråga eller idé att bolla", "Kan vi göra det mindre stressigt?");
    await view.click("Skicka till Assistenten");
    await view.until(() =>
      expect(view.host.textContent).toContain("Undersök varför tåget stannade."),
    );
    const body = JSON.parse(chat.mock.calls[2]?.[0]?.body as string);
    expect(JSON.parse(body.messages[1].content).history).toEqual([
      {
        message: "Kan vi göra det spännande?",
        reply: "Bygg spänningen kring instängdheten.",
        suggestion: "Samarbeta under tidspress.",
      },
    ]);
    await view.click("Använd som svar");
    await view.until(() =>
      expect(view.field("Vad spelaren ska uppleva", ".guide-question").value).toBe(
        "Undersök varför tåget stannade.",
      ),
    );
    await view.click("Skicka till Assistenten");
    await view.until(() => expect(inFlight).toBeDefined());
    await view.click("Nästa");
    expect(inFlight?.aborted).toBe(true);
    await act(async () => {
      await vi.waitFor(async () => {
        const saved = await repo.loadGuideInterview();
        expect(saved?.question).toBeNull();
        expect(saved?.intention).toBe("Undersök varför tåget stannade.");
      });
    });
  } finally {
    await view.cleanup();
    localStorage.removeItem("sandboxai-preferred-model");
    vi.unstubAllGlobals();
  }
});

it("previews and saves a mapped opening with a person, group, item and a linked second scene", async () => {
  const repo = new IndexedDBRepository(new IDBFactory(), "interview-map");
  const realm = newRealmTemplate({
    name: "Stenstaden",
    note: "",
    source: "player",
    worldMap: {
      routes: [],
      nodes: [
        {
          id: "square",
          name: "Torget",
          kind: "Landmark",
          x: 15,
          y: 20,
          description: "",
          population: "",
          characterIds: [],
          intro: "En port står på glänt.",
        },
        {
          id: "house",
          name: "Huset",
          kind: "Landmark",
          x: 45,
          y: 20,
          description: "",
          population: "",
          characterIds: [],
        },
      ],
    },
  });
  await repo.saveRealm(realm);
  const view = mountGuide(repo);
  try {
    await view.open();
    await view.fill("Din idé", "En vakt ska lämna ett besked.");
    await view.reveal("Spelarroll");
    await view.reveal("Öppning");
    await view.fill("Spelarens roll", "Vakten", ".guide-plan");
    await view.fill(
      "Plats på befintlig karta",
      JSON.stringify([realm.id, "square"]),
      ".guide-plan",
    );
    await view.click("Nästa");
    await view.click("Gör öppningen spelbar");
    await view.click("Använd platsens introduktion");
    await view.click("Nästa");
    await view.fill("Handling", "Lämna beskedet");
    await view.click("Nästa");
    await view.fill("Följd", "Dörrvakten bjuder in dig.");
    await view.click("Nästa");
    await view.reveal("Senare scener");
    await view.click("Lägg till scenutkast", ".guide-plan");
    await view.fill("Scenens namn", "Huset", ".guide-plan");
    await view.fill("Vad händer?", "Beskedet når fram.", ".guide-plan");
    const later = ".guide-plan-section fieldset:has(legend)";
    await view.fill("Plats på befintlig karta", JSON.stringify([realm.id, "house"]), later);
    const destination = view.field("Gå till en senare scen", ".guide-plan") as HTMLSelectElement;
    const destinationId = destination.options[1]!.value;
    await view.fill("Gå till en senare scen", destinationId, ".guide-plan");
    await view.fill("Platsens namn", "", later);
    expect(destination.value).toBe(destinationId);
    expect(destination.selectedOptions[0]?.text).toBe("Huset");
    expect(view.host.textContent).toContain("Resmålet ”Huset” för ”Lämna beskedet” saknar plats.");
    expect(view.host.textContent).not.toContain("Granska och skapa äventyr");
    await view.click("Visa fältet i spelplanen");
    expect(document.activeElement).toBe(view.field("Platsens namn", later));
    await view.until(() =>
      expect(view.host.querySelector(".guide-columns")?.getAttribute("data-pane")).toBe("plan"),
    );
    const incomplete = await repo.loadGuideInterview();
    await expect(repo.approveGuideInterview(incomplete!)).rejects.toThrow("saknar plats");
    expect(await repo.listCampaigns()).toEqual([]);
    expect(await repo.listObjects()).toEqual([]);
    await view.click("Ta bort kopplingen", ".guide-plan");
    expect(view.host.textContent).toContain("Granska och skapa äventyr");
    await view.fill("Plats på befintlig karta", JSON.stringify([realm.id, "house"]), later);
    await view.fill("Gå till en senare scen", destinationId, ".guide-plan");
    await view.reveal("Värld och material");
    await view.click("Lägg till person", ".guide-plan");
    await view.fill("Namn på person", "Dörrvakten", ".guide-plan");
    await view.click("Lägg till grupp", ".guide-plan");
    await view.fill("Namn på grupp", "Stadsvakten", ".guide-plan");
    await view.click("Lägg till grupp", ".guide-plan");
    const inputs = view.host.querySelectorAll<HTMLInputElement>(".guide-plan fieldset input");
    const secondGroup = Array.from(inputs).filter(
      (input) => input.parentElement?.firstElementChild?.textContent === "Namn på grupp",
    )[1]!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        secondGroup,
        "Motståndet",
      );
      secondGroup.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await view.click("Lägg till föremål", ".guide-plan");
    await view.fill("Namn på föremål", "Förseglat besked", ".guide-plan");
    await view.click("Granska och skapa äventyr");
    await view.click("Godkänn och skapa");
    await view.until(() => expect(view.host.textContent).toContain("Äventyret är sparat"));
    const [campaign] = await repo.listCampaigns();
    expect(campaign?.mapWorldId).toBe(realm.id);
    expect(campaign?.scenes.map(({ mapNodeId }) => mapNodeId)).toEqual(["square", "house"]);
    expect(campaign?.sceneLinks).toHaveLength(1);
    expect((await repo.listObjects()).map(({ name }) => name)).toEqual(["Förseglat besked"]);
    const person = (await repo.listCharacters()).find(({ name }) => name === "Dörrvakten");
    expect(person).toBeDefined();
    expect(person?.factionIds ?? []).toEqual([]);
    expect((await repo.listFactions()).map(({ name }) => name)).toEqual([
      "Motståndet",
      "Stadsvakten",
    ]);
    expect(await repo.loadRealm(realm.id)).toEqual(realm);
  } finally {
    await view.cleanup();
  }
});

it("keeps a synopsis, reused place and a deferred question across close and reopen", async () => {
  const repo = new IndexedDBRepository(new IDBFactory(), "interview-resume");
  const realm = newRealmTemplate({ name: "Kusten", note: "", source: "player" });
  const place = newPlaceTemplate({
    realmId: realm.id,
    name: "Gamla kajen",
    note: "Vattnet ligger spegelblankt.",
  });
  await repo.saveRealm(realm);
  await repo.savePlace(place);
  const view = mountGuide(repo);
  try {
    await view.open();
    const premise =
      "Tilde letar efter sin syster. En uppslagen liggare på kajen kan ge henne det första spåret.";
    await view.fill("Din idé", premise);
    await view.click("Öppna översikten");
    await view.reveal("Spelarroll");
    await view.reveal("Öppning");
    await view.fill("Spelarens roll", "Tilde", ".guide-plan");
    await view.fill("Befintlig plats", place.id, ".guide-plan");
    await view.click("Guide", ".guide-mobile-tabs");
    await view.click("Nästa");
    await view.click("Gör öppningen spelbar");
    expect(view.host.querySelector(".guide-question h2")?.textContent).toBe(
      "Vad lägger spelaren märke till först?",
    );
    await view.fill("Ankomst i spelplanen", "En liggare ligger uppslagen.", ".guide-plan");
    await view.click("Nästa");
    expect(view.host.querySelector(".guide-question h2")?.textContent).toBe(
      "Vad skulle spelaren kunna prova här?",
    );
    await view.click("Bestäm senare");
    await view.click("Hitta en riktning");
    await view.fill("Vad spelaren ska uppleva", "Upptäcka en familjehemlighet.");
    await view.click("Stäng guiden");
    await view.until(() => expect(view.host.textContent).toContain("Öppna guiden igen"));
    await view.click("Öppna guiden igen");
    await view.until(() =>
      expect(view.host.querySelector(".guide-question h2")?.textContent).toBe(
        "Vad skulle du vilja att spelaren får uppleva?",
      ),
    );
    expect(view.host.querySelector(".guide-original")?.textContent).toBe(premise);
    expect(view.field("Befintlig plats", ".guide-plan").value).toBe(place.id);
    await view.click("Vad skulle spelaren kunna prova här?", ".guide-question");
    await view.fill("Handling", "Läs liggaren");
    await view.click("Nästa");
    await view.fill("Följd", "Din syster skrev in sig i går.");
    await view.click("Nästa");
    await view.click("Granska och skapa äventyr");
    expect(view.host.querySelector(".guide-question")?.textContent).toContain(
      "Återanvänds: Gamla kajen",
    );
    await view.click("Godkänn och skapa");
    await view.until(() => expect(view.host.textContent).toContain("Äventyret är sparat"));
    const [campaign] = await repo.listCampaigns();
    expect(campaign?.scenes[0]?.placeId).toBe(place.id);
    expect(campaign?.scenes[0]?.encounter?.definition.description).toBe(
      "En liggare ligger uppslagen.",
    );
    expect(await repo.listPlaces()).toHaveLength(1);
  } finally {
    await view.cleanup();
  }
});

function reviewableInterview() {
  const draft = newGuideInterview();
  return {
    ...draft,
    premise: "En skådespelare tappar sitt manus.",
    role: { name: "Skådespelaren", note: "" },
    opening: {
      ...draft.opening,
      place: { name: "Logen" },
      arrival: "Det första manuset ligger på stolen.",
    },
    choices: [
      { ...newGuideChoice(), label: "Ta upp manuset", outcome: "Du känner igen första repliken." },
    ],
  };
}

it("stops approval of an old preview and requires reviewing the newly saved opening", async () => {
  const factory = new IDBFactory();
  const repo = new IndexedDBRepository(factory, "interview-review-conflict");
  const otherTab = new IndexedDBRepository(factory, "interview-review-conflict");
  const initial = reviewableInterview();
  await repo.saveGuideInterview(initial, undefined);
  const view = mountGuide(repo);
  try {
    await view.open();
    await view.click("Granska och skapa äventyr");
    const changed = {
      ...initial,
      revision: initial.revision + 1,
      opening: { ...initial.opening, arrival: "Det nya manuset ligger på golvet." },
    };
    await otherTab.saveGuideInterview(changed, initial);
    await view.click("Godkänn och skapa");
    await view.until(() => expect(view.host.textContent).toContain("granska den nya versionen"));
    expect(await repo.listCampaigns()).toEqual([]);
    expect(await repo.listRealms()).toEqual([]);
    expect(await repo.listPlaces()).toEqual([]);
    expect(await repo.listObjects()).toEqual([]);
    expect(await repo.loadGuideInterview()).toEqual(changed);

    await view.click("Öppna senaste utkastet");
    await view.until(() =>
      expect(view.field("Ankomst i spelplanen", ".guide-plan").value).toBe(changed.opening.arrival),
    );
    expect(view.host.textContent).not.toContain("Godkänn och skapa");
    await view.click("Granska och skapa äventyr");
    await view.click("Godkänn och skapa");
    await view.until(() => expect(view.host.textContent).toContain("Äventyret är sparat"));
    const [created] = await repo.listCampaigns();
    expect(created?.scenes[0]?.encounter?.definition.description).toBe(changed.opening.arrival);
    expect((await otherTab.approveGuideInterview(changed)).id).toBe(created?.id);
    expect(await repo.listCampaigns()).toHaveLength(1);
  } finally {
    await view.cleanup();
  }
});

it("rejects autosave from an old tab even if its local revision is higher", async () => {
  const factory = new IDBFactory();
  const repo = new IndexedDBRepository(factory, "interview-autosave-conflict");
  const otherTab = new IndexedDBRepository(factory, "interview-autosave-conflict");
  const initial = reviewableInterview();
  await repo.saveGuideInterview(initial, undefined);
  const view = mountGuide(repo);
  try {
    await view.open();
    const current = { ...initial, revision: initial.revision + 1, title: "Nyare titel" };
    await otherTab.saveGuideInterview(current, initial);
    await view.fill("Äventyrets titel", "Gammal flik", ".guide-plan");
    await view.until(() =>
      expect(view.host.textContent).toContain("Guiden har ändrats i en annan flik"),
    );
    await expect(
      repo.saveGuideInterview({ ...initial, revision: current.revision + 10 }, initial),
    ).rejects.toBeInstanceOf(GuideInterviewConflictError);
    expect(await repo.loadGuideInterview()).toEqual(current);

    const otherDraft = { ...current, id: crypto.randomUUID() };
    await otherTab.saveGuideInterview(otherDraft, current);
    await expect(repo.approveGuideInterview(current)).rejects.toBeInstanceOf(
      GuideInterviewConflictError,
    );
    expect(await repo.loadGuideInterview()).toEqual(otherDraft);
    expect(await repo.listCampaigns()).toEqual([]);
  } finally {
    await view.cleanup();
  }
});
