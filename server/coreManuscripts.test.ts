import { createServer } from "node:http";
import { once } from "node:events";
import { afterEach, describe, expect, it } from "vitest";
import { coreManuscriptsMiddleware, createCoreManuscriptReader } from "./coreManuscripts";

const token = "a".repeat(64);
const workspaceId = "e05e9d93-e7a9-432a-82cd-8e47303f84c8";
const recordId = "04ac0bd1-b658-4265-b529-65311528719f";
const item = { workspaceId, projectId: "book-one", recordId, title: "The Keys", language: "English", translationGroupId: "family", revision: 1, updatedAt: "2026-10-27T00:00:00.000Z" };
const manuscript = { kind: "storycore.manuscript-export", format: 2, sourceApp: "storybook-ai", sourceBookId: "book-one", title: "The Keys", synopsis: "A synopsis", chapters: [{ id: "chapter-one", title: "One", prose: "Full prose" }], bible: [{ kind: "characters", label: "Characters", entities: [{ entity_ref: "emma", name: "Emma", facts: [{ predicate: "core.identity", label: "Identity", value: "Bartender" }], referenceImages: [], privateNotes: "must not pass" }] }], brainstorm: "must not pass" };
const activeServers: ReturnType<typeof createServer>[] = [];
afterEach(async () => { for (const server of activeServers.splice(0)) { server.close(); await once(server, "close"); } });

describe("local Core manuscript reader", () => {
  it("returns only granted manuscripts, reads full prose, and keeps the token out of browser responses", async () => {
    let granted = true;
    const requests: { url: string; method: string; authorization: string | null }[] = [];
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input);
      requests.push({ url, method: init?.method ?? "", authorization: new Headers(init?.headers).get("authorization") });
      if (url.endsWith("/v1/shared-manuscripts")) return Response.json(granted ? [item] : []);
      if (url.endsWith(`/v1/records/${recordId}`)) return granted ? Response.json({ workspaceId, revision: 1, body: manuscript }) : Response.json({ error: "Forbidden" }, { status: 403 });
      return Response.json({ error: "Not found" }, { status: 404 });
    };
    const reader = createCoreManuscriptReader(token, fetcher);
    const middleware = coreManuscriptsMiddleware(reader);
    const server = createServer((req, res) => { void middleware(req, res, () => { res.statusCode = 404; res.end(); }); });
    activeServers.push(server);
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const catalog = await fetch(base + "/api/core/manuscripts");
    expect(catalog.status).toBe(200);
    expect(await catalog.json()).toEqual([item]);
    const detail = await fetch(base + `/api/core/manuscripts/${workspaceId}`);
    const detailBody = await detail.json();
    expect(detailBody.manuscript.chapters[0].prose).toBe("Full prose");
    expect(detailBody.manuscript.bible[0].entities[0].facts[0].value).toBe("Bartender");
    expect(JSON.stringify(detailBody)).not.toContain("must not pass");
    expect(detail.headers.get("cache-control")).toBe("no-store");
    expect(requests.every(req => req.method === "GET" && req.authorization === `Bearer ${token}` && req.url.startsWith("http://127.0.0.1:43127/"))).toBe(true);
    expect(JSON.stringify(item)).not.toContain(token);
    expect((await fetch(base + `/api/core/manuscripts/${workspaceId}`, { method: "POST" })).status).toBe(405);
    expect((await fetch(base + "/api/core/manuscripts", { headers: { origin: "http://evil.example" } })).status).toBe(403);
    const before = requests.length;
    granted = false;
    expect(await (await fetch(base + "/api/core/manuscripts")).json()).toEqual([]);
    expect((await fetch(base + `/api/core/manuscripts/${workspaceId}`)).status).toBe(404);
    expect(requests.length).toBe(before + 2);
  });

  it("refuses unconfigured credentials and malformed record or catalog responses", async () => {
    await expect(createCoreManuscriptReader(undefined).catalog()).rejects.toThrow(/credential/);
    const invalid = createCoreManuscriptReader(token, async input => {
      if (String(input).endsWith("/v1/shared-manuscripts")) return Response.json([item]);
      return Response.json({ workspaceId: "another-workspace", revision: 1, body: manuscript });
    });
    await expect(invalid.manuscript(workspaceId)).rejects.toThrow(/invalid manuscript/);
    await expect(invalid.manuscript("../admin")).rejects.toThrow(/not found/);
  });
});
