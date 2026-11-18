// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { IndexedDBRepository } from "../../src/persistence/IndexedDBRepository";
import { CheckUpdates } from "../../src/ui/home/CheckUpdates";
import { LanguageProvider } from "../../src/ui/i18n/LanguageProvider";
import {
  INSTALLER_URL,
  RUNNING_DOCS_URL,
  UPDATE_CACHE_KEY,
  UPDATE_INTERVAL,
  UpdateProvider,
} from "../../src/ui/home/UpdateProvider";

const desktop = vi.hoisted(() => ({ enabled: false, open: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => desktop.enabled }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: desktop.open }));
const download = vi.hoisted(() => vi.fn());
vi.mock("../../src/ui/studio/studioShared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/ui/studio/studioShared")>()),
  downloadJson: download,
}));

const own = import.meta.env.VITE_EXPLORE_REVISION as string;
const newer = "b".repeat(40);
const request = vi.fn();
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const compare = (ahead_by: number) => ok({ ahead_by });
const release = (revision: string | null) =>
  ok({
    body: revision === null ? "No revision here." : `Revision: ${revision}\nBuilt: 2026-11-18`,
  });
const RELEASE = "/releases/tags/alpha-latest";
/** Answers the release lookup and the comparison, each as given. */
function serve(answers: { release?: unknown; compare?: unknown }) {
  request.mockImplementation(async (url: string) =>
    String(url).includes(RELEASE)
      ? (answers.release ?? { ok: false, status: 404 })
      : (answers.compare ?? compare(0)),
  );
}
const calls = (part: string) => request.mock.calls.filter((call) => String(call[0]).includes(part));

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value() {
      this.open = true;
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value() {
      this.open = false;
    },
  });
  desktop.enabled = false;
  desktop.open.mockReset();
  desktop.open.mockResolvedValue(undefined);
  download.mockReset();
  localStorage.clear();
  request.mockReset();
  serve({ compare: compare(0) });
  vi.stubGlobal("fetch", request);
});
afterEach(() => {
  if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard);
  else Reflect.deleteProperty(navigator, "clipboard");
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
function mount(repo?: IndexedDBRepository) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  return {
    host,
    root,
    render: () =>
      act(async () =>
        root.render(
          <LanguageProvider>
            <CheckUpdates {...(repo ? { repo } : {})} />
          </LanguageProvider>,
        ),
      ),
    close: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}
const press = (host: HTMLElement, label: string) =>
  act(async () => {
    Array.from(host.querySelectorAll("button"))
      .find((b) => b.textContent === label)!
      .click();
  });
const mainButton = (host: HTMLElement) =>
  host.querySelector<HTMLButtonElement>(".sb-update-check > button")!;

// ----- Running from the source code (a browser) -----

it("in a browser: checks quietly at startup, and an update opens a short text about git pull", async () => {
  serve({ compare: compare(2) });
  const ui = mount();
  try {
    await ui.render();
    expect(request).toHaveBeenCalledTimes(1);
    expect(String(request.mock.calls[0]![0])).toContain(`/compare/${own}...main`);
    expect(mainButton(ui.host).textContent).toBe("Update available");
    expect(ui.host.querySelector("[role=status]")).toBeNull();
    await act(async () => mainButton(ui.host).click());
    expect(ui.host.textContent).toContain("Get the latest code with git pull");
    expect(ui.host.querySelector<HTMLAnchorElement>("dialog a")!.href).toBe(RUNNING_DOCS_URL);
    expect(ui.host.querySelector("dialog a[href*='actions']")).toBeNull();
    expect(request).toHaveBeenCalledTimes(1);
  } finally {
    await ui.close();
  }
});
it("in a browser: checks manually, reports the latest code and handles rate limits without a stuck button", async () => {
  const ui = mount();
  try {
    await ui.render();
    expect(mainButton(ui.host).textContent).toBe("Check for updates");
    await act(async () => mainButton(ui.host).click());
    expect(ui.host.textContent).toContain("latest Explore code");
    expect(ui.host.querySelector("a")).toBeNull();
    request.mockResolvedValue({ ok: false, status: 429 });
    await act(async () => mainButton(ui.host).click());
    expect(ui.host.textContent).toContain("temporarily limiting");
    expect(mainButton(ui.host).disabled).toBe(false);
  } finally {
    await ui.close();
  }
});
it("in a browser: a version GitHub does not know is called a development version", async () => {
  serve({ compare: { ok: false, status: 404 } });
  const ui = mount();
  try {
    await ui.render();
    await act(async () => mainButton(ui.host).click());
    expect(ui.host.textContent).toContain("development version");
    expect(ui.host.querySelector("a")).toBeNull();
  } finally {
    await ui.close();
  }
});
it("checks every thirty minutes even while the home button is unmounted and restores the label on return", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-04T18:00:00Z"));
  const host = document.createElement("div"),
    root = createRoot(host);
  const view = (child: React.ReactNode) => (
    <LanguageProvider>
      <UpdateProvider>{child}</UpdateProvider>
    </LanguageProvider>
  );
  try {
    await act(async () => root.render(view(<CheckUpdates />)));
    expect(request).toHaveBeenCalledTimes(1);
    await act(async () => root.render(view(<div>Playing</div>)));
    serve({ compare: compare(3) });
    await act(async () => vi.advanceTimersByTimeAsync(UPDATE_INTERVAL));
    expect(request).toHaveBeenCalledTimes(2);
    await act(async () => root.render(view(<CheckUpdates />)));
    expect(host.textContent).toBe("Update available");
    expect(request).toHaveBeenCalledTimes(2);
  } finally {
    await act(async () => root.unmount());
  }
});
it("uses a revision-specific cache instead of checking on every visit", async () => {
  localStorage.setItem(
    UPDATE_CACHE_KEY,
    JSON.stringify({ available: true, lastChecked: Date.now() }),
  );
  const ui = mount();
  try {
    await ui.render();
    expect(ui.host.textContent).toBe("Update available");
    expect(request).not.toHaveBeenCalled();
  } finally {
    await ui.close();
  }
});
it("keeps a known update after a quiet background failure, and stops checking after unmount", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-04T18:00:00Z"));
  serve({ compare: compare(2) });
  const ui = mount();
  await ui.render();
  request.mockRejectedValue(new Error("Offline"));
  await act(async () => vi.advanceTimersByTimeAsync(UPDATE_INTERVAL));
  expect(ui.host.textContent).toBe("Update available");
  expect(ui.host.querySelector("[role=status]")).toBeNull();
  await ui.close();
  const count = request.mock.calls.length;
  await vi.advanceTimersByTimeAsync(UPDATE_INTERVAL);
  expect(request).toHaveBeenCalledTimes(count);
});
it("aborts a timed-out check without announcing background errors", async () => {
  vi.useFakeTimers();
  request.mockImplementation(
    (_url, options) =>
      new Promise((_resolve, reject) =>
        options.signal.addEventListener("abort", () => reject(new Error("aborted"))),
      ),
  );
  const ui = mount();
  try {
    await ui.render();
    await act(async () => vi.advanceTimersByTimeAsync(15_000));
    expect(ui.host.textContent).toBe("Check for updates");
    expect(ui.host.querySelector("[role=status]")).toBeNull();
    await act(async () => mainButton(ui.host).click());
    await act(async () => vi.advanceTimersByTimeAsync(15_000));
    expect(ui.host.textContent).toContain("timed out");
  } finally {
    await ui.close();
  }
});

// ----- The desktop app: an update is a new installer -----

it("on the desktop: the same commit as the installer is no update, and main is never asked", async () => {
  desktop.enabled = true;
  serve({ release: release(own), compare: compare(9) });
  const ui = mount();
  try {
    await ui.render();
    expect(mainButton(ui.host).textContent).toBe("Check for updates");
    expect(calls("/compare/")).toHaveLength(0);
    await act(async () => mainButton(ui.host).click());
    expect(ui.host.textContent).toContain("You have the latest version of Explore.");
  } finally {
    await ui.close();
  }
});
it("on the desktop: a commit on main that only changes documents is no update, because no new installer is built for it", async () => {
  desktop.enabled = true;
  // Main is far ahead of the app, but the newest installer is still the one the app came from.
  serve({ release: release(own), compare: compare(12) });
  const ui = mount();
  try {
    await ui.render();
    expect(ui.host.textContent).toBe("Check for updates");
    expect(calls("...main")).toHaveLength(0);
  } finally {
    await ui.close();
  }
});
it("on the desktop: a newer installer is an update, compared from the app's own commit", async () => {
  desktop.enabled = true;
  serve({ release: release(newer), compare: compare(4) });
  const ui = mount();
  try {
    await ui.render();
    expect(mainButton(ui.host).textContent).toBe("Update available");
    expect(String(calls("/compare/")[0]![0])).toContain(`/compare/${own}...${newer}`);
  } finally {
    await ui.close();
  }
});
it("on the desktop: an installer that is not ahead of the app is no update", async () => {
  desktop.enabled = true;
  serve({ release: release(newer), compare: compare(0) });
  const ui = mount();
  try {
    await ui.render();
    expect(mainButton(ui.host).textContent).toBe("Check for updates");
  } finally {
    await ui.close();
  }
});
it("on the desktop: no pre-release yet is no update, and says there is nothing to download", async () => {
  desktop.enabled = true;
  serve({ release: { ok: false, status: 404 } });
  const ui = mount();
  try {
    await ui.render();
    expect(mainButton(ui.host).textContent).toBe("Check for updates");
    expect(ui.host.querySelector("[role=status]")).toBeNull();
    await act(async () => mainButton(ui.host).click());
    expect(ui.host.textContent).toContain("There is no installer to download yet.");
    expect(mainButton(ui.host).textContent).toBe("Check for updates");
  } finally {
    await ui.close();
  }
});
it("on the desktop: a description without a revision, or with a bad one, is an error and no update", async () => {
  desktop.enabled = true;
  for (const body of [null, "abc123", "g".repeat(40)]) {
    serve({ release: release(body), compare: compare(5) });
    const ui = mount();
    try {
      await ui.render();
      expect(mainButton(ui.host).textContent, String(body)).toBe("Check for updates");
      await act(async () => mainButton(ui.host).click());
      expect(ui.host.textContent).toContain("does not say which version it is");
      expect(calls("/compare/")).toHaveLength(0);
    } finally {
      await ui.close();
    }
    request.mockReset();
  }
});
it("on the desktop: server errors are quiet in the background and spoken after a manual check", async () => {
  desktop.enabled = true;
  serve({ release: { ok: false, status: 500 } });
  const ui = mount();
  try {
    await ui.render();
    expect(ui.host.querySelector("[role=status]")).toBeNull();
    await act(async () => mainButton(ui.host).click());
    expect(ui.host.textContent).toContain("Could not check for updates");
  } finally {
    await ui.close();
  }
});

// ----- The box "A new version of Explore is available" -----

async function withUpdate() {
  desktop.enabled = true;
  serve({ release: release(newer), compare: compare(1) });
  const ui = mount();
  await ui.render();
  await act(async () => mainButton(ui.host).click());
  return ui;
}

it("opens a box with three steps, and no link to GitHub Actions", async () => {
  const ui = await withUpdate();
  try {
    const box = ui.host.querySelector("dialog")!;
    expect(box.getAttribute("aria-label")).toBe("A new version of Explore is available");
    expect(
      Array.from(box.querySelectorAll("ol > li")).map(
        (li) => li.querySelector("strong")!.textContent,
      ),
    ).toEqual(["Download", "Run the file.", "Follow the installation."]);
    expect(box.textContent).toContain("More information");
    expect(box.textContent).toContain("Run anyway");
    expect(box.textContent).toContain("Your worlds, characters and conversations are kept.");
    expect(ui.host.querySelector("a[href*='actions']")).toBeNull();
    expect(ui.host.textContent).not.toContain("View available builds");
  } finally {
    await ui.close();
  }
});
it("downloads from the fixed address through the native opener, and 'Not now' closes the box", async () => {
  const ui = await withUpdate();
  try {
    await press(ui.host, "Download the installer");
    expect(desktop.open).toHaveBeenCalledWith(INSTALLER_URL);
    expect(INSTALLER_URL).toBe(
      "https://github.com/kaampi/Explore/releases/download/alpha-latest/kaampi-Explore-Setup.exe",
    );
    expect(ui.host.querySelector("input")).toBeNull();
    await press(ui.host, "Not now");
    expect(ui.host.querySelector("dialog")).toBeNull();
    expect(mainButton(ui.host).textContent).toBe("Update available");
  } finally {
    await ui.close();
  }
});
it("opens the address in the browser when the app is not the desktop one", async () => {
  const open = vi.spyOn(window, "open").mockImplementation(() => null);
  const ui = await withUpdate();
  try {
    desktop.enabled = false;
    await press(ui.host, "Download the installer");
    expect(open).toHaveBeenCalledWith(INSTALLER_URL, "_blank", "noopener,noreferrer");
  } finally {
    await ui.close();
  }
});
it("shows the address with a copy button when the browser cannot be opened", async () => {
  desktop.open.mockRejectedValue(new Error("URL is not allowed"));
  const copy = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: copy } });
  const ui = await withUpdate();
  try {
    await press(ui.host, "Download the installer");
    expect(ui.host.textContent).toContain("Could not open your browser");
    const address = ui.host.querySelector<HTMLInputElement>("dialog input")!;
    expect(address.value).toBe(INSTALLER_URL);
    expect(address.readOnly).toBe(true);
    await press(ui.host, "Copy download link");
    expect(copy).toHaveBeenCalledWith(INSTALLER_URL);
    expect(ui.host.textContent).toContain("Download link copied.");
  } finally {
    await ui.close();
  }
});
it("keeps the address usable if clipboard access also fails", async () => {
  desktop.open.mockRejectedValue(new Error("No browser"));
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockRejectedValue(new Error("Not allowed")) },
  });
  const ui = await withUpdate();
  try {
    await press(ui.host, "Download the installer");
    await press(ui.host, "Copy download link");
    expect(ui.host.textContent).toContain("copy it manually");
    expect(ui.host.querySelector<HTMLInputElement>("dialog input")!.value).toBe(INSTALLER_URL);
  } finally {
    await ui.close();
  }
});
it("offers to export the library first, when the app has one to export", async () => {
  const without = await withUpdate();
  try {
    expect(
      Array.from(without.host.querySelectorAll("dialog button")).map((b) => b.textContent),
    ).not.toContain("Export library");
  } finally {
    await without.close();
  }
  const repo = new IndexedDBRepository(new IDBFactory(), "update-export");
  desktop.enabled = true;
  serve({ release: release(newer), compare: compare(1) });
  const ui = mount(repo);
  try {
    await ui.render();
    await act(async () => mainButton(ui.host).click());
    await press(ui.host, "Export library");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(download).toHaveBeenCalledOnce();
    expect(String(download.mock.calls[0]![0])).toMatch(/\.json$/);
    expect(ui.host.textContent).toContain("Library exported.");
  } finally {
    await ui.close();
    await repo.close();
  }
});
it("speaks Swedish when the interface is Swedish", async () => {
  localStorage.setItem("sandboxai:interface-language", "sv");
  const ui = await withUpdate();
  try {
    expect(mainButton(ui.host).textContent).toBe("Uppdatering finns");
    const box = ui.host.querySelector("dialog")!;
    expect(box.getAttribute("aria-label")).toBe("Det finns en ny version av Explore");
    expect(box.textContent).toContain("Mer information");
    expect(box.textContent).toContain("Kör ändå");
    expect(
      Array.from(box.querySelectorAll("button"))
        .map((b) => b.textContent)
        .filter((label) => label !== "×"),
    ).toEqual(["Ladda ner installationsfilen", "Inte nu"]);
  } finally {
    await ui.close();
  }
});
