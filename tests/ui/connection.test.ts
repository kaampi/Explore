import { describe, expect, it, vi } from "vitest";
import {
  discoverOllama,
  initialModel,
  modelReadiness,
} from "../../src/ui/connection/connection";

describe("first conversation readiness", () => {
  it("distinguishes checking, unavailable, no chat models, missing preference and ready", () => {
    expect(modelReadiness({ state: "checking", models: [] }, "chat")).toBe(
      "checking",
    );
    expect(modelReadiness({ state: "unavailable", models: [] }, "chat")).toBe(
      "unavailable",
    );
    expect(modelReadiness({ state: "available", models: [] }, "chat")).toBe(
      "empty",
    );
    expect(
      modelReadiness({ state: "available", models: ["other"] }, "chat"),
    ).toBe("missing-model");
    expect(
      modelReadiness({ state: "available", models: ["chat"] }, "chat"),
    ).toBe("ready");
    expect(
      modelReadiness({ state: "available", models: ["chat:latest"] }, "chat"),
    ).toBe("ready");
    expect(
      modelReadiness({ state: "available", models: ["chat:v2"] }, "chat"),
    ).toBe("missing-model");
  });
  it("only makes an initial choice when no preference has been saved", () => {
    expect(initialModel("", ["first", "second"])).toBe("first");
    expect(initialModel("my-choice", ["other"])).toBe("my-choice");
    expect(initialModel("", [])).toBe("");
  });
  it("does not offer embedding-only models as chat models", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async (url, init) => {
        if (String(url).endsWith("/api/tags"))
          return Response.json({
            models: [{ name: "embeddings" }, { name: "chat" }],
          });
        const model = JSON.parse(String(init?.body)).model;
        return Response.json({
          capabilities:
            model === "chat" ? ["completion", "vision"] : ["embedding"],
        });
      });
    expect(await discoverOllama({ fetchImpl: fetcher })).toEqual({
      state: "available",
      models: ["chat"],
      unsupportedModels: ["embeddings"],
    });
    expect(
      fetcher.mock.calls.every(([url]) => !String(url).includes("/api/chat")),
    ).toBe(true);
  });
  it("supports older servers without model capability metadata", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async (url) =>
        String(url).endsWith("/api/tags")
          ? Response.json({ models: [{ name: "legacy" }] })
          : new Response("Not found", { status: 404 }),
      );
    expect((await discoverOllama({ fetchImpl: fetcher })).models).toEqual([
      "legacy",
    ]);
  });
  it("reports an unreachable server without throwing into the UI", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("Connection refused"));
    expect(await discoverOllama({ fetchImpl: fetcher })).toEqual({
      state: "unavailable",
      models: [],
    });
  });
});
