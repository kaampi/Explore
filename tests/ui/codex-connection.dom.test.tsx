// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { CodexConnection } from "../../src/ui/connection/CodexConnection";
const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true, invoke }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));

it("requests native pairing, shows the comparison code and connects without asking for keys", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  let connected = false;
  invoke.mockImplementation(async command => {
    if (command === "core_connection") return { paired: connected, reachable: connected };
    if (command === "core_begin") return { code: "ABC123", expiresAt: new Date(Date.now()+300000).toISOString() };
    if (command === "core_poll") { connected = true; return { state: "connected" }; }
    throw new Error("Unexpected command");
  });
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value() {} });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value() {} });
  const container = document.createElement("div"), root = createRoot(container);
  try {
    await act(async () => root.render(<CodexConnection />));
    await act(async () => container.querySelector('button')!.click());
    const connect = Array.from(container.querySelectorAll('button')).find(button => button.textContent === "Connect to kaampi Codex")!;
    await act(async () => connect.click());
    expect(container.textContent).toContain("ABC123");
    expect(container.querySelector('input')).toBeNull();
    await act(async () => vi.advanceTimersByTimeAsync(1100));
    expect(container.textContent).toContain("Connected to Codex.");
  } finally { await act(async () => root.unmount()); vi.useRealTimers(); invoke.mockReset(); }
});
