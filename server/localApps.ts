import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import {
  APP_IDS,
  DEFAULT_APP_ADDRESSES,
  isLoopbackAddress,
  safeAppAddress,
  type AppStatus,
  type CompanionAppId,
} from "../src/integrations/localApps";

const MAX_RESPONSE_BYTES = 64 * 1024;
const PROBE_TIMEOUT_MS = 1200;
const TITLE: Record<CompanionAppId, string> = {
  storybook: "storybookai",
  comicbook: "comicbookai",
};

async function readBounded(response: Response): Promise<string> {
  if (Number(response.headers.get("content-length")) > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw new Error("Response is too large.");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  let size = 0,
    text = "";
  const decoder = new TextDecoder();
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) return text + decoder.decode();
      size += part.value.byteLength;
      if (size > MAX_RESPONSE_BYTES) throw new Error("Response is too large.");
      text += decoder.decode(part.value, { stream: true });
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** Probe only the two requested companion services, never an arbitrary network host. */
export async function probeLocalApp(
  appId: CompanionAppId,
  rawAddress: string,
  fetcher: typeof fetch = fetch,
): Promise<AppStatus> {
  const address = safeAppAddress(rawAddress) || DEFAULT_APP_ADDRESSES[appId];
  const status: AppStatus = {
    appId,
    address,
    state: "unknown",
    checkedAt: Date.now(),
  };
  if (!isLoopbackAddress(address)) return status;
  try {
    const options: RequestInit = {
      redirect: "error",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      credentials: "omit",
      headers: { Accept: "text/html, application/json" },
    };
    const identityResponse = await fetcher(
      new URL("/.well-known/storycore-app.json", address).href,
      options,
    );
    if (
      identityResponse.ok &&
      identityResponse.headers.get("content-type")?.includes("application/json")
    ) {
      const identity: unknown = JSON.parse(await readBounded(identityResponse));
      if (identity && typeof identity === "object" && "appId" in identity) {
        if (identity.appId !== appId) return { ...status, state: "wrong-app" };
        const version =
          "version" in identity && typeof identity.version === "string"
            ? identity.version.slice(0, 100)
            : undefined;
        return {
          ...status,
          state: "available",
          ...(version ? { version } : {}),
        };
      }
    } else {
      await identityResponse.body?.cancel();
    }
    // Existing sibling releases have no shared identity endpoint yet; recognize their exact page titles.
    const response = await fetcher(address, options);
    if (!response.ok) return { ...status, state: "unreachable" };
    const body = await readBounded(response);
    const title = body
      .match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]
      ?.replace(/[^a-z0-9]/gi, "")
      .toLowerCase();
    if (title === TITLE[appId]) return { ...status, state: "available" };
    return { ...status, state: "wrong-app" };
  } catch {
    return { ...status, state: "unreachable" };
  }
}

function json(response: ServerResponse, status: number, value: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(value));
}

/** Both npm start and npm run preview expose the same same-origin status API. */
export function localAppsPlugin(): Plugin {
  const pending = new Map<string, Promise<AppStatus>>();
  async function middleware(
    request: IncomingMessage,
    response: ServerResponse,
    next: () => void,
  ) {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (
      !["/api/ecosystem/status", "/.well-known/storycore-app.json"].includes(
        url.pathname,
      )
    )
      return next();
    if (request.method !== "GET") {
      json(response, 405, { error: "GET required" });
      return;
    }
    if (url.pathname === "/.well-known/storycore-app.json") {
      json(response, 200, {
        appId: "sandbox",
        name: "kaampi Explore",
        version: "0.1.0",
        protocolVersion: 1,
      });
      return;
    }
    const origin = request.headers.origin;
    let sameOrigin = true;
    try {
      sameOrigin = !origin || new URL(origin).host === request.headers.host;
    } catch {
      sameOrigin = false;
    }
    if (request.headers["sec-fetch-site"] === "cross-site" || !sameOrigin) {
      json(response, 403, { error: "Use the app's own status controls." });
      return;
    }
    const app = url.searchParams.get("app");
    if (!APP_IDS.includes(app as CompanionAppId)) {
      json(response, 400, { error: "Unknown app" });
      return;
    }
    const appId = app as CompanionAppId;
    let address: string;
    try {
      address =
        safeAppAddress(url.searchParams.get("address") ?? "") ||
        DEFAULT_APP_ADDRESSES[appId];
    } catch {
      json(response, 400, { error: "Invalid app address" });
      return;
    }
    if (!isLoopbackAddress(address)) {
      json(response, 200, {
        appId,
        address,
        state: "unknown",
        checkedAt: Date.now(),
      });
      return;
    }
    const key = `${appId}:${address}`;
    let probe = pending.get(key);
    if (!probe) {
      probe = probeLocalApp(appId, address);
      pending.set(key, probe);
    }
    try {
      json(response, 200, await probe);
    } catch {
      json(response, 503, { error: "Status check failed" });
    } finally {
      pending.delete(key);
    }
  }
  return {
    name: "sandboxai-local-apps",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        void middleware(request, response, next);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((request, response, next) => {
        void middleware(request, response, next);
      });
    },
  };
}
