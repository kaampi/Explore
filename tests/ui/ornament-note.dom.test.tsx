// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { NoteCard, OrnamentProvider } from "../../src/ui/play/ornament";
import { NOTE_COLORS, ornamentVars } from "../../src/ui/play/ornament/vars";
import { PRESET_THEMES, contrastRatio } from "../../src/ui/themes/theme";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

/** The note as the pack shows it, with the pack's own stylesheet beside the ornament's. */
async function readNote(ornament: "plain" | "forged") {
  for (const path of [
    "src/ui/play/ornament/ornament.css",
    "src/ui/components/playerInventory.css",
  ]) {
    const style = document.head.appendChild(document.createElement("style"));
    style.textContent = readFileSync(path, "utf8");
  }
  const theme = { ...PRESET_THEMES.find((t) => t.id === "fantasy")!, ornament };
  const host = document.body.appendChild(document.createElement("div"));
  for (const [name, value] of Object.entries(ornamentVars(theme)))
    host.style.setProperty(name, String(value));
  await act(async () =>
    createRoot(host).render(
      <OrnamentProvider theme={theme}>
        <NoteCard className="inventory-detail__reading">
          <h3>Read</h3>
          <p>Meet me at the old watchtower at dawn.</p>
        </NoteCard>
      </OrnamentProvider>,
    ),
  );
  return host;
}

it("gives the words of a note the note's own colour, which reads on the parchment", async () => {
  const host = await readNote("forged");
  const words = host.querySelector("p")!;
  const style = getComputedStyle(words);

  // The colour is the note's, and the note's text on its parchment reads at 4.5 : 1 or better.
  expect(style.color).toContain("--ornament-note-text");
  expect(contrastRatio(NOTE_COLORS.text, NOTE_COLORS.bg)).toBeGreaterThanOrEqual(4.5);
  const vars = ornamentVars(PRESET_THEMES.find((t) => t.id === "fantasy")!) as Record<
    string,
    string
  >;
  expect(vars["--ornament-note-text"]).toBe(NOTE_COLORS.text);
  expect(vars["--ornament-note-bg"]).toBe(NOTE_COLORS.bg);
});

it("keeps the pack's old look for a note in the plain set", async () => {
  const host = await readNote("plain");
  const words = host.querySelector("p")!;
  expect(getComputedStyle(words).backgroundColor).not.toBe("");
});
