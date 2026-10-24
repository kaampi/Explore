import { describe, it, expect } from "vitest";
import { EventLog } from "@events/EventLog";
import { StateEngine } from "@state/StateEngine";
import {
  nextPartyAfterPlayerText,
  nextPendingAfterOffer,
  partySlots,
  waitlistSlots,
  sameHere,
  isLeftBehind,
  wantsToJoinPlayerParty,
  canAcceptParty,
  nextPendingAfterIds
} from "@state/party";
import { spatialWritesForTurn } from "@state/playerDestination";
import { EXAMPLE_AURORA_ROOMS } from "@library/exampleTemplates";
import type { Session } from "@state/StateSchema";

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    openedRoomIds: [],
    storyFlags: [],
    partyHoldIds: [],
    schemaVersion: 2,
    id: "s1",
    runtime: { model: "test", temperature: 0.7, seed: null, provider: "test" },
    stateVersion: 0,
    characters: {
      emma: {
        name: "Emma",
        position: { value: "behind the bar", lock: "unlocked" },
        mood: { value: "neutral", lock: "unlocked" }
      }
    },
    scene: {
      location: "The Aurora Room — a quiet late-night bar",
      environment: {},
      rooms: EXAMPLE_AURORA_ROOMS
    },
    player: {
      position: { value: "at the bar", lock: "unlocked" },
      status: { value: "awake", lock: "unlocked" }
    },
    partyIds: [],
    partyPendingIds: [],
    relationships: {},
    layers: [],
    memory: { episodic: [], semantic: [], relational: [] },
    conversation: [],
    events: [],
    snapshots: [],
    diagnostics: [],
    ...overrides
  };
}

describe("party", () => {
  it("treats Emma behind the bar as Here with the player", () => {
    expect(sameHere(makeSession(), "behind the bar")).toBe(true);
    expect(sameHere(makeSession(), "Emma's room")).toBe(false);
    expect(isLeftBehind(makeSession(), "emma")).toBe(false);
    expect(
      isLeftBehind(
        makeSession({
          player: {
            position: { value: "Market Streets", lock: "unlocked" },
            status: { value: "awake", lock: "unlocked" }
          },
          characters: {
            emma: {
              name: "Emma",
              position: { value: "Emma's room", lock: "unlocked" },
              mood: { value: "neutral", lock: "unlocked" }
            }
          }
        }),
        "emma"
      )
    ).toBe(true);
  });

  it("shows three empty companion slots beside the player", () => {
    expect(partySlots(makeSession()).map((slot) => slot.kind)).toEqual(["empty", "empty", "empty"]);
    expect(waitlistSlots(makeSession()).map((slot) => slot.kind)).toEqual(["empty", "empty"]);
  });

  it("reads an offer to join the player, not an invitation to follow the NPC", () => {
    expect(wantsToJoinPlayerParty('Emma nods. "I\'ll come with you."')).toBe(true);
    expect(wantsToJoinPlayerParty("She follows you to the door.")).toBe(true);
    expect(wantsToJoinPlayerParty('"I\'m in," she says.')).toBe(true);
    expect(wantsToJoinPlayerParty('"I\'m with you. Lead the way."')).toBe(true);
    expect(wantsToJoinPlayerParty("I'm in the room")).toBe(false);
    expect(wantsToJoinPlayerParty("A little more won't scare me off.")).toBe(true);
    expect(wantsToJoinPlayerParty('"If you\'re offering a chance to break free and make our own way, I\'m interested."')).toBe(
      true
    );
    expect(wantsToJoinPlayerParty('"I\'ll come back tomorrow."')).toBe(false);
    expect(wantsToJoinPlayerParty('"Follow me."')).toBe(false);
    expect(wantsToJoinPlayerParty('"Come with me."')).toBe(false);
    expect(wantsToJoinPlayerParty('"Aye, I\'ll come," she says.')).toBe(true);
    expect(
      wantsToJoinPlayerParty(
        "'We're in this together, partner. Where you go, we go. Count on it.' Emma nods. 'We've got your back.'"
      )
    ).toBe(true);
  });

  it("puts the speaker on Prospects, not someone whose room was named", () => {
    const session = makeSession({
      characters: {
        emma: {
          name: "Emma",
          position: { value: "behind the bar", lock: "unlocked" },
          mood: { value: "n", lock: "unlocked" }
        },
        vikky: {
          name: "Vikky",
          position: { value: "behind the bar", lock: "unlocked" },
          mood: { value: "n", lock: "unlocked" }
        }
      }
    });
    expect(
      nextPendingAfterOffer(
        session,
        "vikky",
        "Vikky's gaze flicks up. 'Aye, I'm in,' she replies. 'Emma's room is just through that door.'"
      )
    ).toEqual(["vikky"]);
  });

  it("puts named companions on Prospects when they say they go where you go", () => {
    const session = makeSession({
      characters: {
        emma: {
          name: "Emma",
          position: { value: "Emma's room", lock: "unlocked" },
          mood: { value: "n", lock: "unlocked" }
        },
        vikky: {
          name: "Vikky",
          position: { value: "Emma's room", lock: "unlocked" },
          mood: { value: "n", lock: "unlocked" }
        }
      }
    });
    const reply =
      "Vikky's grin widens. 'You know it, Moe. When you call, we answer.' She squeezes his arm. 'We're in this together, partner. Where you go, we go. Count on it.' Emma nods. 'We've got your back, Moe.'";
    expect(nextPendingAfterOffer(session, "vikky", reply)).toEqual(
      expect.arrayContaining(["vikky", "emma"])
    );
    expect(nextPendingAfterOffer(session, "vikky", reply)).toHaveLength(2);
  });

  it("lets Pass 2 name people onto Prospects without a canned phrase", () => {
    const session = makeSession({
      characters: {
        emma: {
          name: "Emma",
          position: { value: "Emma's room", lock: "unlocked" },
          mood: { value: "n", lock: "unlocked" }
        },
        vikky: {
          name: "Vikky",
          position: { value: "Emma's room", lock: "unlocked" },
          mood: { value: "n", lock: "unlocked" }
        }
      }
    });
    expect(nextPendingAfterIds(session, ["Vikky", "emma"])).toEqual(["vikky", "emma"]);
    expect(nextPendingAfterIds({ ...session, partyIds: ["emma"] }, ["emma"])).toBeUndefined();
    expect(nextPendingAfterIds(session, ["nobody"])).toBeUndefined();
  });

  it("does not join from player text; leave-behind waits here for later", () => {
    const session = makeSession({ partyIds: ["emma"] });
    expect(nextPartyAfterPlayerText(session, "Let's go", "emma").partyIds).toEqual(["emma"]);
    expect(nextPartyAfterPlayerText(session, "I go alone", "emma")).toEqual({
      partyIds: [],
      partyPendingIds: ["emma"]
    });
    expect(nextPartyAfterPlayerText(session, "Wait here", "emma")).toEqual({
      partyIds: [],
      partyPendingIds: ["emma"]
    });
  });

  it("puts named people from a group beat on Prospects", () => {
    const session = makeSession({
      characters: {
        emma: {
          name: "Emma",
          position: { value: "behind the bar", lock: "unlocked" },
          mood: { value: "n", lock: "unlocked" }
        },
        leah: {
          name: "Leah",
          position: { value: "Emma's room", lock: "unlocked" },
          mood: { value: "n", lock: "unlocked" }
        },
        vikky: {
          name: "Vikky",
          position: { value: "Emma's room", lock: "unlocked" },
          mood: { value: "n", lock: "unlocked" }
        }
      }
    });
    const reply =
      'Leah lets out a laugh. "A little more won\'t scare me off." Vikky steps forward. "I\'m interested."';
    expect(nextPendingAfterOffer(session, "emma", reply)).toEqual(["leah", "vikky"]);
  });

  it("puts an offer on Prospects, not in the traveling party", () => {
    const session = makeSession();
    expect(nextPendingAfterOffer(session, "emma", '"I\'ll come with you."')).toEqual(["emma"]);
    expect(partySlots({ ...session, partyPendingIds: ["emma"] }).map((slot) => slot.kind)).toEqual([
      "empty",
      "empty",
      "empty"
    ]);
    expect(waitlistSlots({ ...session, partyPendingIds: ["emma"] })[0]).toMatchObject({
      kind: "pending",
      id: "emma",
      name: "Emma"
    });
  });

  it("caps the later waitlist at two, even if the party is full", () => {
    const session = makeSession({
      characters: {
        emma: { name: "Emma", position: { value: "bar", lock: "unlocked" }, mood: { value: "n", lock: "unlocked" } },
        lars: { name: "Lars", position: { value: "bar", lock: "unlocked" }, mood: { value: "n", lock: "unlocked" } },
        nia: { name: "Nia", position: { value: "bar", lock: "unlocked" }, mood: { value: "n", lock: "unlocked" } },
        jo: { name: "Jo", position: { value: "bar", lock: "unlocked" }, mood: { value: "n", lock: "unlocked" } },
        kit: { name: "Kit", position: { value: "bar", lock: "unlocked" }, mood: { value: "n", lock: "unlocked" } },
        rey: { name: "Rey", position: { value: "bar", lock: "unlocked" }, mood: { value: "n", lock: "unlocked" } }
      },
      partyIds: ["emma", "lars", "nia"],
      partyPendingIds: ["jo"]
    });
    expect(nextPendingAfterOffer(session, "kit", '"I\'ll come with you."')).toEqual(["jo", "kit"]);
    expect(
      nextPendingAfterOffer({ ...session, partyPendingIds: ["jo", "kit"] }, "rey", '"I\'ll come with you."')
    ).toBeUndefined();
  });

  it("moves accepted members on a walk, not pending ones", () => {
    expect(
      spatialWritesForTurn(makeSession({ partyIds: ["emma"] }), "I walk into the toilets", "emma")
    ).toEqual(
      expect.arrayContaining([
        { path: "player.position", value: "toilets" },
        { path: "characters.emma.position", value: "toilets" }
      ])
    );
    expect(spatialWritesForTurn(makeSession({ partyPendingIds: ["emma"] }), "I walk into the toilets", "emma")).toEqual([
      { path: "player.position", value: "toilets" }
    ]);
  });

  it("Stay keeps them in the party and does not walk them", () => {
    const session = makeSession({ partyIds: ["emma"], partyHoldIds: ["emma"] });
    expect(spatialWritesForTurn(session, "I walk into the toilets", "emma")).toEqual([
      { path: "player.position", value: "toilets" }
    ]);
    expect(
      isLeftBehind(
        makeSession({
          partyIds: ["emma"],
          partyHoldIds: ["emma"],
          player: {
            position: { value: "toilets", lock: "unlocked" },
            status: { value: "awake", lock: "unlocked" }
          },
          characters: {
            emma: {
              name: "Emma",
              position: { value: "behind the bar", lock: "unlocked" },
              mood: { value: "neutral", lock: "unlocked" }
            }
          }
        }),
        "emma"
      )
    ).toBe(true);
  });

  it("accepts a waitlist offer only when they are here, and leave keeps them recruitable", () => {
    const engine = new StateEngine(makeSession(), new EventLog());
    engine.setPartyMember("emma", true);
    expect(engine.getSession().partyIds).toEqual([]);
    engine.offerPartyFromReply("emma", '"I\'ll come with you."');
    expect(engine.getSession().partyPendingIds).toEqual(["emma"]);
    engine.acceptParty("emma");
    expect(engine.getSession().partyIds).toEqual(["emma"]);
    expect(engine.getSession().partyPendingIds).toEqual([]);
    engine.holdParty("emma");
    expect(engine.getSession().partyHoldIds).toEqual(["emma"]);
    engine.followParty("emma");
    expect(engine.getSession().partyHoldIds).toEqual([]);
    engine.holdParty("emma");
    engine.leaveParty("emma");
    expect(engine.getSession().partyIds).toEqual([]);
    expect(engine.getSession().partyHoldIds ?? []).toEqual([]);
    expect(engine.getSession().partyPendingIds).toEqual(["emma"]);
    expect(canAcceptParty(engine.getSession(), "emma")).toBe(true);
    const inLadies = {
      ...engine.getSession(),
      player: {
        ...engine.getSession().player!,
        position: { value: "Ladies Room", lock: "unlocked" as const }
      }
    };
    expect(canAcceptParty(inLadies, "emma")).toBe(true);
    const inRoom = {
      ...engine.getSession(),
      player: {
        ...engine.getSession().player!,
        position: { value: "Emma's room", lock: "unlocked" as const }
      },
      characters: {
        ...engine.getSession().characters,
        emma: {
          ...engine.getSession().characters.emma!,
          position: { value: "with Moe", lock: "unlocked" as const }
        }
      }
    };
    expect(canAcceptParty(inRoom, "emma")).toBe(true);
    const elsewhere = {
      ...engine.getSession(),
      player: {
        ...engine.getSession().player!,
        position: { value: "Market Streets", lock: "unlocked" as const }
      }
    };
    expect(canAcceptParty(elsewhere, "emma")).toBe(false);
  });
});

