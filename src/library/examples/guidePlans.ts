import type { GuidePlanInput } from "../adventureGuidePlan";

const sister = "Systern lever och har flytt från organisationen som letar efter henne.";

export const lighthouseExample = {
  answers: { premise: "En man får ett överraskande brev.", authorNote: sister },
  plan: {
    title: "Fyrvaktarens brev",
    playerName: "Fyrvaktaren",
    playerIntro: "Ett oväntat brev når dig på fyren.",
    world: { name: "Fyrkusten", note: "En vindpinad fyr med en liten hamn." },
    startSceneId: "lighthouse",
    places: [
      { id: "lighthouse", name: "Fyren", position: { x: 16, y: 46 } },
      { id: "shed", name: "Sjöboden", position: { x: 56, y: 22 }, visibility: "arrival" },
      { id: "harbor", name: "Hamnen", position: { x: 56, y: 73 } },
    ],
    items: [
      {
        id: "letter",
        name: "Det oväntade brevet",
        description: "Ett saltfläckat kuvert, adresserat till fyrvaktaren.",
        readableContent: "När ljuset slocknar, räkna till tre. Leta där tjäran aldrig torkar.",
      },
    ],
    scenes: [
      {
        kind: "playable",
        id: "lighthouse",
        name: "Fyren",
        placeId: "lighthouse",
        arrival: "Vinden dånar runt fyren. Ett oväntat brev ligger i din hand.",
        actions: [
          {
            id: "read",
            label: "Läs brevet",
            requiresItems: ["letter"],
            outcome: "Brevet använder samma gåta som du lekte med som barn.",
            learned: "Brevets gåta handlar om den tjärade sjöboden och den tredje brädan.",
            setsFlags: ["letter-read"],
          },
          {
            id: "decipher",
            label: "Tyd ledtråden",
            outcome: "Du förstår vilken sjöbod brevet syftar på.",
            requiresFlags: ["letter-read"],
            excludesFlags: ["harbor-chosen"],
            setsFlags: ["shed-chosen"],
          },
          {
            id: "ask",
            label: "Fråga i hamnen",
            outcome: "Du beslutar att fråga hamnarbetaren om brevet.",
            requiresFlags: ["letter-read"],
            excludesFlags: ["shed-chosen"],
            setsFlags: ["harbor-chosen"],
          },
        ],
      },
      {
        kind: "playable",
        id: "shed",
        name: "Sjöboden",
        placeId: "shed",
        arrival:
          "I sjöboden ligger en reservnyckel under den tredje brädan. Ingen har följt efter dig.",
      },
      {
        kind: "playable",
        id: "harbor",
        name: "Hamnen",
        placeId: "harbor",
        arrival: "Hamnarbetaren tystnar. När du går märker du att en främling följer efter dig.",
      },
      { kind: "draft", id: "reunion", name: "Återföreningen", note: sister },
    ],
    links: [
      {
        id: "to-shed",
        fromSceneId: "lighthouse",
        toSceneId: "shed",
        label: "Gå till sjöboden",
        requiresFlags: ["letter-read", "shed-chosen"],
        requiresAbsentFlags: ["harbor-chosen"],
      },
      {
        id: "to-harbor",
        fromSceneId: "lighthouse",
        toSceneId: "harbor",
        label: "Gå till hamnen",
        requiresFlags: ["letter-read", "harbor-chosen"],
        requiresAbsentFlags: ["shed-chosen"],
        setsFlags: ["followed"],
      },
    ],
  } satisfies GuidePlanInput,
};

export const musicianExample = {
  answers: { premise: "En musiker behöver en plats för kvällens konsert.", authorNote: "" },
  plan: {
    title: "Kvällens konsert",
    playerName: "Musikern",
    playerIntro: "Publiken är på väg. Du behöver någonstans att spela.",
    world: { name: "Kvarteret", note: "En stadsdel med ett konserthus och ett torg." },
    startSceneId: "foyer",
    places: [
      { id: "foyer", name: "Foajén", position: { x: 20, y: 50 } },
      { id: "hall", name: "Konsertlokalen", position: { x: 65, y: 25 } },
      { id: "square", name: "Torget", position: { x: 65, y: 75 } },
    ],
    scenes: [
      {
        kind: "playable",
        id: "foyer",
        name: "Foajén",
        placeId: "foyer",
        arrival: "Du står i foajén med kvällens konsertprogram.",
        actions: [
          {
            id: "negotiate",
            label: "Förhandla om lokalen",
            outcome: "Lokalvärden säger ja till en kortare konsert.",
            excludesFlags: ["square-chosen"],
            setsFlags: ["hall-booked"],
          },
          {
            id: "take-square",
            label: "Spela på torget",
            outcome: "Du ber publiken möta dig på torget.",
            excludesFlags: ["hall-booked"],
            setsFlags: ["square-chosen"],
          },
        ],
      },
      {
        kind: "playable",
        id: "hall",
        name: "Konsertlokalen",
        placeId: "hall",
        arrival: "Värden öppnar konsertlokalen. Du har en timme på scen.",
      },
      {
        kind: "playable",
        id: "square",
        name: "Torget",
        placeId: "square",
        arrival: "På torget samlas förbipasserande och lämnar plats för dig.",
      },
    ],
    links: [
      {
        id: "to-hall",
        fromSceneId: "foyer",
        toSceneId: "hall",
        label: "Gå in i konsertlokalen",
        requiresFlags: ["hall-booked"],
      },
      {
        id: "to-square",
        fromSceneId: "foyer",
        toSceneId: "square",
        label: "Gå till torget",
        requiresFlags: ["square-chosen"],
        setsFlags: ["street-concert"],
      },
    ],
  } satisfies GuidePlanInput,
};
