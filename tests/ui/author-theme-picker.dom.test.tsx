// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { AuthorThemePicker } from "../../src/ui/themes/AuthorThemePicker";
import { LanguageProvider } from "../../src/ui/i18n/LanguageProvider";
import { PRESET_THEMES, type PlayTheme } from "../../src/ui/themes/theme";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
});

async function mount(value: PlayTheme | undefined) {
  const onChange = vi.fn();
  const host = document.body.appendChild(document.createElement("div"));
  await act(async () =>
    createRoot(host).render(
      <LanguageProvider>
        <AuthorThemePicker value={value} onChange={onChange} hint="Only how it looks." />
      </LanguageProvider>,
    ),
  );
  const select = host.querySelector("select")!;
  const pick = async (id: string) =>
    act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select, id);
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
  return { host, select, onChange, pick };
}
const fantasy = PRESET_THEMES.find((t) => t.id === "fantasy")!;

it("offers no theme (the player's own) and every theme that comes with the app", async () => {
  const { select } = await mount(undefined);
  expect(select.value).toBe("");
  expect(Array.from(select.options).map((o) => o.value)).toEqual([
    "",
    ...PRESET_THEMES.map((t) => t.id),
  ]);
  expect(select.options[0]!.textContent).toBe("The player’s own appearance");
});

it("gives the theme chosen, and none when the choice is taken back", async () => {
  const { onChange, pick } = await mount(undefined);
  await pick("fantasy");
  expect(onChange).toHaveBeenLastCalledWith(fantasy);

  const again = await mount(fantasy);
  expect(again.select.value).toBe("fantasy");
  await again.pick("");
  expect(again.onChange).toHaveBeenLastCalledWith(undefined);
});

it("shows the colours of the theme, and says what the choice means", async () => {
  const { host } = await mount(fantasy);
  expect(host.querySelectorAll(".author-theme__swatch")).toHaveLength(3);
  expect(host.querySelector(".author-theme__hint")!.textContent).toBe("Only how it looks.");
  const none = await mount(undefined);
  expect(none.host.querySelector(".author-theme__swatches")).toBeNull();
});

it("keeps a theme that is not one of the app's, under its own name", async () => {
  const own: PlayTheme = { ...fantasy, id: "from-a-file", name: "Harbour at dusk" };
  const { select, onChange, pick } = await mount(own);
  expect(select.value).toBe("from-a-file");
  expect(select.options[1]!.textContent).toBe("Harbour at dusk");
  // Choosing it again keeps it as it was.
  await pick("from-a-file");
  expect(onChange).toHaveBeenLastCalledWith(own);
});

it("speaks Swedish when the interface is Swedish", async () => {
  localStorage.setItem("sandboxai:interface-language", "sv");
  const { select } = await mount(undefined);
  expect(select.options[0]!.textContent).toBe("Spelarens eget utseende");
});

it("hides its label from the eye, not from a screen reader, where a heading says it already", async () => {
  const host = document.body.appendChild(document.createElement("div"));
  await act(async () =>
    createRoot(host).render(
      <LanguageProvider>
        <AuthorThemePicker value={undefined} onChange={() => {}} hint="x" showLabel={false} />
      </LanguageProvider>,
    ),
  );
  expect(host.querySelector("label > span")!.className).toBe("visually-hidden");
  expect(host.querySelector("select")!.getAttribute("aria-label")).toBe("Look when it is played");
});
