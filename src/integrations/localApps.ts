import { z } from "zod";

export const APP_IDS = ["storybook", "comicbook"] as const;
export type CompanionAppId = (typeof APP_IDS)[number];
export const DEFAULT_APP_ADDRESSES: Record<CompanionAppId, string> = {
  storybook: "http://localhost:5175/",
  comicbook: "http://localhost:5176/",
};
export const AppStatusSchema = z.object({
  appId: z.enum(APP_IDS),
  state: z.enum(["available", "unreachable", "wrong-app", "unknown"]),
  address: z.string().url(),
  checkedAt: z.number().finite(),
  version: z.string().max(100).optional(),
});
export type AppStatus = z.infer<typeof AppStatusSchema>;

export function safeAppAddress(value: string): string {
  if (!value.trim()) return "";
  const url = new URL(value.trim());
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new Error("Use an HTTP or HTTPS app address without credentials.");
  }
  return url.href;
}

export function isLoopbackAddress(address: string): boolean {
  try {
    const url = new URL(safeAppAddress(address));
    return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}

/** A hosted/static build has no local probe server. Never infer availability from an HTML fallback. */
export async function checkCompanionApp(
  appId: CompanionAppId,
  address: string,
  signal?: AbortSignal,
): Promise<AppStatus> {
  const checkedAddress =
    safeAppAddress(address) || DEFAULT_APP_ADDRESSES[appId];
  const unknown: AppStatus = {
    appId,
    address: checkedAddress,
    state: "unknown",
    checkedAt: Date.now(),
  };
  if (!isLoopbackAddress(checkedAddress)) return unknown;
  try {
    const query = new URLSearchParams({ app: appId, address: checkedAddress });
    const response = await fetch(`/api/ecosystem/status?${query}`, {
      cache: "no-store",
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(3000)])
        : AbortSignal.timeout(3000),
      credentials: "same-origin",
    });
    if (
      !response.ok ||
      !response.headers.get("content-type")?.includes("application/json")
    )
      return unknown;
    const parsed = AppStatusSchema.safeParse(await response.json());
    if (
      !parsed.success ||
      parsed.data.appId !== appId ||
      parsed.data.address !== checkedAddress
    )
      return unknown;
    return parsed.data;
  } catch {
    return unknown;
  }
}
