// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { AppearanceSettingsContent } from "../../src/ui/themes/AppearanceDialog";
import { PRESET_THEMES } from "../../src/ui/themes/theme";
import { LanguageProvider } from "../../src/ui/i18n/LanguageProvider";

const update = vi.fn();
vi.mock("../../src/ui/themes/ThemeProvider", () => ({
  useAppearance: () => ({
    library: { active: PRESET_THEMES[0], saved: [], shell: "light", conversations: {} },
    conversationId: null,
    ready: true,
    error: null,
    update,
    select: () => {},
    save: () => {},
    remove: () => {},
  }),
  playThemeStyle: () => ({}),
}));

async function mount() {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <LanguageProvider>
        <AppearanceSettingsContent onClose={() => {}} />
      </LanguageProvider>,
    ),
  );
  return host;
}
const pick = async (select: HTMLSelectElement, value: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
const selectWith = (host: HTMLElement, value: string) =>
  Array.from(host.querySelectorAll("select")).find((s) =>
    Array.from(s.options).some((o) => o.value === value),
  )!;

it("lets the player choose the ornament set and how much of it, and offers only sets that draw", async () => {
  const host = await mount();

  const sets = selectWith(host, "forged");
  // The hull set is not offered until it draws something.
  expect(Array.from(sets.options).map((o) => o.value)).toEqual(["plain", "forged"]);
  expect(Array.from(sets.options).map((o) => o.textContent)).toEqual(["Neutral", "Fantasy"]);
  await pick(sets, "forged");
  expect(update).toHaveBeenLastCalledWith({ ornament: "forged" });

  const levels = selectWith(host, "light");
  expect(Array.from(levels.options).map((o) => o.value)).toEqual(["none", "light", "full"]);
  await pick(levels, "light");
  expect(update).toHaveBeenLastCalledWith({ ornamentLevel: "light" });
});
