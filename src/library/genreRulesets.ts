import { RulesetTemplateSchema, type RulesetTemplate } from "./LibrarySchema";

const STAMP = "2026-01-01T00:00:00.000Z";
const covers: Readonly<Record<string, string>> = {
  "example-ruleset-fantasy": "/rulesets/fantasy.webp",
  "example-ruleset-scifi": "/rulesets/sci-fi.webp",
  "example-ruleset-noir": "/rulesets/noir.webp",
  "example-ruleset-horror": "/rulesets/horror.webp",
  "example-ruleset-cozy": "/rulesets/cozy.webp",
  "example-ruleset-romance": "/rulesets/romance.webp",
  "example-ruleset-reality": "/rulesets/contemporary.webp",
};

export function bundledRulesetCover(id: string) {
  return Object.hasOwn(covers, id) ? covers[id] : undefined;
}

type Value = [id: string, name: string, high: string, low: string, maxShift?: number];

/** Genre sheets use the standard 0–100 scale for skills and meters. */
function genreRuleset(args: {
  id: string;
  name: string;
  playerHealth: number;
  values: Value[];
}): RulesetTemplate {
  return RulesetTemplateSchema.parse({
    id: args.id,
    name: args.name,
    imageDataUrl: bundledRulesetCover(args.id),
    playerHealth: args.playerHealth,
    attributes: args.values.map(([id, name, highMeaning, lowMeaning, maxShift]) => ({
      id,
      name,
      kind: "number",
      min: 0,
      max: 100,
      highMeaning,
      lowMeaning,
      ...(maxShift ? { maxShift } : {}),
    })),
    source: "example",
    createdAt: STAMP,
    updatedAt: STAMP,
  });
}

const MELEE: Value = [
  "melee",
  "Melee",
  "Fights well up close, with a weapon or bare hands.",
  "Fights badly up close and is better off avoiding it.",
];
const RANGED: Value = [
  "ranged",
  "Ranged",
  "Hits what they aim at, even at a distance.",
  "Misses more often than not at a distance.",
];

export function exampleGenreRulesets(): RulesetTemplate[] {
  return [
    genreRuleset({
      id: "example-ruleset-scifi",
      name: "Sci-fi",
      playerHealth: 20,
      values: [
        [
          "tech",
          "Tech",
          "Repairs, hacks and bends machines to their will.",
          "Is lost around machines and breaks what they touch.",
        ],
        [
          "piloting",
          "Piloting",
          "Flies anything with steady hands, in a dock or in a firefight.",
          "Should not be given the controls.",
        ],
        [
          "science",
          "Science",
          "Understands how things work and notices what does not add up.",
          "Takes what the instruments say on trust.",
        ],
        [
          "composure",
          "Composure",
          "Stays calm when the alarms go off and decisions cost lives.",
          "Freezes or snaps when pressure rises.",
        ],
        MELEE,
        [
          "ranged",
          "Ranged",
          "Hits what they aim at with a sidearm or a rifle, even across a deck.",
          "Misses more often than not and is a danger to the crew.",
        ],
      ],
    }),
    genreRuleset({
      id: "example-ruleset-noir",
      name: "Noir",
      playerHealth: 15,
      values: [
        [
          "perception",
          "Perception",
          "Sees the detail that gives a liar away: a stain, a wrong word, a lit window.",
          "Walks past the clue and believes the first story they hear.",
        ],
        [
          "persuasion",
          "Persuasion",
          "Talks people into telling more than they meant to.",
          "Is brushed off, lied to and shown the door.",
        ],
        [
          "contacts",
          "Contacts",
          "Knows someone in every bar, precinct and back office.",
          "Is a stranger everywhere and has no one to call.",
        ],
        [
          "nerve",
          "Nerve",
          "Keeps a straight face with a gun in the room and a threat in the air.",
          "Sweats, stammers and gives themselves away.",
        ],
        MELEE,
        RANGED,
      ],
    }),
    genreRuleset({
      id: "example-ruleset-horror",
      name: "Horror",
      playerHealth: 12,
      values: [
        [
          "nerve",
          "Nerve",
          "Goes on when something moves in the dark.",
          "Bolts, freezes or screams at the first sign of it.",
        ],
        [
          "perception",
          "Perception",
          "Hears the step on the stairs and sees what is wrong with the room.",
          "Notices too late.",
        ],
        [
          "agility",
          "Agility",
          "Slips away, climbs, hides and gets out in time.",
          "Is slow, loud and easy to catch.",
        ],
        [
          "strength",
          "Strength",
          "Forces a door, drags a body, holds on.",
          "Is overpowered by almost anything.",
        ],
        [
          "sanity",
          "Sanity",
          "Keeps hold of what is real, even after what they have seen.",
          "Sees things that are not there and cannot trust their own mind.",
          10,
        ],
        [
          "melee",
          "Melee",
          "Fights back when cornered, with whatever is at hand.",
          "Fighting is the last thing that will help; running is better.",
        ],
      ],
    }),
    genreRuleset({
      id: "example-ruleset-cozy",
      name: "Cozy",
      playerHealth: 10,
      values: [
        [
          "care",
          "Care",
          "Notices who needs a hand, a word or a cup of tea.",
          "Means well but misses what others need.",
        ],
        [
          "curiosity",
          "Curiosity",
          "Asks the question that opens a story and finds what was hidden.",
          "Lets things be, and what is hidden stays hidden.",
        ],
        [
          "handiness",
          "Handiness",
          "Bakes, mends and makes things that turn out well.",
          "Burns the bread and drops the cup, with good cheer.",
        ],
        [
          "calm",
          "Calm",
          "Settles a room and takes the heat out of a quarrel.",
          "Fusses, rushes and stirs things up.",
        ],
        [
          "humor",
          "Humor",
          "Makes people laugh, even on a grey day.",
          "The joke lands flat, kindly.",
        ],
      ],
    }),
    genreRuleset({
      id: "example-ruleset-romance",
      name: "Romance",
      playerHealth: 10,
      values: [
        [
          "charm",
          "Charm",
          "Makes people feel seen and wants more of their company.",
          "Is awkward and overlooked at the party.",
        ],
        [
          "empathy",
          "Empathy",
          "Reads what is meant behind what is said.",
          "Misses the hint and says the wrong thing at the wrong time.",
        ],
        [
          "humor",
          "Humor",
          "Breaks the ice and makes a quiet moment light.",
          "The joke falls flat, and the silence after it is long.",
        ],
        [
          "courage",
          "Courage",
          "Says what they feel and takes the first step.",
          "Waits, hints and lets the moment pass.",
        ],
        [
          "honesty",
          "Honesty",
          "Is plain about what they want and what they have done.",
          "Hides behind half-truths, and it shows.",
        ],
      ],
    }),
    genreRuleset({
      id: "example-ruleset-reality",
      name: "Contemporary",
      playerHealth: 20,
      values: [
        [
          "observation",
          "Observation",
          "Notices subtle details and changes in familiar surroundings.",
          "Misses details unless someone points them out.",
        ],
        [
          "persuasion",
          "Persuasion",
          "Makes a clear case and finds a compromise people can accept.",
          "Has trouble getting a point across or finding common ground.",
        ],
        [
          "practical-skills",
          "Practical skills",
          "Improvises with everyday tools and fixes routine problems.",
          "Needs time or help with unfamiliar tasks and repairs.",
        ],
        [
          "composure",
          "Composure",
          "Thinks clearly through an argument or a sudden setback.",
          "Hurries decisions when the pressure rises.",
        ],
        [
          "endurance",
          "Endurance",
          "Keeps going through long days, travel or physical effort.",
          "Needs breaks and loses focus when tired.",
        ],
        [
          "contacts",
          "Contacts",
          "Knows who can answer a question or offer practical help.",
          "Has to find a new contact or figure it out alone.",
        ],
      ],
    }),
  ];
}
