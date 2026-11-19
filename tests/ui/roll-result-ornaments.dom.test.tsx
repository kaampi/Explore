// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { RollResult } from "../../src/ui/components/RollResult";
import { OrnamentProvider } from "../../src/ui/play/ornament";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(() => {
  document.body.innerHTML = "";
});

async function show(wrap: (children: ReactNode) => ReactNode, roll = 34, target = 60) {
  const host = document.body.appendChild(document.createElement("div"));
  const onConfirm = vi.fn();
  await act(async () =>
    createRoot(host).render(
      wrap(<RollResult roll={roll} target={target} detail="Strength" onConfirm={onConfirm} />),
    ),
  );
  return { host, onConfirm };
}

it("is the green hexagon, as before, in the plain look", async () => {
  const { host } = await show((children) => children);
  expect(host.querySelector(".roll-result__frame")).not.toBeNull();
  expect(host.querySelector(".roll-result--ornamented")).toBeNull();
});

it("is a card with the theme's frame, sign and seal in a theme with ornaments, and still keeps the outcome's colour", async () => {
  for (const ornament of ["forged", "hull"] as const) {
    const { host, onConfirm } = await show((children) => (
      <OrnamentProvider theme={{ ornament }}>{children}</OrnamentProvider>
    ));
    const card = host.querySelector(".roll-result--ornamented")!;
    expect(card.querySelector(".roll-result__frame")).toBeNull();
    expect(card.querySelector(".orn-frame")!.getAttribute("data-orn-set")).toBe(ornament);
    expect(card.querySelector(".orn-nameplate")!.textContent).toBe("Success");
    expect(card.querySelector(".orn-check__seal")!.textContent).toBe("34");
    // The outcome is told in words as well, and the colour is the status colour of the outcome.
    expect(card.textContent).toContain("Needed 60 or lower");
    expect(card.getAttribute("data-outcome")).toBe("success");
    expect(card.getAttribute("aria-label")).toBe("Dice result: Success");
    await act(async () => card.querySelector<HTMLButtonElement>(".roll-result__ok")!.click());
    expect(onConfirm).toHaveBeenCalledOnce();
    document.body.innerHTML = "";
  }
});

it("tells a failure as a failure in the themed card too", async () => {
  const { host } = await show(
    (children) => <OrnamentProvider theme={{ ornament: "forged" }}>{children}</OrnamentProvider>,
    80,
    50,
  );
  const card = host.querySelector(".roll-result--ornamented")!;
  expect(card.getAttribute("data-outcome")).toBe("failure");
  expect(card.querySelector(".orn-nameplate")!.textContent).toBe("Failed");
});
