import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { CoreBibleSchema } from "../src/integrations/coreBibleSchema";

const CORE_URL = "http://127.0.0.1:43127";
const MAX_CATALOG_BYTES = 2_000_000;
const MAX_RECORD_BYTES = 22_000_000;
const workspaceIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type CatalogItem = {
  workspaceId: string; projectId: string; recordId: string; title: string;
  language: string; translationGroupId: string; revision: number; updatedAt: string;
};

class CoreReadError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

async function boundedJson(response: Response, max: number): Promise<unknown> {
  if (Number(response.headers.get("content-length")) > max) { await response.body?.cancel(); throw new CoreReadError(502, "Core response is too large."); }
  if (!response.body) throw new CoreReadError(502, "Core returned no data.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > max) throw new CoreReadError(502, "Core response is too large.");
      chunks.push(part.value);
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  try {
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const part of chunks) { bytes.set(part, offset); offset += part.byteLength; }
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch { throw new CoreReadError(502, "Core returned invalid data."); }
}

function catalogItem(value: unknown): value is CatalogItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<CatalogItem>;
  return typeof item.workspaceId === "string" && workspaceIdPattern.test(item.workspaceId) &&
    typeof item.recordId === "string" && workspaceIdPattern.test(item.recordId) &&
    typeof item.projectId === "string" && typeof item.title === "string" &&
    typeof item.language === "string" && typeof item.translationGroupId === "string" &&
    Number.isSafeInteger(item.revision) && typeof item.updatedAt === "string";
}

export function createCoreManuscriptReader(token: string | undefined, fetcher: typeof fetch = fetch) {
  const read = async (path: string, max: number) => {
    if (!token || !/^[0-9a-f]{64}$/.test(token)) throw new CoreReadError(503, "Configure the Sandbox Core credential in the local server.");
    let response: Response;
    try {
      response = await fetcher(CORE_URL + path, {
        method: "GET", redirect: "error", credentials: "omit", signal: AbortSignal.timeout(8000),
        headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      });
    } catch { throw new CoreReadError(503, "Core is unavailable on this computer."); }
    if (response.status === 401) throw new CoreReadError(503, "The Sandbox Core credential is invalid.");
    if (response.status === 403 || response.status === 404) throw new CoreReadError(404, "This manuscript is not shared with Sandbox.");
    if (!response.ok) throw new CoreReadError(502, "Core could not return the manuscript.");
    return boundedJson(response, max);
  };
  const catalog = async (): Promise<CatalogItem[]> => {
    const result = await read("/v1/shared-manuscripts", MAX_CATALOG_BYTES);
    if (!Array.isArray(result) || !result.every(catalogItem)) throw new CoreReadError(502, "Core returned an invalid manuscript catalog.");
    return result;
  };
  return {
    catalog,
    async manuscript(workspaceId: string) {
      if (!workspaceIdPattern.test(workspaceId)) throw new CoreReadError(404, "Manuscript not found.");
      const selected = (await catalog()).find(item => item.workspaceId === workspaceId);
      if (!selected) throw new CoreReadError(404, "This manuscript is not shared with Sandbox.");
      const result = await read(`/v1/records/${selected.recordId}`, MAX_RECORD_BYTES);
      if (!result || typeof result !== "object") throw new CoreReadError(502, "Core returned an invalid manuscript.");
      const record = result as { workspaceId?: unknown; revision?: unknown; body?: unknown };
      const body = record.body as { kind?: unknown; format?: unknown; sourceApp?: unknown; sourceBookId?: unknown; title?: unknown; synopsis?: unknown; chapters?: unknown; bible?: unknown } | null;
      const bible = CoreBibleSchema.safeParse(body?.bible);
      if (record.workspaceId !== selected.workspaceId || record.revision !== selected.revision ||
        !body || body.kind !== "storycore.manuscript-export" || body.format !== 2 || body.sourceApp !== "storybook-ai" ||
        body.sourceBookId !== selected.projectId || typeof body.title !== "string" ||
        typeof body.synopsis !== "string" || !Array.isArray(body.chapters) || !bible.success ||
        !body.chapters.every(chapter => chapter && typeof chapter.id === "string" && typeof chapter.title === "string" && typeof chapter.prose === "string"))
        throw new CoreReadError(502, "Core returned an invalid manuscript.");
      return { ...selected, manuscript: { title: body.title, synopsis: body.synopsis,
        chapters: body.chapters.map(chapter => ({ id: chapter.id, title: chapter.title, prose: chapter.prose })), bible: bible.data } };
    },
  };
}

function json(response: ServerResponse, status: number, value: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(value));
}

export function coreManuscriptsMiddleware(reader = createCoreManuscriptReader(process.env.SANDBOX_CORE_TOKEN)) {
  return async (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    if (path !== "/api/core/manuscripts" && !path.startsWith("/api/core/manuscripts/")) return next();
    const host = request.headers.host ?? "";
    if (!/^(localhost|127\.0\.0\.1):[0-9]{1,5}$/.test(host) ||
      (request.headers.origin && request.headers.origin !== `http://${host}`) ||
      request.headers["sec-fetch-site"] === "cross-site") return json(response, 403, { error: "Use Sandbox on this computer." });
    if (request.method !== "GET") return json(response, 405, { error: "Read only." });
    try {
      const result = path === "/api/core/manuscripts"
        ? await reader.catalog()
        : await reader.manuscript(path.slice("/api/core/manuscripts/".length));
      json(response, 200, result);
    } catch (error) {
      json(response, error instanceof CoreReadError ? error.status : 503, { error: error instanceof CoreReadError ? error.message : "Core is unavailable." });
    }
  };
}

export function coreManuscriptsPlugin(): Plugin {
  return {
    name: "sandbox-core-manuscripts",
    configureServer(server) { const middleware = coreManuscriptsMiddleware(); server.middlewares.use((req, res, next) => { void middleware(req, res, next); }); },
    configurePreviewServer(server) { const middleware = coreManuscriptsMiddleware(); server.middlewares.use((req, res, next) => { void middleware(req, res, next); }); },
  };
}
