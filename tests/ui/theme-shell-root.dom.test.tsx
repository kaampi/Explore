// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { ThemeProvider, useAppearance } from "../../src/ui/themes/ThemeProvider";

function Switch() {
  const appearance = useAppearance();
  return (
    <>
      <button onClick={() => appearance.setShell("dark")}>dark</button>
      <button onClick={() => appearance.setShell("light")}>light</button>
    </>
  );
}

it("puts the shell on <html> as well, so menus drawn into <body> follow the dark palette", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const press = async (label: string) => {
    const button = Array.from(host.querySelectorAll("button")).find(
      (b) => b.textContent === label,
    )!;
    await act(async () => button.click());
  };
  await act(async () =>
    root.render(
      <ThemeProvider>
        <Switch />
      </ThemeProvider>,
    ),
  );
  expect(document.documentElement.getAttribute("data-shell")).toBe("light");

  await press("dark");
  expect(document.documentElement.getAttribute("data-shell")).toBe("dark");
  expect(host.querySelector(".sandbox-root")!.getAttribute("data-shell")).toBe("dark");

  await press("light");
  expect(document.documentElement.getAttribute("data-shell")).toBe("light");

  await act(async () => root.unmount());
  expect(document.documentElement.hasAttribute("data-shell")).toBe(false);
  host.remove();
});
