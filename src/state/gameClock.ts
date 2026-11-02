/** Fictional time, independent of wall time and message count. Day 1 starts at midnight. */
export const INITIAL_GAME_MINUTES = 8 * 60;

export function formatGameTime(totalMinutes = INITIAL_GAME_MINUTES): string {
  const minute = Math.floor(totalMinutes);
  return `Day ${Math.floor(minute / 1440) + 1} · ${String(Math.floor(minute % 1440 / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

export function gameTimeOfDay(totalMinutes: number): string {
  const hour = Math.floor(totalMinutes % 1440 / 60);
  return hour < 6 ? "night" : hour < 12 ? "morning" : hour < 18 ? "afternoon" : hour < 22 ? "evening" : "night";
}

function normalizeDurationNumbers(text: string): string {
  const words: Record<string, number> = {
    zero:0, one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10,
    eleven:11, twelve:12, thirteen:13, fourteen:14, fifteen:15, sixteen:16, seventeen:17, eighteen:18, nineteen:19,
    twenty:20, thirty:30, forty:40, fifty:50, sixty:60, seventy:70, eighty:80, ninety:90,
    noll:0, en:1, ett:1, två:2, tre:3, fyra:4, fem:5, sju:7, åtta:8, nio:9, tio:10,
    elva:11, tolv:12, tretton:13, fjorton:14, femton:15, sexton:16, sjutton:17, arton:18, nitton:19, tjugo:20
  };
  // Combine English tens first; do not interpret arbitrary adjacent numbers as sums.
  const compound = text.replace(/\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[ -](one|two|three|four|five|six|seven|eight|nine)\b/gi,
    (_match, tens: string, ones: string) => String(words[tens.toLowerCase()]! + words[ones.toLowerCase()]!));
  return compound.replace(/(?<![\p{L}\p{N}])[\p{L}]+(?![\p{L}\p{N}])/gu, word => words[word.toLowerCase()] !== undefined ? String(words[word.toLowerCase()]) : word)
    .replace(/\b(?:a|an)\s+(?=minute|hour|day|week)/gi, "1 ");
}

/** Only explicit durations count. Descriptions such as “a few steps” remain unspecified. */
export function parseTravelMinutes(text: string): number | undefined {
  text = normalizeDurationNumbers(text);
  const units: Record<string, number> = { minute: 1, minutes: 1, min: 1, minuter: 1, minut: 1,
    hour: 60, hours: 60, h: 60, timme: 60, timmar: 60,
    day: 1440, days: 1440, dag: 1440, dagar: 1440, week: 10080, weeks: 10080, vecka: 10080, veckor: 10080 };
  const pattern = /(\d+(?:[.,]\d+)?)\s*([a-zåäö]+)/gi;
  let total = 0, matched = false, invalid = false;
  const rest = text.replace(pattern, (_match, value: string, unit: string) => {
    const multiplier = units[unit.toLowerCase()];
    if (!multiplier) invalid = true;
    else { total += Number(value.replace(",", ".")) * multiplier; matched = true; }
    return "";
  }).replace(/\b(?:and|och)\b/gi, "").trim();
  return matched && !invalid && !rest && Number.isSafeInteger(Math.round(total)) ? Math.round(total) : undefined;
}

export type TimeAction = { minutes: number; kind: "wait" | "rest" | "sleep" };

/** A map's “days” estimate includes overnight opportunities between travelling days. */
export function travelDaysFromDuration(text: string): number | undefined {
  const normalized = normalizeDurationNumbers(text).trim();
  const match = normalized.match(/^(\d+(?:[.,]\d+)?)\s*(days?|dag(?:ar)?|weeks?|veck(?:a|or))$/i);
  if (!match) return;
  const days = Number(match[1]!.replace(",", ".")) * (/^(week|veck)/i.test(match[2]!) ? 7 : 1);
  return days > 0 && Number.isFinite(days) ? days : undefined;
}

/** Deliberate completed time skips only, never intentions, questions or quoted dialogue. */
export function timeActionFromText(text: string, totalMinutes: number): TimeAction | undefined {
  const match = text.trim().match(/^(?:I|we|jag|vi)\s+(wait|rest|sleep|väntar|vilar|sover)\s+(?:for\s+|i\s+)?(.+?)[.!]?$/i);
  if (!match) return;
  const verb = match[1]!.toLowerCase();
  const kind = /^(?:sleep|sover)$/.test(verb) ? "sleep" : /^(?:rest|vilar)$/.test(verb) ? "rest" : "wait";
  const duration = match[2]!.replace(/[.!]$/, "").trim();
  if (/^(?:until (?:the )?morning|till(?:s)? (?:på )?morgonen)$/i.test(duration)) {
    const minuteOfDay = totalMinutes % 1440;
    return {kind, minutes: minuteOfDay < 480 ? 480 - minuteOfDay : 1440 - minuteOfDay + 480};
  }
  const minutes = parseTravelMinutes(duration);
  if (minutes !== undefined && minutes > 0) return {kind, minutes};
  return;
}
