// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { useArrivalResidents } from "../../src/ui/components/useArrivalResidents";

function Harness(props: {
  placeId: string | undefined;
  wanted: boolean;
  populate: (signal: AbortSignal) => Promise<unknown>;
}) {
  useArrivalResidents(props.placeId, props.wanted, props.populate);
  return null;
}

let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  root = undefined;
});

function setup() {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const calls: { placeId: string; signal: AbortSignal; finish: () => void }[] = [];
  /** A new function every time, as the engine hands out on every render. */
  const fresh = (placeId: string) => (signal: AbortSignal) =>
    new Promise<void>((resolve) => {
      calls.push({ placeId, signal, finish: resolve });
    });
  const show = (placeId: string | undefined, wanted = true) =>
    act(async () =>
      root!.render(<Harness placeId={placeId} wanted={wanted} populate={fresh(placeId ?? "")} />),
    );
  return { calls, show };
}

it("starts the call once on arrival and does not stop it when the player does other things meanwhile", async () => {
  const { calls, show } = setup();

  await show("market");
  for (let i = 0; i < 6; i++) await show("market");

  expect(calls).toHaveLength(1);
  expect(calls[0]!.signal.aborted).toBe(false);
});

it("does not call again for the same arrival once it has finished", async () => {
  const { calls, show } = setup();
  await show("market");

  await act(async () => calls[0]!.finish());
  await show("market");
  await show("market");

  expect(calls).toHaveLength(1);
});

it("stops the old call when the player goes somewhere else, and starts one there", async () => {
  const { calls, show } = setup();
  await show("market");

  await show("harbour");

  expect(calls.map((c) => c.placeId)).toEqual(["market", "harbour"]);
  expect(calls[0]!.signal.aborted).toBe(true);
  expect(calls[1]!.signal.aborted).toBe(false);
});

it("stops when the place no longer needs residents, and starts nothing when it never did", async () => {
  const { calls, show } = setup();
  await show("market", false);
  expect(calls).toHaveLength(0);

  await show("market", true);
  await show("market", false);

  expect(calls).toHaveLength(1);
  expect(calls[0]!.signal.aborted).toBe(true);
});
