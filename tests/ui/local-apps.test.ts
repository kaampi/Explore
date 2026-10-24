import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkCompanionApp,
  DEFAULT_APP_ADDRESSES,
  isLoopbackAddress,
  safeAppAddress,
} from "../../src/integrations/localApps";
import { probeLocalApp } from "../../server/localApps";

const html = (title: string) =>
  new Response(`<html><title>${title}</title></html>`, {
    headers: { "content-type": "text/html" },
  });
afterEach(() => vi.unstubAllGlobals());
describe("local companion app identification", () => {
  it("accepts the sibling apps' current titles without needing new endpoints", async () => {
    expect(
      (
        await probeLocalApp(
          "storybook",
          DEFAULT_APP_ADDRESSES.storybook,
          vi
            .fn<typeof fetch>()
            .mockImplementation(async () => html("StoryBook AI")),
        )
      ).state,
    ).toBe("available");
    expect(
      (
        await probeLocalApp(
          "comicbook",
          DEFAULT_APP_ADDRESSES.comicbook,
          vi
            .fn<typeof fetch>()
            .mockImplementation(async () => html("ComicBook AI")),
        )
      ).state,
    ).toBe("available");
  });
  it("does not treat a different service on the same port as the requested app", async () => {
    const status = await probeLocalApp(
      "storybook",
      DEFAULT_APP_ADDRESSES.storybook,
      vi
        .fn<typeof fetch>()
        .mockImplementation(async () => html("ComicBook AI")),
    );
    expect(status.state).toBe("wrong-app");
  });
  it("reads a version from an explicit matching identity", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ appId: "storybook", version: "2.0" }));
    expect(
      await probeLocalApp(
        "storybook",
        DEFAULT_APP_ADDRESSES.storybook,
        fetcher,
      ),
    ).toMatchObject({ state: "available", version: "2.0" });
    expect(fetcher).toHaveBeenCalledWith(
      new URL(
        "/.well-known/storycore-app.json",
        DEFAULT_APP_ADDRESSES.storybook,
      ).href,
      expect.objectContaining({
        redirect: "error",
        credentials: "omit",
        signal: expect.any(AbortSignal),
      }),
    );
  });
  it("reports a stopped or failing service as unreachable, without inferring installation", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("Connection refused"));
    expect(
      (
        await probeLocalApp(
          "storybook",
          DEFAULT_APP_ADDRESSES.storybook,
          fetcher,
        )
      ).state,
    ).toBe("unreachable");
  });
  it("never probes remote hosts or deceptive localhost names", async () => {
    const fetcher = vi.fn<typeof fetch>();
    for (const address of [
      "http://localhost.example.com/",
      "http://192.168.1.2/",
      "https://example.com/",
    ]) {
      expect((await probeLocalApp("storybook", address, fetcher)).state).toBe(
        "unknown",
      );
    }
    expect(fetcher).not.toHaveBeenCalled();
    expect(isLoopbackAddress("http://[::1]:5175/")).toBe(true);
  });
  it("bounds response size even when content-length is absent", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(
        async () =>
          new Response("x".repeat(65537), {
            headers: { "content-type": "text/html" },
          }),
      );
    expect(
      (
        await probeLocalApp(
          "storybook",
          DEFAULT_APP_ADDRESSES.storybook,
          fetcher,
        )
      ).state,
    ).toBe("unreachable");
  });
  it("rejects credential-bearing and executable app addresses", () => {
    for (const address of [
      "javascript:alert(1)",
      "http://user:secret@localhost:5175/",
    ])
      expect(() => safeAppAddress(address)).toThrow();
  });
});
describe("status API client", () => {
  it("uses the same-origin backend and accepts a matching status", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({
          appId: "storybook",
          state: "available",
          address: DEFAULT_APP_ADDRESSES.storybook,
          checkedAt: 1,
        }),
      );
    vi.stubGlobal("fetch", fetcher);
    expect(
      (await checkCompanionApp("storybook", DEFAULT_APP_ADDRESSES.storybook))
        .state,
    ).toBe("available");
    expect(fetcher.mock.calls[0]?.[0]).toMatch(/^\/api\/ecosystem\/status\?/);
  });
  it("handles a hosted static HTML fallback as unknown", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(html("SandboxAI")),
    );
    expect(
      (await checkCompanionApp("storybook", DEFAULT_APP_ADDRESSES.storybook))
        .state,
    ).toBe("unknown");
  });
  it("rejects statuses for a different app or address", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          Response.json({
            appId: "comicbook",
            state: "available",
            address: DEFAULT_APP_ADDRESSES.storybook,
            checkedAt: 1,
          }),
        ),
    );
    expect(
      (await checkCompanionApp("storybook", DEFAULT_APP_ADDRESSES.storybook))
        .state,
    ).toBe("unknown");
  });
});
