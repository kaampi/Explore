import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { createCoreManuscriptReader, CoreReadError } from "../src/integrations/coreManuscriptReader";
export { createCoreManuscriptReader } from "../src/integrations/coreManuscriptReader";

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
